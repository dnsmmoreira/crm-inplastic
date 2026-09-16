/**
 * Acompanhamento do Chat Interno — leitura das conversas do time.
 *
 * O gate real está no banco: `chat_supervisao_conversas` e
 * `chat_supervisao_mensagens` só respondem para o usuário supervisor
 * (hoje o Denis), e recusam qualquer outro, inclusive quem tem
 * `usuarios.gerenciar`. Aqui não há escrita nenhuma — nada de `last_read_at`.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import {
  PAGINA_SUPERVISAO,
  ordenarConversasSupervisao,
  type ConversaSupervisao,
  type MensagemSupervisao,
} from "@/lib/chat-supervisao";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

export const listarConversasSupervisao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ conversas: ConversaSupervisao[] }> => {
    const sb: LooseClient = context.supabase;
    const { data, error } = await sb.rpc("chat_supervisao_conversas");
    if (error) throw new Error(`Falha ao carregar as conversas do time: ${error.message}`);
    return { conversas: ordenarConversasSupervisao((data ?? []) as ConversaSupervisao[]) };
  });

export const mensagensSupervisao = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { canalId: string; antes?: string | null }) => {
    if (!input?.canalId) throw new Error("Conversa não informada.");
    return { canalId: input.canalId, antes: input.antes ?? null };
  })
  .handler(async ({ context, data }): Promise<{ mensagens: MensagemSupervisao[] }> => {
    const sb: LooseClient = context.supabase;
    const { data: rows, error } = await sb.rpc("chat_supervisao_mensagens", {
      _canal_id: data.canalId,
      _antes: data.antes,
      _limite: PAGINA_SUPERVISAO,
    });
    if (error) throw new Error(`Falha ao carregar as mensagens: ${error.message}`);
    return { mensagens: (rows ?? []) as MensagemSupervisao[] };
  });
