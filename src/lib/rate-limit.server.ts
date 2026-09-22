/**
 * Limite de tentativas DISTRIBUÍDO (server-only).
 *
 * Em memória não vale: com várias instâncias do servidor, cada uma teria o
 * próprio contador. A contagem vive no banco (`consulta_tentativas`), que é
 * único para todas as instâncias e se limpa sozinho (registros com mais de um
 * dia são apagados a cada chamada).
 */
import { registrarFalhaSegura } from "@/lib/guard-erros";

export type ResultadoLimite = { permitido: boolean; usadas: number };

/**
 * Consome uma tentativa da `chave`. FAIL-OPEN de propósito: se o banco falhar,
 * a consulta não é bloqueada — o limite existe contra varredura, não é uma
 * regra de segurança de acesso.
 */
export async function consumirTentativa(
  chave: string,
  janelaSegundos: number,
  limite: number,
): Promise<ResultadoLimite> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("registrar_tentativa", {
      _chave: chave,
      _janela_segundos: janelaSegundos,
      _limite: limite,
    });
    if (error) {
      await registrarFalhaSegura("rate-limit.consumirTentativa", error, { chave, limite });
      return { permitido: true, usadas: 0 };
    }
    const row = (Array.isArray(data) ? data[0] : data) as
      | { permitido?: boolean; usadas?: number }
      | undefined;
    return { permitido: row?.permitido !== false, usadas: Number(row?.usadas ?? 0) };
  } catch (e) {
    await registrarFalhaSegura("rate-limit.consumirTentativa", e, { chave, limite });
    return { permitido: true, usadas: 0 };
  }
}
