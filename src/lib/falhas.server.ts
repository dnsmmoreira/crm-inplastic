/**
 * Registro central de falhas silenciosas (`public.falhas_sistema`).
 *
 * Motivo: erros que só iam para `console.error` sumiam. Aqui eles ficam
 * visíveis na tela /falhas.
 *
 * CONTRATO INEGOCIÁVEL:
 * - `registrarFalha` NUNCA lança. Se o próprio registro falhar, cai para
 *   `console.error` e segue — nenhum fluxo de negócio pode cair por causa
 *   do registro de falha.
 * - Segredos nunca são gravados: chaves sensíveis do contexto viram
 *   "[redigido]".
 * - Agrupa por (origem, mensagem) enquanto a falha não estiver resolvida.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

export const VALOR_REDIGIDO = "[redigido]";

const PADROES_SENSIVEIS = ["secret", "token", "password", "senha", "key", "authorization"];

export function chaveSensivel(nome: string): boolean {
  const n = nome.toLowerCase();
  return PADROES_SENSIVEIS.some((p) => n.includes(p));
}

/** Extrai mensagem legível de qualquer coisa lançada. */
export function mensagemDeErro(erro: unknown): string {
  if (erro instanceof Error) return erro.message || erro.name || "Error";
  if (typeof erro === "string") return erro;
  if (erro && typeof erro === "object") {
    const m = (erro as { message?: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
    try {
      return JSON.stringify(erro);
    } catch {
      return String(erro);
    }
  }
  return String(erro);
}

/** Substitui valores de chaves sensíveis por `[redigido]`, recursivamente. */
export function redigirContexto(ctx: unknown, profundidade = 0): unknown {
  if (profundidade > 5) return VALOR_REDIGIDO;
  if (Array.isArray(ctx)) return ctx.map((v) => redigirContexto(v, profundidade + 1));
  if (ctx && typeof ctx === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(ctx as Record<string, unknown>)) {
      out[k] = chaveSensivel(k) ? VALOR_REDIGIDO : redigirContexto(v, profundidade + 1);
    }
    return out;
  }
  return ctx;
}

/**
 * Registra uma falha usando o client informado. Nunca lança.
 *
 * ATENÇÃO: o INSERT em `falhas_sistema` é liberado apenas para `service_role`.
 * Com um client de usuário o INSERT morre no RLS — por isso, se a gravação
 * falhar, esta função NÃO desiste em silêncio: ela reenvia pelo client de
 * serviço (`registrarFalhaAdmin`). Prefira sempre `registrarFalhaAdmin`.
 * Retorna `true` quando conseguiu gravar (direto ou pelo fallback).
 */
export async function registrarFalha(
  sb: SB,
  origem: string,
  erro: unknown,
  contexto?: Record<string, unknown>,
  /** Uso interno: evita recursão quando já estamos no client de serviço. */
  semFallback = false,
): Promise<boolean> {

  try {
    const mensagem = mensagemDeErro(erro).slice(0, 1000);
    const ctx = contexto ? (redigirContexto(contexto) as Record<string, unknown>) : null;
    const agora = new Date().toISOString();

    // Agrupamento: mesma origem + mesma mensagem ainda aberta => incrementa.
    const { data: existente } = await sb
      .from("falhas_sistema")
      .select("id, ocorrencias")
      .eq("origem", origem)
      .eq("mensagem", mensagem)
      .is("resolvido_em", null)
      .limit(1)
      .maybeSingle();

    if (existente?.id) {
      const { error } = await sb
        .from("falhas_sistema")
        .update({
          ocorrencias: Number(existente.ocorrencias ?? 1) + 1,
          ocorrido_em: agora,
          contexto: ctx,
        })
        .eq("id", existente.id);
      if (error) throw new Error(error.message);
      return true;
    }

    const { error } = await sb
      .from("falhas_sistema")
      .insert({ origem, mensagem, contexto: ctx, ocorrido_em: agora });
    if (error) throw new Error(error.message);
    return true;
  } catch (e) {
    console.error(
      `[falhas] não consegui registrar a falha (origem=${origem}):`,
      e instanceof Error ? e.message : String(e),
    );
    // Fallback: provavelmente RLS (client de usuário). Reenvia pelo service_role.
    if (!semFallback) {
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        return await registrarFalha(supabaseAdmin as SB, origem, erro, contexto, true);
      } catch (e2) {
        console.error(
          `[falhas] fallback pelo client de serviço também falhou (origem=${origem}):`,
          e2 instanceof Error ? e2.message : String(e2),
        );
      }
    }
    return false;
  }
}

/**
 * Atalho para os pontos que não têm um client à mão. Usa o client de serviço
 * (o INSERT em `falhas_sistema` é liberado apenas para `service_role`).
 * Também nunca lança.
 */
export async function registrarFalhaAdmin(
  origem: string,
  erro: unknown,
  contexto?: Record<string, unknown>,
): Promise<boolean> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return await registrarFalha(supabaseAdmin as SB, origem, erro, contexto, true);

  } catch (e) {
    console.error(
      `[falhas] client de serviço indisponível (origem=${origem}):`,
      e instanceof Error ? e.message : String(e),
    );
    return false;
  }
}
