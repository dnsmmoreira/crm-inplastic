import { MargemPropostaCard } from "@/components/arena/MargemPropostaCard";
import { createFileRoute, Link, useNavigate, useBlocker } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useDuplicarProposta } from "@/hooks/use-duplicar-proposta";
import { ArrowLeft, Plus, Trash2, Printer, RefreshCw, Send, CheckCircle2, XCircle, Check, ChevronsUpDown, Search, AlertCircle, Lock, Unlock, ShieldAlert, Mail, Copy } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const MAX_QTY = 100_000;
const MAX_PRICE = 10_000_000;
const MAX_DESC = 200;

const itemSchema = z.object({
  description: z.string().trim().min(1, "Descrição não pode ficar vazia").max(MAX_DESC, `Descrição deve ter até ${MAX_DESC} caracteres`),
  quantity: z.number({ invalid_type_error: "Quantidade inválida" }).finite("Quantidade inválida").positive("Quantidade deve ser maior que zero").max(MAX_QTY, `Quantidade máxima: ${MAX_QTY.toLocaleString("pt-BR")}`),
  unitPrice: z.number({ invalid_type_error: "Preço inválido" }).finite("Preço inválido").nonnegative("Preço não pode ser negativo").max(MAX_PRICE, "Preço acima do limite permitido"),
});

const addItemSchema = itemSchema.pick({ quantity: true, unitPrice: true }).extend({
  productId: z.string().min(1, "Selecione um produto do catálogo"),
});
import {
  useCrm,
  formatBRL,
  proposalTotals,
  useMaxDiscountForCurrentUser,
  useIsAdmin,
  useCurrentUser,
  USERS,
  type ProposalStatus,
  termParcelas,
  PAYMENT_FORMS,
  type PaymentForm,
  type PaymentTerm,

  type PaymentInstallment,
} from "@/lib/crm-store";
import { calculateFreightDistance } from "@/lib/freight.functions";
import { gerarPedidoOmie } from "@/lib/omie.functions";
import { formatDocumentoCliente } from "@/lib/clientes";
import { getVendedorDaProposta, type VendedorContato, type ClienteRow } from "@/lib/clientes.functions";
import { useQuery, useMutation } from "@tanstack/react-query";
import { enviarPropostaWhatsapp, enviarPropostaEmail } from "@/lib/propostas.functions";

import { formatCep } from "@/lib/format";
import { useServerFn } from "@tanstack/react-start";
import {
  listarTransportadorasAtivas,
  sugerirTransportadora,
  type TransportadoraRow,
} from "@/lib/transportadoras.functions";
import { ehOpcaoEspecialTransporte, OPCOES_ESPECIAIS_TRANSPORTE } from "@/lib/transportadoras";
import {
  addDaysToDateInput,
  aplicarIntervalo,
  descreverParcelas,
  espacamentoIrregular,
  formatDateBr,
  intervaloPredominante,
  valoresPorPercentual,
} from "@/lib/condicoes-comerciais";
import { markDeleted } from "@/lib/delete-intents";
import { ConferenciaFinalDialog } from "@/components/propostas/ConferenciaFinalDialog";


/** Parcelas de exibição (dias + percentual da condição) a partir do total da proposta. */
function buildTermInstallments(term: PaymentTerm | undefined, total: number) {
  if (!term) return [];
  const parcelas = termParcelas(term);
  if (parcelas.length === 0) return [];
  const valores = valoresPorPercentual(total, parcelas.map((p) => p.percentual));
  return parcelas.map((p, i) => ({ days: p.dias, percentual: p.percentual, amount: valores[i] }));
}

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/propostas/$id")({
  component: PropostaDetalhe,
});

const STATUS_META: Record<ProposalStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive"; className?: string }> = {
  rascunho: { label: "Rascunho", variant: "outline" },
  enviada: { label: "Enviada", variant: "secondary" },
  aguardando_aprovacao: { label: "Aguardando aprovação ADM", variant: "outline", className: "border-amber-500 text-amber-700 bg-amber-500/10" },
  aprovada: { label: "Aprovada", variant: "default" },
  recusada: { label: "Recusada", variant: "destructive" },
  pedido: { label: "Pedido gerado", variant: "default", className: "bg-emerald-600 hover:bg-emerald-600" },
};

/** Peso e cubagem calculados a partir dos itens da proposta e do catálogo de produtos. */
function computeAutoTransport(
  items: { productId: string; quantity: number }[],
  products: { id: string; weightKg: number; heightCm: number; widthCm: number; lengthCm: number }[],
) {
  let weight = 0;
  let cubageCm3 = 0;
  for (const it of items) {
    const p = products.find((x) => x.id === it.productId);
    if (!p) continue;
    weight += (p.weightKg || 0) * (it.quantity || 0);
    cubageCm3 += (p.heightCm || 0) * (p.widthCm || 0) * (p.lengthCm || 0) * (it.quantity || 0);
  }
  return {
    grossWeightKg: +weight.toFixed(2),
    cubageM3: +(cubageCm3 / 1_000_000).toFixed(3),
  };
}

function PropostaDetalhe() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const proposal = useCrm((s) => s.proposals.find((p) => p.id === id));
  const lead = useCrm((s) => (proposal ? s.leads.find((l) => l.id === proposal.leadId) : undefined));
  const products = useCrm((s) => s.products);
  const emitters = useCrm((s) => s.emitters);
  const defaultEmitterId = useCrm((s) => s.defaultEmitterId);
  const emitter = useMemo(
    () =>
      emitters.find((e) => e.id === proposal?.emitterId) ??
      emitters.find((e) => e.id === defaultEmitterId) ??
      emitters[0],
    [emitters, proposal?.emitterId, defaultEmitterId],
  );


  // Sugestão dinâmica de empresa emitente com base nos flags fiscais do cliente vinculado.
  const [emitterSuggestion, setEmitterSuggestion] = useState<{ id: string; reason: string } | null>(null);
  useEffect(() => {
    const clienteId = (lead as { clienteId?: string | null } | undefined)?.clienteId;
    if (!clienteId) { setEmitterSuggestion(null); return; }
    let alive = true;
    (async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data: cli } = await supabase
          .from("clientes")
          .select("empresa_padrao, simples_optante, suframa_isento")
          .eq("id", clienteId)
          .maybeSingle();
        const { data: prev } = await supabase
          .from("propostas")
          .select("emitter_id, id, leads!inner(cliente_id)")
          .eq("leads.cliente_id", clienteId)
          .neq("id", id)
          .order("created_at", { ascending: false })
          .limit(1);
        const prevEmitter = (prev?.[0] as { emitter_id?: string } | undefined)?.emitter_id;
        if (!alive) return;
        if (prevEmitter) {
          setEmitterSuggestion({ id: prevEmitter, reason: "Histórico: última proposta deste cliente usou esta empresa." });
        } else if (cli?.suframa_isento) {
          setEmitterSuggestion({ id: "taoplast", reason: "Cliente com SUFRAMA — sugerido TAOPLAST." });
        } else if (cli?.simples_optante) {
          setEmitterSuggestion({ id: "licitaplas", reason: "Cliente optante do Simples — sugerido LICITAPLAS." });
        } else if (cli?.empresa_padrao) {
          setEmitterSuggestion({ id: String(cli.empresa_padrao).toLowerCase(), reason: "Empresa padrão do cliente." });
        } else {
          setEmitterSuggestion(null);
        }
      } catch {
        if (alive) setEmitterSuggestion(null);
      }
    })();
    return () => { alive = false; };
  }, [lead, id]);

  const paymentTerms = useCrm((s) => s.paymentTerms);
  const activePaymentTerms = useMemo(() => paymentTerms.filter((t) => t.active), [paymentTerms]);
  const maxDiscount = useMaxDiscountForCurrentUser();
  const _addItem = useCrm((s) => s.addProposalItem);
  const _updateItem = useCrm((s) => s.updateProposalItem);
  const _removeItem = useCrm((s) => s.removeProposalItem);
  const _updateProposal = useCrm((s) => s.updateProposal);
  const _setStatus = useCrm((s) => s.setProposalStatus);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [productPickerId, setProductPickerId] = useState<string>("");
  const [productPickerQty, setProductPickerQty] = useState<number>(1);
  const [rowErrors, setRowErrors] = useState<Record<string, { field: "description" | "quantity" | "unitPrice"; message: string } | null>>({});
  const [dirty, setDirty] = useState(false);
  const freightConfig = useCrm((s) => s.freightConfig);
  const [freightLoading, setFreightLoading] = useState(false);
  const calcFreight = useServerFn(calculateFreightDistance);
  const gerarPedido = useServerFn(gerarPedidoOmie);
  const [omieBusy, setOmieBusy] = useState(false);
  /** Conferência final obrigatória antes de gerar/solicitar o pedido. */
  const [conferencia, setConferencia] = useState<{ open: boolean; requerAprovacao: boolean }>({
    open: false,
    requerAprovacao: false,
  });
  /** Intervalo (dias) entre parcelas escolhido pelo vendedor; null = usa o da condição. */
  const [intervaloParcelas, setIntervaloParcelas] = useState<number | null>(null);

  // Cadastro de transportadoras + sugestão por UF do cliente (campo estruturado).
  const listarTransportadorasFn = useServerFn(listarTransportadorasAtivas);
  const transportadorasQ = useQuery<TransportadoraRow[]>({
    queryKey: ["transportadoras-ativas"],
    staleTime: 5 * 60 * 1000,
    queryFn: () => listarTransportadorasFn({ data: undefined as never }),
  });
  const transportadoras = transportadorasQ.data ?? [];


  const selectedTerm = useMemo(
    () => paymentTerms.find((t: PaymentTerm) => t.id === proposal?.paymentTermId) ?? null,
    [paymentTerms, proposal?.paymentTermId],
  );
  const totals = useMemo(
    () => (proposal ? proposalTotals(proposal, selectedTerm?.acrescimoPercent ?? 0) : null),
    [proposal, selectedTerm],
  );
  const owner = proposal ? USERS.find((u) => u.id === proposal.ownerId) : null;

  // Vendedor real (tabela de usuários) — vinculado ao cliente da proposta.
  const vendedorFn = useServerFn(getVendedorDaProposta);
  const vendedorQ = useQuery<VendedorContato | null>({
    queryKey: ["proposta-vendedor", proposal?.leadId ?? null, proposal?.ownerId ?? null],
    enabled: !!proposal,
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      vendedorFn({ data: { leadId: proposal?.leadId ?? null, ownerId: proposal?.ownerId ?? null } }),
  });
  const vendedor = vendedorQ.data ?? null;

  // Dados cadastrais do cliente (CNPJ + endereço) para o bloco "Para" da impressão.
  const clienteId = (lead as { clienteId?: string | null } | undefined)?.clienteId ?? null;
  const [clienteRow, setClienteRow] = useState<ClienteRow | null>(null);
  useEffect(() => {
    if (!clienteId) { setClienteRow(null); return; }
    let alive = true;
    (async () => {
      try {
        const { supabase } = await import("@/integrations/supabase/client");
        const { data } = await supabase.from("clientes").select("*").eq("id", clienteId).maybeSingle();
        if (alive) setClienteRow((data as ClienteRow | null) ?? null);
      } catch {
        if (alive) setClienteRow(null);
      }
    })();
    return () => { alive = false; };
  }, [clienteId]);

  // Pessoa Física: só condições à vista ou cartão (permite_pf).
  const isClientePf = clienteRow?.tipo_pessoa === "PF";

  const ufCliente =
    (clienteRow as { estado?: string | null } | null)?.estado ??
    (lead as { endereco?: { uf?: string } } | undefined)?.endereco?.uf ??
    null;
  const sugerirTransportadoraFn = useServerFn(sugerirTransportadora);
  const sugestaoQ = useQuery({
    queryKey: ["sugestao-transportadora", ufCliente],
    enabled: !!ufCliente,
    staleTime: 5 * 60 * 1000,
    queryFn: () => sugerirTransportadoraFn({ data: { uf: ufCliente } }),
  });
  const sugestaoTransportadora = sugestaoQ.data ?? null;
  const visiblePaymentTerms = useMemo(() => {
    const base = isClientePf
      ? activePaymentTerms.filter((t: PaymentTerm) => !!t.permitePf)
      : activePaymentTerms;
    const lista = [...base].sort(
      (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.label.localeCompare(b.label, "pt-BR"),
    );
    // O prazo em uso pela proposta continua na lista mesmo quando inativo,
    // senão propostas antigas perdem a condição ao serem abertas.
    const atual = proposal?.paymentTermId
      ? paymentTerms.find((t: PaymentTerm) => t.id === proposal.paymentTermId)
      : undefined;
    if (atual && !lista.some((t) => t.id === atual.id)) lista.push(atual);
    return lista;
  }, [activePaymentTerms, isClientePf, paymentTerms, proposal?.paymentTermId]);
  useEffect(() => {
    if (!proposal || !isClientePf || !proposal.paymentTermId) return;
    const term = paymentTerms.find((t: PaymentTerm) => t.id === proposal.paymentTermId);
    if (term && !term.permitePf) {
      _updateProposal(proposal.id, { paymentTermId: undefined });
      toast.warning("Condição a prazo não permitida para Pessoa Física — escolha à vista ou cartão.");
    }
  }, [isClientePf, proposal, paymentTerms, _updateProposal]);


  
  const isAdmin = useIsAdmin();
  const { duplicando, duplicarProposta } = useDuplicarProposta();

  const currentUser = useCurrentUser();
  const approver = proposal?.approvedByUserId ? USERS.find((u) => u.id === proposal.approvedByUserId) : null;
  const editRequester = proposal?.editRequestedByUserId ? USERS.find((u) => u.id === proposal.editRequestedByUserId) : null;
  const editUnlocker = proposal?.editUnlockedByUserId ? USERS.find((u) => u.id === proposal.editUnlockedByUserId) : null;

  // Pedido fechado é read-only, salvo se ADM liberou edição.
  const isPedido = proposal?.status === "pedido";
  const editUnlocked = Boolean(proposal?.editUnlockedAt);
  const editRequested = Boolean(proposal?.editRequestedAt) && !editUnlocked;
  const readOnly = isPedido && !editUnlocked;

  // Estado de UI para diálogos de solicitação/liberação
  const [editReqOpen, setEditReqOpen] = useState(false);
  const [editReqReason, setEditReqReason] = useState("");
  const [releaseOpen, setReleaseOpen] = useState(false);


  // Auto-recalcula peso e cubagem a partir do catálogo sempre que os itens mudam.
  const autoTransport = useMemo(
    () => (proposal ? computeAutoTransport(proposal.items, products) : null),
    [proposal, products],
  );
  useEffect(() => {
    if (!proposal || !autoTransport) return;
    const t = proposal.transport;
    if (t.grossWeightKg === autoTransport.grossWeightKg && t.cubageM3 === autoTransport.cubageM3) return;
    _updateProposal(proposal.id, {
      transport: {
        ...t,
        grossWeightKg: autoTransport.grossWeightKg,
        cubageM3: autoTransport.cubageM3,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTransport?.grossWeightKg, autoTransport?.cubageM3, proposal?.id]);

  // Warn on tab close/refresh while there are unsaved edits
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Intercept in-app navigation while dirty; render our own confirm dialog
  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    withResolver: true,
    enableBeforeUnload: false, // handled above with a friendlier message
  });

  const markDirty = () => setDirty(true);
  const guard = () => {
    if (readOnly) {
      toast.error("Pedido fechado — solicite liberação do ADM para editar.");
      return true;
    }
    return false;
  };

  // Wrappers: auto-mark the proposal as dirty on any mutation e bloqueia se pedido fechado.
  const addItem: typeof _addItem = (...a) => { if (guard()) return; markDirty(); return _addItem(...a); };
  const updateItem: typeof _updateItem = (...a) => { if (guard()) return; markDirty(); return _updateItem(...a); };
  const removeItem: typeof _removeItem = (...a) => { if (guard()) return; markDirty(); return _removeItem(...a); };
  const updateProposal: typeof _updateProposal = (...a) => { if (guard()) return; markDirty(); return _updateProposal(...a); };
  const setStatus: typeof _setStatus = (...a) => { if (guard()) return; markDirty(); return _setStatus(...a); };

  // Envio real da proposta por WhatsApp (link da página pública).
  const enviarPropostaFn = useServerFn(enviarPropostaWhatsapp);
  const enviarWhatsMut = useMutation({
    mutationFn: (propostaId: string) => enviarPropostaFn({ data: { propostaId } }),
    onSuccess: (_r: unknown, propostaId: string) => {
      setStatus(propostaId, "enviada");
      toast.success("Proposta enviada por WhatsApp!");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Envio real da proposta por e-mail (mesmo link da página pública).
  const enviarEmailFn = useServerFn(enviarPropostaEmail);
  const enviarEmailMut = useMutation({
    mutationFn: (propostaId: string) => enviarEmailFn({ data: { propostaId } }),
    onSuccess: (r: { email?: string }, propostaId: string) => {
      setStatus(propostaId, "enviada");
      toast.success(`Proposta enviada por e-mail${r?.email ? ` para ${r.email}` : ""}!`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  /**
   * Troca a condição de pagamento: descarta as parcelas anteriores (marcando-as
   * como exclusão intencional para o sync apagar no banco) e recria a partir dos
   * percentuais da nova condição, quando já houver previsão de faturamento.
   */
  const trocarCondicao = (termId: string) => {
    if (!proposal) return;
    const antigas = proposal.installments ?? [];
    if (antigas.length > 0) markDeleted("proposalParcelas", ...antigas.map((p) => p.id));
    const novo = paymentTerms.find((t: PaymentTerm) => t.id === termId) ?? null;
    const base = proposal.billingForecastDate;
    const parcelasCond = novo ? termParcelas(novo) : [];
    const totalAtual = proposalTotals(proposal, novo?.acrescimoPercent ?? 0).total;
    const valores = valoresPorPercentual(totalAtual, parcelasCond.map((p) => p.percentual));
    updateProposal(proposal.id, {
      paymentTermId: termId,
      installments:
        base && parcelasCond.length > 0
          ? parcelasCond.map((p, i) => ({
              id: crypto.randomUUID(),
              days: p.dias,
              amount: valores[i],
              percentual: p.percentual,
              notes: "",
              dueDate: addDaysToDateInput(base, p.dias),
            }))
          : [],
    });
  };




  const validateAndUpdateItem = (
    itemId: string,
    field: "description" | "quantity" | "unitPrice",
    raw: string,
  ) => {
    const value = field === "description" ? raw : Number(raw);
    const parsed = itemSchema.shape[field].safeParse(value);
    if (!parsed.success) {
      setRowErrors((prev) => ({ ...prev, [itemId]: { field, message: parsed.error.issues[0]?.message ?? "Valor inválido" } }));
      updateItem(proposal!.id, itemId, { [field]: value } as never);
      return;
    }
    setRowErrors((prev) => ({ ...prev, [itemId]: null }));
    updateItem(proposal!.id, itemId, { [field]: parsed.data } as never);
  };

  async function handleGerarPedido(requerAprovacao: boolean) {
    if (!proposal) return;
    if (proposal.items.length === 0) {
      toast.error("Adicione ao menos um item antes de fechar o pedido.");
      return;
    }
    setOmieBusy(true);
    const t = toast.loading(requerAprovacao ? "Solicitando aprovação..." : "Gerando pedido...");
    try {
      const r = await gerarPedido({
        data: {
          proposta_id: proposal.id,
          requer_aprovacao: requerAprovacao,
          conferencia_confirmada: true,
        },
      });
      toast.dismiss(t);
      if (!r.ok) {
        toast.error("Pendências antes de gerar o pedido", {
          description: (r.validacao_erros ?? ["Erro desconhecido"]).join("\n"),
          duration: 10000,
        });
      } else if (requerAprovacao) {
        toast.success("Enviado ao supervisor ADM");
      } else {
        toast.success(r.pedido_number ? `Pedido ${r.pedido_number} gerado` : "Pedido gerado", {
          description: "Lead movido para Ganho.",
        });
      }
      // Espelha status no store (o sync já persiste no DB).
      if (r.ok && !requerAprovacao) {
        _updateProposal(proposal.id, {
          status: "pedido",
          orderCreatedAt: new Date().toISOString(),
          approvedByUserId: currentUser.id,
          approvedAt: new Date().toISOString(),
        });
      }
      setDirty(false);
    } catch (e) {
      toast.dismiss(t);
      toast.error("Erro ao gerar pedido", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setOmieBusy(false);
    }
  }


  if (!proposal || !lead) {
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">Proposta não encontrada.</p>
        <Button variant="link" onClick={() => navigate({ to: "/propostas" })}>Voltar</Button>
      </div>
    );
  }

  const s = STATUS_META[proposal.status];

  return (
    <div className="p-4 md:p-8 space-y-6 print:p-0 print:space-y-4">
      {/* Toolbar — hidden on print */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/propostas" })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl md:text-2xl font-semibold">Proposta {proposal.number}</h1>
              <Badge variant={s.variant} className={s.className}>{s.label}</Badge>
              {proposal.transport.freightPayer === "CIF" && proposal.status !== "pedido" && (
                <Badge variant="outline" className="border-amber-500 text-amber-700 bg-amber-500/10 gap-1">
                  <AlertCircle className="h-3 w-3" /> CIF · requer aprovação do supervisor
                </Badge>
              )}
              {dirty && (
                <Badge variant="outline" className="border-amber-500 text-amber-600 gap-1">
                  <AlertCircle className="h-3 w-3" /> Alterações não salvas
                </Badge>
              )}
              {isPedido && !editUnlocked && !editRequested && (
                <Badge variant="outline" className="border-slate-400 text-slate-700 bg-slate-500/10 gap-1">
                  <Lock className="h-3 w-3" /> Pedido bloqueado para edição
                </Badge>
              )}
              {editRequested && (
                <Badge variant="outline" className="border-amber-500 text-amber-700 bg-amber-500/10 gap-1">
                  <ShieldAlert className="h-3 w-3" /> Alteração solicitada — aguardando ADM
                </Badge>
              )}
              {editUnlocked && (
                <Badge variant="outline" className="border-emerald-500 text-emerald-700 bg-emerald-500/10 gap-1">
                  <Unlock className="h-3 w-3" /> Edição liberada pelo ADM
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Criada em {format(new Date(proposal.createdAt), "dd/MM/yyyy", { locale: ptBR })} · Vendedor: {vendedor?.name ?? owner?.name ?? "—"}
              {proposal.approvedAt && approver && (
                <> · Aprovada por <span className="font-medium text-foreground">{approver.name}</span> em {format(new Date(proposal.approvedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</>
              )}
              {editRequested && editRequester && proposal.editRequestedAt && (
                <><br />Alteração solicitada por <span className="font-medium text-foreground">{editRequester.name}</span> em {format(new Date(proposal.editRequestedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  {proposal.editRequestReason ? <> — "{proposal.editRequestReason}"</> : null}
                </>
              )}
              {editUnlocked && editUnlocker && proposal.editUnlockedAt && (
                <><br />Edição liberada por <span className="font-medium text-foreground">{editUnlocker.name}</span> em {format(new Date(proposal.editUnlockedAt), "dd/MM/yyyy HH:mm", { locale: ptBR })}</>
              )}
            </p>

          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="gap-2"
            disabled={duplicando}
            onClick={() => void duplicarProposta(proposal.id)}
          >
            <Copy className="h-4 w-4" />
            {duplicando ? "Duplicando..." : "Duplicar"}
          </Button>

          {!isPedido && (
            <Button
              variant="outline"
              className="gap-2"
              disabled={enviarWhatsMut.isPending}
              onClick={() => enviarWhatsMut.mutate(proposal.id)}
            >
              {enviarWhatsMut.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {enviarWhatsMut.isPending ? "Enviando..." : "Enviar por WhatsApp"}
            </Button>
          )}

          {!isPedido && (
            <Button
              variant="outline"
              className="gap-2"
              disabled={enviarEmailMut.isPending}
              onClick={() => enviarEmailMut.mutate(proposal.id)}
            >
              {enviarEmailMut.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              {enviarEmailMut.isPending ? "Enviando..." : "Enviar por e-mail"}
            </Button>
          )}

          {/* Fechar pedido: admin gera direto; vendedor solicita aprovação.
              Ambos passam antes pela conferência final item a item. */}
          {proposal.status !== "pedido" && proposal.status !== "aguardando_aprovacao" && (
            <Button
              variant="default"
              className="gap-2"
              disabled={omieBusy}
              onClick={() => setConferencia({ open: true, requerAprovacao: !isAdmin })}
            >
              <CheckCircle2 className="h-4 w-4" /> {isAdmin ? "Gerar pedido" : "Solicitar pedido"}
            </Button>
          )}


          {/* Motivo calculado pelas regras de aprovação financeira. */}
          {proposal.status === "aguardando_aprovacao" && proposal.approvalReason && (
            <div className="flex items-start gap-2 self-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300 max-w-md">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                <span className="font-medium">Motivo da aprovação:</span> {proposal.approvalReason}
              </span>
            </div>
          )}

          {/* ADM libera pedidos aguardando aprovação — geração no ato. */}
          {proposal.status === "aguardando_aprovacao" && isAdmin && (
            <Button
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              disabled={omieBusy}
              onClick={() => setConferencia({ open: true, requerAprovacao: false })}
            >
              <CheckCircle2 className="h-4 w-4" /> Aprovar liberação
            </Button>
          )}

          <ConferenciaFinalDialog
            open={conferencia.open}
            onOpenChange={(v) => setConferencia((c) => ({ ...c, open: v }))}
            busy={omieBusy}
            confirmLabel={
              conferencia.requerAprovacao
                ? "Confirmar e solicitar aprovação"
                : "Confirmar e gerar pedido"
            }
            input={{
              items: proposal.items.map((it) => ({
                id: it.id,
                description: it.description,
                sku: it.sku,
                quantity: it.quantity,
                unit: it.unit,
                unitPrice: it.unitPrice,
              })),
              cliente: {
                razaoSocial: clienteRow?.razao_social ?? lead?.company ?? null,
                documento: clienteRow ? formatDocumentoCliente(clienteRow) : null,
              },
              condicao: {
                label: selectedTerm?.label ?? null,
                parcelas: selectedTerm ? descreverParcelas(termParcelas(selectedTerm)) : null,
              },
              transporte: {
                freightPayer: proposal.transport.freightPayer,
                carrier: proposal.transport.carrier,
                endereco:
                  proposal.transport.deliveryAddress ??
                  (proposal.transport.deliveryCep
                    ? `CEP ${formatCep(proposal.transport.deliveryCep)}`
                    : null),
              },
              descontoPercent: proposal.discountPercent,
              validadeDias: proposal.validityDays,
            }}
            onConfirm={() => {
              setConferencia((c) => ({ ...c, open: false }));
              void handleGerarPedido(conferencia.requerAprovacao);
            }}
          />

          {proposal.status === "aguardando_aprovacao" && !isAdmin && (
            <Badge variant="outline" className="border-amber-500 text-amber-700 bg-amber-500/10 gap-1 self-center px-3 py-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> Aguardando liberação do supervisor
            </Badge>
          )}

          {/* Pedido fechado: vendedor solicita alteração; ADM libera/recusa/re-bloqueia */}
          {isPedido && !editUnlocked && !editRequested && !isAdmin && (
            <Button
              variant="outline"
              className="gap-2 border-amber-500 text-amber-700 hover:bg-amber-500/10"
              onClick={() => { setEditReqReason(""); setEditReqOpen(true); }}
            >
              <ShieldAlert className="h-4 w-4" /> Solicitar alteração
            </Button>
          )}
          {isPedido && editRequested && !isAdmin && (
            <Button
              variant="ghost"
              className="gap-2 text-muted-foreground"
              onClick={() => {
                _updateProposal(proposal.id, { editRequestedAt: undefined, editRequestReason: undefined, editRequestedByUserId: undefined });
                toast.success("Solicitação de alteração cancelada");
              }}
            >
              <XCircle className="h-4 w-4" /> Cancelar solicitação
            </Button>
          )}
          {isPedido && !editUnlocked && isAdmin && (
            <Button
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setReleaseOpen(true)}
            >
              <Unlock className="h-4 w-4" /> {editRequested ? "Liberar alteração" : "Desbloquear edição"}
            </Button>
          )}
          {isPedido && editRequested && isAdmin && (
            <Button
              variant="outline"
              className="gap-2 border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => {
                _updateProposal(proposal.id, { editRequestedAt: undefined, editRequestReason: undefined, editRequestedByUserId: undefined });
                toast.success("Solicitação recusada", { description: `${editRequester?.name ?? "Vendedor"} foi notificado — pedido permanece bloqueado.` });
              }}
            >
              <XCircle className="h-4 w-4" /> Recusar solicitação
            </Button>
          )}
          {isPedido && editUnlocked && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => {
                _updateProposal(proposal.id, { editUnlockedAt: undefined, editUnlockedByUserId: undefined, editRequestedAt: undefined, editRequestReason: undefined, editRequestedByUserId: undefined });
                setDirty(false);
                toast.success("Pedido re-bloqueado");
              }}
            >
              <Lock className="h-4 w-4" /> Re-bloquear
            </Button>
          )}

          {!isPedido && (
            <Button variant="outline" className="gap-2" onClick={() => { setStatus(proposal.id, "recusada"); }}>
              <XCircle className="h-4 w-4" /> Recusar
            </Button>
          )}
          <Button
            variant={dirty ? "default" : "outline"}
            className="gap-2"
            disabled={!dirty}
            onClick={() => {
              // Se estava editando um pedido liberado, ao salvar re-bloqueia automaticamente.
              if (isPedido && editUnlocked) {
                _updateProposal(proposal.id, {
                  editUnlockedAt: undefined,
                  editUnlockedByUserId: undefined,
                  editRequestedAt: undefined,
                  editRequestReason: undefined,
                  editRequestedByUserId: undefined,
                });
                setDirty(false);
                toast.success("Alterações salvas", { description: "Pedido re-bloqueado automaticamente." });
                return;
              }
              setDirty(false);
              toast.success("Alterações salvas");
            }}
          >
            <CheckCircle2 className="h-4 w-4" /> Salvar
          </Button>
          <Button className="gap-2" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimir / PDF
          </Button>
        </div>
      </div>

      <MargemPropostaCard propostaId={proposal.id} />



      {/* Confirm dialog for in-app navigation while dirty */}
      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => { if (!open && blocker.status === "blocked") blocker.reset(); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair sem salvar?</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem alterações nesta proposta que ainda não foram salvas. Se sair agora, elas continuam no rascunho, mas nenhum aviso será mostrado ao vendedor.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.status === "blocked" && blocker.reset()}>
              Continuar editando
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setDirty(false);
                if (blocker.status === "blocked") blocker.proceed();
              }}
            >
              Sair sem salvar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Vendedor solicita alteração de pedido fechado */}
      <AlertDialog open={editReqOpen} onOpenChange={setEditReqOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              Solicitar alteração do pedido {proposal.number}
            </AlertDialogTitle>
            <AlertDialogDescription>
              O pedido já foi fechado. Descreva o motivo da alteração — o supervisor ADM receberá a solicitação e decidirá se libera a edição.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="edit-reason">Motivo</Label>
            <Textarea
              id="edit-reason"
              rows={4}
              maxLength={500}
              value={editReqReason}
              onChange={(e) => setEditReqReason(e.target.value)}
              placeholder="Ex.: cliente pediu troca de quantidade do item X; corrigir CEP de entrega..."
            />
            <p className="text-[11px] text-muted-foreground">{editReqReason.length}/500</p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const reason = editReqReason.trim();
                if (reason.length < 5) { toast.error("Descreva o motivo com pelo menos 5 caracteres."); return; }
                _updateProposal(proposal.id, {
                  editRequestedAt: new Date().toISOString(),
                  editRequestReason: reason,
                  editRequestedByUserId: currentUser.id,
                });
                setEditReqOpen(false);
                toast.success("Solicitação enviada ao ADM", { description: "Você será avisado quando a edição for liberada." });
              }}
            >
              Enviar solicitação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ADM libera a edição do pedido */}
      <AlertDialog open={releaseOpen} onOpenChange={setReleaseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Unlock className="h-4 w-4 text-emerald-600" />
              Liberar edição do pedido {proposal.number}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {editRequested && editRequester ? (
                <>Vendedor <span className="font-medium text-foreground">{editRequester.name}</span> pediu:
                  <span className="block mt-1 rounded border bg-muted/40 p-2 text-foreground italic">"{proposal.editRequestReason}"</span>
                </>
              ) : (
                <>Você vai desbloquear este pedido para edição. Depois que o vendedor salvar, o pedido volta a ficar bloqueado automaticamente.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                _updateProposal(proposal.id, {
                  editUnlockedAt: new Date().toISOString(),
                  editUnlockedByUserId: currentUser.id,
                });
                setReleaseOpen(false);
                toast.success("Edição liberada", { description: `${editRequester?.name ?? owner?.name ?? "Vendedor"} já pode alterar o pedido.` });
              }}
            >
              Liberar edição
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>



      {/* Editor — hidden on print */}
      <div className="grid gap-4 lg:grid-cols-3 print:hidden">

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Itens da proposta</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>NCM</TableHead>
                  <TableHead>Un</TableHead>
                  <TableHead className="w-24">Qtd</TableHead>
                  <TableHead className="w-32">Preço un.</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {proposal.items.map((it) => {
                  const err = rowErrors[it.id];
                  const cls = (field: "description" | "quantity" | "unitPrice") =>
                    err?.field === field ? "border-destructive focus-visible:ring-destructive" : "";
                  return (
                    <TableRow key={it.id}>
                      <TableCell>
                        <Input
                          value={it.description}
                          maxLength={MAX_DESC}
                          onChange={(e) => validateAndUpdateItem(it.id, "description", e.target.value)}
                          className={cn("font-medium", cls("description"))}
                          aria-invalid={err?.field === "description"}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{it.sku}</TableCell>
                      <TableCell className="font-mono text-xs">{it.ncm || "—"}</TableCell>
                      <TableCell>{it.unit}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          step="1"
                          value={it.quantity}
                          onChange={(e) => validateAndUpdateItem(it.id, "quantity", e.target.value)}
                          className={cls("quantity")}
                          aria-invalid={err?.field === "quantity"}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          min={0}
                          value={it.unitPrice}
                          onChange={(e) => validateAndUpdateItem(it.id, "unitPrice", e.target.value)}
                          className={cls("unitPrice")}
                          aria-invalid={err?.field === "unitPrice"}
                        />
                      </TableCell>
                      <TableCell className="text-right font-semibold whitespace-nowrap">
                        {formatBRL(it.quantity * it.unitPrice)}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" aria-label="Remover item">
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover item da proposta?</AlertDialogTitle>
                              <AlertDialogDescription>
                                {it.description || "Item sem descrição"}
                                {it.sku ? ` (${it.sku})` : ""} — {it.quantity} {it.unit} · {formatBRL(it.quantity * it.unitPrice)}.
                                <br />Esta ação não pode ser desfeita.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => {
                                  removeItem(proposal.id, it.id);
                                  setRowErrors((prev) => { const n = { ...prev }; delete n[it.id]; return n; });
                                  toast.success("Item removido");
                                }}
                              >
                                Remover
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {Object.values(rowErrors).some(Boolean) && (
                  <TableRow>
                    <TableCell colSpan={7} className="bg-destructive/5 py-2">
                      <ul className="text-xs text-destructive space-y-0.5">
                        {Object.entries(rowErrors).map(([id, e]) => e ? (
                          <li key={id} className="flex items-center gap-1.5">
                            <AlertCircle className="h-3 w-3" /> {e.message}
                          </li>
                        ) : null)}
                      </ul>
                    </TableCell>
                  </TableRow>
                )}

                {proposal.items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                      Nenhum item ainda. Busque um produto abaixo pelo SKU ou nome.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>

            {totals && (
              <div className="mt-3 pr-2 space-y-1 text-sm">
                <div className="flex justify-end gap-6">
                  <span className="text-muted-foreground">Subtotal itens:</span>
                  <span className="font-semibold w-32 text-right">{formatBRL(totals.subtotal)}</span>
                </div>
                {totals.discountPercent > 0 && (
                  <div className="flex justify-end gap-6 text-emerald-700">
                    <span>Desconto ({totals.discountPercent}%):</span>
                    <span className="font-semibold w-32 text-right">− {formatBRL(totals.discountAmount)}</span>
                  </div>
                )}
                {totals.surchargeAmount > 0 && (
                  <div className="flex justify-end gap-6 text-amber-700">
                    <span>Acréscimo ({String(totals.surchargePercent).replace(".", ",")}%):</span>
                    <span className="font-semibold w-32 text-right">+ {formatBRL(totals.surchargeAmount)}</span>
                  </div>
                )}
                {proposal.transport.freightValue > 0 && (
                  <div className="flex justify-end gap-6">
                    <span className="text-muted-foreground">Frete:</span>
                    <span className="font-semibold w-32 text-right">{formatBRL(proposal.transport.freightValue)}</span>
                  </div>
                )}
                <div className="flex justify-end gap-6 pt-1 border-t">
                  <span className="text-muted-foreground">Total:</span>
                  <span className="font-bold text-primary w-32 text-right">{formatBRL(totals.total)}</span>
                </div>
              </div>
            )}

            <div className="mt-4 border-t pt-4 space-y-3">
              <div className="text-xs text-muted-foreground">
                Itens vêm do catálogo interno de produtos.
              </div>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-end">
                <div>
                  <Label className="text-xs">Produto</Label>
                  <Popover open={productPickerOpen} onOpenChange={setProductPickerOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between font-normal"
                        disabled={readOnly}
                      >
                        {productPickerId
                          ? (() => {
                              const p = products.find((x) => x.id === productPickerId);
                              return p ? `${p.sku} · ${p.name}` : "Selecionar produto";
                            })()
                          : "Selecionar produto"}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Buscar por SKU ou nome..." />
                        <CommandList>
                          <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                          <CommandGroup>
                            {products
                              .filter((p) => p.active)
                              .map((p) => (
                                <CommandItem
                                  key={p.id}
                                  value={`${p.sku} ${p.name}`}
                                  onSelect={() => {
                                    setProductPickerId(p.id);
                                    setProductPickerOpen(false);
                                  }}
                                >
                                  <Check className={cn("mr-2 h-4 w-4", productPickerId === p.id ? "opacity-100" : "opacity-0")} />
                                  <div className="flex flex-col">
                                    <span className="font-medium">{p.name}</span>
                                    <span className="text-[11px] text-muted-foreground">
                                      {p.sku} · {p.unit} · {formatBRL(p.defaultPrice)}
                                    </span>
                                  </div>
                                </CommandItem>
                              ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-xs">Qtd</Label>
                  <Input
                    type="number"
                    min={1}
                    step="1"
                    className="w-24"
                    value={productPickerQty}
                    onChange={(e) => setProductPickerQty(Math.max(1, Number(e.target.value) || 1))}
                    disabled={readOnly}
                  />
                </div>
                <Button
                  className="gap-2"
                  disabled={readOnly || !productPickerId || productPickerQty <= 0}
                  onClick={() => {
                    const parsed = addItemSchema.safeParse({
                      productId: productPickerId,
                      quantity: productPickerQty,
                      unitPrice: products.find((p) => p.id === productPickerId)?.defaultPrice ?? 0,
                    });
                    if (!parsed.success) {
                      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
                      return;
                    }
                    addItem(proposal.id, productPickerId, productPickerQty);
                    setProductPickerId("");
                    setProductPickerQty(1);
                    toast.success("Item adicionado");
                  }}
                >
                  <Plus className="h-4 w-4" /> Adicionar
                </Button>
              </div>
            </div>


          </CardContent>
        </Card>


        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Transporte</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Transportador</Label>
                <Select
                  value={
                    proposal.transport.carrierTransportadoraId
                      ? `id:${proposal.transport.carrierTransportadoraId}`
                      : ehOpcaoEspecialTransporte(proposal.transport.carrier)
                        ? `especial:${proposal.transport.carrier}`
                        : ""
                  }
                  onValueChange={(v) => {
                    if (v.startsWith("especial:")) {
                      updateProposal(proposal.id, {
                        transport: {
                          ...proposal.transport,
                          carrier: v.slice("especial:".length),
                          carrierTransportadoraId: null,
                        },
                      });
                      return;
                    }
                    const tid = v.slice("id:".length);
                    const t = transportadoras.find((x) => x.id === tid);
                    if (!t) return;
                    updateProposal(proposal.id, {
                      transport: {
                        ...proposal.transport,
                        carrier: t.nome,
                        carrierTransportadoraId: t.id,
                      },
                    });
                  }}
                  disabled={readOnly}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={proposal.transport.carrier || "Selecionar transportador"} />
                  </SelectTrigger>
                  <SelectContent>
                    {sugestaoTransportadora && (
                      <SelectItem value={`id:${sugestaoTransportadora.id}`}>
                        <span className="flex items-center gap-2">
                          {sugestaoTransportadora.nome}
                          <Badge variant="secondary" className="text-[10px]">sugerida</Badge>
                        </span>
                      </SelectItem>
                    )}
                    {OPCOES_ESPECIAIS_TRANSPORTE.map((o) => (
                      <SelectItem key={o} value={`especial:${o}`}>
                        <span className="flex items-center gap-2">
                          {o}
                          <span className="text-[10px] text-muted-foreground">(sem transportadora)</span>
                        </span>
                      </SelectItem>
                    ))}
                    {transportadoras
                      .filter((t) => t.id !== sugestaoTransportadora?.id)
                      .map((t) => (
                        <SelectItem key={t.id} value={`id:${t.id}`}>
                          {t.nome}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {sugestaoTransportadora && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Sugestão: {sugestaoTransportadora.nome} — mais usada em clientes de{" "}
                    {sugestaoTransportadora.uf} ({sugestaoTransportadora.usos} propostas).
                  </p>
                )}
                {!proposal.transport.carrierTransportadoraId &&
                  !ehOpcaoEspecialTransporte(proposal.transport.carrier) &&
                  proposal.transport.carrier && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Valor atual (texto antigo): {proposal.transport.carrier}
                    </p>
                  )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Label>Frete por conta</Label>
                  <Select
                    value={proposal.transport.freightPayer}
                    onValueChange={(v) => updateProposal(proposal.id, { transport: { ...proposal.transport, freightPayer: v as "CIF" | "FOB" } })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FOB">FOB (cliente) · padrão</SelectItem>
                      <SelectItem value="CIF">CIF (emitente) · requer aprovação</SelectItem>
                    </SelectContent>
                  </Select>
                  {proposal.transport.freightPayer === "CIF" && (
                    <p className="mt-1 text-[11px] text-amber-700 flex items-start gap-1">
                      <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                      Frete CIF exige autorização do supervisor. O pedido só será gerado após liberação do ADM.
                    </p>
                  )}
                </div>
                <div>
                  <Label className="flex items-center gap-1">
                    Peso bruto (kg)
                    <span className="text-[10px] font-normal text-muted-foreground">auto</span>
                  </Label>
                  <Input
                    type="number"
                    value={proposal.transport.grossWeightKg}
                    readOnly
                    className="bg-muted/50"
                    title="Calculado a partir do peso unitário × quantidade dos itens"
                  />
                </div>
                <div>
                  <Label className="flex items-center gap-1">
                    Cubagem (m³)
                    <span className="text-[10px] font-normal text-muted-foreground">auto</span>
                  </Label>
                  <Input
                    type="number"
                    value={proposal.transport.cubageM3}
                    readOnly
                    className="bg-muted/50"
                    title="Calculada a partir das dimensões do produto × quantidade"
                  />
                </div>
                <div>
                  <Label>Volumes</Label>
                  <Input
                    type="number"
                    value={proposal.transport.volumes}
                    onChange={(e) => updateProposal(proposal.id, { transport: { ...proposal.transport, volumes: Number(e.target.value) } })}
                  />
                </div>
                <div>
                  <Label>Valor frete aproximado (R$)</Label>
                  <Input
                    type="number" step="0.01"
                    value={proposal.transport.approxFreightValue}
                    onChange={(e) => updateProposal(proposal.id, { transport: { ...proposal.transport, approxFreightValue: Number(e.target.value) || 0 } })}
                    placeholder="Estimativa do vendedor"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Valor frete definitivo (R$)</Label>
                  <Input
                    type="number" step="0.01"
                    value={proposal.transport.freightValue}
                    onChange={(e) => updateProposal(proposal.id, { transport: { ...proposal.transport, freightValue: Number(e.target.value) || 0 } })}
                    placeholder="Confirmado com transportadora — entra no total"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Somado ao total da proposta. Deixe zero enquanto for apenas estimativa.
                  </p>
                </div>

                <div className="col-span-2 mt-1 rounded-md border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold uppercase tracking-wide">Cálculo automático por CEP</Label>
                    <span className="text-[10px] text-muted-foreground">
                      Origem: {freightConfig.originCep} · {freightConfig.originAddress}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <Label>CEP de entrega</Label>
                      <Input
                        value={proposal.transport.deliveryCep ?? ""}
                        onChange={(e) => updateProposal(proposal.id, { transport: { ...proposal.transport, deliveryCep: e.target.value } })}
                        placeholder="00000-000"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button
                        type="button"
                        size="sm"
                        className="w-full"
                        disabled={freightLoading || !proposal.transport.deliveryCep}
                        onClick={async () => {
                          try {
                            setFreightLoading(true);
                            const res = await calcFreight({
                              data: {
                                originCep: freightConfig.originCep,
                                destinationCep: proposal.transport.deliveryCep!,
                              },
                            });
                            const cubicKg = proposal.transport.cubageM3 * freightConfig.cubageFactorKgPerM3;
                            const taxableKg = Math.max(proposal.transport.grossWeightKg, cubicKg);
                            const value = +(taxableKg * res.distanceKm * freightConfig.rateBRLPerKgKm).toFixed(2);
                            updateProposal(proposal.id, {
                              transport: {
                                ...proposal.transport,
                                deliveryAddress: res.destinationAddress,
                                distanceKm: res.distanceKm,
                                approxFreightValue: value,
                              },
                            });
                            toast.success(`Distância: ${res.distanceKm} km`, {
                              description: `Peso taxável ${taxableKg.toFixed(0)}kg → ${formatBRL(value)}`,
                            });
                          } catch (err) {
                            toast.error("Falha ao calcular frete", {
                              description: err instanceof Error ? err.message : "Verifique o CEP",
                            });
                          } finally {
                            setFreightLoading(false);
                          }
                        }}
                      >
                        {freightLoading ? "Calculando..." : "Calcular"}
                      </Button>
                    </div>
                  </div>
                  {proposal.transport.distanceKm != null && (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div>📍 {proposal.transport.deliveryAddress}</div>
                      <div>
                        Distância: <strong>{proposal.transport.distanceKm} km</strong> · Tarifa: {freightConfig.rateBRLPerKgKm.toFixed(4)} R$/kg·km · Fator cubagem: {freightConfig.cubageFactorKgPerM3} kg/m³
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <LogisticaCard proposalId={proposal.id} />


          <Card>
            <CardHeader><CardTitle className="text-base">Empresa emissora</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Select
                value={proposal.emitterId}
                onValueChange={(v) => updateProposal(proposal.id, { emitterId: v })}
              >
                <SelectTrigger><SelectValue placeholder="Selecione o CNPJ emissor" /></SelectTrigger>
                <SelectContent>
                  {emitters.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      <span className="font-medium">{e.brand}</span>
                      <span className="text-muted-foreground text-xs ml-2">· CNPJ {e.cnpj}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="rounded-md border bg-muted/30 p-3 text-[11px] leading-relaxed">
                <div className="font-medium text-sm">{emitter.legalName}</div>
                <div>CNPJ: {emitter.cnpj} · IE: {emitter.ie}</div>
                <div>{emitter.address}</div>
                <div>Tel: {emitter.phone} · {emitter.email}</div>
              </div>
              {emitterSuggestion && proposal && (
                <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] leading-relaxed flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-primary">
                      Sugerido: {emitters.find((e) => e.id === emitterSuggestion.id)?.brand ?? emitterSuggestion.id.toUpperCase()}
                    </div>
                    <div className="text-muted-foreground">{emitterSuggestion.reason}</div>
                  </div>
                  {proposal.emitterId !== emitterSuggestion.id && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => _updateProposal(proposal.id, { emitterId: emitterSuggestion.id })}
                    >
                      Usar sugestão
                    </Button>
                  )}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Define qual CNPJ do grupo aparece no cabeçalho da proposta impressa.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Condições comerciais</CardTitle></CardHeader>

            <CardContent className="space-y-3">
              <div>
                <Label>Forma de pagamento</Label>
                <Select
                  value={proposal.formaPagamento ?? ""}
                  disabled={readOnly}
                  onValueChange={(v) =>
                    updateProposal(proposal.id, { formaPagamento: v as PaymentForm })
                  }
                >
                  <SelectTrigger><SelectValue placeholder="Boleto, Depósito em Conta ou PIX" /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_FORMS.map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Como o cliente vai pagar. O prazo é escolhido abaixo.
                </p>
              </div>

              <div>
                <Label>Prazo de pagamento</Label>
                <Select
                  value={proposal.paymentTermId ?? ""}
                  onValueChange={(v) => trocarCondicao(v)}
                >
                  <SelectTrigger><SelectValue placeholder="Escolha um prazo cadastrado" /></SelectTrigger>
                  <SelectContent className="max-h-80">
                    {visiblePaymentTerms.map((t: PaymentTerm) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="font-medium">{t.label}</span>
                        <span className="text-muted-foreground text-xs ml-2">
                          {t.active ? "" : "· (inativa)"}
                          {(t.acrescimoPercent ?? 0) > 0
                            ? ` · +${String(t.acrescimoPercent).replace(".", ",")}%`
                            : ""}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {isClientePf
                    ? "Cliente Pessoa Física: apenas condições à vista ou cartão (com acréscimo)."
                    : "Somente o administrador pode cadastrar novas condições."}
                </p>
              </div>

              <div>
                <Label>Previsão de entrega</Label>
                <Input
                  type="date"
                  value={proposal.expectedDeliveryDate ?? ""}
                  onChange={(e) =>
                    updateProposal(proposal.id, { expectedDeliveryDate: e.target.value || undefined })
                  }
                  disabled={readOnly}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Opcional. Se vazio, usa hoje + 7 dias como referência.
                </p>
              </div>
              {(() => {
                const term = selectedTerm;
                const total = totals?.total ?? 0;
                const previsao = proposal.billingForecastDate;
                const parcelas = proposal.installments ?? [];

                const parcelasCond = term ? termParcelas(term) : [];
                const diasCond = parcelasCond.map((p) => p.dias);
                const intervaloCond = intervaloPredominante(diasCond);
                const intervaloEfetivo = intervaloParcelas ?? intervaloCond;
                const irregular = espacamentoIrregular(diasCond) && intervaloParcelas === null;

                /** Recria as parcelas a partir dos percentuais da condição. */
                const gerarParcelas = (base?: string, t: PaymentTerm | null = term, intervalo?: number | null) => {
                  const dataBase = base ?? previsao;
                  if (!t || !dataBase) return;
                  const cond = termParcelas(t);
                  if (cond.length === 0) return;
                  const iv = intervalo === undefined ? intervaloParcelas : intervalo;
                  const dias =
                    iv === null || iv === undefined
                      ? cond.map((p) => p.dias)
                      : aplicarIntervalo(cond.map((p) => p.dias), iv);
                  const valores = valoresPorPercentual(total, cond.map((p) => p.percentual));
                  const antigas = proposal.installments ?? [];
                  if (antigas.length > 0) markDeleted("proposalParcelas", ...antigas.map((p) => p.id));
                  updateProposal(proposal.id, {
                    installments: cond.map((p, i) => ({
                      id: crypto.randomUUID(),
                      days: dias[i],
                      amount: valores[i],
                      percentual: p.percentual,
                      notes: "",
                      dueDate: addDaysToDateInput(dataBase, dias[i]),
                    })),
                  });
                };

                const patchParcela = (id: string, patch: Partial<PaymentInstallment>) =>
                  updateProposal(proposal.id, {
                    installments: parcelas.map((p) => (p.id === id ? { ...p, ...patch } : p)),
                  });

                const soma = parcelas.reduce((acc, p) => acc + (p.amount || 0), 0);
                const divergente = parcelas.length > 0 && Math.abs(soma - total) > 0.009;
                const preview = term && previsao ? buildTermInstallments(term, total) : [];


                return (
                  <>
                    <div>
                      <Label>Previsão de faturamento</Label>
                      <Input
                        type="date"
                        disabled={readOnly}
                        value={previsao ?? ""}
                        onChange={(e) => {
                          const v = e.target.value || undefined;
                          updateProposal(proposal.id, { billingForecastDate: v });
                          if (v) gerarParcelas(v);
                        }}
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Os vencimentos são calculados como previsão de faturamento + prazo de cada parcela.
                      </p>
                    </div>

                    {term && parcelasCond.length > 1 && (
                      <div>
                        <Label>Intervalo entre parcelas (dias)</Label>
                        <Input
                          type="number"
                          min={0}
                          disabled={readOnly}
                          placeholder={irregular ? "Espaçamento irregular da condição" : String(intervaloEfetivo)}
                          value={intervaloParcelas === null ? "" : String(intervaloParcelas)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const v = raw === "" ? null : Math.max(0, Number(raw) || 0);
                            setIntervaloParcelas(v);
                            if (previsao) gerarParcelas(previsao, term, v);
                          }}
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {irregular
                            ? "A condição tem espaçamento irregular. Informe um valor para uniformizar os prazos."
                            : `Vazio = usa o intervalo da condição (${intervaloCond} dias). Só altera os prazos, não os percentuais.`}
                        </p>
                      </div>
                    )}

                    <div className="rounded-md border-l-4 border-amber-500 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800">
                      <span className="font-semibold">Válido após aprovação financeira.</span>
                    </div>

                    {!term ? (
                      <p className="text-xs text-muted-foreground italic">Nenhuma condição selecionada.</p>
                    ) : !previsao ? (
                      <div className="rounded-md border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">{term.label}</span> ·{" "}
                        {descreverParcelas(parcelasCond)}
                        <br />
                        Informe a previsão de faturamento para calcular os vencimentos.
                      </div>

                    ) : (
                      <div className="rounded-md border bg-muted/30">
                        <div className="px-3 py-2 border-b flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium">{term.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">{term.method}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px]"
                              disabled={readOnly || !previsao}
                              onClick={() => {
                                gerarParcelas();
                                toast.success("Percentuais reaplicados");
                              }}
                            >
                              <RefreshCw className="h-3.5 w-3.5 mr-1" />
                              Ajustar percentuais
                            </Button>
                          </div>
                        </div>
                        <div className="px-3 py-1.5 border-b text-[11px] text-muted-foreground">
                          {descreverParcelas(parcelasCond)}
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="h-8 w-16">Parcela</TableHead>
                              <TableHead className="h-8">Prazo</TableHead>
                              <TableHead className="h-8 w-16 text-right">%</TableHead>
                              <TableHead className="h-8">Vencimento</TableHead>
                              <TableHead className="h-8 text-right">Valor (R$)</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {parcelas.length === 0 &&
                              preview.map((r, i) => (
                                <TableRow key={`prev-${i}`} className="text-xs">
                                  <TableCell className="py-1.5">{i + 1}/{preview.length}</TableCell>
                                  <TableCell className="py-1.5">{r.days === 0 ? "à vista" : `${r.days} dias`}</TableCell>
                                  <TableCell className="py-1.5 text-right text-muted-foreground">
                                    {String(+r.percentual.toFixed(2)).replace(".", ",")}%
                                  </TableCell>
                                  <TableCell className="py-1.5 text-muted-foreground">
                                    {previsao ? formatDateBr(addDaysToDateInput(previsao, r.days)) : "—"}
                                  </TableCell>
                                  <TableCell className="py-1.5 text-right font-medium">{formatBRL(r.amount)}</TableCell>
                                </TableRow>
                              ))}
                            {parcelas.map((p, i) => (
                              <TableRow key={p.id} className="text-xs">
                                <TableCell className="py-1.5">{i + 1}/{parcelas.length}</TableCell>
                                <TableCell className="py-1.5">{p.days === 0 ? "à vista" : `${p.days} dias`}</TableCell>
                                <TableCell className="py-1.5 text-right text-muted-foreground">
                                  {p.percentual == null
                                    ? "—"
                                    : `${String(+Number(p.percentual).toFixed(2)).replace(".", ",")}%`}
                                </TableCell>
                                <TableCell className="py-1.5">
                                  <Input
                                    type="date"
                                    className="h-8"
                                    disabled={readOnly}
                                    value={p.dueDate ?? ""}
                                    onChange={(e) => patchParcela(p.id, { dueDate: e.target.value || undefined })}
                                  />
                                </TableCell>
                                <TableCell className="py-1.5">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    className="h-8 text-right"
                                    disabled={readOnly}
                                    value={p.amount}
                                    onChange={(e) => patchParcela(p.id, { amount: Number(e.target.value) || 0 })}
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>

                        {parcelas.length > 0 && (
                          <div className="flex items-center justify-between px-3 py-2 border-t text-[11px]">
                            <span className="text-muted-foreground">Soma das parcelas</span>
                            <span className={divergente ? "font-semibold text-destructive" : "font-semibold"}>
                              {formatBRL(soma)}
                              {divergente ? ` · difere do total (${formatBRL(total)})` : ""}
                            </span>
                          </div>
                        )}
                        {term.notes && (
                          <div className="px-3 py-2 border-t text-[11px] text-muted-foreground">{term.notes}</div>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}

              <div>
                <div className="flex items-baseline justify-between">
                  <Label>Desconto (%)</Label>
                  <span className="text-[11px] text-muted-foreground">
                    Limite: <span className="font-medium text-foreground">{maxDiscount}%</span>
                  </span>
                </div>
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={maxDiscount}
                  value={proposal.discountPercent ?? 0}
                  onChange={(e) => {
                    const raw = Number(e.target.value);
                    if (!Number.isFinite(raw) || raw < 0) {
                      updateProposal(proposal.id, { discountPercent: 0 });
                      return;
                    }
                    if (raw > maxDiscount) {
                      toast.error(`Desconto máximo permitido: ${maxDiscount}%. Fale com o administrador para aumentar o limite.`);
                      updateProposal(proposal.id, { discountPercent: maxDiscount });
                      return;
                    }
                    updateProposal(proposal.id, { discountPercent: raw });
                  }}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Aplicado sobre o subtotal dos itens. Frete não entra no cálculo.
                </p>
              </div>

              <div>
                <Label>Validade (dias)</Label>
                <Input type="number" value={proposal.validityDays} onChange={(e) => updateProposal(proposal.id, { validityDays: Number(e.target.value) })} />
              </div>
              <div>
                <Label>Nº do pedido do cliente</Label>
                <Input
                  placeholder="Ex.: PO-12345 / OC 2026-001"
                  value={proposal.customerOrderNumber ?? ""}
                  onChange={(e) => updateProposal(proposal.id, { customerOrderNumber: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Opcional. Aparece no cabeçalho da proposta impressa quando preenchido.
                </p>
              </div>
              <div>
                <Label>Observações</Label>
                <Textarea rows={3} value={proposal.observations} onChange={(e) => updateProposal(proposal.id, { observations: e.target.value })} />
              </div>
              <div>
                <Label>Observações do pedido</Label>
                <Textarea
                  rows={3}
                  placeholder="Instruções específicas do pedido (entrega, embalagem, contato, etc.)"
                  value={proposal.orderNotes ?? ""}
                  onChange={(e) => updateProposal(proposal.id, { orderNotes: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Opcional. Exibida em seção própria na proposta impressa.
                </p>
              </div>
              <div>
                <Label>Tratativa comercial (interno)</Label>
                <Textarea
                  rows={4}
                  placeholder="O que foi combinado com o cliente: condições, concessões, contexto, promessas…"
                  value={proposal.tratativaComercial ?? ""}
                  onChange={(e) => updateProposal(proposal.id, { tratativaComercial: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Não aparece na proposta enviada ao cliente. É o que o financeiro vai ler ao aprovar.
                </p>
              </div>
            </CardContent>
          </Card>


        </div>
      </div>

      {/* Documento imprimível */}
      <div className="bg-white text-[13px] leading-snug border rounded-lg p-8 md:p-10 shadow-sm print:border-0 print:shadow-none print:rounded-none print:p-6 print:text-[11px]" id="proposta-print">
        {/* Print-only running header: repeats on every printed page */}
        <div className="print-running-header" aria-hidden="true">
          <div className="print-running-header-inner">
            <div className="print-running-header-brand">{emitter.brand}</div>
            <div className="print-running-header-meta">
              <span>PROPOSTA Nº <strong>{proposal.number}</strong></span>
              <span> · {format(new Date(proposal.createdAt), "dd/MM/yyyy")}</span>
            </div>
          </div>
        </div>
        <div className="print-running-footer" aria-hidden="true">
          <div className="print-running-footer-inner">
            <span>{emitter.legalName} · CNPJ {emitter.cnpj} · {emitter.phone} · {emitter.email}</span>
            <span className="print-page-counter" />
          </div>
        </div>
        <div className="flex items-start justify-between border-b pb-4 mb-4">
          <div>
            <div className="text-xl font-display font-bold text-primary">{emitter.brand}</div>
            <div className="text-[11px] text-muted-foreground">{emitter.tagline ?? ""}</div>

            <div className="mt-2 text-[11px] leading-relaxed">
              <div className="font-medium">{emitter.legalName}</div>
              <div>CNPJ: {emitter.cnpj} · IE: {emitter.ie}</div>
              <div>{emitter.address}</div>
              <div>Tel: {emitter.phone} · WhatsApp: {emitter.whatsapp}</div>
              <div>{emitter.email} · {emitter.website}</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Proposta Nº</div>
            <div className="font-display text-2xl font-bold">{proposal.number}</div>
            <div className="text-[11px] mt-2">
              <div>Data: {format(new Date(proposal.createdAt), "dd/MM/yyyy")}</div>
              <div>Validade: {proposal.validityDays} dias</div>
              {proposal.customerOrderNumber && proposal.customerOrderNumber.trim() && (
                <div>Pedido do cliente: <span className="font-semibold">{proposal.customerOrderNumber}</span></div>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Para</div>
            <div className="font-semibold">{clienteRow?.razao_social || lead.company}</div>
            <div className="text-[11px] leading-relaxed">
              {clienteRow && <div>{formatDocumentoCliente(clienteRow) !== "—" ? `${clienteRow.tipo_pessoa === "PF" ? "CPF" : "CNPJ"}: ${formatDocumentoCliente(clienteRow)}` : ""}</div>}
              {(clienteRow?.endereco || clienteRow?.numero) && (
                <div>
                  {[clienteRow?.endereco, clienteRow?.numero].filter(Boolean).join(", ")}
                  {clienteRow?.complemento ? ` — ${clienteRow.complemento}` : ""}
                </div>
              )}
              {clienteRow?.bairro && <div>Bairro: {clienteRow.bairro}</div>}
              {(clienteRow?.cidade || clienteRow?.estado) && (
                <div>{[clienteRow?.cidade, clienteRow?.estado].filter(Boolean).join("/")}</div>
              )}
              {clienteRow?.cep && <div>CEP: {formatCep(clienteRow.cep)}</div>}
              <div>Aos cuidados de: {lead.contactName}</div>
              <div>E-mail: {lead.email || clienteRow?.email || "—"}</div>
              <div>Telefone: {lead.phone || clienteRow?.telefone || "—"}</div>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Vendedor(a)</div>
            <div className="font-semibold">{vendedor?.name ?? owner?.name ?? "—"}</div>
            <div className="text-[11px]">{vendedor?.email ?? emitter.email}</div>

          </div>
        </div>

        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Itens da proposta comercial</div>
        <table className="w-full text-[11px] border-collapse mb-4">
          <thead>
            <tr className="bg-muted/60">
              <th className="border p-1.5 text-left w-8">#</th>
              <th className="border p-1.5 text-left">Descrição do produto</th>
              <th className="border p-1.5 text-left">Código</th>
              <th className="border p-1.5 text-left w-24">NCM</th>
              <th className="border p-1.5 text-center w-12">Un</th>
              <th className="border p-1.5 text-right w-20">Qtd.</th>
              <th className="border p-1.5 text-right w-28">Preço un.</th>
              <th className="border p-1.5 text-right w-28">Preço total</th>
            </tr>
          </thead>
          <tbody>
            {proposal.items.map((it, idx) => (
              <tr key={it.id}>
                <td className="border p-1.5">{idx + 1}</td>
                <td className="border p-1.5">{it.description}</td>
                <td className="border p-1.5 font-mono">{it.sku}</td>
                <td className="border p-1.5 font-mono">{it.ncm || "—"}</td>
                <td className="border p-1.5 text-center">{it.unit}</td>
                <td className="border p-1.5 text-right">{it.quantity.toLocaleString("pt-BR")}</td>
                <td className="border p-1.5 text-right">{formatBRL(it.unitPrice)}</td>
                <td className="border p-1.5 text-right font-semibold">{formatBRL(it.quantity * it.unitPrice)}</td>
              </tr>
            ))}
            {proposal.items.length === 0 && (
              <tr><td colSpan={8} className="border p-3 text-center text-muted-foreground italic">Nenhum item adicionado.</td></tr>
            )}
          </tbody>
        </table>

        <table className="w-full text-[11px] border-collapse mb-4">
          <thead>
            <tr className="bg-muted/60">
              <th className="border p-1.5">Nº de Itens</th>
              <th className="border p-1.5">Soma das Qtdes</th>
              <th className="border p-1.5">Subtotal dos itens</th>
              <th className="border p-1.5">Desconto</th>
              <th className="border p-1.5">Acréscimo</th>
              <th className="border p-1.5">Frete</th>
              <th className="border p-1.5">Total da proposta</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border p-1.5 text-center">{totals?.count}</td>
              <td className="border p-1.5 text-center">{totals?.qty.toLocaleString("pt-BR")}</td>
              <td className="border p-1.5 text-right">{formatBRL(totals?.subtotal ?? 0)}</td>
              <td className="border p-1.5 text-right">
                {(totals?.discountPercent ?? 0) > 0
                  ? `− ${formatBRL(totals?.discountAmount ?? 0)} (${totals?.discountPercent}%)`
                  : "—"}
              </td>
              <td className="border p-1.5 text-right">
                {(totals?.surchargeAmount ?? 0) > 0
                  ? `+ ${formatBRL(totals?.surchargeAmount ?? 0)} (${String(totals?.surchargePercent).replace(".", ",")}%)`
                  : "—"}
              </td>
              <td className="border p-1.5 text-right">{formatBRL(proposal.transport.freightValue)}</td>
              <td className="border p-1.5 text-right font-bold text-primary">{formatBRL(totals?.total ?? 0)}</td>
            </tr>
          </tbody>
        </table>


        {proposal.installments.length > 0 && (
          <div className="mb-4 print-block">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1 print-title">
              Vencimentos{selectedTerm ? ` ${selectedTerm.label}` : ""}
            </div>
            <table className="w-full text-[11px] border-collapse">
              <tbody>
                <tr className="print-head-row">
                  <th className="border p-1.5 text-left w-28">Parcela</th>
                  {proposal.installments.map((p, i) => (
                    <th key={`n-${p.id}`} className="border p-1.5 text-center">{i + 1}</th>
                  ))}
                </tr>
                <tr>
                  <td className="border p-1.5 bg-muted/40 font-medium">Vencimento</td>
                  {proposal.installments.map((p) => (
                    <td key={`d-${p.id}`} className="border p-1.5 text-center">
                      {p.dueDate ? formatDateBr(p.dueDate) : (p.days === 0 ? "à vista" : `${p.days} dias`)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="border p-1.5 bg-muted/40 font-medium">Valor (R$)</td>
                  {proposal.installments.map((p) => (
                    <td key={`v-${p.id}`} className="border p-1.5 text-center">{formatBRL(p.amount)}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="mb-4 print-block">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1 print-title">Outras Informações</div>
          <table className="w-full text-[11px] border-collapse">
            <tbody>
              <tr>
                <td className="border p-1.5 bg-muted/40 font-medium w-44">Proposta incluída em</td>
                <td className="border p-1.5">{format(new Date(proposal.createdAt), "dd/MM/yyyy")}</td>
                <td className="border p-1.5 bg-muted/40 font-medium w-44">Previsão de faturamento</td>
                <td className="border p-1.5">{formatDateBr(proposal.billingForecastDate)}</td>
              </tr>
              <tr>
                <td className="border p-1.5 bg-muted/40 font-medium">Vendedor(a)</td>
                <td className="border p-1.5">{vendedor?.name ?? owner?.name ?? "—"}</td>
                <td className="border p-1.5 bg-muted/40 font-medium">Frete</td>
                <td className="border p-1.5">
                  {proposal.transport.freightPayer} · {formatBRL(proposal.transport.freightValue)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Condições comerciais</div>
            {(() => {
              const term = paymentTerms.find((t: PaymentTerm) => t.id === proposal.paymentTermId);
              if (!term) {
                return <div className="text-[11px] italic text-muted-foreground">A combinar.</div>;
              }
              // Parcelas reais (já vêm ordenadas por `position` do banco); sem elas,
              // cai na previsão a partir dos percentuais da condição.
              const reais = proposal.installments ?? [];
              const rows =
                reais.length > 0
                  ? reais.map((p) => ({
                      days: p.days,
                      amount: p.amount,
                      percentual: p.percentual ?? null,
                      dueDate: p.dueDate ?? null,
                    }))
                  : buildTermInstallments(term, totals?.total ?? 0).map((r) => ({
                      days: r.days,
                      amount: r.amount,
                      percentual: r.percentual,
                      dueDate: proposal.billingForecastDate
                        ? addDaysToDateInput(proposal.billingForecastDate, r.days)
                        : null,
                    }));
              return (
                <>
                  <div className="text-[11px] mb-1">
                    <span className="font-semibold">{term.label}</span>
                    {proposal.formaPagamento ? <> · Forma: {proposal.formaPagamento}</> : null}
                  </div>
                  <div className="text-[10px] text-muted-foreground mb-1">{descreverParcelas(termParcelas(term))}</div>
                  <table className="w-full text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-muted/60">
                        <th className="border p-1.5 text-left w-12">Nº</th>
                        <th className="border p-1.5 text-left">Prazo</th>
                        <th className="border p-1.5 text-left">Vencimento</th>
                        <th className="border p-1.5 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i}>
                          <td className="border p-1.5">{i + 1}/{rows.length}</td>
                          <td className="border p-1.5">{r.days === 0 ? "à vista" : `${r.days} dias`}</td>
                          <td className="border p-1.5">{r.dueDate ? formatDateBr(r.dueDate) : "—"}</td>
                          <td className="border p-1.5 text-right">{formatBRL(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {term.notes && <div className="text-[10px] text-muted-foreground mt-1">{term.notes}</div>}
                </>
              );
            })()}

            <div className="mt-2 text-[11px] font-semibold text-amber-800 border-l-4 border-amber-500 bg-amber-500/10 px-2 py-1">
              Válido após aprovação financeira.
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Transportador</div>
            <table className="w-full text-[11px] border-collapse">
              <tbody>
                <tr><td className="border p-1.5 bg-muted/40 font-medium w-32">Nome</td><td className="border p-1.5">{proposal.transport.carrier}</td></tr>
                <tr><td className="border p-1.5 bg-muted/40 font-medium">Frete por conta</td><td className="border p-1.5">{proposal.transport.freightPayer}</td></tr>
                <tr><td className="border p-1.5 bg-muted/40 font-medium">Peso Bruto (kg)</td><td className="border p-1.5">{proposal.transport.grossWeightKg}</td></tr>
                <tr><td className="border p-1.5 bg-muted/40 font-medium">Cubagem (m³)</td><td className="border p-1.5">{proposal.transport.cubageM3}</td></tr>
                <tr><td className="border p-1.5 bg-muted/40 font-medium">Qtd Volumes</td><td className="border p-1.5">{proposal.transport.volumes}</td></tr>
                <tr><td className="border p-1.5 bg-muted/40 font-medium">Frete aproximado</td><td className="border p-1.5">{formatBRL(proposal.transport.approxFreightValue ?? 0)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        {proposal.observations && (
          <div className="mb-6">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Observações</div>
            <div className="text-[11px] whitespace-pre-wrap border rounded p-3 bg-muted/20">{proposal.observations}</div>
          </div>
        )}

        {proposal.orderNotes && proposal.orderNotes.trim() && (
          <div className="mb-6">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Observações do pedido</div>
            <div className="text-[11px] whitespace-pre-wrap border rounded p-3 bg-muted/20">{proposal.orderNotes}</div>
          </div>
        )}

        {(emitter.banco || emitter.agencia || emitter.conta || emitter.pix) && (
          <div className="mb-6">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Dados para pagamento</div>
            <div className="border rounded p-3 bg-muted/10 text-[11px] leading-relaxed">
              <div className="font-semibold">{emitter.legalName}</div>
              <div>CNPJ: {emitter.cnpj}</div>
              {emitter.banco && <div>Banco: {emitter.banco}</div>}
              {(emitter.agencia || emitter.conta) && (
                <div>
                  {emitter.agencia && <>Agência: <span className="font-mono">{emitter.agencia}</span></>}
                  {emitter.agencia && emitter.conta && " · "}
                  {emitter.conta && <>Conta corrente: <span className="font-mono">{emitter.conta}</span></>}
                </div>
              )}
              {emitter.pix && (
                <div className="mt-1">
                  <span>Chave PIX:</span>{" "}
                  <span className="font-mono font-semibold select-all">{emitter.pix}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="text-[11px] mt-6">Atenciosamente,<br/>Departamento de Vendas</div>

        <div className="mt-8 grid grid-cols-3 gap-6 text-[11px]">
          <div>
            <div className="border-t pt-1">Data da aprovação</div>
            <div className="text-muted-foreground">___/___/______</div>
          </div>
          <div>
            <div className="border-t pt-1">Assinatura do cliente</div>
          </div>
          <div className="text-right">
            <div className="text-xs">Proposta Nº <span className="font-bold">{proposal.number}</span></div>
            <div className="text-sm">Valor Total: <span className="font-bold text-primary">{formatBRL(totals?.total ?? 0)}</span></div>
          </div>
        </div>
      </div>

      <style>{`
        /* Elementos exclusivos de impressão ficam ocultos na tela */
        .print-running-header,
        .print-running-footer { display: none; }

        /* Folha A4 com margens do modelo anterior */
        @page {
          size: A4;
          margin: 14mm 12mm 16mm 12mm;
        }

        @media print {
          body { background: white; }
          /* Nenhum elemento de interface é impresso */
          aside, header, nav { display: none !important; }
          .print\\:hidden { display: none !important; }
          [data-sonner-toaster] { display: none !important; }

          #proposta-print {
            padding: 0 !important;
            font-size: 9pt;
            line-height: 1.35;
            color: #111827;
            background: #fff;
          }
          #proposta-print table { font-size: 8pt; width: 100%; }
          #proposta-print th, #proposta-print td { padding: 1.2mm 1.5mm; }

          /* Cabeçalho corrido em todas as páginas */
          #proposta-print .print-running-header {
            display: block;
            position: fixed;
            top: 0; left: 0; right: 0;
            height: 10mm;
            box-sizing: border-box;
            padding: 2mm 0;
            background: white;
            border-bottom: 0.3mm solid #0e7c6b;
            font-size: 8pt;
          }
          #proposta-print .print-running-header-inner,
          #proposta-print .print-running-footer-inner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6mm;
          }
          #proposta-print .print-running-header-brand {
            font-weight: 700;
            color: #0e7c6b;
          }
          #proposta-print .print-running-header-meta { color: #374151; }

          /* Rodapé com dados da empresa e numeração */
          #proposta-print .print-running-footer {
            display: block;
            position: fixed;
            bottom: 0; left: 0; right: 0;
            height: 10mm;
            box-sizing: border-box;
            padding: 2mm 0;
            background: white;
            border-top: 0.3mm solid #d1d5db;
            font-size: 7pt;
            color: #4b5563;
          }
          #proposta-print .print-page-counter::after {
            content: "Página " counter(page) " de " counter(pages);
          }

          /* Blocos inteiros e linhas não quebram entre páginas */
          #proposta-print > div,
          #proposta-print > table,
          #proposta-print .print-block {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          #proposta-print table,
          #proposta-print thead,
          #proposta-print tbody,
          #proposta-print tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          #proposta-print .print-title,
          #proposta-print .text-xs.uppercase {
            break-after: avoid;
            page-break-after: avoid;
          }

          /* Cabeçalho da tabela de itens repete a cada quebra de página */
          #proposta-print thead { display: table-header-group; }
          #proposta-print tfoot { display: table-footer-group; }

          /* Verde institucional nos cabeçalhos e destaques + zebra */
          #proposta-print thead tr,
          #proposta-print tr.print-head-row {
            background: #0e7c6b !important;
            color: #ffffff !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #proposta-print thead th,
          #proposta-print tr.print-head-row th {
            color: #ffffff !important;
            border-color: #0e7c6b !important;
          }
          #proposta-print tbody tr:nth-child(even) td {
            background: #f3f4f6 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          #proposta-print .text-primary { color: #0e7c6b !important; }
        }
      `}</style>
    </div>
  );
}

// ============ Logística inteligente ============

import { Truck } from "lucide-react";
import { cotarLogistica } from "@/lib/logistica.functions";
import type { CalcResultado } from "@/lib/logistica";

function LogisticaCard({ proposalId }: { proposalId: string }) {
  const proposal = useCrm((s) => s.proposals.find((p) => p.id === proposalId));
  const products = useCrm((s) => s.products);
  const fleet = useCrm((s) => s.fleet);
  const freightConfig = useCrm((s) => s.freightConfig);
  const updateProposal = useCrm((s) => s.updateProposal);
  const cotar = useServerFn(cotarLogistica);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<(CalcResultado & { originAddress: string; destinationAddress: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!proposal) return null;

  const destCep = proposal.transport.deliveryCep ?? "";
  const originCep = freightConfig.originCep;

  const itens = useMemo(() => {
    return proposal.items
      .map((it) => {
        const p = products.find((pp) => pp.id === it.productId);
        if (!p) return null;
        return {
          produto: {
            sku: p.sku,
            name: p.name,
            weightKg: p.weightKg,
            heightCm: p.heightCm,
            widthCm: p.widthCm,
            lengthCm: p.lengthCm,
            pecasPorColuna: p.pecasPorColuna || 1,
            stackHeightCm: p.stackHeightCm ?? null,
          },
          quantidade: it.quantity,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  }, [proposal.items, products]);

  const canCalc = itens.length > 0 && !!destCep && !!originCep && fleet.some((v) => v.ativo);

  const run = async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await cotar({ data: { itens, frota: fleet, originCep, destinationCep: destCep } });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na cotação");
    } finally {
      setLoading(false);
    }
  };

  const aplicarFrete = (valor: number) => {
    updateProposal(proposal.id, {
      transport: { ...proposal.transport, freightValue: valor },
    });
    toast.success("Frete aplicado à proposta");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Truck className="h-4 w-4 text-primary" />
          Logística inteligente
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Usa os itens da proposta + dimensões cadastradas do produto para calcular peso, cubagem, mix de veículos e frete por peça.
        </p>
        <div className="text-xs space-y-1">
          <div>Origem: <span className="font-mono">{originCep}</span> · {freightConfig.originAddress}</div>
          <div>Destino: <span className="font-mono">{destCep || "— informe CEP em Transporte"}</span></div>
          <div>Itens: {itens.length} SKU · {itens.reduce((s, i) => s + i.quantidade, 0)} peça(s)</div>
        </div>
        <Button size="sm" onClick={run} disabled={!canCalc || loading} className="w-full">
          {loading ? "Calculando…" : "Calcular logística"}
        </Button>
        {error && (
          <div className="text-xs text-destructive flex items-start gap-1">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            {error}
          </div>
        )}
        {result && (
          <div className="space-y-2 pt-2 border-t">
            <div className="text-xs text-muted-foreground">
              📍 {result.destinationAddress} · <strong>{result.distanciaKm} km</strong>
            </div>
            <div className="text-xs flex flex-wrap gap-3">
              <span>Peso total: <strong>{result.totalPesoKg.toLocaleString("pt-BR")} kg</strong></span>
              <span>Cubagem: <strong>{result.totalVolumeM3.toFixed(2)} m³</strong></span>
              <span>Peças: <strong>{result.totalPecas}</strong></span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Veículo</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Aprov.</TableHead>
                    <TableHead>Limite</TableHead>
                    <TableHead className="text-right">Frete total</TableHead>
                    <TableHead className="text-right">R$/peça</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.veiculos.map((v) => {
                    const isBest = v.vehicleId === result.melhorVeiculoId;
                    const noFit = v.veiculosNecessarios === 0;
                    return (
                      <TableRow key={v.vehicleId} className={isBest ? "bg-primary/5" : ""}>
                        <TableCell className="font-medium">
                          {v.nome} {isBest && <Badge variant="secondary" className="ml-1 text-[10px]">melhor</Badge>}
                        </TableCell>
                        <TableCell className="text-right">{noFit ? "—" : v.veiculosNecessarios}</TableCell>
                        <TableCell className="text-right">{noFit ? "—" : `${v.aproveitamentoPct}%`}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {noFit ? "não cabe" : v.limitante}
                        </TableCell>
                        <TableCell className="text-right">{noFit ? "—" : formatBRL(v.freteTotal)}</TableCell>
                        <TableCell className="text-right">{noFit ? "—" : formatBRL(v.fretePorPeca)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" disabled={noFit} onClick={() => aplicarFrete(v.freteTotal)}>
                            Usar
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

