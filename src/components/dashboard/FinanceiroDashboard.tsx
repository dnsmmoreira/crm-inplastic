import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { listPedidos } from "@/lib/pedidos.functions";
import { decisoesFinanceirasSemana } from "@/lib/dashboard-operacao.functions";
import { PedidoDetailDrawer } from "@/components/pedidos/PedidoDetailDrawer";
import {
  AlertasPendentesCard,
  ContadorCard,
  ListaPedidosCard,
  Saudacao,
} from "@/components/dashboard/operacao-shared";
import { useAuth } from "@/hooks/use-auth";

/** Tela inicial do perfil Financeiro (chave `pedidos.aprovar_financeiro`). */
export function FinanceiroDashboard() {
  const { user } = useAuth();
  const [openPedidoId, setOpenPedidoId] = useState<string | null>(null);

  const listFn = useServerFn(listPedidos);
  const decisoesFn = useServerFn(decisoesFinanceirasSemana);

  const pedidosQ = useQuery({
    queryKey: ["pedidos", "list"],
    queryFn: () => listFn({}),
    staleTime: 30_000,
  });
  const decisoesQ = useQuery({
    queryKey: ["dashboard", "decisoes-financeiras-semana"],
    queryFn: () => decisoesFn({}),
    staleTime: 60_000,
  });

  const pedidos = useMemo(() => pedidosQ.data ?? [], [pedidosQ.data]);
  const analise = pedidos.filter((p) => p.stage === "analise_financeira");
  const aguardandoPgto = pedidos.filter((p) => p.stage === "aguardando_pagamento");

  return (
    <div className="space-y-6 p-4 md:p-8">
      <Saudacao
        nome={user?.name ?? ""}
        papel="Painel financeiro — aprovação e liberação de pedidos"
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <ContadorCard
          label="Aguardando aprovação"
          value={String(analise.length)}
          icon={CircleAlert}
        />
        <ContadorCard
          label="Aguardando pagamento"
          value={String(aguardandoPgto.length)}
          icon={CircleAlert}
        />
        <ContadorCard
          label="Aprovados na semana"
          value={decisoesQ.data ? String(decisoesQ.data.aprovados) : "—"}
          hint="últimos 7 dias"
          icon={CheckCircle2}
        />
        <ContadorCard
          label="Reprovados na semana"
          value={decisoesQ.data ? String(decisoesQ.data.reprovados) : "—"}
          hint="últimos 7 dias"
          icon={CircleAlert}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ListaPedidosCard
          titulo="Aguardando aprovação financeira"
          descricao="Pedidos em análise financeira, do mais antigo na etapa para o mais recente."
          pedidos={[...analise].sort((a, b) =>
            a.stage_changed_at.localeCompare(b.stage_changed_at),
          )}
          onOpen={setOpenPedidoId}
          destacarParado
          vazio="Nenhum pedido aguardando aprovação."
        />
        <ListaPedidosCard
          titulo="Aguardando pagamento antecipado"
          descricao="Pedidos aprovados que dependem da confirmação do pagamento."
          pedidos={[...aguardandoPgto].sort((a, b) =>
            a.stage_changed_at.localeCompare(b.stage_changed_at),
          )}
          onOpen={setOpenPedidoId}
          destacarParado
          vazio="Nenhum pedido aguardando pagamento."
        />
      </div>

      <AlertasPendentesCard />

      <PedidoDetailDrawer pedidoId={openPedidoId} onClose={() => setOpenPedidoId(null)} />
    </div>
  );
}
