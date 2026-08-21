import { createContext, useContext } from "react";

/**
 * Conversas que já têm alerta com aceite obrigatório na fila do
 * `AlertasPendentesProvider`. O `NovaConversaAlerta` lê daqui e se cala,
 * para não existirem dois diálogos do mesmo evento.
 */
export const ConversasComAlertaCtx = createContext<ReadonlySet<string>>(new Set());

export function useConversasComAlertaPendente(): ReadonlySet<string> {
  return useContext(ConversasComAlertaCtx);
}
