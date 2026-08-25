import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  ClipboardCheck,
  ShieldCheck,
  ShieldAlert,
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  Loader2,
  Bell,
  Package,
  Wallet,
  History as HistoryIcon,
  MessageSquareText,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/crm-store";
import { formatDateBr } from "@/lib/condicoes-comerciais";
import {
  getPedidoDetalhes,
  decidirAprovacao,
  reprovarPedidoFinanceiro,

  updatePedidoStage,
  salvarChecklistConferencia,
  atualizarStatusFiscal,
  registrarOcorrencia,
  resolverOcorrencia,
  listPedidoNotificacoes,
  PEDIDO_STAGES,
  type ChecklistItem,
  type PedidoDetalhes,
  type PedidoStageId,
  type PedidoNotificacaoRow,
} from "@/lib/pedidos.functions";

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: "conf-produto", label: "Produto/SKU conferido", done: false },
  { id: "conf-qtd", label: "Quantidade conferida", done: false },
  { id: "conf-embal", label: "Embalagem/rotulagem OK", done: false },
  { id: "conf-peso", label: "Peso/volume batendo", done: false },
  { id: "conf-doc", label: "Documentos anexos completos", done: false },
  { id: "pronto", label: "Pronto para faturamento/expedição", done: false },
];

const OCORRENCIA_TIPOS = [
  "Bloqueio comercial",
  "Bloqueio fiscal",
  "Bloqueio financeiro",
  "Divergência de estoque",

  "Atraso de produção",
  "Avaria",
  "Cliente solicitou alteração",
  "Documentação faltando",
  "Outro",
];

type Props = {
  pedidoId: string | null;
  onClose: () => void;
};

export function PedidoDetailDrawer({ pedidoId, onClose }: Props) {
  const getFn = useServerFn(getPedidoDetalhes);
  const qc = useQueryClient();

  const detailQ = useQuery({
    queryKey: ["pedido", "detail", pedidoId],
    queryFn: () => getFn({ data: { pedido_id: pedidoId! } }),
    enabled: !!pedidoId,
    refetchOnWindowFocus: false,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["pedido", "detail", pedidoId] });
    void qc.invalidateQueries({ queryKey: ["pedidos", "kanban"] });
  };

  return (
    <Sheet open={!!pedidoId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0">
        {detailQ.isLoading ? (
          <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : detailQ.isError || !detailQ.data ? (
          <div className="p-6 text-sm text-destructive">Erro ao carregar pedido.</div>
        ) : (
          <PedidoDetailBody pedido={detailQ.data} onChanged={invalidate} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function PedidoDetailBody({
  pedido,
  onChanged,
}: {
  pedido: PedidoDetalhes;
  onChanged: () => void;
}) {
  const stageLabel = PEDIDO_STAGES.find((s) => s.id === pedido.stage)?.label ?? pedido.stage;
  // Quem aprova e quem opera precisam de coisas diferentes: a etapa decide a visão.
  const visaoFinanceira =
    pedido.stage === "analise_financeira" || pedido.stage === "aguardando_pagamento";
  const visaoReprovado = pedido.stage === "reprovado_financeiro";


  return (
    <div className="flex flex-col h-full">
      <SheetHeader className="p-6 pb-4 border-b">
        <div className="min-w-0 space-y-1">
          <SheetTitle className="font-mono text-base">{pedido.number}</SheetTitle>
          <SheetDescription asChild>
            <div className="space-y-1">
              <div>
                <Badge variant="secondary">{stageLabel}</Badge>
                <span className="ml-2 text-primary font-semibold">{formatBRL(pedido.total)}</span>
              </div>
              <div className="text-sm font-medium text-foreground truncate">
                {pedido.cliente_nome ?? "Cliente não identificado"}
              </div>
              <div className="text-xs text-muted-foreground">
                {pedido.cliente_cnpj ?? "CNPJ não informado"} · Vendedor:{" "}
                {pedido.vendedor_nome ?? "—"}
              </div>
            </div>
          </SheetDescription>
        </div>
      </SheetHeader>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          {visaoReprovado ? (
            <>
              <ItensBlock pedido={pedido} comValores={false} />
              <TratativaBlock pedido={pedido} />
              <DecisaoLeitura pedido={pedido} />
            </>
          ) : visaoFinanceira ? (
            <>
              <ItensBlock pedido={pedido} comValores />
              <PagamentoBlock pedido={pedido} completo />
              <HistoricoClienteBlock pedido={pedido} />
              <TratativaBlock pedido={pedido} />
              <AprovacaoBlock pedido={pedido} onChanged={onChanged} />
              <OcorrenciasBlock pedido={pedido} onChanged={onChanged} />
            </>
          ) : (

            <>
              <ItensBlock pedido={pedido} comValores={false} />
              <ChecklistBlock pedido={pedido} onChanged={onChanged} />
              <FiscalBlock pedido={pedido} onChanged={onChanged} />
              <OcorrenciasBlock pedido={pedido} onChanged={onChanged} />
              <NotificacoesBlock pedidoId={pedido.id} />
              <PagamentoBlock pedido={pedido} completo={false} />
              {pedido.aprovacao_decisao && <DecisaoLeitura pedido={pedido} />}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

/* ----------------------------------- Itens ---------------------------------- */

function ItensBlock({ pedido, comValores }: { pedido: PedidoDetalhes; comValores: boolean }) {
  const desconto =
    pedido.desconto_percent > 0
      ? +(pedido.subtotal * (pedido.desconto_percent / 100)).toFixed(2)
      : 0;

  return (
    <section className="space-y-3">
      <SectionTitle
        icon={<Package className="h-4 w-4" />}
        label="Itens"
        right={
          <span className="text-xs text-muted-foreground">{pedido.itens.length} item(ns)</span>
        }
      />
      <div className="rounded-lg border overflow-hidden">
        {pedido.itens.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground italic">
            Nenhum item registrado neste pedido.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2">Produto</th>
                <th className="text-right p-2 w-16">Qtd</th>
                <th className="text-left p-2 w-14">Un.</th>
                {comValores && <th className="text-right p-2 w-24">Unitário</th>}
                {comValores && <th className="text-right p-2 w-24">Total</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {pedido.itens.map((i, idx) => (
                <tr key={`${i.sku ?? "s"}-${idx}`}>
                  <td className="p-2">
                    <div className="font-medium">{i.description ?? "—"}</div>
                    {i.sku && (
                      <div className="text-[10px] font-mono text-muted-foreground">{i.sku}</div>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums">{i.quantity}</td>
                  <td className="p-2">{i.unit ?? "—"}</td>
                  {comValores && (
                    <td className="p-2 text-right tabular-nums">{formatBRL(i.unit_price)}</td>
                  )}
                  {comValores && (
                    <td className="p-2 text-right tabular-nums">
                      {formatBRL(i.quantity * i.unit_price)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {comValores && (
              <tfoot className="bg-muted/30">
                <tr>
                  <td className="p-2 text-right" colSpan={4}>
                    Subtotal
                  </td>
                  <td className="p-2 text-right tabular-nums">{formatBRL(pedido.subtotal)}</td>
                </tr>
                {desconto > 0 && (
                  <tr>
                    <td className="p-2 text-right" colSpan={4}>
                      Desconto ({pedido.desconto_percent}%)
                    </td>
                    <td className="p-2 text-right tabular-nums">− {formatBRL(desconto)}</td>
                  </tr>
                )}
                <tr className="font-semibold">
                  <td className="p-2 text-right" colSpan={4}>
                    Total
                  </td>
                  <td className="p-2 text-right tabular-nums text-primary">
                    {formatBRL(pedido.total)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>
    </section>
  );
}

/* --------------------------------- Pagamento -------------------------------- */

function PagamentoBlock({ pedido, completo }: { pedido: PedidoDetalhes; completo: boolean }) {
  return (
    <section className="space-y-3">
      <SectionTitle icon={<Wallet className="h-4 w-4" />} label="Pagamento" />
      <div className="rounded-lg border p-3 space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-muted-foreground">Forma de pagamento</div>
            <div className="font-medium">{pedido.forma_pagamento ?? "—"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Condição</div>
            <div className="font-medium">{pedido.condicao_label ?? "—"}</div>
          </div>
        </div>

        {completo && (
          <>
            {pedido.previsao_faturamento ? (
              <div className="text-xs">
                <span className="text-muted-foreground">Previsão de faturamento: </span>
                <b>{formatDateBr(pedido.previsao_faturamento)}</b>
              </div>
            ) : (
              <div className="text-xs font-medium rounded border border-amber-500/40 bg-amber-500/10 text-amber-700 px-2 py-1.5">
                Previsão de faturamento não informada
              </div>
            )}

            {pedido.parcelas.length > 0 && (
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 w-12">Nº</th>
                    <th className="text-left p-2">Prazo</th>
                    <th className="text-left p-2">Vencimento</th>
                    <th className="text-right p-2">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pedido.parcelas.map((p, i) => (
                    <tr key={i}>
                      <td className="p-2">
                        {i + 1}/{pedido.parcelas.length}
                      </td>
                      <td className="p-2">{p.days === 0 ? "à vista" : `${p.days} dias`}</td>
                      <td className="p-2">{formatDateBr(p.due_date)}</td>
                      <td className="p-2 text-right tabular-nums">{formatBRL(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* --------------------------- Histórico do cliente --------------------------- */

function HistoricoClienteBlock({ pedido }: { pedido: PedidoDetalhes }) {
  const h = pedido.historico_cliente;
  return (
    <section className="space-y-3">
      <SectionTitle
        icon={<HistoryIcon className="h-4 w-4" />}
        label="Histórico do cliente"
        right={
          h.parcial ? (
            <span className="text-[11px] text-muted-foreground">parcial · sem CNPJ no lead</span>
          ) : null
        }
      />
      <div className="rounded-lg border p-3 space-y-3">
        {h.primeira_compra ? (
          <div className="text-sm font-medium rounded border border-sky-500/40 bg-sky-500/10 text-sky-700 px-2 py-1.5">
            Primeira compra deste cliente
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric label="Pedidos" value={String(h.quantidade)} />
            <Metric label="Valor acumulado" value={formatBRL(h.valor_total)} />
            <Metric
              label="Última compra"
              value={h.ultimo_em ? format(new Date(h.ultimo_em), "dd/MM/yyyy") : "—"}
            />
          </div>
        )}

        {h.tem_ocorrencia_aberta && (
          <div className="text-xs font-medium rounded border border-rose-500/40 bg-rose-500/10 text-rose-700 px-2 py-1.5 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Existe ocorrência em aberto em pedido anterior deste cliente.
          </div>
        )}

        {h.recentes.length > 0 && (
          <ul className="divide-y text-xs">
            {h.recentes.map((r) => (
              <li key={r.id} className="py-1.5 flex items-center gap-2">
                <span className="font-mono">{r.number}</span>
                <span className="text-muted-foreground">
                  {format(new Date(r.created_at), "dd/MM/yyyy")}
                </span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {stageLabelFor(r.stage as PedidoStageId)}
                </Badge>
                <span className="ml-auto tabular-nums">{formatBRL(r.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}

/* ---------------------------- Tratativa comercial --------------------------- */

function TratativaBlock({ pedido }: { pedido: PedidoDetalhes }) {
  const texto = (pedido.tratativa_comercial ?? "").trim();
  return (
    <section className="space-y-3">
      <SectionTitle icon={<MessageSquareText className="h-4 w-4" />} label="Tratativa comercial" />
      <div className="rounded-lg border p-3 text-sm whitespace-pre-wrap bg-muted/20">
        {texto || (
          <span className="italic text-muted-foreground">
            O vendedor não registrou a tratativa desta proposta.
          </span>
        )}
      </div>
    </section>
  );
}

/* ------------------------- Decisão de aprovação (RO) ------------------------ */

function DecisaoLeitura({ pedido }: { pedido: PedidoDetalhes }) {
  return (
    <section className="space-y-3">
      <SectionTitle icon={<ShieldCheck className="h-4 w-4" />} label="Aprovação" />
      <div
        className={cn(
          "rounded-lg border p-3 text-sm space-y-1",
          pedido.aprovacao_decisao === "aprovado"
            ? "bg-emerald-500/10 border-emerald-500/30"
            : "bg-rose-500/10 border-rose-500/30",
        )}
      >
        <div className="flex items-center gap-1.5 font-medium">
          {pedido.aprovacao_decisao === "aprovado" ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Aprovado
            </>
          ) : (
            <>
              <XCircle className="h-4 w-4 text-rose-600" /> Rejeitado
            </>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {pedido.aprovacao_decidida_por_nome ?? "—"}
          {pedido.aprovacao_decidida_em &&
            ` em ${format(new Date(pedido.aprovacao_decidida_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}`}
        </div>
        {pedido.aprovacao_observacao && (
          <div className="whitespace-pre-wrap">{pedido.aprovacao_observacao}</div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------ Notificações (RO) --------------------------- */

const CLASSIFICACAO_LABEL: Record<PedidoNotificacaoRow["classificacao"], string> = {
  informativa: "Informativa",
  acao_necessaria: "Ação necessária",
  alerta: "Alerta",
};

const STATUS_LABEL: Record<PedidoNotificacaoRow["status"], string> = {
  pendente: "Pendente",
  enviado: "Enviado",
  entregue: "Entregue",
  falhou: "Falhou",
  reprocessado: "Reprocessado",
};

function stageLabelFor(id: PedidoStageId | null): string {
  if (!id) return "—";
  return PEDIDO_STAGES.find((s) => s.id === id)?.label ?? id;
}

function NotificacoesBlock({ pedidoId }: { pedidoId: string }) {
  const listFn = useServerFn(listPedidoNotificacoes);
  const q = useQuery({
    queryKey: ["pedido", "notificacoes", pedidoId],
    queryFn: () => listFn({ data: { pedido_id: pedidoId } }),
    refetchOnWindowFocus: false,
  });
  const rows = q.data ?? [];

  return (
    <section className="space-y-3">
      <SectionTitle
        icon={<Bell className="h-4 w-4" />}
        label="Notificações"
        right={
          <span className="text-xs text-muted-foreground">somente leitura · envio desativado</span>
        }
      />
      <div className="rounded-lg border">
        {q.isLoading ? (
          <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground italic">
            Nenhum evento registrado para este pedido.
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map((n) => (
              <li key={n.id} className="p-3 space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{format(new Date(n.criado_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                  <div className="flex items-center gap-1">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-1.5 py-0",
                        n.classificacao === "acao_necessaria" &&
                          "border-amber-500/40 text-amber-700 bg-amber-500/10",
                        n.classificacao === "alerta" &&
                          "border-rose-500/40 text-rose-700 bg-rose-500/10",
                      )}
                    >
                      {CLASSIFICACAO_LABEL[n.classificacao]}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      {STATUS_LABEL[n.status]}
                    </Badge>
                  </div>
                </div>
                <div className="text-xs">
                  <span className="text-muted-foreground">Etapa: </span>
                  <b>{stageLabelFor(n.etapa_anterior)}</b>
                  <span className="text-muted-foreground"> → </span>
                  <b>{stageLabelFor(n.nova_etapa)}</b>
                </div>
                <div className="text-xs text-foreground/80 line-clamp-2 whitespace-pre-wrap">
                  {n.mensagem}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* --------------------------------- Aprovação -------------------------------- */

function AprovacaoBlock({ pedido, onChanged }: { pedido: PedidoDetalhes; onChanged: () => void }) {
  const decidirFn = useServerFn(decidirAprovacao);
  const moverFn = useServerFn(updatePedidoStage);
  const reprovarFn = useServerFn(reprovarPedidoFinanceiro);
  const [observacao, setObservacao] = useState("");
  const [erroMotivo, setErroMotivo] = useState<string | null>(null);

  const reprovar = useMutation({
    mutationFn: async (motivo: string) => {
      const r = await reprovarFn({ data: { pedido_id: pedido.id, motivo } });
      if (!r.ok) throw new Error(r.message);
      return r;
    },
    onSuccess: () => {
      toast.success("Pedido reprovado — proposta reaberta no funil");
      setObservacao("");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });


  /**
   * Aprovar = decidir + liberar na mesma ação (nunca só metade).
   * A movimentação vai primeiro: se `updatePedidoStage` recusar a transição,
   * a decisão NÃO é gravada e a mensagem dela é exibida.
   */
  const aprovarEMover = useMutation({
    mutationFn: async (destino: "programacao" | "aguardando_pagamento") => {
      if (pedido.stage !== destino) {
        const r = await moverFn({ data: { pedido_id: pedido.id, stage: destino } });
        if (!r.ok) throw new Error(r.message);
      }
      await decidirFn({
        data: { pedido_id: pedido.id, decisao: "aprovado", observacao: observacao || undefined },
      });
      return destino;
    },
    onSuccess: (destino) => {
      toast.success(
        destino === "programacao"
          ? "Pedido aprovado e liberado"
          : "Pedido aprovado — aguardando pagamento antecipado",
      );
      setObservacao("");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Quem aprova decide direto: os botões não dependem de uma solicitação prévia.
  const showDecision = !pedido.aprovacao_decisao;

  return (
    <section className="space-y-3">
      <SectionTitle icon={<ShieldCheck className="h-4 w-4" />} label="Aprovação" />
      {pedido.aprovacao_solicitada_em && (
        <div className="rounded-lg border p-3 text-sm space-y-1 bg-muted/30">
          <div className="text-xs text-muted-foreground">
            Solicitada por <b>{pedido.aprovacao_solicitada_por_nome ?? "—"}</b> em{" "}
            {format(new Date(pedido.aprovacao_solicitada_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </div>
          {pedido.aprovacao_motivo && (
            <div className="whitespace-pre-wrap">{pedido.aprovacao_motivo}</div>
          )}
        </div>
      )}
      {pedido.aprovacao_decisao && (
        <div
          className={cn(
            "rounded-lg border p-3 text-sm space-y-1",
            pedido.aprovacao_decisao === "aprovado"
              ? "bg-emerald-500/10 border-emerald-500/30"
              : "bg-rose-500/10 border-rose-500/30",
          )}
        >
          <div className="flex items-center gap-1.5 font-medium">
            {pedido.aprovacao_decisao === "aprovado" ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Aprovado
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-rose-600" /> Rejeitado
              </>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {pedido.aprovacao_decidida_por_nome ?? "—"} em{" "}
            {pedido.aprovacao_decidida_em &&
              format(new Date(pedido.aprovacao_decidida_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </div>
          {pedido.aprovacao_observacao && (
            <div className="whitespace-pre-wrap">{pedido.aprovacao_observacao}</div>
          )}
        </div>
      )}

      {showDecision && (
        <div className="space-y-2 rounded-lg border p-3">
          <Label className="text-xs">Motivo da reprovação (obrigatório para rejeitar)</Label>
          <Textarea
            rows={2}
            value={observacao}
            onChange={(e) => {
              setObservacao(e.target.value);
              if (erroMotivo) setErroMotivo(null);
            }}
          />
          {erroMotivo && <p className="text-xs text-destructive">{erroMotivo}</p>}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={aprovarEMover.isPending || reprovar.isPending}
              onClick={() => aprovarEMover.mutate("programacao")}
              title="Aprova e libera o pedido (etapa Liberado)"
            >
              {aprovarEMover.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-1" />
              )}
              Aprovar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={aprovarEMover.isPending || reprovar.isPending}
              onClick={() => aprovarEMover.mutate("aguardando_pagamento")}
              title="Aprova condicionado a pagamento antecipado"
            >
              <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar com pagamento antecipado
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={reprovar.isPending || aprovarEMover.isPending}
              onClick={() => {
                const motivo = observacao.trim();
                if (motivo.length < 3) {
                  setErroMotivo("Informe o motivo da reprovação (mínimo 3 caracteres).");
                  return;
                }
                setErroMotivo(null);
                reprovar.mutate(motivo);
              }}
            >
              {reprovar.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-1" />
              )}
              Rejeitar
            </Button>
          </div>
        </div>
      )}

    </section>
  );
}

/* --------------------------------- Checklist -------------------------------- */

function ChecklistBlock({ pedido, onChanged }: { pedido: PedidoDetalhes; onChanged: () => void }) {
  const salvarFn = useServerFn(salvarChecklistConferencia);
  const initial = useMemo<ChecklistItem[]>(
    () =>
      pedido.checklist_conferencia.length > 0 ? pedido.checklist_conferencia : DEFAULT_CHECKLIST,
    [pedido.checklist_conferencia],
  );
  const [items, setItems] = useState<ChecklistItem[]>(initial);
  const [newLabel, setNewLabel] = useState("");
  useEffect(() => setItems(initial), [initial]);

  const isConferencia: PedidoStageId[] = [
    "aguardando_pagamento",
    "programacao",
    "em_producao",
    "pronto",
    "faturado_em_rota",
    "pos_venda",
  ];
  const relevant = isConferencia.includes(pedido.stage);
  const done = items.filter((i) => i.done).length;

  const isProntoItem = (it: ChecklistItem) =>
    it.id === "pronto" || /pronto\s+para\s+(faturamento|expedi)/i.test(it.label);
  const outrosPendentes = items.filter((i) => !isProntoItem(i) && !i.done).length;
  const prontoLocked = outrosPendentes > 0;

  const salvar = useMutation({
    mutationFn: () => salvarFn({ data: { pedido_id: pedido.id, items } }),
    onSuccess: () => {
      toast.success("Checklist salvo");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="space-y-3">
      <SectionTitle
        icon={<ClipboardCheck className="h-4 w-4" />}
        label="Checklist de conferência"
        right={
          <span className="text-xs text-muted-foreground">
            {done}/{items.length} · {relevant ? "aplicável" : "informativo"}
          </span>
        }
      />
      <div className="space-y-2 rounded-lg border p-3">
        {items.map((it, idx) => {
          const pronto = isProntoItem(it);
          const disabled = pronto && prontoLocked && !it.done;
          return (
            <div key={it.id} className="flex items-start gap-2">
              <Checkbox
                checked={it.done}
                disabled={disabled}
                onCheckedChange={(v) => {
                  if (disabled) return;
                  const copy = [...items];
                  copy[idx] = { ...it, done: v === true };
                  setItems(copy);
                }}
                id={`chk-${it.id}`}
              />
              <label
                htmlFor={`chk-${it.id}`}
                className={cn(
                  "text-sm cursor-pointer",
                  it.done && "line-through text-muted-foreground",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                {it.label}
                {pronto && (
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                    gate
                  </span>
                )}
              </label>
              {disabled && (
                <span className="ml-auto text-[11px] text-muted-foreground">
                  bloqueado: {outrosPendentes} item(ns) pendente(s)
                </span>
              )}
            </div>
          );
        })}
        <div className="flex gap-2 pt-2 border-t mt-2">
          <Input
            placeholder="Adicionar item…"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            className="h-8"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={newLabel.trim().length < 1}
            onClick={() => {
              setItems([...items, { id: `c-${Date.now()}`, label: newLabel.trim(), done: false }]);
              setNewLabel("");
            }}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        <Button size="sm" disabled={salvar.isPending} onClick={() => salvar.mutate()}>
          Salvar checklist
        </Button>
        {pedido.checklist_atualizado_em && (
          <div className="text-[11px] text-muted-foreground">
            Atualizado em{" "}
            {format(new Date(pedido.checklist_atualizado_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------------------------------- Fiscal ---------------------------------- */

const FISCAL_LABELS: Record<string, string> = {
  nao_iniciado: "Não iniciado",
  em_processamento: "Em processamento",
  emitida: "Emitida",
  erro: "Erro",
};

function FiscalBlock({ pedido, onChanged }: { pedido: PedidoDetalhes; onChanged: () => void }) {
  const atualizarFn = useServerFn(atualizarStatusFiscal);
  const [status, setStatus] = useState(pedido.fiscal_status ?? "nao_iniciado");
  const [nfNumero, setNfNumero] = useState(pedido.nf_numero ?? "");
  const [nfSerie, setNfSerie] = useState(pedido.nf_serie ?? "");
  const [nfChave, setNfChave] = useState(pedido.nf_chave ?? "");
  const [nfValor, setNfValor] = useState<string>(
    pedido.nf_valor != null ? String(pedido.nf_valor) : "",
  );

  useEffect(() => {
    setStatus(pedido.fiscal_status ?? "nao_iniciado");
    setNfNumero(pedido.nf_numero ?? "");
    setNfSerie(pedido.nf_serie ?? "");
    setNfChave(pedido.nf_chave ?? "");
    setNfValor(pedido.nf_valor != null ? String(pedido.nf_valor) : "");
  }, [
    pedido.id,
    pedido.fiscal_status,
    pedido.nf_numero,
    pedido.nf_serie,
    pedido.nf_chave,
    pedido.nf_valor,
  ]);

  const salvar = useMutation({
    mutationFn: () => {
      const valorNum = nfValor ? Number(nfValor.replace(",", ".")) : undefined;
      return atualizarFn({
        data: {
          pedido_id: pedido.id,
          fiscal_status: status,
          nf_numero: nfNumero,
          nf_serie: nfSerie,
          nf_chave: nfChave,
          nf_valor: valorNum && !Number.isNaN(valorNum) ? valorNum : undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Status fiscal atualizado");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="space-y-3">
      <SectionTitle icon={<FileCheck2 className="h-4 w-4" />} label="Status fiscal" />
      <div className="space-y-3 rounded-lg border p-3">
        <div>
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FISCAL_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Nº NF</Label>
            <Input value={nfNumero} onChange={(e) => setNfNumero(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Série</Label>
            <Input value={nfSerie} onChange={(e) => setNfSerie(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Chave (44)</Label>
          <Input value={nfChave} onChange={(e) => setNfChave(e.target.value)} maxLength={44} />
        </div>
        <div>
          <Label className="text-xs">Valor NF (R$)</Label>
          <Input
            inputMode="decimal"
            value={nfValor}
            onChange={(e) => setNfValor(e.target.value)}
            placeholder="0,00"
          />
        </div>
        <Button size="sm" disabled={salvar.isPending} onClick={() => salvar.mutate()}>
          Salvar status fiscal
        </Button>
        {pedido.nf_emitida_em && (
          <div className="text-[11px] text-muted-foreground">
            NF emitida em{" "}
            {format(new Date(pedido.nf_emitida_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </div>
        )}
      </div>
    </section>
  );
}

/* -------------------------------- Ocorrências ------------------------------- */

function OcorrenciasBlock({
  pedido,
  onChanged,
}: {
  pedido: PedidoDetalhes;
  onChanged: () => void;
}) {
  const registrarFn = useServerFn(registrarOcorrencia);
  const resolverFn = useServerFn(resolverOcorrencia);
  const [tipo, setTipo] = useState(OCORRENCIA_TIPOS[0]);
  const [severidade, setSeveridade] = useState<"baixa" | "media" | "alta" | "critica">("media");
  const [descricao, setDescricao] = useState("");
  const [notaResolucao, setNotaResolucao] = useState<Record<string, string>>({});

  const registrar = useMutation({
    mutationFn: () => registrarFn({ data: { pedido_id: pedido.id, tipo, severidade, descricao } }),
    onSuccess: () => {
      toast.success("Ocorrência registrada");
      setDescricao("");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const resolver = useMutation({
    mutationFn: (ocorrencia_id: string) =>
      resolverFn({
        data: { ocorrencia_id, resolucao_nota: notaResolucao[ocorrencia_id] || undefined },
      }),
    onSuccess: () => {
      toast.success("Ocorrência resolvida");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const abertas = pedido.ocorrencias.filter((o) => !o.resolvida);
  const resolvidas = pedido.ocorrencias.filter((o) => o.resolvida);

  return (
    <section className="space-y-3">
      <SectionTitle
        icon={<AlertTriangle className="h-4 w-4" />}
        label="Ocorrências"
        right={
          abertas.length > 0 ? (
            <Badge className="bg-rose-500/15 text-rose-700 border-rose-500/30">
              {abertas.length} aberta{abertas.length > 1 ? "s" : ""}
            </Badge>
          ) : null
        }
      />

      <div className="space-y-3 rounded-lg border p-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OCORRENCIA_TIPOS.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Severidade</Label>
            <Select value={severidade} onValueChange={(v) => setSeveridade(v as typeof severidade)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="critica">Crítica</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-xs">Descrição</Label>
          <Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </div>
        <Button
          size="sm"
          disabled={descricao.trim().length < 3 || registrar.isPending}
          onClick={() => registrar.mutate()}
        >
          Registrar ocorrência
        </Button>
      </div>

      {abertas.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Abertas</div>
          {abertas.map((o) => (
            <div key={o.id} className="rounded-lg border p-3 text-sm space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={severidadeClass(o.severidade)}>
                  {o.severidade}
                </Badge>
                <span className="font-medium">{o.tipo}</span>
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {format(new Date(o.created_at), "dd/MM HH:mm", { locale: ptBR })}
                </span>
              </div>
              <div className="whitespace-pre-wrap text-muted-foreground">{o.descricao}</div>
              <div className="text-[11px] text-muted-foreground">
                Por {o.criada_por_nome ?? "—"}
              </div>
              <div className="flex gap-2 items-start pt-1 border-t">
                <Input
                  className="h-8"
                  placeholder="Nota da resolução (opcional)"
                  value={notaResolucao[o.id] ?? ""}
                  onChange={(e) => setNotaResolucao({ ...notaResolucao, [o.id]: e.target.value })}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => resolver.mutate(o.id)}
                  disabled={resolver.isPending}
                >
                  <ShieldAlert className="h-3 w-3 mr-1" /> Resolver
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {resolvidas.length > 0 && (
        <div className="space-y-2">
          <Separator />
          <div className="text-xs font-medium text-muted-foreground">Resolvidas</div>
          {resolvidas.map((o) => (
            <div
              key={o.id}
              className="rounded-lg border p-3 text-xs space-y-1 opacity-80 bg-muted/30"
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={severidadeClass(o.severidade)}>
                  {o.severidade}
                </Badge>
                <span className="font-medium">{o.tipo}</span>
                <CheckCircle2 className="h-3 w-3 text-emerald-600 ml-auto" />
              </div>
              <div className="whitespace-pre-wrap">{o.descricao}</div>
              <div className="text-muted-foreground">
                Resolvida por {o.resolvida_por_nome ?? "—"} em{" "}
                {o.resolvida_em &&
                  format(new Date(o.resolvida_em), "dd/MM HH:mm", { locale: ptBR })}
                {o.resolucao_nota && ` · ${o.resolucao_nota}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/* ---------------------------------- utils ----------------------------------- */

function SectionTitle({
  icon,
  label,
  right,
}: {
  icon: React.ReactNode;
  label: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        {icon}
        {label}
      </div>
      <div className="ml-auto">{right}</div>
    </div>
  );
}

function severidadeClass(s: string) {
  switch (s) {
    case "baixa":
      return "bg-slate-500/10 text-slate-700 border-slate-500/30";
    case "media":
      return "bg-amber-500/10 text-amber-700 border-amber-500/30";
    case "alta":
      return "bg-orange-500/10 text-orange-700 border-orange-500/30";
    case "critica":
      return "bg-rose-500/15 text-rose-700 border-rose-500/30";
    default:
      return "";
  }
}
