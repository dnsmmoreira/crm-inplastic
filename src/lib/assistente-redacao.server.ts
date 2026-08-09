/**
 * Helpers do assistente de redação (apoio ao vendedor no chat).
 * Nada aqui envia mensagem para o WhatsApp — só devolve texto sugerido.
 */

export type ModoAssistente = "corrigir" | "sugerir";

export const LIMITE_CHAMADAS_HORA = 30;
const MAX_CARACTERES = 600;

const REGRAS_COMUNS = [
  "Você é um assistente de redação para vendedores de uma indústria de pallets plásticos.",
  "Escreva sempre em português do Brasil, tom profissional, direto e consultivo.",
  "Máximo de 600 caracteres na resposta final.",
  "Não use emoji em excesso (no máximo um, e só se fizer sentido).",
  "Nunca inclua links.",
  "Nunca prometa preço, prazo, medida, capacidade de carga, desconto ou condição comercial que não esteja explicitamente na conversa ou no rascunho.",
  "Responda APENAS com o texto final da mensagem, sem aspas, sem comentários e sem explicações.",
].join("\n");

const PROMPT_CORRIGIR = [
  REGRAS_COMUNS,
  "",
  "Tarefa: corrigir o rascunho do vendedor apenas em ortografia, pontuação, concordância e clareza.",
  "É proibido mudar o sentido, acrescentar informação nova, inventar preço, prazo, medida, capacidade de carga ou condição comercial.",
  "Se o rascunho já estiver correto, devolva-o praticamente igual.",
].join("\n");

const PROMPT_SUGERIR = [
  REGRAS_COMUNS,
  "",
  "Tarefa: com base no histórico da conversa, propor UMA única resposta consultiva para o vendedor enviar.",
  "Faça no máximo 1 pergunta de qualificação e conduza a conversa para o fechamento.",
  "Se faltar algum dado necessário, pergunte em vez de supor.",
].join("\n");

export function promptDoModo(modo: ModoAssistente) {
  return modo === "corrigir" ? PROMPT_CORRIGIR : PROMPT_SUGERIR;
}

export function limparSaida(texto: string) {
  let t = texto.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("“") && t.endsWith("”"))) {
    t = t.slice(1, -1).trim();
  }
  t = t.replace(/\s*\n{3,}\s*/g, "\n\n");
  if (t.length > MAX_CARACTERES) {
    const corte = t.slice(0, MAX_CARACTERES);
    const ultimo = Math.max(corte.lastIndexOf("."), corte.lastIndexOf("?"), corte.lastIndexOf("!"));
    t = (ultimo > 200 ? corte.slice(0, ultimo + 1) : corte).trim();
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

/** Chamada ao Lovable AI Gateway (chat completions). Retorna o texto gerado. */
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
      max_tokens: 500,
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

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const texto = limparSaida(json.choices?.[0]?.message?.content ?? "");
  if (!texto) throw new Error("A IA não retornou texto. Tente novamente.");
  return texto;
}
