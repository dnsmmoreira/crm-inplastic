/**
 * Consistência lead × cliente (banco real, somente leitura).
 *
 * Confere as regras combinadas com o Denis:
 *  - documento gravado só com dígitos (o site antigo pode mandar com máscara);
 *  - lead ligado a cliente de CNPJ diferente é recusado, mas SÓ quando os dois
 *    documentos estão preenchidos;
 *  - toda troca de cliente no lead vai para a auditoria.
 *
 * Em CI a falta de banco FALHA o teste; fora de CI os casos são pulados.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

const VARIAVEIS = ["PGHOST", "PGUSER", "PGDATABASE"] as const;

function consulta(sql: string): string {
  return execFileSync("psql", ["-tA", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const ausentes = VARIAVEIS.filter((v) => !process.env[v]);
let conectado = false;
if (!ausentes.length) {
  try {
    conectado = consulta("SELECT 1") === "1";
  } catch {
    conectado = false;
  }
}
const OBRIGATORIO = process.env["CI"] === "true";
const rodar = conectado || OBRIGATORIO;

describe.skipIf(!rodar)("consistência lead × cliente no banco", () => {
  it("o banco normaliza o documento em leads e clientes", () => {
    const gatilhos = consulta(
      `select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid
        where not t.tgisinternal and t.tgname in
        ('tg_leads_normaliza_documento','tg_clientes_normaliza_documento')`,
    );
    expect(gatilhos).toBe("2");
  });

  it("não sobrou documento com máscara nos leads", () => {
    const mascarados = consulta(
      `select count(*) from leads where cnpj is not null and cnpj <> regexp_replace(cnpj,'\\D','','g')`,
    );
    expect(mascarados).toBe("0");
  });

  it("nenhum lead aponta para cliente de outro CNPJ", () => {
    const errados = consulta(
      `select count(*) from leads l join clientes c on c.id = l.cliente_id
        where coalesce(c.cnpj,'') <> '' and coalesce(l.cnpj,'') <> ''
          and regexp_replace(c.cnpj,'\\D','','g') <> regexp_replace(l.cnpj,'\\D','','g')`,
    );
    expect(errados).toBe("0");
  });

  it("o gatilho de coerência só recusa com os dois documentos preenchidos", () => {
    const corpo = consulta(
      `select pg_get_functiondef(oid) from pg_proc where proname = 'tg_leads_vinculo_cliente'`,
    );
    expect(corpo).toContain("_doc_cliente IS NOT NULL AND _doc_cliente <> _doc");
    expect(corpo).toContain("_vend IS DISTINCT FROM NEW.owner_id");
  });

  it("lead e cliente da mesma empresa têm sempre o mesmo dono", () => {
    const divergentes = consulta(
      `select count(*) from leads l join clientes c on c.id = l.cliente_id
        where c.vendedor_id is distinct from l.owner_id`,
    );
    expect(divergentes).toBe("0");
    const porDocumento = consulta(
      `select count(*) from leads l join clientes c
         on nullif(regexp_replace(coalesce(c.cnpj,''),'\\D','','g'),'')
          = nullif(regexp_replace(coalesce(l.cnpj,''),'\\D','','g'),'')
        where c.vendedor_id is distinct from l.owner_id`,
    );
    expect(porDocumento).toBe("0");
  });

  it("trocar o dono do cliente propaga para leads, tarefas, conversas e propostas", () => {
    const gatilho = consulta(
      `select count(*) from pg_trigger where tgname = 'tg_clientes_dono_propaga' and not tgisinternal`,
    );
    expect(gatilho).toBe("1");
    const corpo = consulta(
      `select pg_get_functiondef(oid) from pg_proc where proname = 'tg_clientes_dono_propaga'`,
    );
    for (const alvo of ["public.leads", "public.tarefas", "public.whatsapp_conversas", "public.propostas"]) {
      expect(corpo).toContain(alvo);
    }
    expect(corpo).toContain("user_audit_log");
  });

  it("cliente novo com documento de lead de outro vendedor é recusado", () => {
    const gatilho = consulta(
      `select count(*) from pg_trigger where tgname = 'tg_clientes_dono_coerente' and not tgisinternal`,
    );
    expect(gatilho).toBe("1");
  });

  it("toda troca de cliente no lead é auditada", () => {
    const gatilho = consulta(
      `select count(*) from pg_trigger where tgname = 'tg_leads_cliente_auditoria' and not tgisinternal`,
    );
    expect(gatilho).toBe("1");
    const corpo = consulta(
      `select pg_get_functiondef(oid) from pg_proc where proname = 'tg_leads_cliente_auditoria'`,
    );
    expect(corpo).toContain("user_audit_log");
    expect(corpo).toContain("leads.cliente_id:");
  });

  it("o backup da correção guarda documento e vínculo antigos", () => {
    const colunas = consulta(
      `select string_agg(column_name, ',' order by column_name) from information_schema.columns
        where table_name = 'correcao_documento_backup'`,
    );
    expect(colunas).toContain("cnpj_antigo");
    expect(colunas).toContain("cliente_id_antigo");
    const linhas = Number(consulta(`select count(*) from correcao_documento_backup`));
    expect(linhas).toBeGreaterThan(0);
  });
});

describe.skipIf(!rodar)("transferências continuam livres (regra do dono único)", () => {
  it("trocar o dono do lead leva o cliente ligado junto", () => {
    const gatilho = consulta(
      `select count(*) from pg_trigger where tgname = 'tg_leads_dono_propaga' and not tgisinternal`,
    );
    expect(gatilho).toBe("1");
    const corpo = consulta(
      `select pg_get_functiondef(oid) from pg_proc where proname = 'tg_leads_dono_propaga'`,
    );
    expect(corpo).toContain("UPDATE public.clientes");
    // guarda contra recursão com o gatilho do cliente
    expect(corpo).toContain("transferencia_carteira");
  });

  it("a troca de dono de um lead existente nunca é recusada", () => {
    const corpo = consulta(
      `select pg_get_functiondef(oid) from pg_proc where proname = 'tg_leads_vinculo_cliente'`,
    );
    expect(corpo).toContain("_dono_mudou");
    expect(corpo).toContain("_ligacao_mudou");
  });

  it("a conversa atribuída registra a falha em vez de engolir", () => {
    const corpo = consulta(
      `select pg_get_functiondef(oid) from pg_proc where proname = 'tg_conversa_dono_para_lead'`,
    );
    expect(corpo).toContain("log_falha_trigger");
    expect(corpo).not.toContain("WHEN OTHERS THEN\n    NULL");
  });
});
