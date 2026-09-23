/**
 * Regressão (caso Renata × aprovação financeira): quem tem
 * `pedidos.aprovar_financeiro` precisa conseguir assumir o pedido nas etapas
 * financeiras, sem ganhar nada da operação.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { ehEtapaFinanceira, PEDIDO_STAGES_FINANCEIRAS } from "@/lib/pedidos-stages";

describe("etapas financeiras", () => {
  it("reconhece exatamente as duas etapas do financeiro", () => {
    expect([...PEDIDO_STAGES_FINANCEIRAS]).toEqual(["analise_financeira", "aguardando_pagamento"]);
    expect(ehEtapaFinanceira("analise_financeira")).toBe(true);
    expect(ehEtapaFinanceira("aguardando_pagamento")).toBe(true);
  });

  it("não vaza para etapas de produção nem para valor vazio (fail-closed)", () => {
    for (const s of ["programacao", "em_producao", "entrega", "pos_venda", "", null, undefined]) {
      expect(ehEtapaFinanceira(s as string)).toBe(false);
    }
  });
});

describe("assumir pedido — porta do financeiro", () => {
  const fonte = readFileSync("src/lib/pedidos.functions.ts", "utf8");
  const i = fonte.indexOf("async function assumirPedidoImpl(");
  const corpo = fonte.slice(i, fonte.indexOf("\n}\n", i));

  it("a permissão só é avaliada DEPOIS de carregar a etapa do pedido", () => {
    expect(corpo.indexOf("from(\"pedidos\")")).toBeLessThan(
      corpo.indexOf("não tem permissão para assumir pedidos da operação"),
    );
  });

  it("a porta do financeiro exige a chave E a etapa financeira", () => {
    expect(corpo).toContain("ehEtapaFinanceira(p.stage)");
    expect(corpo).toContain('temPermissao(sb, userId, "pedidos.aprovar_financeiro")');
    expect(corpo).toContain("naEtapaFinanceira && (await temPermissao");
  });

  it("quem não é aprovador financeiro continua passando pelo check de produção", () => {
    expect(corpo).toContain("!aprovadorFinanceiro && !(await podeOperarProducao(sb, userId))");
  });
});

describe("updatePedidoStage — isenção do aprovador financeiro", () => {
  const fonte = readFileSync("src/lib/pedidos.functions.ts", "utf8");
  const i = fonte.indexOf("const ehAdmin = await isAdminUser(sb, context.userId);");
  const corpo = fonte.slice(i, i + 900);

  it("combina a etapa de origem com a permissão de aprovar o financeiro", () => {
    expect(corpo).toContain("ehEtapaFinanceira(from)");
    expect(corpo).toContain('temPermissao(sb, context.userId, "pedidos.aprovar_financeiro")');
  });

  it("a isenção entra na guarda junto do !ehAdmin", () => {
    expect(corpo).toContain("!ehAdmin");
    expect(corpo).toContain("!aprovadorFinanceiro");
  });

  it("a isenção é amarrada à etapa de ORIGEM, nunca à de destino", () => {
    const linha = corpo
      .split("\n")
      .find((l) => l.includes("ehEtapaFinanceira("))!;
    expect(linha).toContain("ehEtapaFinanceira(from)");
    expect(linha).not.toContain("ehEtapaFinanceira(to)");
  });
});
