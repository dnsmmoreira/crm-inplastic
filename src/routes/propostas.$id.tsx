import { createFileRoute, Link, useNavigate, useBlocker } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2, Printer, Send, CheckCircle2, XCircle, Check, ChevronsUpDown, Search, AlertCircle, Lock, Unlock, ShieldAlert } from "lucide-react";
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
  type PaymentTerm,
} from "@/lib/crm-store";
import { calculateFreightDistance } from "@/lib/freight.functions";
import { gerarPedidoOmie } from "@/lib/omie.functions";
import { useServerFn } from "@tanstack/react-start";


/** Build display installments (equal split) from an ADM payment term and the proposal total. */
function buildTermInstallments(term: PaymentTerm | undefined, total: number) {
  if (!term) return [];
  const n = term.splits.length;
  const base = Math.floor((total / n) * 100) / 100;
  const remainder = Math.round((total - base * n) * 100) / 100;
  return term.splits.map((days, i) => ({
    days,
    amount: i === n - 1 ? +(base + remainder).toFixed(2) : base,
  }));
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

  const totals = useMemo(() => (proposal ? proposalTotals(proposal) : null), [proposal]);
  const owner = proposal ? USERS.find((u) => u.id === proposal.ownerId) : null;
  
  const isAdmin = useIsAdmin();
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
      const r = await gerarPedido({ data: { proposta_id: proposal.id, requer_aprovacao: requerAprovacao } });
      toast.dismiss(t);
      if (!r.ok) {
        toast.error("Pendências antes de gerar o pedido", {
          description: (r.validacao_erros ?? ["Erro desconhecido"]).join("\n"),
          duration: 10000,
        });
      } else if (requerAprovacao) {
        toast.success("Enviado ao supervisor ADM");
      } else {
        toast.success("Pedido gerado", { description: "Lead movido para Ganho." });
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
              {proposal.omieStatus === "enviado" && (
                <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 gap-1" variant="outline">
                  ✅ Pedido Omie #{proposal.omieNumeroPedido ?? "?"}
                </Badge>
              )}
              {proposal.omieStatus === "erro" && (
                <>
                  <Badge className="bg-red-500/15 text-red-700 border-red-500/30 gap-1" variant="outline">
                    ❌ Erro Omie
                  </Badge>
                  <Button size="sm" variant="outline" disabled={omieBusy} onClick={() => void handleReenviarPedido()}>
                    Reenviar
                  </Button>
                </>
              )}
              {proposal.omieStatus === "pendente" && (
                <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 animate-pulse" variant="outline">
                  ⏳ Enviando ao Omie...
                </Badge>
              )}
              {proposal.omieStatus === "nao_aplicavel" && (
                <Badge className="bg-muted text-muted-foreground" variant="outline">
                  ⚫ LICITAPLAS — sem Omie
                </Badge>
              )}
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
              Criada em {format(new Date(proposal.createdAt), "dd/MM/yyyy", { locale: ptBR })} · Vendedor: {owner?.name ?? "—"}
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
          {!isPedido && (
            <Button variant="outline" className="gap-2" onClick={() => { setStatus(proposal.id, "enviada"); toast.success("Marcada como enviada"); }}>
              <Send className="h-4 w-4" /> Enviar
            </Button>
          )}

          {/* Fechar pedido: admin gera direto e dispara Omie; vendedor solicita aprovação. */}
          {proposal.status !== "pedido" && proposal.status !== "aguardando_aprovacao" && (
            <Button
              variant="default"
              className="gap-2"
              disabled={omieBusy}
              onClick={() => void handleGerarPedido(!isAdmin)}
            >
              <CheckCircle2 className="h-4 w-4" /> {isAdmin ? "Gerar pedido" : "Solicitar pedido"}
            </Button>
          )}


          {/* ADM libera pedidos aguardando aprovação — dispara Omie no ato. */}
          {proposal.status === "aguardando_aprovacao" && isAdmin && (
            <Button
              className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              disabled={omieBusy}
              onClick={() => void handleGerarPedido(false)}
            >
              <CheckCircle2 className="h-4 w-4" /> Aprovar liberação
            </Button>
          )}
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

            <div className="mt-4 border-t pt-4 flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">
                Itens vêm do catálogo Omie — só produtos cadastrados no Omie podem virar pedido.
              </div>
              <Button
                onClick={() => {
                  if (readOnly) {
                    toast.error("Pedido fechado — solicite liberação do ADM para editar.");
                    return;
                  }
                  setOmieDialogOpen(true);
                }}
                className="gap-2"
              >
                <Plus className="h-4 w-4" /> Adicionar produto do Omie
              </Button>
            </div>

            <AddOmieItemDialog
              open={omieDialogOpen}
              onOpenChange={setOmieDialogOpen}
              onAdd={(payload: AddOmieItemPayload) => {
                addItemFromOmie(
                  proposal.id,
                  {
                    omieCodigoProduto: payload.omieCodigoProduto,
                    description: payload.description,
                    sku: payload.sku,
                    unit: payload.unit,
                    unitPrice: payload.unitPrice,
                  },
                  payload.quantity,
                );
                toast.success("Item adicionado");
              }}
            />

          </CardContent>
        </Card>


        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Transporte</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Transportador</Label>
                <Input
                  value={proposal.transport.carrier}
                  onChange={(e) => updateProposal(proposal.id, { transport: { ...proposal.transport, carrier: e.target.value } })}
                />
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
              <p className="text-[11px] text-muted-foreground">
                Define qual CNPJ do grupo aparece no cabeçalho da proposta impressa.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Condições comerciais</CardTitle></CardHeader>

            <CardContent className="space-y-3">
              <div>
                <Label>Condição de pagamento</Label>
                <Select
                  value={proposal.paymentTermId ?? ""}
                  onValueChange={(v) => updateProposal(proposal.id, { paymentTermId: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Escolha uma condição cadastrada" /></SelectTrigger>
                  <SelectContent className="max-h-80">
                    {activePaymentTerms.map((t: PaymentTerm) => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="font-medium">{t.label}</span>
                        <span className="text-muted-foreground text-xs ml-2">· {t.method}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Somente o administrador pode cadastrar novas condições.
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
                  Opcional. Se vazio, o Omie usa hoje + 7 dias no pedido.
                </p>
              </div>


              <div className="rounded-md border-l-4 border-amber-500 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800">
                <span className="font-semibold">Válido após aprovação financeira.</span>
              </div>


              {(() => {
                const term = paymentTerms.find((t: PaymentTerm) => t.id === proposal.paymentTermId);
                if (!term) return (
                  <p className="text-xs text-muted-foreground italic">Nenhuma condição selecionada.</p>
                );
                const rows = buildTermInstallments(term, totals?.total ?? 0);
                return (
                  <div className="rounded-md border bg-muted/30">
                    <div className="px-3 py-2 border-b flex items-center justify-between text-xs">
                      <span className="font-medium">{term.label}</span>
                      <span className="text-muted-foreground">{term.method}</span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8">Parcela</TableHead>
                          <TableHead className="h-8">Vencimento</TableHead>
                          <TableHead className="h-8 text-right">Valor</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r, i) => (
                          <TableRow key={i} className="text-xs">
                            <TableCell className="py-1.5">{i + 1}/{rows.length}</TableCell>
                            <TableCell className="py-1.5">{r.days === 0 ? "à vista" : `${r.days} dias`}</TableCell>
                            <TableCell className="py-1.5 text-right font-medium">{formatBRL(r.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {term.notes && (
                      <div className="px-3 py-2 border-t text-[11px] text-muted-foreground">{term.notes}</div>
                    )}
                  </div>
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
                <Label>Observações</Label>
                <Textarea rows={3} value={proposal.observations} onChange={(e) => updateProposal(proposal.id, { observations: e.target.value })} />
              </div>
            </CardContent>
          </Card>

        </div>
      </div>

      {/* Documento imprimível */}
      <div className="bg-white text-[13px] leading-snug border rounded-lg p-8 md:p-10 shadow-sm print:border-0 print:shadow-none print:rounded-none print:p-6 print:text-[11px]" id="proposta-print">
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
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Para</div>
            <div className="font-semibold">{lead.company}</div>
            <div className="text-[11px] leading-relaxed">
              <div>Aos cuidados de: {lead.contactName}</div>
              <div>E-mail: {lead.email || "—"}</div>
              <div>Telefone: {lead.phone}</div>
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Vendedor(a)</div>
            <div className="font-semibold">{owner?.name ?? "—"}</div>
            <div className="text-[11px]">{emitter.email}</div>
          </div>
        </div>

        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Itens da proposta comercial</div>
        <table className="w-full text-[11px] border-collapse mb-4">
          <thead>
            <tr className="bg-muted/60">
              <th className="border p-1.5 text-left w-8">#</th>
              <th className="border p-1.5 text-left">Descrição do produto</th>
              <th className="border p-1.5 text-left">Código</th>
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
                <td className="border p-1.5 text-center">{it.unit}</td>
                <td className="border p-1.5 text-right">{it.quantity.toLocaleString("pt-BR")}</td>
                <td className="border p-1.5 text-right">{formatBRL(it.unitPrice)}</td>
                <td className="border p-1.5 text-right font-semibold">{formatBRL(it.quantity * it.unitPrice)}</td>
              </tr>
            ))}
            {proposal.items.length === 0 && (
              <tr><td colSpan={7} className="border p-3 text-center text-muted-foreground italic">Nenhum item adicionado.</td></tr>
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
              <td className="border p-1.5 text-right">{formatBRL(proposal.transport.freightValue)}</td>
              <td className="border p-1.5 text-right font-bold text-primary">{formatBRL(totals?.total ?? 0)}</td>
            </tr>
          </tbody>
        </table>


        <div className="grid grid-cols-2 gap-6 mb-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Condições comerciais</div>
            {(() => {
              const term = paymentTerms.find((t: PaymentTerm) => t.id === proposal.paymentTermId);
              const rows = buildTermInstallments(term, totals?.total ?? 0);
              if (!term) {
                return <div className="text-[11px] italic text-muted-foreground">A combinar.</div>;
              }
              return (
                <>
                  <div className="text-[11px] mb-1"><span className="font-semibold">{term.label}</span> · {term.method}</div>
                  <table className="w-full text-[11px] border-collapse">
                    <thead>
                      <tr className="bg-muted/60">
                        <th className="border p-1.5 text-left w-12">Nº</th>
                        <th className="border p-1.5 text-left">Vencimento</th>
                        <th className="border p-1.5 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i}>
                          <td className="border p-1.5">{i + 1}/{rows.length}</td>
                          <td className="border p-1.5">{r.days === 0 ? "à vista" : `${r.days} dias`}</td>
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
        @media print {
          body { background: white; }
          aside, header, nav { display: none !important; }
          .print\\:hidden { display: none !important; }
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

