import { useCallback } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { moverParaGanhoOmie } from "@/lib/omie.functions";
import { useCrm, type StageId } from "@/lib/crm-store";

/**
 * Etapas que exigem ao menos uma proposta vinculada ao lead.
 */
const STAGES_REQUIRING_PROPOSAL: StageId[] = ["proposta", "negociacao", "ganho"];

export type LostReasonInput = {
  motivo: string;
  motivoLabel: string;
  observacao?: string;
};

/**
 * Move um lead entre etapas.
 * - Etapas em `STAGES_REQUIRING_PROPOSAL` exigem ao menos uma proposta vinculada.
 * - Alvo "perdido" exige `lostReason`; sem ele o hook retorna
 *   `{ ok: false, reason: "needs_lost_reason" }` para o caller abrir o diálogo.
 * - Alvo "ganho" ainda passa pelo gate fiscal (`moverParaGanhoOmie`).
 */
export function useMoveLeadStage() {
  const moveLead = useCrm((s) => s.moveLead);
  const updateLead = useCrm((s) => s.updateLead);
  const addInteraction = useCrm((s) => s.addInteraction);
  const mover = useServerFn(moverParaGanhoOmie);

  return useCallback(
    async (
      leadId: string,
      stage: StageId,
      opts?: { onGanhoLabel?: string; lostReason?: LostReasonInput },
    ) => {
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

      if (stage === "perdido") {
        if (!opts?.lostReason) {
          return { ok: false as const, reason: "needs_lost_reason" as const };
        }
        const { motivoLabel, observacao } = opts.lostReason;
        const lead = useCrm.getState().leads.find((l) => l.id === leadId);
        const stamp = new Date().toLocaleString("pt-BR");
        const line = `[${stamp}] Perda — Motivo: ${motivoLabel}${
          observacao ? ` · ${observacao}` : ""
        }`;
        const prevNotes = lead?.notes ?? "";
        updateLead(leadId, {
          notes: prevNotes ? `${line}\n${prevNotes}` : line,
        });
        addInteraction(leadId, {
          date: new Date().toISOString(),
          type: "note",
          content: `Lead marcado como Perdido — Motivo: ${motivoLabel}${
            observacao ? `. Observação: ${observacao}` : ""
          }`,
        });
        moveLead(leadId, "perdido");
        return { ok: true as const };
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
    [mover, moveLead, updateLead, addInteraction],
  );
}
