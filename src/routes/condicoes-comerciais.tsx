import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Trash2, RotateCcw, ShieldAlert, CheckCircle2, XCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import {
  useCrm,
  useIsAdmin,
  type PaymentTerm,
  type PaymentMethod,
} from "@/lib/crm-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/condicoes-comerciais")({
  head: () => ({
    meta: [
      { title: "Condições Comerciais — CRM" },
      { name: "description", content: "Gestão do catálogo de condições de pagamento disponíveis para os vendedores." },
    ],
  }),
  component: CondicoesComerciais,
});

const METHODS: PaymentMethod[] = ["Boleto", "PIX", "Depósito em Conta", "Cartão", "Dinheiro"];

const formSchema = z.object({
  label: z.string().trim().min(3, "Nome muito curto").max(80, "Nome muito longo"),
  method: z.enum(["Boleto", "PIX", "Depósito em Conta", "Cartão", "Dinheiro"]),
  splitsRaw: z
    .string()
    .trim()
    .min(1, "Informe ao menos uma parcela (ex: 0 para à vista)")
    .regex(/^\s*\d+(\s*[,/]\s*\d+)*\s*$/, "Use números separados por vírgula ou barra (ex: 30, 60, 90)"),
  notes: z.string().max(200, "Máx. 200 caracteres").optional().or(z.literal("")),
  active: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

const emptyForm: FormValues = { label: "", method: "Boleto", splitsRaw: "", notes: "", active: true };

function parseSplits(raw: string): number[] {
  return raw
    .split(/[,/]/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
}

function CondicoesComerciais() {
  const isAdmin = useIsAdmin();
  const terms = useCrm((s) => s.paymentTerms);
  const addTerm = useCrm((s) => s.addPaymentTerm);
  const updateTerm = useCrm((s) => s.updatePaymentTerm);
  const removeTerm = useCrm((s) => s.removePaymentTerm);
  const toggleActive = useCrm((s) => s.togglePaymentTermActive);
  const resetTerms = useCrm((s) => s.resetPaymentTerms);
  const maxDiscount = useCrm((s) => s.maxDiscountPercentVendedor);
  const setMaxDiscount = useCrm((s) => s.setMaxDiscountPercentVendedor);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PaymentTerm | null>(null);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});

  const activeCount = useMemo(() => terms.filter((t) => t.active).length, [terms]);

  if (!isAdmin) {
    return (
      <div className="p-4 md:p-8">
        <Card className="max-w-lg mx-auto">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-base">Acesso restrito</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Apenas administradores podem cadastrar e ativar condições comerciais.
              Fale com o administrador se precisar de uma nova condição de pagamento.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/propostas">Voltar para Propostas</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setErrors({});
    setDialogOpen(true);
  };

  const openEdit = (t: PaymentTerm) => {
    setEditing(t);
    setForm({
      label: t.label,
      method: t.method,
      splitsRaw: t.splits.join(", "),
      notes: t.notes ?? "",
      active: t.active,
    });
    setErrors({});
    setDialogOpen(true);
  };

  const submit = () => {
    const parsed = formSchema.safeParse(form);
    if (!parsed.success) {
      const map: Partial<Record<keyof FormValues, string>> = {};
      parsed.error.issues.forEach((i) => {
        map[i.path[0] as keyof FormValues] = i.message;
      });
      setErrors(map);
      return;
    }
    const splits = parseSplits(parsed.data.splitsRaw);
    if (splits.length === 0) {
      setErrors({ splitsRaw: "Informe ao menos uma parcela válida" });
      return;
    }
    const payload = {
      label: parsed.data.label,
      method: parsed.data.method,
      splits,
      notes: parsed.data.notes?.trim() || undefined,
      active: parsed.data.active,
    };
    if (editing) {
      updateTerm(editing.id, payload);
      toast.success("Condição atualizada");
    } else {
      addTerm(payload);
      toast.success("Condição cadastrada");
    }
    setDialogOpen(false);
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold">Condições Comerciais</h1>
          <p className="text-sm text-muted-foreground">
            Catálogo de condições de pagamento disponíveis para os vendedores nas propostas.
            {" "}
            <span className="font-medium text-foreground">{activeCount}</span> de {terms.length} ativas.
          </p>
        </div>
        <div className="flex gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <RotateCcw className="h-4 w-4 mr-2" />
                Restaurar padrão
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Restaurar as 20 condições padrão?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação substitui o catálogo atual pelas 20 condições originais.
                  Condições personalizadas serão removidas. Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    resetTerms();
                    toast.success("Catálogo restaurado ao padrão");
                  }}
                >
                  Restaurar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button size="sm" onClick={openNew}>
            <Plus className="h-4 w-4 mr-2" />
            Nova condição
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Limite de desconto do vendedor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <Label>Desconto máximo (%)</Label>
              <Input
                type="number"
                step="0.1"
                min={0}
                max={100}
                value={maxDiscount}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  if (!Number.isFinite(raw) || raw < 0) return setMaxDiscount(0);
                  if (raw > 100) return setMaxDiscount(100);
                  setMaxDiscount(raw);
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground max-w-md">
              Percentual máximo que um vendedor pode aplicar como desconto em uma proposta comercial.
              Administradores não têm limite. Alteração vale para propostas criadas a partir de agora.
            </p>
          </div>
        </CardContent>
      </Card>

      <FrotaCard />


      <CatalogueEditor kind="tags" />
      <CatalogueEditor kind="segments" />
      <FreightConfigEditor />


      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catálogo</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Meio</TableHead>
                <TableHead>Parcelas</TableHead>
                <TableHead>Observações</TableHead>
                <TableHead className="text-center">Ativa</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {terms.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                    Nenhuma condição cadastrada.
                  </TableCell>
                </TableRow>
              )}
              {terms.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.label}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{t.method}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {t.splits.length}x —{" "}
                    <span className="text-muted-foreground">
                      {t.splits.map((d) => (d === 0 ? "à vista" : `${d}d`)).join(" / ")}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                    {t.notes ?? "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="inline-flex items-center gap-2">
                      <Switch
                        checked={t.active}
                        onCheckedChange={() => toggleActive(t.id)}
                        aria-label={t.active ? "Desativar" : "Ativar"}
                      />
                      {t.active ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="inline-flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(t)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" aria-label="Remover">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover condição?</AlertDialogTitle>
                            <AlertDialogDescription>
                              A condição <span className="font-medium">{t.label}</span> será removida do catálogo.
                              Propostas que já a utilizam manterão o registro histórico, mas ela deixará de aparecer no dropdown.
                              Esta ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => {
                                removeTerm(t.id);
                                toast.success("Condição removida");
                              }}
                            >
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar condição" : "Nova condição comercial"}</DialogTitle>
            <DialogDescription>
              Defina o meio de pagamento, as parcelas (em dias) e se ela ficará disponível no dropdown do vendedor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Ex: Boleto 45 dias"
              />
              {errors.label && <p className="text-xs text-destructive mt-1">{errors.label}</p>}
            </div>
            <div>
              <Label>Meio de pagamento</Label>
              <Select
                value={form.method}
                onValueChange={(v) => setForm((f) => ({ ...f, method: v as PaymentMethod }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Parcelas (dias de vencimento)</Label>
              <Input
                value={form.splitsRaw}
                onChange={(e) => setForm((f) => ({ ...f, splitsRaw: e.target.value }))}
                placeholder="Ex: 30, 60, 90  ·  use 0 para à vista"
              />
              {errors.splitsRaw && <p className="text-xs text-destructive mt-1">{errors.splitsRaw}</p>}
              <p className="text-[11px] text-muted-foreground mt-1">
                Separe os dias com vírgula ou barra. O total da proposta será dividido igualmente entre as parcelas.
              </p>
            </div>
            <div>
              <Label>Observações (opcional)</Label>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Ex: Com 3% de desconto"
              />
              {errors.notes && <p className="text-xs text-destructive mt-1">{errors.notes}</p>}
            </div>
            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <div className="text-sm font-medium">Disponível para vendedores</div>
                <div className="text-xs text-muted-foreground">
                  Se desativada, não aparece no dropdown de novas propostas.
                </div>
              </div>
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={submit}>{editing ? "Salvar" : "Cadastrar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CatalogueEditor({ kind }: { kind: "tags" | "segments" }) {
  const items = useCrm((s) => (kind === "tags" ? s.leadTags : s.leadSegments));
  const add = useCrm((s) => (kind === "tags" ? s.addLeadTag : s.addLeadSegment));
  const remove = useCrm((s) => (kind === "tags" ? s.removeLeadTag : s.removeLeadSegment));
  const [value, setValue] = useState("");

  const title = kind === "tags" ? "Tags de Leads" : "Segmentos de mercado";
  const description =
    kind === "tags"
      ? "Etiquetas selecionáveis pelo vendedor no cadastro de um novo lead."
      : "Segmentos disponíveis no cadastro de leads.";
  const placeholder = kind === "tags" ? "Ex: VIP" : "Ex: Varejo";

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    if (items.some((x) => x.toLowerCase() === v.toLowerCase())) {
      toast.error("Já existe");
      return;
    }
    add(v);
    setValue("");
    toast.success("Adicionado");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
            placeholder={placeholder}
          />
          <Button onClick={submit} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {items.length === 0 && (
            <span className="text-xs text-muted-foreground italic">Nenhum item cadastrado.</span>
          )}
          {items.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/40 pl-2.5 pr-1 py-0.5 text-xs"
            >
              {item}
              <button
                type="button"
                onClick={() => remove(item)}
                className="rounded-full hover:bg-destructive/10 p-0.5 text-muted-foreground hover:text-destructive"
                aria-label={`Remover ${item}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function FreightConfigEditor() {
  const cfg = useCrm((s) => s.freightConfig);
  const setCfg = useCrm((s) => s.setFreightConfig);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Cálculo de frete (rodoviário)</CardTitle>
        <p className="text-xs text-muted-foreground">
          Origem, tarifa e fator de cubagem usados para estimar o frete de propostas com CEP de entrega.
          Fórmula: <strong>maior(peso real, cubagem × fator)</strong> × distância (km) × tarifa (R$/kg/km).
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>CEP de origem</Label>
          <Input
            value={cfg.originCep}
            onChange={(e) => setCfg({ originCep: e.target.value })}
            placeholder="00000-000"
          />
        </div>
        <div>
          <Label>Endereço de origem (referência)</Label>
          <Input
            value={cfg.originAddress}
            onChange={(e) => setCfg({ originAddress: e.target.value })}
            placeholder="Rua, cidade / UF"
          />
        </div>
        <div>
          <Label>Tarifa (R$ por kg × km)</Label>
          <Input
            type="number" step="0.0001" min={0}
            value={cfg.rateBRLPerKgKm}
            onChange={(e) => setCfg({ rateBRLPerKgKm: Math.max(0, Number(e.target.value) || 0) })}
          />
          <p className="text-[11px] text-muted-foreground mt-1">Referência de mercado: R$ 0,0008 a R$ 0,0015.</p>
        </div>
        <div>
          <Label>Fator de cubagem (kg por m³)</Label>
          <Input
            type="number" step="1" min={0}
            value={cfg.cubageFactorKgPerM3}
            onChange={(e) => setCfg({ cubageFactorKgPerM3: Math.max(0, Number(e.target.value) || 0) })}
          />
          <p className="text-[11px] text-muted-foreground mt-1">Padrão ANTT rodoviário: 300 kg/m³.</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ============ Frota (calculadora de logística) ============

import { Truck, Plus as PlusIcon } from "lucide-react";
import type { FleetVehicle, FleetVehicleType } from "@/lib/logistica";

const VEHICLE_TYPES: { value: FleetVehicleType; label: string }[] = [
  { value: "vuc", label: "VUC" },
  { value: "3_4", label: "3/4" },
  { value: "toco", label: "Toco" },
  { value: "truck", label: "Truck" },
  { value: "carreta", label: "Carreta" },
  { value: "container_20", label: "Container 20'" },
  { value: "container_40", label: "Container 40'" },
  { value: "bitrem", label: "Bitrem" },
  { value: "rodotrem", label: "Rodotrem" },
];

function FrotaCard() {
  const fleet = useCrm((s) => s.fleet);
  const upsert = useCrm((s) => s.upsertFleetVehicle);
  const remove = useCrm((s) => s.removeFleetVehicle);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FleetVehicle | null>(null);

  const empty: FleetVehicle = {
    id: "",
    nome: "",
    tipo: "truck",
    comprimentoUtilM: 0,
    larguraUtilM: 0,
    alturaUtilM: 0,
    capacidadeKg: 0,
    rsPorKm: 0,
    ativo: true,
  };
  const [form, setForm] = useState<FleetVehicle>(empty);

  const openNew = () => {
    setEditing(null);
    setForm({ ...empty, id: `v-${Math.random().toString(36).slice(2, 8)}` });
    setOpen(true);
  };
  const openEdit = (v: FleetVehicle) => {
    setEditing(v);
    setForm(v);
    setOpen(true);
  };
  const save = () => {
    if (!form.nome.trim()) {
      toast.error("Nome obrigatório");
      return;
    }
    upsert(form);
    toast.success(editing ? "Veículo atualizado" : "Veículo cadastrado");
    setOpen(false);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" />
            Frota — calculadora de logística
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Dimensões úteis e R$/km alimentam o cálculo de peso, cubagem e frete por veículo nas propostas.
          </p>
        </div>
        <Button size="sm" onClick={openNew}>
          <PlusIcon className="h-4 w-4 mr-1" /> Veículo
        </Button>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">C×L×A útil (m)</TableHead>
              <TableHead className="text-right">Capac. (kg)</TableHead>
              <TableHead className="text-right">R$/km</TableHead>
              <TableHead>Ativo</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {fleet.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium">{v.nome}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {VEHICLE_TYPES.find((t) => t.value === v.tipo)?.label ?? v.tipo}
                </TableCell>
                <TableCell className="text-right text-xs font-mono">
                  {v.comprimentoUtilM.toFixed(2)}×{v.larguraUtilM.toFixed(2)}×{v.alturaUtilM.toFixed(2)}
                </TableCell>
                <TableCell className="text-right">{v.capacidadeKg.toLocaleString("pt-BR")}</TableCell>
                <TableCell className="text-right">R$ {v.rsPorKm.toFixed(2)}</TableCell>
                <TableCell>
                  {v.ativo ? <Badge variant="secondary">Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(v)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Remover ${v.nome}?`)) {
                        remove(v.id);
                        toast.success("Veículo removido");
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {fleet.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                  Nenhum veículo cadastrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar veículo" : "Novo veículo"}</DialogTitle>
            <DialogDescription>
              Dimensões úteis = espaço realmente utilizável para carga (menor que as externas).
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as FleetVehicleType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VEHICLE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Comprimento útil (m)</Label>
              <Input type="number" step="0.01" value={form.comprimentoUtilM} onChange={(e) => setForm({ ...form, comprimentoUtilM: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Largura útil (m)</Label>
              <Input type="number" step="0.01" value={form.larguraUtilM} onChange={(e) => setForm({ ...form, larguraUtilM: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Altura útil (m)</Label>
              <Input type="number" step="0.01" value={form.alturaUtilM} onChange={(e) => setForm({ ...form, alturaUtilM: Number(e.target.value) })} />
            </div>
            <div>
              <Label>Capacidade (kg)</Label>
              <Input type="number" step="1" value={form.capacidadeKg} onChange={(e) => setForm({ ...form, capacidadeKg: Number(e.target.value) })} />
            </div>
            <div>
              <Label>R$ por km</Label>
              <Input type="number" step="0.01" value={form.rsPorKm} onChange={(e) => setForm({ ...form, rsPorKm: Number(e.target.value) })} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              <Label>Ativo (entra nas cotações)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}



