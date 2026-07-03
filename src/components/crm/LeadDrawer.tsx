import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Mail,
  Phone,
  Building2,
  Package,
  Calendar,
  MessageSquare,
  StickyNote,
  Users2,
  Trash2,
  Plus,
  Sparkles,
  Bot,
  CalendarCheck,
  Zap,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useCrm,
  STAGES,
  PRODUCTS,
  formatBRL,
  type Lead,
  type Interaction,
} from "@/lib/crm-store";
import { toast } from "sonner";

const TYPE_META: Record<Interaction["type"], { label: string; icon: typeof Mail }> = {
  email: { label: "E-mail", icon: Mail },
  call: { label: "Ligação", icon: Phone },
  meeting: { label: "Reunião", icon: Users2 },
  note: { label: "Anotação", icon: StickyNote },
  whatsapp: { label: "WhatsApp", icon: MessageSquare },
};

export function LeadDrawer({
  leadId,
  open,
  onOpenChange,
}: {
  leadId: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const lead = useCrm((s) => s.leads.find((l) => l.id === leadId));
  const updateLead = useCrm((s) => s.updateLead);
  const removeLead = useCrm((s) => s.removeLead);
  const addInteraction = useCrm((s) => s.addInteraction);
  const addTask = useCrm((s) => s.addTask);
  const runFollowUp = useCrm((s) => s.runAiFollowUp);
  const bookSlot = useCrm((s) => s.bookSlotWithAi);
  const calendar = useCrm((s) => s.calendar);

  const [newInt, setNewInt] = useState<{ type: Interaction["type"]; content: string }>({
    type: "call",
    content: "",
  });
  const [newTask, setNewTask] = useState({ title: "", dueDate: "" });

  if (!lead) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto p-0 gap-0">
        <SheetHeader className="border-b bg-muted/40 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <SheetTitle className="flex items-center gap-2 text-xl">
                <Building2 className="h-5 w-5 text-primary" />
                <span className="truncate">{lead.company}</span>
              </SheetTitle>
              <SheetDescription className="mt-1">
                {lead.contactName} · Lead desde {format(new Date(lead.createdAt), "dd MMM yyyy", { locale: ptBR })}
              </SheetDescription>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {lead.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-xs">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs text-muted-foreground">Valor estimado</div>
              <div className="font-display text-2xl font-semibold text-primary">
                {formatBRL(lead.estimatedValue)}
              </div>
            </div>
          </div>
        </SheetHeader>

        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoRow icon={Mail} label="E-mail" value={lead.email} />
            <InfoRow icon={Phone} label="Telefone" value={lead.phone} />
            <InfoRow icon={Package} label="Produto" value={lead.product} />
            <InfoRow icon={Calendar} label="Último contato" value={format(new Date(lead.lastContact), "dd/MM/yyyy")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Etapa</Label>
              <Select
                value={lead.stage}
                onValueChange={(v) => {
                  updateLead(lead.id, { stage: v as Lead["stage"] });
                  toast.success("Etapa atualizada");
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Valor estimado (R$)</Label>
              <Input
                type="number"
                className="mt-1"
                defaultValue={lead.estimatedValue}
                onBlur={(e) =>
                  updateLead(lead.id, { estimatedValue: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>

          <Separator />

          <Tabs defaultValue="hist">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="hist">Histórico</TabsTrigger>
              <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
              <TabsTrigger value="notas">Notas</TabsTrigger>
            </TabsList>

            <TabsContent value="hist" className="mt-4 space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex gap-2">
                  <Select
                    value={newInt.type}
                    onValueChange={(v) => setNewInt({ ...newInt, type: v as Interaction["type"] })}
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_META).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Registrar interação..."
                    value={newInt.content}
                    onChange={(e) => setNewInt({ ...newInt, content: e.target.value })}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!newInt.content.trim()) return;
                      addInteraction(lead.id, {
                        type: newInt.type,
                        content: newInt.content,
                        date: new Date().toISOString(),
                      });
                      setNewInt({ type: "call", content: "" });
                      toast.success("Interação registrada");
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <ol className="relative ml-3 space-y-4 border-l pl-5">
                {lead.interactions.map((i) => {
                  const M = TYPE_META[i.type];
                  const Icon = M.icon;
                  return (
                    <li key={i.id} className="relative">
                      <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Icon className="h-3 w-3" />
                      </span>
                      <div className="text-xs text-muted-foreground">
                        {M.label} · {format(new Date(i.date), "dd MMM yyyy 'às' HH:mm", { locale: ptBR })}
                      </div>
                      <div className="text-sm">{i.content}</div>
                    </li>
                  );
                })}
              </ol>
            </TabsContent>

            <TabsContent value="tarefas" className="mt-4 space-y-3">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <Input
                  placeholder="Nova tarefa (ex: Ligar para João na terça)"
                  value={newTask.title}
                  onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                />
                <div className="flex gap-2">
                  <Input
                    type="date"
                    value={newTask.dueDate}
                    onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                  />
                  <Button
                    onClick={() => {
                      if (!newTask.title || !newTask.dueDate) return;
                      addTask({
                        leadId: lead.id,
                        title: newTask.title,
                        dueDate: new Date(newTask.dueDate).toISOString(),
                      });
                      setNewTask({ title: "", dueDate: "" });
                      toast.success("Tarefa agendada");
                    }}
                  >
                    Agendar
                  </Button>
                </div>
              </div>
              <LeadTasks leadId={lead.id} />
            </TabsContent>

            <TabsContent value="notas" className="mt-4">
              <Textarea
                rows={8}
                defaultValue={lead.notes}
                onBlur={(e) => updateLead(lead.id, { notes: e.target.value })}
                placeholder="Anotações internas sobre o lead..."
              />
            </TabsContent>
          </Tabs>

          <Separator />

          <div className="flex justify-between">
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                removeLead(lead.id);
                onOpenChange(false);
                toast.success("Lead removido");
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" /> Excluir lead
            </Button>
            <div className="text-xs text-muted-foreground self-center">
              Atualizado {formatDistanceToNow(new Date(lead.lastContact), { locale: ptBR, addSuffix: true })}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="truncate">{value}</div>
      </div>
    </div>
  );
}

function LeadTasks({ leadId }: { leadId: string }) {
  const tasks = useCrm((s) => s.tasks.filter((t) => t.leadId === leadId));
  const toggle = useCrm((s) => s.toggleTask);
  const remove = useCrm((s) => s.removeTask);
  if (tasks.length === 0)
    return <div className="text-sm text-muted-foreground italic">Nenhuma tarefa agendada.</div>;
  return (
    <ul className="space-y-2">
      {tasks.map((t) => (
        <li
          key={t.id}
          className="flex items-center gap-3 rounded-md border bg-card p-3"
        >
          <input
            type="checkbox"
            checked={t.done}
            onChange={() => toggle(t.id)}
            className="h-4 w-4"
          />
          <div className="flex-1 min-w-0">
            <div className={t.done ? "line-through text-muted-foreground text-sm" : "text-sm"}>{t.title}</div>
            <div className="text-xs text-muted-foreground">
              {format(new Date(t.dueDate), "dd MMM yyyy", { locale: ptBR })}
            </div>
          </div>
          <button
            onClick={() => remove(t.id)}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}

// ------------- New Lead Dialog trigger + form --------
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";

export function NewLeadDialog({ trigger }: { trigger: React.ReactNode }) {
  const addLead = useCrm((s) => s.addLead);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    company: "",
    contactName: "",
    email: "",
    phone: "",
    product: PRODUCTS[0],
    quantity: 100,
    estimatedValue: 20000,
    stage: "novo" as Lead["stage"],
    tags: "",
    notes: "",
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo lead</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Empresa</Label>
            <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
          <div>
            <Label>Contato</Label>
            <Input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>E-mail</Label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Produto</Label>
            <Select value={form.product} onValueChange={(v) => setForm({ ...form, product: v as Lead["product"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRODUCTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quantidade</Label>
            <Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Valor estimado (R$)</Label>
            <Input type="number" value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Etapa</Label>
            <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v as Lead["stage"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Tags (separadas por vírgula)</Label>
            <Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button
            onClick={() => {
              if (!form.company) { toast.error("Informe a empresa"); return; }
              addLead({
                company: form.company,
                contactName: form.contactName,
                email: form.email,
                phone: form.phone,
                product: form.product,
                quantity: form.quantity,
                estimatedValue: form.estimatedValue,
                stage: form.stage,
                tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
                source: "Manual",
                notes: form.notes,
              });
              toast.success("Lead criado");
              setOpen(false);
              setForm({ ...form, company: "", contactName: "", email: "", phone: "", tags: "", notes: "" });
            }}
          >
            Criar lead
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
