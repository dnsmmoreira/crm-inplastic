import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PERM_LEADS_CRIAR, PERM_CLIENTES_CRIAR } from "@/lib/cadastro-permissoes";

const ler = (p: string) => readFileSync(p, "utf8");

describe("permissões de cadastro (leads.criar / clientes.criar)", () => {
  it("as chaves têm o nome acordado", () => {
    expect(PERM_LEADS_CRIAR).toBe("leads.criar");
    expect(PERM_CLIENTES_CRIAR).toBe("clientes.criar");
  });

  it("o diálogo de novo lead exige a chave", () => {
    const src = ler("src/components/crm/LeadDrawer.tsx");
    expect(src).toContain("PERM_LEADS_CRIAR");
    expect(src).toMatch(/if \(!podeCriar\) return null;/);
  });

  it("o botão de novo cliente exige a chave", () => {
    const src = ler("src/routes/clientes.index.tsx");
    expect(src).toContain("hasPerm(user, PERM_CLIENTES_CRIAR)");
  });

  it("createCliente confere a chave no servidor", () => {
    const src = ler("src/lib/clientes.functions.ts");
    expect(src).toContain("assertPodeCriarCliente");
    expect(src).toContain('_chave: "clientes.criar"');
  });

  it("o menu só AMPLIA o acesso a Leads, Funil e Clientes", () => {
    const src = ler("src/routes/__root.tsx");
    expect(src).toContain('vendasOuAlguma("leads.ver_todos", "leads.ver_equipe", "leads.criar")');
    expect(src).toContain('"clientes.criar"');
    expect(src).toContain("show: leadsVisivel");
    expect(src).toContain("show: clientesVisivel");
  });
});

describe("duplicidade mostra o dono, nunca o registro", () => {
  const src = ler("src/lib/contato-entrada.functions.ts");
  const server = ler("src/lib/consulta-dono.server.ts");

  it("usa as mesmas funções de visibilidade do resto do sistema", () => {
    expect(server).toContain("supervisor_ve_tudo");
    expect(server).toContain("mesma_equipe");
    expect(server).toContain('_chave: "leads.ver_todos"');
  });

  it("ids do registro só saem para quem enxerga o registro", () => {
    expect(src).toContain("dono.podeVerRegistro ? (entrada.leadId ?? null) : null");
    expect(src).toContain("dono.podeVerRegistro ? vendedorId : null");
  });

  it("a empresa só sai para quem enxerga o registro", () => {
    expect(server).toContain("empresa: podeVer ? (entrada.empresa ?? null) : null");
  });

  it("a tela não usa mais a mensagem que escondia o dono", () => {
    const ui = ler("src/components/crm/LeadDrawer.tsx");
    expect(ui).not.toContain("Já existe cadastro deste CNPJ. Fale com o administrador.");
    expect(ui).toContain("mensagemDonoDuplicado");
  });
});
