import { useCallback } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { moverParaGanhoOmie } from "@/lib/omie.functions";
import { useCrm, type StageId } from "@/lib/crm-store";

/**
 * Move um lead entre etapas. Se o alvo for "ganho", exige que exista uma
 * proposta com `status='pedido'` vinculada — caso contrário mostra a
 * pendência ao usuário. Em qualquer outra etapa, aplica direto no store
 * local (que sincroniza com o Supabase).
 */
export function useMoveLeadStage() {
  const moveLead = useCrm((s) => s.moveLead);
  const mover = useServerFn(moverParaGanhoOmie);

  return useCallback(
    async (leadId: string, stage: StageId, opts?: { onGanhoLabel?: string }) => {
      if (stage !== "ganho") {
        moveLead(leadId, stage);
        return { ok: true as const };
      }

      const t = toast.loading("Fechando o lead...");
      try {
        const r = await mover({ data: { lead_id: leadId } });
        if (!r.ok) {
          toast.dismiss(t);
          toast.error("Pendências antes do Ganho", {
            description: (r.validacao_erros ?? ["Erro desconhecido"]).join("\n"),
            duration: 8000,
          });
          return { ok: false as const, result: r };
        }

        moveLead(leadId, "ganho");
        toast.dismiss(t);
        toast.success(`${opts?.onGanhoLabel ?? "Lead"} → Ganho`);
        return { ok: true as const, result: r };
      } catch (e) {
        toast.dismiss(t);
        toast.error("Erro ao mover para Ganho", {
          description: e instanceof Error ? e.message : String(e),
        });
        return { ok: false as const };
      }
    },
    [mover, moveLead],
  );
}
