import { useCallback } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { moverParaGanhoOmie } from "@/lib/omie.functions";
import { useCrm, type StageId } from "@/lib/crm-store";

/**
 * Move um lead entre etapas. Se o alvo for "ganho", roteia pela server fn
 * `moverParaGanhoOmie` que valida cliente/itens/condições e dispara o webhook do n8n
 * (INPLASTIC/TAOPLAST) ou marca como "não aplicável" (LICITAPLAS). Em qualquer outra
 * etapa, aplica direto no store local (que sincroniza com o Supabase).
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

      const t = toast.loading("Enviando para o Omie...");
      try {
        const r = await mover({ data: { lead_id: leadId } });
        if (!r.ok) {
          toast.dismiss(t);
          if (r.validacao_erros?.length) {
            toast.error("Pendências antes do Ganho", {
              description: r.validacao_erros.join("\n"),
              duration: 8000,
            });
          } else {
            toast.error("Falha ao enviar ao Omie", {
              description: r.omie_erro ?? "Erro desconhecido",
              duration: 8000,
            });
          }
          return { ok: false as const, result: r };
        }

        // Sucesso: sincroniza o stage no store local também.
        moveLead(leadId, "ganho");

        toast.dismiss(t);
        if (r.omie_status === "nao_aplicavel") {
          toast.success(`${opts?.onGanhoLabel ?? "Lead"} → Ganho`, {
            description: "LICITAPLAS: sem integração com Omie.",
          });
        } else if (r.omie_numero_pedido) {
          toast.success(`${opts?.onGanhoLabel ?? "Lead"} → Ganho`, {
            description: `Pedido Omie #${r.omie_numero_pedido}`,
          });
        } else {
          toast.success(`${opts?.onGanhoLabel ?? "Lead"} → Ganho`);
        }
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
