import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  ClipboardCheck, ShieldCheck, ShieldAlert, FileCheck2, AlertTriangle,
  CheckCircle2, XCircle, Plus, Loader2, Bell,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/crm-store";
import {
  getPedidoDetalhes,
  solicitarAprovacao,
  decidirAprovacao,
  salvarChecklistConferencia,
  atualizarStatusFiscal,
  registrarOcorrencia,
  resolverOcorrencia,
  PEDIDO_STAGES,
  type ChecklistItem,
  type PedidoDetalhes,
  type PedidoStageId,
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
  "Bloqueio comercial", "Bloqueio fiscal", "Divergência de estoque",
  "Atraso de produção", "Avaria", "Cliente solicitou alteração",
  "Documentação faltando", "Outro",
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
  return (
    <div className="flex flex-col h-full">
      <SheetHeader className="p-6 pb-4 border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <SheetTitle className="font-mono text-base">{pedido.number}</SheetTitle>
            <SheetDescription className="mt-1">
              <Badge variant="secondary">{stageLabel}</Badge>
              <span className="ml-2 text-primary font-semibold">{formatBRL(pedido.total)}</span>
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <ScrollArea className="flex-1">
        <div className="p-6 space-y-6">
          <AprovacaoBlock pedido={pedido} onChanged={onChanged} />
          <ChecklistBlock pedido={pedido} onChanged={onChanged} />
          <FiscalBlock pedido={pedido} onChanged={onChanged} />
          <OcorrenciasBlock pedido={pedido} onChanged={onChanged} />
        </div>
      </ScrollArea>
    </div>
  );
}

/* --------------------------------- Aprovação -------------------------------- */

function AprovacaoBlock({
  pedido, onChanged,
}: { pedido: PedidoDetalhes; onChanged: () => void }) {
  const solicitarFn = useServerFn(solicitarAprovacao);
  const decidirFn = useServerFn(decidirAprovacao);
  const [motivo, setMotivo] = useState("");
  const [observacao, setObservacao] = useState("");

  const solicitar = useMutation({
    mutationFn: (m: string) => solicitarFn({ data: { pedido_id: pedido.id, motivo: m } }),
    onSuccess: () => { toast.success("Aprovação solicitada"); setMotivo(""); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const decidir = useMutation({
    mutationFn: (decisao: "aprovado" | "rejeitado") =>
      decidirFn({ data: { pedido_id: pedido.id, decisao, observacao: observacao || undefined } }),
    onSuccess: (_r, decisao) => {
      toast.success(decisao === "aprovado" ? "Pedido aprovado" : "Pedido rejeitado");
      setObservacao(""); onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const showRequest =
    pedido.stage === "em_validacao" ||
    pedido.stage === "aguardando_aprovacao" ||
    (pedido.aprovacao_solicitada_em && !pedido.aprovacao_decisao);
  const showDecision = pedido.aprovacao_solicitada_em && !pedido.aprovacao_decisao;

  return (
    <section className="space-y-3">
      <SectionTitle icon={<ShieldCheck className="h-4 w-4" />} label="Aprovação" />
      {pedido.aprovacao_solicitada_em && (
        <div className="rounded-lg border p-3 text-sm space-y-1 bg-muted/30">
          <div className="text-xs text-muted-foreground">
            Solicitada por <b>{pedido.aprovacao_solicitada_por_nome ?? "—"}</b> em{" "}
            {format(new Date(pedido.aprovacao_solicitada_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </div>
          {pedido.aprovacao_motivo && <div className="whitespace-pre-wrap">{pedido.aprovacao_motivo}</div>}
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
              <><CheckCircle2 className="h-4 w-4 text-emerald-600" /> Aprovado</>
            ) : (
              <><XCircle className="h-4 w-4 text-rose-600" /> Rejeitado</>
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

      {showRequest && !showDecision && (
        <div className="space-y-2">
          <Label className="text-xs">Motivo para pedir aprovação</Label>
          <Textarea
            rows={3}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: desconto acima do teto; prazo excepcional; condição não padrão…"
          />
          <Button
            size="sm"
            disabled={motivo.trim().length < 3 || solicitar.isPending}
            onClick={() => solicitar.mutate(motivo.trim())}
          >
            {pedido.aprovacao_solicitada_em ? "Re-solicitar aprovação" : "Solicitar aprovação"}
          </Button>
        </div>
      )}

      {showDecision && (
        <div className="space-y-2 rounded-lg border p-3">
          <Label className="text-xs">Observação da decisão (opcional)</Label>
          <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              disabled={decidir.isPending}
              onClick={() => decidir.mutate("aprovado")}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={decidir.isPending}
              onClick={() => decidir.mutate("rejeitado")}
            >
              <XCircle className="h-4 w-4 mr-1" /> Rejeitar
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/* --------------------------------- Checklist -------------------------------- */

function ChecklistBlock({
  pedido, onChanged,
}: { pedido: PedidoDetalhes; onChanged: () => void }) {
  const salvarFn = useServerFn(salvarChecklistConferencia);
  const initial = useMemo<ChecklistItem[]>(
    () => (pedido.checklist_conferencia.length > 0 ? pedido.checklist_conferencia : DEFAULT_CHECKLIST),
    [pedido.checklist_conferencia],
  );
  const [items, setItems] = useState<ChecklistItem[]>(initial);
  const [newLabel, setNewLabel] = useState("");
  useEffect(() => setItems(initial), [initial]);

  const isConferencia: PedidoStageId[] = [
    "separacao_conferencia", "aprovado_programado", "em_producao",
    "faturado_aguardando_coleta", "despachado_transporte",
    "pedido_entregue", "concluido",
  ];
  const relevant = isConferencia.includes(pedido.stage);
  const done = items.filter((i) => i.done).length;

  const isProntoItem = (it: ChecklistItem) =>
    it.id === "pronto" || /pronto\s+para\s+(faturamento|expedi)/i.test(it.label);
  const outrosPendentes = items.filter((i) => !isProntoItem(i) && !i.done).length;
  const prontoLocked = outrosPendentes > 0;

  const salvar = useMutation({
    mutationFn: () => salvarFn({ data: { pedido_id: pedido.id, items } }),
    onSuccess: () => { toast.success("Checklist salvo"); onChanged(); },
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
            Atualizado em {format(new Date(pedido.checklist_atualizado_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
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

function FiscalBlock({
  pedido, onChanged,
}: { pedido: PedidoDetalhes; onChanged: () => void }) {
  const atualizarFn = useServerFn(atualizarStatusFiscal);
  const [status, setStatus] = useState(pedido.fiscal_status ?? "nao_iniciado");
  const [nfNumero, setNfNumero] = useState(pedido.nf_numero ?? "");
  const [nfSerie, setNfSerie] = useState(pedido.nf_serie ?? "");
  const [nfChave, setNfChave] = useState(pedido.nf_chave ?? "");
  const [nfValor, setNfValor] = useState<string>(pedido.nf_valor != null ? String(pedido.nf_valor) : "");

  useEffect(() => {
    setStatus(pedido.fiscal_status ?? "nao_iniciado");
    setNfNumero(pedido.nf_numero ?? "");
    setNfSerie(pedido.nf_serie ?? "");
    setNfChave(pedido.nf_chave ?? "");
    setNfValor(pedido.nf_valor != null ? String(pedido.nf_valor) : "");
  }, [pedido.id, pedido.fiscal_status, pedido.nf_numero, pedido.nf_serie, pedido.nf_chave, pedido.nf_valor]);

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
    onSuccess: () => { toast.success("Status fiscal atualizado"); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="space-y-3">
      <SectionTitle icon={<FileCheck2 className="h-4 w-4" />} label="Status fiscal" />
      <div className="space-y-3 rounded-lg border p-3">
        <div>
          <Label className="text-xs">Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(FISCAL_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
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
            NF emitida em {format(new Date(pedido.nf_emitida_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
          </div>
        )}
      </div>
    </section>
  );
}

/* -------------------------------- Ocorrências ------------------------------- */

function OcorrenciasBlock({
  pedido, onChanged,
}: { pedido: PedidoDetalhes; onChanged: () => void }) {
  const registrarFn = useServerFn(registrarOcorrencia);
  const resolverFn = useServerFn(resolverOcorrencia);
  const [tipo, setTipo] = useState(OCORRENCIA_TIPOS[0]);
  const [severidade, setSeveridade] = useState<"baixa" | "media" | "alta" | "critica">("media");
  const [descricao, setDescricao] = useState("");
  const [notaResolucao, setNotaResolucao] = useState<Record<string, string>>({});

  const registrar = useMutation({
    mutationFn: () =>
      registrarFn({ data: { pedido_id: pedido.id, tipo, severidade, descricao } }),
    onSuccess: () => { toast.success("Ocorrência registrada"); setDescricao(""); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const resolver = useMutation({
    mutationFn: (ocorrencia_id: string) =>
      resolverFn({ data: { ocorrencia_id, resolucao_nota: notaResolucao[ocorrencia_id] || undefined } }),
    onSuccess: () => { toast.success("Ocorrência resolvida"); onChanged(); },
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
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {OCORRENCIA_TIPOS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Severidade</Label>
            <Select value={severidade} onValueChange={(v) => setSeveridade(v as typeof severidade)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
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
              <div className="text-[11px] text-muted-foreground">Por {o.criada_por_nome ?? "—"}</div>
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
            <div key={o.id} className="rounded-lg border p-3 text-xs space-y-1 opacity-80 bg-muted/30">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={severidadeClass(o.severidade)}>{o.severidade}</Badge>
                <span className="font-medium">{o.tipo}</span>
                <CheckCircle2 className="h-3 w-3 text-emerald-600 ml-auto" />
              </div>
              <div className="whitespace-pre-wrap">{o.descricao}</div>
              <div className="text-muted-foreground">
                Resolvida por {o.resolvida_por_nome ?? "—"} em{" "}
                {o.resolvida_em && format(new Date(o.resolvida_em), "dd/MM HH:mm", { locale: ptBR })}
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
  icon, label, right,
}: { icon: React.ReactNode; label: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 text-sm font-medium">{icon}{label}</div>
      <div className="ml-auto">{right}</div>
    </div>
  );
}

function severidadeClass(s: string) {
  switch (s) {
    case "baixa": return "bg-slate-500/10 text-slate-700 border-slate-500/30";
    case "media": return "bg-amber-500/10 text-amber-700 border-amber-500/30";
    case "alta": return "bg-orange-500/10 text-orange-700 border-orange-500/30";
    case "critica": return "bg-rose-500/15 text-rose-700 border-rose-500/30";
    default: return "";
  }
}
