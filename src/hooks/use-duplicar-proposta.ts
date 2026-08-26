/**
 * Duplicação de proposta/pedido em nova proposta rascunho.
 *
 * Depois da chamada ao servidor, re-hidrata o store CRM (mesmo caminho usado
 * no login em `use-auth`) antes de navegar — sem isso a tela nova abre vazia.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { duplicarProposta, duplicarPedidoEmProposta } from "@/lib/propostas.functions";
import { hydrateCrmForUser } from "@/lib/crm-sync";
import { useAuth } from "@/hooks/use-auth";

export function useDuplicarProposta() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const dupProposta = useServerFn(duplicarProposta);
  const dupPedido = useServerFn(duplicarPedidoEmProposta);
  const [duplicando, setDuplicando] = useState(false);

  async function run(fn: () => Promise<{ id: string; number: string }>) {
    if (duplicando) return;
    setDuplicando(true);
    try {
      const nova = await fn();
      if (user) await hydrateCrmForUser(user.id, user.role);
      toast.success(`Proposta ${nova.number} criada em rascunho`);
      await navigate({ to: "/propostas/$id", params: { id: nova.id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao duplicar");
    } finally {
      setDuplicando(false);
    }
  }

  return {
    duplicando,
    duplicarProposta: (propostaId: string) => run(() => dupProposta({ data: { propostaId } })),
    duplicarPedido: (pedidoId: string) => run(() => dupPedido({ data: { pedidoId } })),
  };
}
