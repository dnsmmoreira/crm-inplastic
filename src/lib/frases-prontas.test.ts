import { describe, expect, it } from "vitest";
import {
  aplicarVariaveisFrase,
  citaNomeDeEmpresa,
  converterParaMeta,
  ehErroTemplateJaExiste,
  motivoRejeicaoLegivel,
  ordemCategoria,
  preencherParamsMeta,
  slugMeta,
  validarParaMeta,
  variaveisInvalidas,
} from "./frases-prontas";

describe("aplicarVariaveisFrase", () => {
  it("aplica as três variáveis", () => {
    expect(
      aplicarVariaveisFrase("Olá {{nome}}, aqui é {{atendente}} — {{empresa}}", {
        nome: "Carlos",
        empresa: "ACME",
        atendente: "Bia",
      }),
    ).toBe("Olá Carlos, aqui é Bia — ACME");
  });

  it("usa fallbacks de nome e empresa", () => {
    expect(aplicarVariaveisFrase("Olá {{nome}}, da {{empresa}}", {})).toBe(
      "Olá tudo bem, da sua empresa",
    );
  });

  it("reescreve as construções com atendente vazio", () => {
    expect(
      aplicarVariaveisFrase("Olá {{nome}}, tudo bem? Aqui é {{atendente}}, da equipe.", {
        nome: "Ana",
      }),
    ).toBe("Olá Ana, tudo bem? da equipe.");
    expect(
      aplicarVariaveisFrase("Me chamo {{atendente}} e vou seguir com você.", { nome: "Ana" }),
    ).toBe("Vou seguir com você.");
  });
});

describe("converterParaMeta", () => {
  it("mapeia por ordem de primeira aparição e reaproveita repetições", () => {
    const r = converterParaMeta("Oi {{nome}}, a {{empresa}} e você {{nome}}?");
    expect(r.texto).toBe("Oi {{1}}, a {{2}} e você {{1}}?");
    expect(r.mapa).toEqual(["nome", "empresa"]);
    expect(r.exemplos).toEqual(["Carlos", "Empresa Exemplo"]);
  });

  it("prefixa 'Olá ' quando começa com variável", () => {
    expect(converterParaMeta("{{nome}}, uma informação importante.").texto).toBe(
      "Olá {{1}}, uma informação importante.",
    );
  });

  it("não mexe quando já começa com palavra", () => {
    expect(converterParaMeta("Oi {{nome}}, tudo bem?").texto).toBe("Oi {{1}}, tudo bem?");
  });

  it("não conserta automaticamente o fim com variável", () => {
    expect(converterParaMeta("Falo com a {{empresa}}").texto).toBe("Falo com a {{1}}");
  });


  it("normaliza espaços, tabs e linhas duplas", () => {
    expect(converterParaMeta("Oi  {{nome}}\t— tudo\n\nbem?").texto).toBe("Oi {{1}} — tudo\nbem?");
  });

  it("texto sem variável fica intacto e sem exemplos", () => {
    const r = converterParaMeta("Bom dia, seguimos à disposição.");
    expect(r.mapa).toEqual([]);
    expect(r.exemplos).toEqual([]);
  });
});

describe("validarParaMeta", () => {
  it("recusa variável no fim mesmo com pontuação depois", () => {
    expect(validarParaMeta("Podemos seguir com a proposta para a {{empresa}}.")).toHaveLength(1);
  });

  it("aceita variável no início (prefixo automático resolve)", () => {
    expect(validarParaMeta("{{nome}}, tudo bem?")).toEqual([]);
  });

  it("aceita quando termina em palavra", () => {
    expect(validarParaMeta("Olá, falo com a {{empresa}} agora?")).toEqual([]);
  });
});


describe("slugMeta", () => {
  it("remove acentos, hífens e pontuação", () => {
    expect(slugMeta("Follow-up — em análise?")).toBe("crm_follow_up_em_analise");
    expect(slugMeta("Pós-venda")).toBe("crm_pos_venda");
    expect(slugMeta("30 dias após a entrega")).toBe("crm_30_dias_apos_a_entrega");
  });

  it("respeita o limite de 60 caracteres sem terminar em _", () => {
    const s = slugMeta("a".repeat(120));
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith("_")).toBe(false);
  });
});

describe("preencherParamsMeta", () => {
  it("devolve os valores na ordem do mapa", () => {
    expect(
      preencherParamsMeta(["empresa", "nome"], { nome: "Ana", empresa: "ACME", atendente: "Bia" }),
    ).toEqual(["ACME", "Ana"]);
  });

  it("usa fallbacks quando falta valor", () => {
    expect(preencherParamsMeta(["nome", "empresa", "atendente"], {})).toEqual([
      "cliente",
      "sua empresa",
      "equipe comercial",
    ]);
  });
});

describe("validações", () => {
  it("detecta nome de empresa do grupo", () => {
    expect(citaNomeDeEmpresa("Somos a Tao Plast")).toBe(true);
    expect(citaNomeDeEmpresa("pallets plásticos")).toBe(false);
  });

  it("detecta variáveis fora do catálogo", () => {
    expect(variaveisInvalidas("Oi {{nome}} da {{cidade}}")).toEqual(["cidade"]);
    expect(variaveisInvalidas("Oi {{nome}}")).toEqual([]);
  });

  it("ordena categorias conforme o catálogo", () => {
    expect(ordemCategoria("abertura")).toBeLessThan(ordemCategoria("triagem"));
    expect(ordemCategoria("inexistente")).toBe(9);
  });
});

describe("respostas da Meta", () => {
  it("reconhece template já existente", () => {
    expect(ehErroTemplateJaExiste("Já existe conteúdo em Portuguese (BR) para esse modelo")).toBe(
      true,
    );
    expect(ehErroTemplateJaExiste("template already exists")).toBe(true);
    expect(ehErroTemplateJaExiste("(#100) subcode 2388023")).toBe(true);
    expect(ehErroTemplateJaExiste("Formato inválido")).toBe(false);
    expect(ehErroTemplateJaExiste(null)).toBe(false);
  });

  it("traduz motivos de rejeição", () => {
    expect(motivoRejeicaoLegivel("INVALID_FORMAT")).toBe("Formato inválido (INVALID_FORMAT)");
    expect(motivoRejeicaoLegivel("TAG_CONTENT_MISMATCH")).toContain("UTILITY/MARKETING");
    expect(motivoRejeicaoLegivel("NONE")).toContain("Sem motivo");
    expect(motivoRejeicaoLegivel("ALGO_NOVO")).toBe("ALGO_NOVO");
    expect(motivoRejeicaoLegivel(null)).toBeNull();
  });
});
