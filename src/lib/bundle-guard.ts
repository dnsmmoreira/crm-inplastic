/**
 * Guarda de bundle desatualizado — roda no BROWSER.
 *
 * - Consulta `/version.json` (gerado no build) ao voltar o foco da aba, ao
 *   reconectar e a cada 5 minutos.
 * - Se o build do servidor mudou, ou se qualquer escrita falhar com erro de
 *   coluna inexistente (42703), a aba entra em estado BLOQUEADO: toast
 *   persistente com botão "Recarregar" e `doSave` suspenso (melhor não salvar
 *   do que gravar com o schema errado).
 */

import { toast } from "sonner";
import { BUILD_ID, MSG_BUNDLE_DESATUALIZADO, buildMudou } from "@/lib/build-version";

let bloqueado = false;
let avisado = false;
let timer: ReturnType<typeof setInterval> | null = null;
let iniciado = false;

const INTERVALO_MS = 5 * 60 * 1000;

export function bundleDesatualizado(): boolean {
  return bloqueado;
}

export function bloquearPorBundleDesatualizado(motivo: string): void {
  bloqueado = true;
  if (avisado) return;
  avisado = true;
  console.error("[bundle-guard] bundle desatualizado:", motivo, { buildId: BUILD_ID });
  toast.error(MSG_BUNDLE_DESATUALIZADO, {
    id: "bundle-desatualizado",
    duration: Infinity,
    description: motivo,
    action: {
      label: "Recarregar",
      onClick: () => {
        if (typeof window !== "undefined") window.location.reload();
      },
    },
  });
}

async function checarVersao(): Promise<void> {
  if (bloqueado || typeof fetch === "undefined") return;
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as { buildId?: unknown };
    if (buildMudou(BUILD_ID, json?.buildId)) {
      bloquearPorBundleDesatualizado("O servidor está servindo uma versão mais nova do CRM.");
    }
  } catch {
    // rede instável não deve bloquear nada; o gate de 42703 cobre o pior caso.
  }
}

export function iniciarVigiaDeVersao(): void {
  if (iniciado || typeof window === "undefined") return;
  iniciado = true;

  const aoVoltar = () => {
    if (document.visibilityState === "visible") void checarVersao();
  };
  document.addEventListener("visibilitychange", aoVoltar);
  window.addEventListener("online", () => void checarVersao());
  timer = setInterval(() => void checarVersao(), INTERVALO_MS);
  void checarVersao();
}

export function pararVigiaDeVersao(): void {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Só para testes. */
export function _resetBundleGuard(): void {
  bloqueado = false;
  avisado = false;
  iniciado = false;
  pararVigiaDeVersao();
}
