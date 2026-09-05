import { describe, expect, it } from "vitest";
import {
  acionarEntrada,
  alternarConferencia,
  buildConferenciaEntries,
  contarConfirmados,
  estadoDaEntrada,
  estadoInicialConferencia,
  indiceAtual,
  todosConfirmados,
  type ConferenciaInput,
} from "./conferencia-final";

const base: ConferenciaInput = {
  items: [
    { id: "i1", description: "Caixa 30L", sku: "CX30", quantity: 10, unit: "un", unitPrice: 25 },
    { id: "i2", description: "Tampa", sku: null, quantity: 5, unit: "un", unitPrice: 4.5 },
  ],
  cliente: { razaoSocial: "Inplastic LTDA", documento: "12.345.678/0001-90" },
  condicao: { label: "28/56 dias", parcelas: "50% em 28 dias + 50% em 56 dias" },
  transporte: { freightPayer: "CIF", carrier: "Braspress", endereco: "Rua X, 100 - SP" },
  descontoPercent: 5,
  validadeDias: 15,
};

describe("conferência final da proposta", () => {
  it("gera uma linha por item mais as cinco de dados gerais", () => {
    const entries = buildConferenciaEntries(base);
    expect(entries.filter((e) => e.grupo === "item")).toHaveLength(2);
    expect(entries.filter((e) => e.grupo === "geral").map((e) => e.id)).toEqual([
      "geral:cliente",
      "geral:condicao",
      "geral:transporte",
      "geral:desconto",
      "geral:acrescimo",
      "geral:validade",
    ]);
  });

  it("mostra quantidade, unidade e preço no detalhe do item", () => {
    const [item] = buildConferenciaEntries(base);
    expect(item.detail).toContain("SKU CX30");
    expect(item.detail).toContain("10 un");
    expect(item.detail).toContain("250,00");
  });

  it("avisa quando dados gerais estão vazios em vez de mostrar em branco", () => {
    const entries = buildConferenciaEntries({
      ...base,
      cliente: { razaoSocial: "", documento: null },
      condicao: { label: null, parcelas: null },
      transporte: { freightPayer: "FOB", carrier: "", endereco: null },
      descontoPercent: 0,
    });
    const byId = Object.fromEntries(entries.map((e) => [e.id, e.detail]));
    expect(byId["geral:cliente"]).toContain("CNPJ/CPF não informado");
    expect(byId["geral:condicao"]).toContain("Condição não selecionada");
    expect(byId["geral:transporte"]).toContain("Endereço de entrega não informado");
    expect(byId["geral:desconto"]).toBe("Sem desconto");
  });

  it("não confirma nada no estado inicial", () => {
    const entries = buildConferenciaEntries(base);
    const marcados = estadoInicialConferencia();
    expect(contarConfirmados(entries, marcados)).toBe(0);
    expect(todosConfirmados(entries, marcados)).toBe(false);
  });

  it("mantém bloqueado enquanto um único item continua destravado", () => {
    const entries = buildConferenciaEntries(base);
    let marcados = estadoInicialConferencia();
    for (const e of entries.slice(1)) marcados = alternarConferencia(marcados, e.id);
    expect(contarConfirmados(entries, marcados)).toBe(entries.length - 1);
    expect(todosConfirmados(entries, marcados)).toBe(false);
  });

  it("libera somente com todas as linhas marcadas", () => {
    const entries = buildConferenciaEntries(base);
    let marcados = estadoInicialConferencia();
    for (const e of entries) marcados = alternarConferencia(marcados, e.id);
    expect(todosConfirmados(entries, marcados)).toBe(true);
  });

  it("desmarcar volta a bloquear", () => {
    const entries = buildConferenciaEntries(base);
    let marcados = estadoInicialConferencia();
    for (const e of entries) marcados = alternarConferencia(marcados, e.id);
    marcados = alternarConferencia(marcados, "geral:validade");
    expect(todosConfirmados(entries, marcados)).toBe(false);
  });

  it("reabrir o modal zera o checklist (estado efêmero)", () => {
    const entries = buildConferenciaEntries(base);
    let marcados = estadoInicialConferencia();
    for (const e of entries) marcados = alternarConferencia(marcados, e.id);
    expect(todosConfirmados(entries, marcados)).toBe(true);
    const reaberto = estadoInicialConferencia();
    expect(contarConfirmados(entries, reaberto)).toBe(0);
    expect(todosConfirmados(entries, reaberto)).toBe(false);
  });
  it("fluxo sequencial: só a linha atual pode ser confirmada", () => {
    const entries = buildConferenciaEntries(base);
    let marcados = estadoInicialConferencia();
    expect(indiceAtual(entries, marcados)).toBe(0);
    // clicar numa linha bloqueada não muda nada
    marcados = acionarEntrada(entries, marcados, "geral:validade");
    expect(contarConfirmados(entries, marcados)).toBe(0);
    marcados = acionarEntrada(entries, marcados, entries[0].id);
    expect(estadoDaEntrada(entries, marcados, 0)).toBe("confirmado");
    expect(estadoDaEntrada(entries, marcados, 1)).toBe("atual");
    expect(estadoDaEntrada(entries, marcados, 2)).toBe("bloqueado");
  });

  it("reabrir uma linha confirmada reseta o progresso dali pra frente", () => {
    const entries = buildConferenciaEntries(base);
    let marcados = estadoInicialConferencia();
    for (const e of entries) marcados = acionarEntrada(entries, marcados, e.id);
    expect(todosConfirmados(entries, marcados)).toBe(true);
    marcados = acionarEntrada(entries, marcados, entries[1].id);
    expect(indiceAtual(entries, marcados)).toBe(1);
    expect(contarConfirmados(entries, marcados)).toBe(1);
  });
});

