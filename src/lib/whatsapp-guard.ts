/**
 * Guardas explícitas de ESCRITA no WhatsApp.
 *
 * Antes do Xerife Humano, as funções de envio se protegiam só pelo fato de a
 * conversa não aparecer no SELECT para quem não pode atender. Com a permissão
 * de leitura por equipe (`whatsapp.ver_equipe`) a conversa passa a aparecer —
 * por isso toda ação que ESCREVE precisa exigir a permissão de atender de
 * forma explícita, nunca só a visibilidade.
 */
import { registrarFalhaSegura } from "@/lib/guard-erros";
import { PERM_WHATSAPP_ATENDER } from "@/lib/atendimento-espera";

/** Client Supabase autenticado do contexto (tipagem local, sem acoplar ao gerado). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseLike = any;

export const MSG_SOMENTE_LEITURA =
  "Você tem acesso somente de leitura a esta conversa.";

/**
 * A conversa pode ser TRABALHADA por este usuário?
 * `whatsapp_pode_atuar` já embute `whatsapp.atender` + regra de equipe do canal,
 * e é exatamente a mesma expressão da policy de leitura dos atendentes — ou
 * seja, não é mais restritiva do que a visibilidade que protegia antes.
 */
export async function assertPodeAtuarNaConversa(
  supabase: SupabaseLike,
  conversaId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("whatsapp_pode_atuar", {
    _conversa_id: conversaId,
  });
  if (error) {
    await registrarFalhaSegura("whatsapp-guard/whatsapp_pode_atuar", error, {
      conversa_id: conversaId,
    });
    throw new Error("Não foi possível confirmar o seu acesso a esta conversa.");
  }
  if (data !== true) throw new Error(MSG_SOMENTE_LEITURA);
}

/**
 * Para ações que ainda não têm conversa (iniciar conversa com um cliente):
 * exige a permissão de atender.
 */
export async function assertPodeAtender(
  supabase: SupabaseLike,
  userId: string,
): Promise<void> {
  const { data, error } = await supabase.rpc("tem_permissao", {
    _user_id: userId,
    _chave: PERM_WHATSAPP_ATENDER,
  });
  if (error) {
    await registrarFalhaSegura("whatsapp-guard/tem_permissao", error, { user_id: userId });
    throw new Error("Não foi possível confirmar a sua permissão de atendimento.");
  }
  if (data !== true) {
    throw new Error("Você não tem permissão para iniciar conversas no WhatsApp.");
  }
}
