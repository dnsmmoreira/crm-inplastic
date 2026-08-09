/**
 * Helpers do assistente de redação (apoio ao vendedor no chat).
 * Nada aqui envia mensagem para o WhatsApp — só devolve texto sugerido.
 */

export type ModoAssistente = "corrigir" | "sugerir";

export const LIMITE_CHAMADAS_HORA = 30;
const MAX_CARACTERES = 600;

const REGRAS_COMUNS = [
  "Você é um assistente de redação para vendedores de uma indústria de pallets plásticos.",
  "Escreva SEMPRE em português do Brasil, mesmo que o rascunho ou a conversa estejam em outro idioma.",
  "Tom profissional, direto e consultivo.",
  "Máximo de 600 caracteres.",
  "No máximo um emoji, e só se fizer sentido. Nunca inclua links.",
  "Nunca prometa preço, prazo, medida, capacidade de carga, desconto ou condição comercial que não esteja explicitamente na conversa ou no rascunho.",
].join("\n");

const FECHO = [
  "",
  "IMPORTANTE: sua resposta é SOMENTE o texto final pronto para colar no WhatsApp.",
  "Sem explicação, sem título, sem aspas, sem markdown, sem lista, sem asterisco e sem repetir estas regras.",
].join("\n");

const PROMPT_CORRIGIR = [
  REGRAS_COMUNS,
  "",
  "Tarefa: corrigir o rascunho do vendedor (delimitado por <rascunho>) apenas em ortografia, pontuação, concordância e clareza.",
  "É proibido mudar o sentido, acrescentar informação nova, inventar preço, prazo, medida, capacidade de carga ou condição comercial.",
  "Se o rascunho já estiver correto, devolva-o praticamente igual.",
  FECHO,
].join("\n");

const PROMPT_SUGERIR = [
  REGRAS_COMUNS,
  "",
  "Tarefa: com base no histórico da conversa (delimitado por <conversa>), propor UMA única resposta consultiva para o vendedor enviar.",
  "Faça no máximo 1 pergunta de qualificação e conduza a conversa para o fechamento.",
  "Se faltar algum dado necessário, pergunte em vez de supor.",
  FECHO,
].join("\n");

export function promptDoModo(modo: ModoAssistente) {
  return modo === "corrigir" ? PROMPT_CORRIGIR : PROMPT_SUGERIR;
}

/** Marcas de vazamento de instrução na saída. */
const PADROES_INSTRUCAO = [
  /\brules\b/i,
  /\btone\s*:/i,
  /\bsystem\b/i,
  /\bprompt\b/i,
  /^\s*[*#-]\s+/m,
  /\*\*/,
];

export function saidaSuspeita(texto: string) {
  if (!texto || texto.trim().length < 15) return true;
  return PADROES_INSTRUCAO.some((re) => re.test(texto));
}

export function limparSaida(texto: string) {
  let t = texto.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("“") && t.endsWith("”"))) {
    t = t.slice(1, -1).trim();
  }
  t = t.replace(/\s*\n{3,}\s*/g, "\n\n");

  if (t.length > MAX_CARACTERES) {
    const corte = t.slice(0, MAX_CARACTERES);
    const fimFrase = Math.max(
      corte.lastIndexOf("."),
      corte.lastIndexOf("?"),
      corte.lastIndexOf("!"),
    );
    if (fimFrase > 100) {
      t = corte.slice(0, fimFrase + 1).trim();
    } else {
      // sem fim de frase utilizável: cortar no último espaço, nunca no meio da palavra
      const espaco = corte.lastIndexOf(" ");
      t = (espaco > 100 ? corte.slice(0, espaco) : corte).trim();
    }
  }
  return t;
}

export function historicoParaTexto(
  mensagens: { direcao: string; autor: string | null; conteudo: string | null }[],
) {
  return mensagens
    .filter((m) => (m.conteudo ?? "").trim().length > 0)
    .map((m) => `${m.direcao === "entrada" ? "Cliente" : "Nós"}: ${(m.conteudo ?? "").trim()}`)
    .join("\n");
}

/** Chamada ao Lovable AI Gateway (chat completions, não-streaming). Retorna o texto gerado. */
export async function gerarTexto(system: string, user: string) {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Assistente de IA indisponível no momento.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      temperature: 0.4,
      stream: false,
      // 600 caracteres em pt-BR ≈ 200 tokens; com folga para o modelo respirar.
      max_tokens: 1200,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  if (res.status === 429) {
    throw new Error("A IA está sobrecarregada agora. Tente novamente em alguns instantes.");
  }
  if (res.status === 402) {
    throw new Error("Os créditos de IA acabaram. Fale com o administrador.");
  }
  if (!res.ok) {
    const detalhe = await res.text().catch(() => "");
    console.error(`[assistente-redacao] gateway ${res.status}: ${detalhe.slice(0, 300)}`);
    throw new Error("Não foi possível gerar o texto agora. Tente novamente.");
  }

  // Lê o corpo por completo antes de interpretar.
  const bruto = await res.text();
  let json: {
    choices?: { message?: { content?: string }; finish_reason?: string }[];
  };
  try {
    json = JSON.parse(bruto);
  } catch {
    console.error(`[assistente-redacao] resposta não-JSON: ${bruto.slice(0, 300)}`);
    throw new Error("Não consegui gerar agora, tente de novo");
  }

  const finishReason = json.choices?.[0]?.finish_reason ?? "desconhecido";
  const conteudo = json.choices?.[0]?.message?.content ?? "";
  console.log(
    `[assistente-redacao] finish_reason=${finishReason} chars=${conteudo.length}`,
  );

  const texto = limparSaida(conteudo);
  if (saidaSuspeita(texto)) {
    console.error(
      `[assistente-redacao] saída rejeitada (finish_reason=${finishReason}): ${texto.slice(0, 200)}`,
    );
    throw new Error("Não consegui gerar agora, tente de novo");
  }
  return texto;
}
