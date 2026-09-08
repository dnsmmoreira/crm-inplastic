/**
 * Baixa e reabertura de tarefas fora da Minha Agenda (/tarefas e LeadDrawer).
 *
 * Todas as telas passam pelo MESMO caminho de servidor (`concluirTarefa`):
 * o front nunca escreve `tarefas.done` nem `status` direto. Quando a tarefa é
 * comercial do Xerife, o desfecho é obrigatório e vem do DesfechoTarefaDialog.
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { concluirTarefa, reabrirTarefa } from "@/lib/minha-agenda.functions";
import { DesfechoTarefaDialog } from "@/components/tarefas/DesfechoTarefaDialog";
import { exigeDesfecho, type DesfechoInput } from "@/lib/tarefa-desfecho";
import { useCrm, tarefaConcluida, type Task } from "@/lib/crm-store";

export function useBaixaTarefa() {
  const setTaskStatus = useCrm((s) => s.setTaskStatus);
  const [alvo, setAlvo] = useState<{ tarefa: Task; stageAtual: string | null } | null>(null);

  const concluirFn = useServerFn(concluirTarefa);
  const reabrirFn = useServerFn(reabrirTarefa);

  const mConcluir = useMutation({
    mutationFn: (input: { id: string; desfecho?: DesfechoInput }) => concluirFn({ data: input }),
    onSuccess: (r: any, vars) => {
      if (r && r.ok === false) {
        toast.error(r.message ?? "Escolha o desfecho desta tarefa.");
        return;
      }
      setTaskStatus(vars.id, {
        status: "concluida",
        desfecho: vars.desfecho?.tipo ?? "manual",
      });
      toast.success(r?.mensagem ?? "Tarefa concluída");
      if (r?.aviso) toast.warning(r.aviso);
      setAlvo(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao concluir a tarefa"),
  });

  const mReabrir = useMutation({
    mutationFn: (id: string) => reabrirFn({ data: { id } }),
    onSuccess: (r: any, id) => {
      setTaskStatus(id, { status: "pendente", desfecho: null, desfechoDetalhe: null });
      toast.success(r?.mensagem ?? "Tarefa reaberta");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao reabrir a tarefa"),
  });

  /** Clique no marcador: concluída volta a pendente; aberta é concluída. */
  const alternar = (tarefa: Task, stageAtual: string | null | undefined) => {
    if (tarefaConcluida(tarefa)) {
      mReabrir.mutate(tarefa.id);
      return;
    }
    const gate = {
      origem: tarefa.origem ?? "manual",
      tipo: tarefa.tipo ?? null,
      lead_id: tarefa.leadId || null,
      pedido_id: tarefa.pedidoId ?? null,
    };
    if (exigeDesfecho(gate as any)) {
      setAlvo({ tarefa, stageAtual: stageAtual ?? null });
      return;
    }
    mConcluir.mutate({ id: tarefa.id });
  };

  const dialog = (
    <DesfechoTarefaDialog
      open={!!alvo}
      onOpenChange={(o) => !o && setAlvo(null)}
      titulo={alvo?.tarefa.title ?? ""}
      stageAtual={alvo?.stageAtual ?? null}
      tipoTarefa={alvo?.tarefa.tipo ?? null}
      temLead={!!alvo?.tarefa.leadId}
      propostaId={(alvo?.tarefa as { propostaId?: string | null } | undefined)?.propostaId ?? null}
      pendente={mConcluir.isPending}
      onConfirmar={(d) => alvo && mConcluir.mutate({ id: alvo.tarefa.id, desfecho: d })}
    />
  );

  return { alternar, dialog, pendente: mConcluir.isPending || mReabrir.isPending };
}
