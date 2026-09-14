/**
 * Aviso sonoro curto do Chat Interno, gerado por Web Audio API
 * (sem arquivo de áudio). Falha em silêncio se o browser bloquear.
 */
export function tocarPingChat(): void {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1046, now);
    osc.frequency.exponentialRampToValueAtTime(1568, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.18);
    window.setTimeout(() => void ctx.close().catch(() => undefined), 800);
  } catch {
    /* autoplay bloqueado — segue sem som */
  }
}

/**
 * Decide se o aviso deve tocar: só quando o total AUMENTA e já houve
 * uma leitura anterior (evita tocar no carregamento inicial).
 */
export function deveAvisarChat(anterior: number | null, atual: number): boolean {
  return anterior !== null && atual > anterior;
}
