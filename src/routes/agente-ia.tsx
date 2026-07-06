import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bot,
  Sparkles,
  Zap,
  MessageCircle,
  Clock,
  ChevronRight,
  CalendarClock,
  AlertTriangle,
  Settings2,
  RefreshCw,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LeadDrawer } from "@/components/crm/LeadDrawer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { useServerFn } from "@tanstack/react-start";
import {
  getXerifeConfig,
  updateXerifeConfig,
  listAiActions,
  runXerifeNow,
} from "@/lib/xerife.functions";

export const Route = createFileRoute("/agente-ia")({
  component: AgenteIaPage,
  head: () => ({
    meta: [{ title: "Painel do Xerife — INPLASTIC - CRM" }],
  }),
});

type Action = {
  id: string;
  lead_id: string | null;
  owner_id: string | null;
  type: "followup" | "schedule" | "qualify" | "reply" | "alerta" | "resumo";
  content: string;
  metadata: unknown;
  occurred_at: string;
  lead_company: string | null;
};

function AgenteIaPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const listFn = useServerFn(listAiActions);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    try {
      const r = await listFn({
        data: typeFilter === "all" ? {} : { type: typeFilter as Action["type"] },
      });
      setActions(r as Action[]);
    } catch (e) {
      toast.error("Falha ao carregar log", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter]);

  const counts = actions.reduce(
    (acc, a) => {
      acc[a.type] = (acc[a.type] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold flex items-center gap-2">
            <Bot className="h-7 w-7 text-primary" /> Painel do Xerife
          </h1>
          <p className="text-sm text-muted-foreground">
            Motor determinístico que varre leads, tarefas e propostas em horário comercial e
            registra ações no diário da IA.
          </p>
        </div>
        <Badge variant="secondary" className="gap-1 h-8 px-3">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          {actions.length} ações no período
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard label="Follow-ups" value={counts.followup ?? 0} icon={<MessageCircle className="h-4 w-4" />} />
        <StatCard label="Alertas" value={counts.alerta ?? 0} tone="warn" icon={<AlertTriangle className="h-4 w-4" />} />
        <StatCard label="Qualificações" value={counts.qualify ?? 0} icon={<Sparkles className="h-4 w-4" />} />
        <StatCard label="Resumos" value={counts.resumo ?? 0} tone="ok" icon={<CalendarClock className="h-4 w-4" />} />
      </div>

      <Tabs defaultValue="feed">
        <TabsList>
          <TabsTrigger value="feed">Diário do Xerife</TabsTrigger>
          <TabsTrigger value="config" disabled={!isAdmin}>
            Configurações {!isAdmin && "(admin)"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="feed" className="mt-6 space-y-4">
          <div className="rounded-xl border bg-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs">Filtrar por tipo</Label>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="followup">Follow-up</SelectItem>
                    <SelectItem value="alerta">Alerta</SelectItem>
                    <SelectItem value="qualify">Qualificação</SelectItem>
                    <SelectItem value="schedule">Agendamento</SelectItem>
                    <SelectItem value="reply">Resposta</SelectItem>
                    <SelectItem value="resumo">Resumo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={load} disabled={loading}>
                  <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
                  Atualizar
                </Button>
                {isAdmin && <RunXerifeButton onDone={load} />}
              </div>
            </div>

            <ul className="space-y-3">
              {actions.map((a) => (
                <li key={a.id} className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    {a.type === "schedule" ? <CalendarClock className="h-4 w-4" /> :
                     a.type === "followup" ? <MessageCircle className="h-4 w-4" /> :
                     a.type === "qualify" ? <Sparkles className="h-4 w-4" /> :
                     a.type === "alerta" ? <AlertTriangle className="h-4 w-4" /> :
                     <Bot className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    {a.lead_company && a.lead_id ? (
                      <button
                        onClick={() => setOpenLead(a.lead_id)}
                        className="text-sm font-medium hover:text-primary text-left"
                      >
                        {a.lead_company} <ChevronRight className="inline h-3 w-3" />
                      </button>
                    ) : (
                      <span className="text-sm font-medium text-muted-foreground">Sistema</span>
                    )}
                    <p className="text-sm text-foreground/90">{a.content}</p>
                    <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      {format(new Date(a.occurred_at), "dd MMM 'às' HH:mm", { locale: ptBR })}
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {a.type}
                      </Badge>
                    </div>
                  </div>
                </li>
              ))}
              {actions.length === 0 && !loading && (
                <li className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma ação registrada ainda.
                </li>
              )}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="config" className="mt-6">
          {isAdmin ? <XerifeConfigForm /> : (
            <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
              Somente administradores podem editar as regras do Xerife.
            </div>
          )}
        </TabsContent>
      </Tabs>

      <LeadDrawer leadId={openLead} open={!!openLead} onOpenChange={(o) => !o && setOpenLead(null)} />
    </div>
  );
}

function RunXerifeButton({ onDone }: { onDone: () => void }) {
  const run = useServerFn(runXerifeNow);
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      onClick={async () => {
        setBusy(true);
        try {
          const r = await run();
          toast.success("Xerife executado", {
            description: `${r.totalActions} ação(ões) registradas · ${r.followupsCreated} follow-up(s)`,
          });
          onDone();
        } catch (e) {
          toast.error("Falha ao executar", { description: e instanceof Error ? e.message : String(e) });
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
    >
      <Play className="h-3.5 w-3.5 mr-1.5" />
      {busy ? "Executando..." : "Executar agora"}
    </Button>
  );
}

type CfgState = {
  novo: number;
  qualificacao: number;
  proposta: number;
  negociacao: number;
  proposta_enviada_dias: number;
  tarefa_atrasada_horas: number;
  ia_sem_resposta_horas: number;
  horario_comercial_inicio: string;
  horario_comercial_fim: string;
  resumo_diario_ativo: boolean;
  resumo_hora: string;
  ativo: boolean;
};

function XerifeConfigForm() {
  const getFn = useServerFn(getXerifeConfig);
  const saveFn = useServerFn(updateXerifeConfig);
  const [cfg, setCfg] = useState<CfgState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const r: any = await getFn();
      if (!r) return;
      const dias = r.dias_sem_interacao_por_etapa ?? {};
      setCfg({
        novo: dias.novo ?? 1,
        qualificacao: dias.qualificacao ?? 2,
        proposta: dias.proposta ?? 3,
        negociacao: dias.negociacao ?? 2,
        proposta_enviada_dias: r.proposta_enviada_dias ?? 3,
        tarefa_atrasada_horas: r.tarefa_atrasada_horas ?? 24,
        ia_sem_resposta_horas: r.ia_sem_resposta_horas ?? 2,
        horario_comercial_inicio: (r.horario_comercial_inicio ?? "07:00:00").slice(0, 5),
        horario_comercial_fim: (r.horario_comercial_fim ?? "20:00:00").slice(0, 5),
        resumo_diario_ativo: r.resumo_diario_ativo ?? true,
        resumo_hora: (r.resumo_hora ?? "08:00:00").slice(0, 5),
        ativo: r.ativo ?? true,
      });
    })();
  }, [getFn]);

  async function save() {
    if (!cfg) return;
    setSaving(true);
    try {
      await saveFn({
        data: {
          dias_sem_interacao_por_etapa: {
            novo: cfg.novo,
            qualificacao: cfg.qualificacao,
            proposta: cfg.proposta,
            negociacao: cfg.negociacao,
          },
          proposta_enviada_dias: cfg.proposta_enviada_dias,
          tarefa_atrasada_horas: cfg.tarefa_atrasada_horas,
          ia_sem_resposta_horas: cfg.ia_sem_resposta_horas,
          horario_comercial_inicio: `${cfg.horario_comercial_inicio}:00`,
          horario_comercial_fim: `${cfg.horario_comercial_fim}:00`,
          resumo_diario_ativo: cfg.resumo_diario_ativo,
          resumo_hora: `${cfg.resumo_hora}:00`,
          ativo: cfg.ativo,
        },
      });
      toast.success("Configuração salva");
    } catch (e) {
      toast.error("Falha ao salvar", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) return <div className="p-8 text-sm text-muted-foreground">Carregando...</div>;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border bg-card p-5 space-y-4">
        <header className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h2 className="font-medium">Dias sem interação por etapa</h2>
        </header>
        <div className="grid grid-cols-2 gap-3">
          {(["novo", "qualificacao", "proposta", "negociacao"] as const).map((s) => (
            <div key={s}>
              <Label className="text-xs capitalize">{s}</Label>
              <Input
                type="number"
                min={1}
                value={cfg[s]}
                onChange={(e) => setCfg({ ...cfg, [s]: Number(e.target.value) || 1 })}
                className="mt-1"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 space-y-4">
        <header className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-primary" />
          <h2 className="font-medium">Gatilhos</h2>
        </header>
        <div>
          <Label className="text-xs">Proposta enviada sem resposta (dias)</Label>
          <Input
            type="number" min={1} className="mt-1"
            value={cfg.proposta_enviada_dias}
            onChange={(e) => setCfg({ ...cfg, proposta_enviada_dias: Number(e.target.value) || 1 })}
          />
        </div>
        <div>
          <Label className="text-xs">Tarefa considerada atrasada (horas)</Label>
          <Input
            type="number" min={1} className="mt-1"
            value={cfg.tarefa_atrasada_horas}
            onChange={(e) => setCfg({ ...cfg, tarefa_atrasada_horas: Number(e.target.value) || 1 })}
          />
        </div>
        <div>
          <Label className="text-xs">IA aguarda resposta do cliente (horas)</Label>
          <Input
            type="number" min={1} className="mt-1"
            value={cfg.ia_sem_resposta_horas}
            onChange={(e) => setCfg({ ...cfg, ia_sem_resposta_horas: Number(e.target.value) || 1 })}
          />
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 space-y-4">
        <header className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <h2 className="font-medium">Horário comercial (America/Sao_Paulo)</h2>
        </header>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Início</Label>
            <Input
              type="time" className="mt-1"
              value={cfg.horario_comercial_inicio}
              onChange={(e) => setCfg({ ...cfg, horario_comercial_inicio: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Fim</Label>
            <Input
              type="time" className="mt-1"
              value={cfg.horario_comercial_fim}
              onChange={(e) => setCfg({ ...cfg, horario_comercial_fim: e.target.value })}
            />
          </div>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Resumo diário</Label>
            <p className="text-xs text-muted-foreground">Enviar consolidado por vendedor no início do dia.</p>
          </div>
          <Switch
            checked={cfg.resumo_diario_ativo}
            onCheckedChange={(v) => setCfg({ ...cfg, resumo_diario_ativo: v })}
          />
        </div>
        <div>
          <Label className="text-xs">Hora do resumo</Label>
          <Input
            type="time" className="mt-1"
            value={cfg.resumo_hora}
            onChange={(e) => setCfg({ ...cfg, resumo_hora: e.target.value })}
          />
        </div>
      </section>

      <section className="rounded-xl border bg-card p-5 space-y-4">
        <header className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-primary" />
          <h2 className="font-medium">Motor</h2>
        </header>
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Xerife ativo</Label>
            <p className="text-xs text-muted-foreground">
              Desligue para pausar todas as execuções automáticas.
            </p>
          </div>
          <Switch checked={cfg.ativo} onCheckedChange={(v) => setCfg({ ...cfg, ativo: v })} />
        </div>
        <div className="pt-2">
          <Button onClick={save} disabled={saving} className="w-full">
            {saving ? "Salvando..." : "Salvar configurações"}
          </Button>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label, value, tone, icon,
}: { label: string; value: number; tone?: "ok" | "warn"; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={cn(
        "mt-1 font-display text-3xl font-semibold",
        tone === "ok" && "text-emerald-600",
        tone === "warn" && "text-amber-600",
        !tone && "text-primary",
      )}>
        {value}
      </div>
    </div>
  );
}
