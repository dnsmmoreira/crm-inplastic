import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bot,
  Sparkles,
  MessageCircle,
  Clock,
  ChevronRight,
  CalendarClock,
  AlertTriangle,
  RefreshCw,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
  listAiActions,
  runXerifeNow,
  runResumoDiarioNow,
} from "@/lib/xerife.functions";
import { CadenciaPanel } from "@/components/xerife/CadenciaPanel";
import { XerifeConfigForm } from "@/components/xerife/XerifeConfigForm";

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
          <TabsTrigger value="cadencia" disabled={!isAdmin}>
            Cadência {!isAdmin && "(admin)"}
          </TabsTrigger>
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

        <TabsContent value="cadencia" className="mt-6">
          {isAdmin ? (
            <CadenciaPanel onOpenLead={(id) => setOpenLead(id)} />
          ) : (
            <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
              Somente administradores podem ver o painel de cadência.
            </div>
          )}
        </TabsContent>

        <TabsContent value="config" className="mt-6 space-y-4">
          {isAdmin ? (
            <>
              <XerifeConfigForm />
              <div className="rounded-xl border bg-card p-5">
                <h3 className="font-medium mb-2">Testar envio</h3>
                <TestResumoButton />
              </div>
            </>
          ) : (
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

function TestResumoButton() {
  const run = useServerFn(runResumoDiarioNow);
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      className="w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const r = await run();
          if (!r.ran) {
            toast.info("Resumo não enviado", { description: r.reason ?? "sem dados" });
          } else {
            toast.success("Resumo enviado", {
              description: `${r.vendedoresNotificados} vendedor(es) · ${r.adminsNotificados} admin(s)`,
            });
          }
        } catch (e) {
          toast.error("Falha ao enviar resumo", {
            description: e instanceof Error ? e.message : String(e),
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <Play className="h-3.5 w-3.5 mr-1.5" />
      {busy ? "Enviando..." : "Testar resumo agora (WhatsApp)"}
    </Button>
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
