/**
 * Fila de alertas com aceite obrigatório.
 * - filtra por aceito_em / adiado_ate
 * - "Lembrar em 10 min" NÃO grava aceite
 * - "Aceitar" grava aceito_em E lida_em
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { filtrarPendentes, type AlertaPendenteRow } from "@/hooks/useAlertasPendentes";

const base: AlertaPendenteRow = {
  id: "n1",
  tipo: "pedido_aprovacao",
  titulo: "Novo pedido para aprovação",
  created_at: "2026-08-21T10:00:00.000Z",
  pedido_id: "ped-1",
  conversa_id: null,
  exige_aceite: true,
  aceito_em: null,
  adiado_ate: null,
};
const agora = new Date("2026-08-21T12:00:00.000Z");

describe("fila de alertas pendentes", () => {
  it("mostra alerta que exige aceite e não foi aceito", () => {
    expect(filtrarPendentes([base], agora).map((r) => r.id)).toEqual(["n1"]);
  });

  it("esconde alerta já aceito", () => {
    const r = { ...base, aceito_em: "2026-08-21T11:00:00.000Z" };
    expect(filtrarPendentes([r], agora)).toHaveLength(0);
  });

  it("esconde alerta adiado para o futuro e devolve quando vence", () => {
    const futuro = { ...base, adiado_ate: "2026-08-21T12:10:00.000Z" };
    expect(filtrarPendentes([futuro], agora)).toHaveLength(0);
    expect(filtrarPendentes([futuro], new Date("2026-08-21T12:10:01.000Z"))).toHaveLength(1);
  });

  it("ignora notificação que não exige aceite", () => {
    expect(filtrarPendentes([{ ...base, exige_aceite: false }], agora)).toHaveLength(0);
  });

  it("mostra a mais antiga primeiro", () => {
    const nova = { ...base, id: "n2", created_at: "2026-08-21T11:00:00.000Z" };
    expect(filtrarPendentes([nova, base], agora).map((r) => r.id)).toEqual(["n1", "n2"]);
  });
});

describe("escritas de aceite/adiamento", () => {
  const src = readFileSync(resolve(__dirname, "alertas.functions.ts"), "utf8");

  it("aceitar grava aceito_em e lida_em", () => {
    expect(src).toContain("update({ aceito_em: nowIso, lida_em: nowIso })");
  });

  it("adiar grava só adiado_ate — nunca aceite", () => {
    const trecho = src.slice(src.indexOf("export const adiarAlerta"));
    expect(trecho).toContain("update({ adiado_ate: ate })");
    expect(trecho).not.toContain("aceito_em:");
    expect(trecho).not.toContain("lida_em:");
  });

  it("ambas restringem a notificação ao usuário logado", () => {
    expect(src.match(/\.eq\("user_id", context\.userId\)/g)).toHaveLength(2);
  });
});

describe("diálogo sem saída sem decisão", () => {
  const ui = readFileSync(
    resolve(__dirname, "../components/alertas/AlertaPendente.tsx"),
    "utf8",
  );
  it("bloqueia Esc, overlay e esconde o X", () => {
    expect(ui).toContain("onEscapeKeyDown={(e) => e.preventDefault()}");
    expect(ui).toContain("onPointerDownOutside={(e) => e.preventDefault()}");
    expect(ui).toContain("onInteractOutside={(e) => e.preventDefault()}");
    expect(ui).toContain("[&>button]:hidden");
    expect(ui).not.toContain("onOpenChange");
  });
});
