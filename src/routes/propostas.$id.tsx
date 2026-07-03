import { createFileRoute, Link, useNavigate, useBlocker } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2, Printer, Send, CheckCircle2, XCircle, Check, ChevronsUpDown, Search, AlertCircle } from "lucide-react";
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
  USERS,
  type ProposalStatus,
} from "@/lib/crm-store";
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

const STATUS_META: Record<ProposalStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  rascunho: { label: "Rascunho", variant: "outline" },
  enviada: { label: "Enviada", variant: "secondary" },
  aprovada: { label: "Aprovada", variant: "default" },
  recusada: { label: "Recusada", variant: "destructive" },
};

function PropostaDetalhe() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const proposal = useCrm((s) => s.proposals.find((p) => p.id === id));
  const lead = useCrm((s) => (proposal ? s.leads.find((l) => l.id === proposal.leadId) : undefined));
  const products = useCrm((s) => s.products);
  const emitter = useCrm((s) => s.emitter);
  const _addItem = useCrm((s) => s.addProposalItem);
  const _updateItem = useCrm((s) => s.updateProposalItem);
  const _removeItem = useCrm((s) => s.removeProposalItem);
  const _updateProposal = useCrm((s) => s.updateProposal);
  const _setStatus = useCrm((s) => s.setProposalStatus);
  const [addProduct, setAddProduct] = useState("");
  const [addQty, setAddQty] = useState<number | "">(1);
  const [addPrice, setAddPrice] = useState<number | "">("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, { field: "description" | "quantity" | "unitPrice"; message: string } | null>>({});
  const [dirty, setDirty] = useState(false);

  const totals = useMemo(() => (proposal ? proposalTotals(proposal) : null), [proposal]);
  const owner = proposal ? USERS.find((u) => u.id === proposal.ownerId) : null;
  const selectedProduct = useMemo(() => products.find((p) => p.id === addProduct), [products, addProduct]);

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

  const validateAndUpdateItem = (
    itemId: string,
    field: "description" | "quantity" | "unitPrice",
    raw: string,
  ) => {
    const value = field === "description" ? raw : Number(raw);
    const parsed = itemSchema.shape[field].safeParse(value);
    if (!parsed.success) {
      setRowErrors((prev) => ({ ...prev, [itemId]: { field, message: parsed.error.issues[0]?.message ?? "Valor inválido" } }));
      // Still reflect the raw value in the store so the user sees what they typed
      updateItem(proposal!.id, itemId, { [field]: value } as never);
      return;
    }
    setRowErrors((prev) => ({ ...prev, [itemId]: null }));
    updateItem(proposal!.id, itemId, { [field]: parsed.data } as never);
  };

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
              <Badge variant={s.variant}>{s.label}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Criada em {format(new Date(proposal.createdAt), "dd/MM/yyyy", { locale: ptBR })} · Vendedor: {owner?.name ?? "—"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={proposal.status} onValueChange={(v) => setStatus(proposal.id, v as ProposalStatus)}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="rascunho">Rascunho</SelectItem>
              <SelectItem value="enviada">Enviada</SelectItem>
              <SelectItem value="aprovada">Aprovada</SelectItem>
              <SelectItem value="recusada">Recusada</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" onClick={() => { setStatus(proposal.id, "enviada"); toast.success("Marcada como enviada"); }}>
            <Send className="h-4 w-4" /> Enviar
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => { setStatus(proposal.id, "aprovada"); toast.success("Proposta aprovada!"); }}>
            <CheckCircle2 className="h-4 w-4" /> Aprovar
          </Button>
          <Button variant="outline" className="gap-2" onClick={() => { setStatus(proposal.id, "recusada"); }}>
            <XCircle className="h-4 w-4" /> Recusar
          </Button>
          <Button className="gap-2" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Imprimir / PDF
          </Button>
        </div>
      </div>

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
              <div className="flex justify-end gap-6 text-sm mt-3 pr-2">
                <span className="text-muted-foreground">Subtotal itens:</span>
                <span className="font-semibold">{formatBRL(totals.subtotal)}</span>
              </div>
            )}

            <div className="flex flex-wrap items-end gap-2 mt-4 border-t pt-4">
              <div className="flex-1 min-w-[240px]">
                <Label>Buscar produto (SKU ou nome)</Label>
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={pickerOpen}
                      className="w-full justify-between font-normal"
                    >
                      {selectedProduct ? (
                        <span className="truncate">
                          <span className="font-mono text-xs mr-2">{selectedProduct.sku}</span>
                          {selectedProduct.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground flex items-center gap-2">
                          <Search className="h-3.5 w-3.5" /> Digite SKU ou nome do produto...
                        </span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[420px] p-0" align="start">
                    <Command
                      filter={(value, search) => {
                        const p = products.find((x) => x.id === value);
                        if (!p) return 0;
                        const hay = `${p.sku} ${p.name} ${p.ncm}`.toLowerCase();
                        return hay.includes(search.toLowerCase()) ? 1 : 0;
                      }}
                    >
                      <CommandInput placeholder="Buscar por SKU, nome ou NCM..." />
                      <CommandList>
                        <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                        <CommandGroup heading="Catálogo">
                          {products.filter((p) => p.active).map((p) => (
                            <CommandItem
                              key={p.id}
                              value={p.id}
                              onSelect={() => {
                                setAddProduct(p.id);
                                setAddPrice(p.defaultPrice);
                                setPickerOpen(false);
                              }}
                            >
                              <Check className={cn("mr-2 h-4 w-4", addProduct === p.id ? "opacity-100" : "opacity-0")} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs text-muted-foreground">{p.sku}</span>
                                  <span className="font-medium truncate">{p.name}</span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {p.unit} · NCM {p.ncm} · {formatBRL(p.defaultPrice)}
                                </div>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="w-24">
                <Label>Qtd</Label>
                <Input
                  type="number"
                  min={1}
                  step="1"
                  value={addQty}
                  className={addError && (addQty === "" || Number(addQty) <= 0) ? "border-destructive" : ""}
                  onChange={(e) => setAddQty(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
              <div className="w-32">
                <Label>Preço un. (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={addPrice}
                  placeholder={selectedProduct ? String(selectedProduct.defaultPrice) : "0,00"}
                  onChange={(e) => setAddPrice(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
              <Button
                onClick={() => {
                  const qty = addQty === "" ? NaN : Number(addQty);
                  const price = addPrice === "" ? (selectedProduct?.defaultPrice ?? NaN) : Number(addPrice);
                  const parsed = addItemSchema.safeParse({ productId: addProduct, quantity: qty, unitPrice: price });
                  if (!parsed.success) {
                    const msg = parsed.error.issues[0]?.message ?? "Dados inválidos";
                    setAddError(msg);
                    toast.error(msg);
                    return;
                  }
                  setAddError(null);
                  addItem(proposal.id, parsed.data.productId, parsed.data.quantity);
                  if (selectedProduct && parsed.data.unitPrice !== selectedProduct.defaultPrice) {
                    const current = useCrm.getState().proposals.find((p) => p.id === proposal.id);
                    const last = current?.items[current.items.length - 1];
                    if (last) updateItem(proposal.id, last.id, { unitPrice: parsed.data.unitPrice });
                  }
                  setAddProduct("");
                  setAddQty(1);
                  setAddPrice("");
                  toast.success("Item adicionado");
                }}
                className="gap-2"
              >
                <Plus className="h-4 w-4" /> Adicionar

              </Button>
              <Link to="/produtos" className="text-xs text-primary hover:underline ml-2 self-center">
                Gerenciar catálogo →
              </Link>
            </div>
            {addError && (
              <p className="mt-2 text-xs text-destructive flex items-center gap-1.5">
                <AlertCircle className="h-3 w-3" /> {addError}
              </p>
            )}
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
                <div>
                  <Label>Frete por conta</Label>
                  <Select
                    value={proposal.transport.freightPayer}
                    onValueChange={(v) => updateProposal(proposal.id, { transport: { ...proposal.transport, freightPayer: v as "CIF" | "FOB" } })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CIF">CIF (emitente)</SelectItem>
                      <SelectItem value="FOB">FOB (cliente)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Valor frete (R$)</Label>
                  <Input
                    type="number" step="0.01"
                    value={proposal.transport.freightValue}
                    onChange={(e) => updateProposal(proposal.id, { transport: { ...proposal.transport, freightValue: Number(e.target.value) } })}
                  />
                </div>
                <div>
                  <Label>Peso bruto (kg)</Label>
                  <Input
                    type="number" step="0.01"
                    value={proposal.transport.grossWeightKg}
                    onChange={(e) => updateProposal(proposal.id, { transport: { ...proposal.transport, grossWeightKg: Number(e.target.value) } })}
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
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Condições comerciais</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {proposal.installments.map((inst) => (
                <div key={inst.id} className="grid grid-cols-6 gap-2 items-end">
                  <div>
                    <Label className="text-xs">Dias</Label>
                    <Input type="number" value={inst.days} onChange={(e) => updateProposal(proposal.id, {
                      installments: proposal.installments.map((i) => i.id === inst.id ? { ...i, days: Number(e.target.value) } : i),
                    })} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Valor (R$)</Label>
                    <Input type="number" step="0.01" value={inst.amount} onChange={(e) => updateProposal(proposal.id, {
                      installments: proposal.installments.map((i) => i.id === inst.id ? { ...i, amount: Number(e.target.value) } : i),
                    })} />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Obs.</Label>
                    <Input value={inst.notes} onChange={(e) => updateProposal(proposal.id, {
                      installments: proposal.installments.map((i) => i.id === inst.id ? { ...i, notes: e.target.value } : i),
                    })} />
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => updateProposal(proposal.id, {
                    installments: proposal.installments.filter((i) => i.id !== inst.id),
                  })}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline" size="sm" className="gap-2"
                onClick={() => updateProposal(proposal.id, {
                  installments: [...proposal.installments, { id: Math.random().toString(36).slice(2, 10), days: 30, amount: 0, notes: "" }],
                })}
              >
                <Plus className="h-3 w-3" /> Nova parcela
              </Button>
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
            <div className="text-xl font-display font-bold text-primary">PALLET DE PLÁSTICO</div>
            <div className="text-[11px] text-muted-foreground">Indústria e comércio de produtos plásticos</div>
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
              <th className="border p-1.5">Frete</th>
              <th className="border p-1.5">Total da proposta</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="border p-1.5 text-center">{totals?.count}</td>
              <td className="border p-1.5 text-center">{totals?.qty.toLocaleString("pt-BR")}</td>
              <td className="border p-1.5 text-right">{formatBRL(totals?.subtotal ?? 0)}</td>
              <td className="border p-1.5 text-right">{formatBRL(proposal.transport.freightValue)}</td>
              <td className="border p-1.5 text-right font-bold text-primary">{formatBRL(totals?.total ?? 0)}</td>
            </tr>
          </tbody>
        </table>

        <div className="grid grid-cols-2 gap-6 mb-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Condições comerciais</div>
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="bg-muted/60">
                  <th className="border p-1.5 text-left">Dias</th>
                  <th className="border p-1.5 text-right">Valor</th>
                  <th className="border p-1.5 text-left">Obs.</th>
                </tr>
              </thead>
              <tbody>
                {proposal.installments.map((i) => (
                  <tr key={i.id}>
                    <td className="border p-1.5">{i.days}</td>
                    <td className="border p-1.5 text-right">{formatBRL(i.amount)}</td>
                    <td className="border p-1.5">{i.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Transportador</div>
            <table className="w-full text-[11px] border-collapse">
              <tbody>
                <tr><td className="border p-1.5 bg-muted/40 font-medium w-32">Nome</td><td className="border p-1.5">{proposal.transport.carrier}</td></tr>
                <tr><td className="border p-1.5 bg-muted/40 font-medium">Frete por conta</td><td className="border p-1.5">{proposal.transport.freightPayer}</td></tr>
                <tr><td className="border p-1.5 bg-muted/40 font-medium">Peso Bruto (kg)</td><td className="border p-1.5">{proposal.transport.grossWeightKg}</td></tr>
                <tr><td className="border p-1.5 bg-muted/40 font-medium">Qtd Volumes</td><td className="border p-1.5">{proposal.transport.volumes}</td></tr>
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
