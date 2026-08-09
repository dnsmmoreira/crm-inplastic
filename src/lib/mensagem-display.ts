/**
 * Utilitários puros para exibição de mensagens (nunca alteram o que é gravado no banco).
 */

const TRACKING_PARAMS = /(gclid=|gbraid=|wbraid=|gad_source=|gad_campaignid=|fbclid=)/i;

/** Linha é o cabeçalho do bloco "Origem" (com ou sem asteriscos / dois-pontos). */
function isOrigemHeader(line: string): boolean {
  const t = line.trim().replace(/\*/g, "").replace(/[:：]\s*$/, "").trim();
  return /^origem$/i.test(t);
}

/** Linha de detalhe do bloco de origem que deve sumir. */
function isOrigemDetail(line: string): boolean {
  const t = line.trim().replace(/^[-•*]\s*/, "").replace(/\*/g, "").trim();
  if (!t) return false;
  if (TRACKING_PARAMS.test(line)) return true;
  return /^(p[áa]gina de entrada|id do clique|click id)\s*[:：]?/i.test(t);
}

/** Linha que inicia um novo campo, tipo "*Produto de interesse:*". */
function isFieldLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^[-•]\s/.test(t)) return false;
  return /^\*?[^*:]{1,40}\*?\s*[:：]/.test(t);
}

export function limparOrigemAnuncio(texto: string): string {
  if (!texto) return texto;
  if (!/origem/i.test(texto) && !TRACKING_PARAMS.test(texto)) return texto;

  const lines = texto.split("\n");
  const out: string[] = [];
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isOrigemHeader(line)) {
      // Olha adiante: coleta as linhas do bloco até o próximo campo.
      const kept: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const next = lines[j];
        if (isFieldLine(next) && !isOrigemDetail(next)) break;
        if (!next.trim()) {
          // linha em branco encerra o bloco se o que vier depois não for detalhe
          const after = lines[j + 1];
          if (after === undefined || !isOrigemDetail(after)) break;
          continue;
        }
        if (isOrigemDetail(next)) {
          changed = true;
          continue;
        }
        kept.push(next);
      }
      if (kept.length > 0) {
        out.push(line, ...kept);
      } else {
        changed = true;
      }
      i = j - 1;
      continue;
    }

    if (isOrigemDetail(line)) {
      changed = true;
      continue;
    }

    out.push(line);
  }

  if (!changed) return texto;

  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s+$/, "")
    .replace(/^\n+/, "");
}
