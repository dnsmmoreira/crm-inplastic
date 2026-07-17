import { useCallback } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { moverParaGanhoOmie } from "@/lib/omie.functions";
import { useCrm, type StageId } from "@/lib/crm-store";

/**
 * Etapas que exigem ao menos uma proposta vinculada ao lead
 * (independente de status; recusadas também contam como registro histórico?
 * Aqui bloqueamos apenas se NÃO houver nenhuma proposta — não filtramos por status
 * para manter genérico).
 */
const STAGES_REQUIRING_PROPOSAL: StageId[] = ["proposta", "negociacao", "ganho"];

/**
 * Move um lead entre etapas.
 * - Etapas em `STAGES_REQUIRING_PROPOSAL` exigem ao menos uma proposta vinculada.
 * - Alvo "ganho" ainda passa pelo gate fiscal (`moverParaGanhoOmie`).
 * - Demais etapas aplicam direto no store (sincroniza com Supabase).
 */
export function useMoveLeadStage() {
  const moveLead = useCrm((s) => s.moveLead);
  const mover = useServerFn(moverParaGanhoOmie);

  return useCallback(
    async (leadId: string, stage: StageId, opts?: { onGanhoLabel?: string }) => {
      if (STAGES_REQUIRING_PROPOSAL.includes(stage)) {
        const proposals = useCrm.getState().proposals;
        const hasProposal = proposals.some((p) => p.leadId === leadId);
        if (!hasProposal) {
          const stageLabel =
            stage === "proposta" ? "Proposta Enviada"
            : stage === "negociacao" ? "Negociação"
            : "Ganho";
          toast.error(`Crie uma proposta antes de mover para ${stageLabel}`, {
            description: "Vincule pelo menos uma proposta ao lead para avançar nesta etapa.",
          });
          return { ok: false as const, reason: "no_proposal" as const };
        }
      }

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
