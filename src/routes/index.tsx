import { createFileRoute } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  Legend,
} from "recharts";
import {
  TrendingUp,
  Users,
  Target,
  Clock,
  Plus,
  ArrowUpRight,
  CheckCircle2,
  CircleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import { format, isToday, isBefore, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCrm, STAGES, formatBRL, useVisibleLeads, useVisibleTasks, useCurrentUser, followupTemperature, useLeadValueMap, useProposalAggregates } from "@/lib/crm-store";
import { PlacarWidget } from "@/components/placar/PlacarWidget";
import { NewLeadDialog, LeadDrawer } from "@/components/crm/LeadDrawer";
import { ResumoDoDia } from "@/components/dashboard/ResumoDoDia";
import { Link } from "@tanstack/react-router";


export const Route = createFileRoute("/")({
  component: DashboardPage,
});

function DashboardPage() {
  const leads = useVisibleLeads();
  const tasks = useVisibleTasks();
  const user = useCurrentUser();
  const isAdmin = user.role === "admin";
  const [openLead, setOpenLead] = useState<string | null>(null);

  const leadValueMap = useLeadValueMap();
  const proposalAgg = useProposalAggregates(isAdmin ? undefined : user.id);
  const leadValue = (id: string, fallback = 0) => leadValueMap.get(id) ?? fallback;

  const kpis = useMemo(() => {
    const active = leads.filter((l) => l.stage !== "perdido" && l.stage !== "ganho");
    // Pipeline ativo: valor total das propostas em aberto + leads ativos sem proposta (fallback estimatedValue)
    const pipelineFromLeads = active.reduce((sum, l) => sum + leadValue(l.id, l.estimatedValue), 0);
    // Receita fechada: propostas com status "pedido"
    const wonValue = proposalAgg.wonValue;
    const won = leads.filter((l) => l.stage === "ganho");
    const conv = leads.length ? (won.length / leads.length) * 100 : 0;
    const monthStart = startOfMonth(new Date());
    const newThisMonth = leads.filter((l) => new Date(l.createdAt) >= monthStart).length;
    return { pipeline: pipelineFromLeads, wonValue, conv, newThisMonth, total: leads.length };
  }, [leads, leadValueMap, proposalAgg]);

  const stageData = useMemo(
    () =>
      STAGES.map((s) => {
        const stageLeads = leads.filter((l) => l.stage === s.id);
        return {
          name: s.label,
          leads: stageLeads.length,
          valor: stageLeads.reduce((sum, l) => sum + leadValue(l.id, l.estimatedValue), 0),
        };
      }),
    [leads, leadValueMap],
  );

  const trend = useMemo(() => {
    const months: { name: string; leads: number; ganho: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const label = format(d, "MMM", { locale: ptBR });
      const inMonth = leads.filter(
        (l) => format(new Date(l.createdAt), "yyyy-MM") === format(d, "yyyy-MM"),
      );
      months.push({
        name: label,
        leads: inMonth.length,
        ganho: inMonth.filter((l) => l.stage === "ganho").length,
      });
    }
    return months;
  }, [leads]);

  const productMix = useMemo(() => {
    const map = new Map<string, number>();
    leads.forEach((l) => map.set(l.product, (map.get(l.product) || 0) + leadValue(l.id, l.estimatedValue)));
    return Array.from(map, ([name, value]) => ({ name, value }));
  }, [leads, leadValueMap]);

  const PIE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

  const todayTasks = tasks
    .filter((t) => !t.done && isToday(new Date(t.dueDate)))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const overdueTasks = tasks.filter((t) => !t.done && isBefore(new Date(t.dueDate), new Date()) && !isToday(new Date(t.dueDate)));




  return (
    <div className="p-4 md:p-8 space-y-6">
      <ResumoDoDia />

      <div className="flex flex-wrap items-center justify-between gap-3">

        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">
            Olá, {user.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Visão de administrador — todos os leads e propostas"
              : "Seu painel — leads e propostas atribuídos a você"}
          </p>
        </div>
        <NewLeadDialog
          trigger={
            <Button size="lg" className="gap-2">
              <Plus className="h-4 w-4" /> Novo lead
            </Button>
          }
        />
      </div>

      <PlacarWidget />


      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          label="Pipeline ativo"
          value={formatBRL(kpis.pipeline)}
          hint={`${kpis.total} leads no total`}
          icon={TrendingUp}
          tone="brand"
        />
        <Kpi
          label="Receita fechada"
          value={formatBRL(kpis.wonValue)}
          hint="Negócios ganhos"
          icon={CheckCircle2}
          tone="success"
        />
        <Kpi
          label="Taxa de conversão"
          value={`${kpis.conv.toFixed(1)}%`}
          hint="Leads → ganhos"
          icon={Target}
          tone="default"
        />
        <Kpi
          label="Novos no mês"
          value={String(kpis.newThisMonth)}
          hint={format(new Date(), "MMMM yyyy", { locale: ptBR })}
          icon={Users}
          tone="default"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Valor por etapa do funil</CardTitle>
            <CardDescription>Receita estimada em cada estágio</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={stageData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(v: number) => formatBRL(v)}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }}
                />
                <Bar dataKey="valor" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mix de produtos</CardTitle>
            <CardDescription>Distribuição de valor</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={productMix} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                  {productMix.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatBRL(v)} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tendência de leads (últimos 6 meses)</CardTitle>
          <CardDescription>Volume recebido pelo site vs. negócios ganhos</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="leads" name="Leads recebidos" stroke="var(--chart-1)" strokeWidth={2.5} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="ganho" name="Ganhos" stroke="var(--chart-2)" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> Tarefas do dia
              </CardTitle>
              <CardDescription>
                {todayTasks.length} para hoje · {overdueTasks.length} atrasadas
              </CardDescription>
            </div>
            <Link to="/tarefas" className="text-xs text-primary hover:underline flex items-center gap-1">
              Ver todas <ArrowUpRight className="h-3 w-3" />
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {overdueTasks.length > 0 && (
              <div className="flex items-center gap-2 rounded-md bg-destructive/10 text-destructive px-3 py-2 text-sm">
                <CircleAlert className="h-4 w-4" />
                {overdueTasks.length} tarefa(s) atrasada(s)
              </div>
            )}
            {todayTasks.length === 0 && overdueTasks.length === 0 && (
              <p className="text-sm text-muted-foreground italic">Nenhuma tarefa para hoje. Aproveite!</p>
            )}
            {[...overdueTasks, ...todayTasks].slice(0, 6).map((t) => {
              const lead = leads.find((l) => l.id === t.leadId);
              return (
                <button
                  key={t.id}
                  onClick={() => lead && setOpenLead(lead.id)}
                  className="w-full text-left flex items-center justify-between rounded-md border p-3 hover:bg-accent/50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{t.title}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {lead?.company}
                    </div>
                  </div>
                  <Badge variant={isBefore(new Date(t.dueDate), new Date()) && !isToday(new Date(t.dueDate)) ? "destructive" : "secondary"}>
                    {format(new Date(t.dueDate), "dd/MM")}
                  </Badge>
                </button>
              );
            })}
          </CardContent>
        </Card>

        {(() => {
          const activeLeads = leads.filter((l) => l.stage !== "ganho" && l.stage !== "perdido");
          const rank = { urgent: 0, attention: 1, scheduled: 2, ok: 3 } as const;
          const withTemp = activeLeads
            .map((l) => ({ l, f: followupTemperature(l) }))
            .sort((a, b) => {
              const r = rank[a.f.level] - rank[b.f.level];
              if (r !== 0) return r;
              return (b.f.overdueDays ?? -Infinity) - (a.f.overdueDays ?? -Infinity);
            });
          const urgentCount = withTemp.filter((x) => x.f.level === "urgent").length;
          const attentionCount = withTemp.filter((x) => x.f.level === "attention").length;
          const items = withTemp.slice(0, 6);
          return (
            <Card>
              <CardHeader>
                <CardTitle>Agenda de retornos</CardTitle>
                <CardDescription>
                  {urgentCount} urgente(s) · {attentionCount} para hoje/atrasado(s)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {items.length === 0 && (
                  <p className="text-sm text-muted-foreground italic">Nenhum lead ativo.</p>
                )}
                {items.map(({ l, f }) => (
                  <button
                    key={l.id}
                    onClick={() => setOpenLead(l.id)}
                    className="w-full text-left flex items-center justify-between rounded-md border p-3 hover:bg-accent/50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{l.company}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {l.product} · {formatBRL(l.estimatedValue)}
                      </div>
                    </div>
                    <Badge variant="outline" className={`shrink-0 ${f.className}`} title={f.hint}>
                      <span className="mr-1">{f.emoji}</span>{f.label}
                    </Badge>
                  </button>
                ))}
              </CardContent>
            </Card>
          );
        })()}
      </div>

      <LeadDrawer leadId={openLead} open={!!openLead} onOpenChange={(o) => !o && setOpenLead(null)} />
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof TrendingUp;
  tone?: "default" | "brand" | "success";
}) {
  const toneClass =
    tone === "brand"
      ? "bg-primary/10 text-primary"
      : tone === "success"
        ? "bg-[color:var(--success)]/15 text-[color:var(--success)]"
        : "bg-muted text-muted-foreground";
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-1 font-display text-2xl font-semibold truncate">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass} shrink-0`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

