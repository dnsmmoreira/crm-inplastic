import { describe, expect, it } from "vitest";
import {
  cadastrarTransportadoraRapida,
  validarTransportadoraRapida,
} from "./transportadoras.functions";

/** Fake do client autenticado: simula a função `criar_transportadora_rapida` do banco. */
function makeSupabase(opts: { existentePorCnpj?: { cnpj: string; id: string; nome: string } } = {}) {
  const chamadas: Array<Record<string, unknown>> = [];
  const criadas: Array<Record<string, unknown>> = [];
  return {
    chamadas,
    criadas,
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name !== "criar_transportadora_rapida") return { data: null, error: null };
      chamadas.push(args);
      const nome = String(args["_nome"] ?? "").trim();
      if (nome.length < 2) {
        return { data: null, error: { message: "Nome da transportadora e obrigatorio" } };
      }
      const digitos = String(args["_cnpj"] ?? "").replace(/\D/g, "");
      const existente = opts.existentePorCnpj;
      if (digitos && existente && existente.cnpj.replace(/\D/g, "") === digitos) {
        return {
          data: [{ ...existente, ativo: true, reaproveitada: true }],
          error: null,
        };
      }
      const nova = {
        id: `t-${criadas.length + 1}`,
        nome,
        cnpj: digitos || null,
        ativo: true,
        reaproveitada: false,
      };
      criadas.push(nova);
      return { data: [nova], error: null };
    },
  };
}

describe("cadastro rápido de transportadora (a partir da proposta)", () => {
  it("rejeita nome vazio antes de chegar no banco", async () => {
    const sb = makeSupabase();
    await expect(cadastrarTransportadoraRapida(sb, { nome: "   " })).rejects.toThrow();
    expect(sb.chamadas).toHaveLength(0);
    expect(() => validarTransportadoraRapida({ nome: "A" })).toThrow();
  });

  it("cria transportadora ativa com nome digitado, sem CNPJ", async () => {
    const sb = makeSupabase();
    const row = await cadastrarTransportadoraRapida(sb, { nome: "Rodo Express" });
    expect(row).toMatchObject({ nome: "Rodo Express", ativo: true, reaproveitada: false });
    expect(sb.criadas).toHaveLength(1);
    expect(sb.chamadas[0]?.["_cnpj"]).toBeNull();
  });

  it("CNPJ já cadastrado devolve a existente em vez de duplicar", async () => {
    const sb = makeSupabase({
      existentePorCnpj: { cnpj: "12.345.678/0001-90", id: "t-existente", nome: "Rodo Express" },
    });
    const row = await cadastrarTransportadoraRapida(sb, {
      nome: "Rodo Express Transportes",
      cnpj: "12345678000190",
    });
    expect(row.id).toBe("t-existente");
    expect(row.reaproveitada).toBe(true);
    expect(sb.criadas).toHaveLength(0);
  });

  it("propaga erro do banco (ex.: chamada sem sessão) sem inventar sucesso", async () => {
    const sb = {
      rpc: async () => ({ data: null, error: { message: "Nao autenticado" } }),
    };
    await expect(cadastrarTransportadoraRapida(sb, { nome: "Rodo Express" })).rejects.toThrow(
      "Nao autenticado",
    );
  });

  it("repassa CNPJ, razão social e endereço vindos da busca de CNPJ", async () => {
    const sb = makeSupabase();
    await cadastrarTransportadoraRapida(sb, {
      nome: "Rodo Express",
      cnpj: "12.345.678/0001-90",
      razao_social: "Rodo Express Transportes LTDA",
      endereco: { cidade: "Campinas", uf: "SP", telefone: "1930000000" },
    });
    expect(sb.chamadas[0]).toMatchObject({
      _razao_social: "Rodo Express Transportes LTDA",
      _endereco: { cidade: "Campinas", uf: "SP" },
    });
  });
});
