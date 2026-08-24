import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Factory, PackageCheck, Rocket } from "lucide-react";
import { listPedidos } from "@/lib/pedidos.functions";
import { tarefasProducaoAbertas } from "@/lib/dashboard-operacao.functions";
import { PedidoDetailDrawer } from "@/components/pedidos/PedidoDetailDrawer";
import {
  AlertasPendentesCard,
  ContadorCard,
  DIAS_PARADO_ALERTA,
  ListaPedidosCard,
  Saudacao,
} from "@/components/dashboard/operacao-shared";
import { useAuth } from "@/hooks/use-auth";

/** Tela inicial do perfil Operacional (chave `pedidos.operar_producao`). */
export function OperacionalDashboard() {
  const { user } = useAuth();
  const [openPedidoId, setOpenPedidoId] = useState<string | null>(null);

  const listFn = useServerFn(listPedidos);
  const tarefasFn = useServerFn(tarefasProducaoAbertas);

  const pedidosQ = useQuery({
    queryKey: ["pedidos", "list"],
    queryFn: () => listFn({}),
    staleTime: 30_000,
  });
  const tarefasQ = useQuery({
    queryKey: ["dashboard", "tarefas-producao"],
    queryFn: () => tarefasFn({}),
    staleTime: 60_000,
  });

  const pedidos = useMemo(() => pedidosQ.data ?? [], [pedidosQ.data]);
  const prazoPorPedido = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const t of tarefasQ.data ?? []) if (!m.has(t.pedido_id)) m.set(t.pedido_id, t.due_date);
    return m;
  }, [tarefasQ.data]);

  const porEtapa = (stage: string) =>
    pedidos
      .filter((p) => p.stage === stage)
      .sort((a, b) => a.stage_changed_at.localeCompare(b.stage_changed_at));

  const liberados = porEtapa("programacao");
  const producao = porEtapa("em_producao");
  const prontos = porEtapa("pronto");

  return (
    <div className="space-y-6 p-4 md:p-8">
      <Saudacao
        nome={user?.name ?? ""}
        papel={`Painel operacional — programação, produção e expedição (destaque após ${DIAS_PARADO_ALERTA} dias na mesma etapa)`}
      />

      <div className="grid grid-cols-3 gap-4">
        <ContadorCard label="Liberados" value={String(liberados.length)} icon={Rocket} />
        <ContadorCard label="Em produção" value={String(producao.length)} icon={Factory} />
        <ContadorCard label="Prontos" value={String(prontos.length)} icon={PackageCheck} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ListaPedidosCard
          titulo="Liberados para programação"
          descricao="Aprovados pelo financeiro, aguardando entrar na fila de produção."
          pedidos={liberados}
          onOpen={setOpenPedidoId}
          destacarParado
          vazio="Nenhum pedido liberado no momento."
        />
        <ListaPedidosCard
          titulo="Em produção"
          descricao="Pedidos em fabricação, com o prazo da tarefa de acompanhamento quando existir."
          pedidos={producao}
          onOpen={setOpenPedidoId}
          destacarParado
          vazio="Nenhum pedido em produção."
          extra={(p) => {
            const prazo = prazoPorPedido.get(p.id);
            if (!prazo) return null;
            return (
              <div className="text-xs text-muted-foreground">
                Acompanhar produção até {new Date(prazo).toLocaleDateString("pt-BR")}
              </div>
            );
          }}
        />
        <ListaPedidosCard
          titulo="Prontos aguardando coleta/entrega"
          descricao="Produção concluída, pendente de expedição."
          pedidos={prontos}
          onOpen={setOpenPedidoId}
          destacarParado
          vazio="Nenhum pedido pronto."
        />
      </div>

      <AlertasPendentesCard />

      <PedidoDetailDrawer pedidoId={openPedidoId} onClose={() => setOpenPedidoId(null)} />
    </div>
  );
}
