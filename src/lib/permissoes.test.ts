import { describe, it, expect } from "vitest";
import {
  podeEscreverConversa,
  podeMovimentarPedido,
  podeExcluirPedido,
  podeEditarEmpresa,
  relatorioEscopoProprio,
  PERM_PEDIDOS_MOVIMENTAR,
  PERM_PEDIDOS_EXCLUIR,
  PERM_EMPRESAS_EDITAR,
  PERM_PEDIDOS_VER_TODOS,
} from "./permissoes";

const admin = { isAdmin: true, permKeys: [] as string[] };
const vendedor = { isAdmin: false, permKeys: [] as string[] };
const financeiro = { isAdmin: false, permKeys: [PERM_PEDIDOS_MOVIMENTAR, PERM_PEDIDOS_VER_TODOS] };
const operacional = { isAdmin: false, permKeys: [PERM_PEDIDOS_MOVIMENTAR, PERM_EMPRESAS_EDITAR] };

describe("permissões de pedidos", () => {
  it("vendedor não movimenta nem exclui pedido", () => {
    expect(podeMovimentarPedido(vendedor)).toBe(false);
    expect(podeExcluirPedido(vendedor)).toBe(false);
  });
  it("financeiro e operacional movimentam", () => {
    expect(podeMovimentarPedido(financeiro)).toBe(true);
    expect(podeMovimentarPedido(operacional)).toBe(true);
  });
  it("exclusão de pedido é só de quem tem a chave", () => {
    expect(podeExcluirPedido(financeiro)).toBe(false);
    expect(podeExcluirPedido({ isAdmin: false, permKeys: [PERM_PEDIDOS_EXCLUIR] })).toBe(true);
    expect(podeExcluirPedido(admin)).toBe(true);
  });
  it("admin pode tudo", () => {
    expect(podeMovimentarPedido(admin)).toBe(true);
    expect(podeEditarEmpresa(admin)).toBe(true);
  });
});

describe("empresas", () => {
  it("vendedor não edita empresa; operacional edita", () => {
    expect(podeEditarEmpresa(vendedor)).toBe(false);
    expect(podeEditarEmpresa(operacional)).toBe(true);
  });
});

describe("escopo de relatório", () => {
  it("vendedor só vê os próprios", () => {
    expect(relatorioEscopoProprio(vendedor)).toBe(true);
  });
  it("admin e financeiro veem tudo", () => {
    expect(relatorioEscopoProprio(admin)).toBe(false);
    expect(relatorioEscopoProprio(financeiro)).toBe(false);
  });
});

describe("escrita em conversas", () => {
  it("permite aguardando e atendendo humano", () => {
    expect(podeEscreverConversa("aguardando_humano")).toBe(true);
    expect(podeEscreverConversa("humano_atendendo")).toBe(true);
  });
  it("bloqueia IA, encerrada e nulo", () => {
    expect(podeEscreverConversa("ia_atendendo")).toBe(false);
    expect(podeEscreverConversa("encerrado")).toBe(false);
    expect(podeEscreverConversa(null)).toBe(false);
  });
});
