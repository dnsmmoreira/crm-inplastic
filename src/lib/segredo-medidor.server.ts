/**
 * Medidor de força de segredos de webhook — SOMENTE OBSERVAÇÃO.
 *
 * Não recusa nada e não altera status HTTP: apenas registra em
 * `falhas_sistema` quando o segredo configurado está ausente ou fraco
 * (< 32 caracteres, ou < 8 caracteres distintos).
 *
 * NUNCA registra o valor do segredo, nem prefixo, nem sufixo — só o
 * comprimento e a quantidade de caracteres distintos.
 */
import { registrarFalhaSegura } from "@/lib/guard-erros";

export function segredoFraco(segredo: string | undefined | null): boolean {
  if (typeof segredo !== "string") return true;
  const s = segredo.trim();
  if (s.length < 32) return true;
  return new Set(s).size < 8;
}

/** Registra (no máximo uma vez por chamada) quando o segredo é ausente/fraco. */
export async function medirSegredo(
  origem: string,
  segredo: string | undefined | null,
  contexto?: Record<string, unknown>,
): Promise<void> {
  if (!segredoFraco(segredo)) return;
  const s = typeof segredo === "string" ? segredo.trim() : "";
  await registrarFalhaSegura(
    origem,
    new Error(
      s.length === 0
        ? "Segredo do webhook ausente — recusa ainda NÃO aplicada (modo medição)."
        : "Segredo do webhook fraco — recusa ainda NÃO aplicada (modo medição).",
    ),
    {
      ...contexto,
      ausente: s.length === 0,
      comprimento: s.length,
      caracteres_distintos: new Set(s).size,
    },
  );
}
