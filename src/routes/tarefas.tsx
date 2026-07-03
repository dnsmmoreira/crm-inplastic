import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, CheckCircle2, Circle, Trash2, CircleAlert } from "lucide-react";
import { format, isToday, isTomorrow, isThisWeek, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCrm } from "@/lib/crm-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LeadDrawer } from "@/components/crm/LeadDrawer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/tarefas")({
  component: TasksPage,
  head: () => ({
    meta: [{ title: "Tarefas — CRM Pallet de Plástico" }],
  }),
});

function TasksPage() {
  const tasks = useVisibleTasks();
  const leads = useVisibleLeads();
  const addTask = useCrm((s) => s.addTask);
  const toggleTask = useCrm((s) => s.toggleTask);
  const removeTask = useCrm((s) => s.removeTask);

  const [openLead, setOpenLead] = useState<string | null>(null);
  const [form, setForm] = useState({ leadId: "", title: "", dueDate: "" });

  const groups = useMemo(() => {
    const overdue: typeof tasks = [];
    const today: typeof tasks = [];
    const upcoming: typeof tasks = [];
    const done: typeof tasks = [];
    const sorted = [...tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    sorted.forEach((t) => {
      if (t.done) return done.push(t);
      const d = new Date(t.dueDate);
      if (isToday(d)) today.push(t);
      else if (isBefore(d, new Date())) overdue.push(t);
      else upcoming.push(t);
    });
    return { overdue, today, upcoming, done };
  }, [tasks]);

  const submit = () => {
    if (!form.leadId || !form.title || !form.dueDate) {
      toast.error("Preencha todos os campos");
      return;
    }
    addTask({
      leadId: form.leadId,
      title: form.title,
      dueDate: new Date(form.dueDate).toISOString(),
    });
    setForm({ leadId: "", title: "", dueDate: "" });
    toast.success("Tarefa criada");
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold">Tarefas & Lembretes</h1>
        <p className="text-sm text-muted-foreground">
          Automatize follow-ups em processos consultivos de longa duração
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nova tarefa</CardTitle>
          <CardDescription>Agende um retorno vinculado a um cliente</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-[1.2fr_2fr_140px_auto]">
            <Select value={form.leadId} onValueChange={(v) => setForm({ ...form, leadId: v })}>
              <SelectTrigger><SelectValue placeholder="Cliente..." /></SelectTrigger>
              <SelectContent>
                {leads.map((l) => (
                  <SelectItem key={l.id} value={l.id}>{l.company}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Ex: Ligar para João na próxima terça"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            />
            <Button onClick={submit} className="gap-2"><Plus className="h-4 w-4" />Agendar</Button>
          </div>
        </CardContent>
      </Card>

      <TaskGroup
        title="Atrasadas"
        description="Precisam de atenção imediata"
        tone="destructive"
        tasks={groups.overdue}
        leads={leads}
        onToggle={toggleTask}
        onRemove={removeTask}
        onOpen={setOpenLead}
      />
      <TaskGroup
        title="Hoje"
        description={format(new Date(), "EEEE, dd MMM", { locale: ptBR })}
        tone="primary"
        tasks={groups.today}
        leads={leads}
        onToggle={toggleTask}
        onRemove={removeTask}
        onOpen={setOpenLead}
      />
      <TaskGroup
        title="Próximas"
        description="Agendadas para os próximos dias"
        tone="default"
        tasks={groups.upcoming}
        leads={leads}
        onToggle={toggleTask}
        onRemove={removeTask}
        onOpen={setOpenLead}
      />
      {groups.done.length > 0 && (
        <TaskGroup
          title="Concluídas"
          description={`${groups.done.length} tarefa(s) finalizada(s)`}
          tone="success"
          tasks={groups.done}
          leads={leads}
          onToggle={toggleTask}
          onRemove={removeTask}
          onOpen={setOpenLead}
        />
      )}

      <LeadDrawer leadId={openLead} open={!!openLead} onOpenChange={(o) => !o && setOpenLead(null)} />
    </div>
  );
}

function TaskGroup({
  title, description, tone, tasks, leads, onToggle, onRemove, onOpen,
}: {
  title: string;
  description: string;
  tone: "default" | "primary" | "destructive" | "success";
  tasks: ReturnType<typeof useCrm.getState>["tasks"];
  leads: ReturnType<typeof useCrm.getState>["leads"];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  if (tasks.length === 0) return null;
  const toneMap = {
    default: "text-muted-foreground",
    primary: "text-primary",
    destructive: "text-destructive",
    success: "text-[color:var(--success)]",
  };
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className={cn("flex items-center gap-2 text-base", toneMap[tone])}>
          {tone === "destructive" && <CircleAlert className="h-4 w-4" />}
          {title} <Badge variant="secondary">{tasks.length}</Badge>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {tasks.map((t) => {
          const lead = leads.find((l) => l.id === t.leadId);
          const d = new Date(t.dueDate);
          const dueLabel = isToday(d)
            ? "Hoje"
            : isTomorrow(d)
              ? "Amanhã"
              : isThisWeek(d)
                ? format(d, "EEEE", { locale: ptBR })
                : format(d, "dd MMM yyyy", { locale: ptBR });
          return (
            <div key={t.id} className="flex items-center gap-3 rounded-md border p-3 hover:bg-accent/30 transition-colors">
              <button onClick={() => onToggle(t.id)} className="shrink-0">
                {t.done ? (
                  <CheckCircle2 className="h-5 w-5 text-[color:var(--success)]" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
              </button>
              <button onClick={() => lead && onOpen(lead.id)} className="flex-1 min-w-0 text-left">
                <div className={cn("text-sm font-medium truncate", t.done && "line-through text-muted-foreground")}>
                  {t.title}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {lead?.company || "—"}
                </div>
              </button>
              <Badge variant={tone === "destructive" ? "destructive" : "outline"}>{dueLabel}</Badge>
              <button onClick={() => onRemove(t.id)} className="text-muted-foreground hover:text-destructive shrink-0">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
