import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  Flame,
  Snowflake,
  Users,
  ChevronRight,
  RefreshCw,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  getCadenciaSnapshot,
  type CadenciaSnapshot,
} from "@/lib/xerife-cadencia.functions";

const TIPO_LABEL: Record<string, string> = {
  follow_up: "Follow-up",
  primeiro_contato: "1º contato",
  cadencia_proposta: "Cadência proposta",
  pos_venda_confirmacao: "Pós-venda D+3",
  pos_venda_satisfacao: "Pós-venda D+15",
  pos_venda_recompra: "Recompra D+45",
  resgate_carteira: "Resgate carteira",
  reativacao_lead: "Reativação",
  prospecção: "Prospecção",
  outro: "Outro",
};
const tipoLabel = (t: string) => TIPO_LABEL[t] ?? t;

export function CadenciaPanel({
  onOpenLead,
}: {
  onOpenLead?: (leadId: string) => void;
}) {
  const fn = useServerFn(getCadenciaSnapshot);
  const [data, setData] = useState<CadenciaSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setData(await fn());
    } catch (e) {
      toast.error("Falha ao carregar cadência", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        {loading ? "Carregando cadência..." : "Sem dados."}
      </div>
    );
  }

  const t = data.totals;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Snapshot da cadência</h2>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
          Atualizar
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Kpi label="Tarefas pendentes" value={t.tarefas_pendentes} icon={<Clock className="h-4 w-4" />} />
        <Kpi label="Tarefas atrasadas" value={t.tarefas_atrasadas} tone="warn" icon={<AlertTriangle className="h-4 w-4" />} />
        <Kpi label="Escalonadas" value={t.tarefas_escalonadas} tone="danger" icon={<Flame className="h-4 w-4" />} />
        <Kpi label="Carteira em risco" value={t.carteira_risco} tone="warn" icon={<Users className="h-4 w-4" />} />
        <Kpi label="Leads esfriando" value={t.leads_esfriando} tone="warn" icon={<Snowflake className="h-4 w-4" />} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-5 space-y-3">
          <header className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-primary" />
            <h3 className="font-medium">SLAs abertos por tipo</h3>
          </header>
          {data.slaAbertos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhum SLA estourado agora.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-normal py-1">Tipo</th>
                  <th className="text-right font-normal">Total</th>
                  <th className="text-right font-normal">≤1h</th>
                  <th className="text-right font-normal">≤4h</th>
                  <th className="text-right font-normal">1d+</th>
                </tr>
              </thead>
              <tbody>
                {data.slaAbertos.map((s) => (
                  <tr key={s.tipo} className="border-t">
                    <td className="py-1.5">{tipoLabel(s.tipo)}</td>
                    <td className="text-right font-medium">{s.total}</td>
                    <td className="text-right text-amber-600">{s.vencidas_ate_1h}</td>
                    <td className="text-right text-orange-600">{s.vencidas_ate_4h}</td>
                    <td className="text-right text-red-600">{s.vencidas_mais_1d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="rounded-xl border bg-card p-5 space-y-3">
          <header className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Tarefas pendentes por vendedor</h3>
          </header>
          {data.porVendedor.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhuma tarefa aberta.</p>
          ) : (
            <ul className="divide-y">
              {data.porVendedor.map((v) => (
                <li key={v.user_id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{v.name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(v.por_tipo).map(([tp, n]) => (
                        <Badge key={tp} variant="outline" className="text-[10px]">
                          {tipoLabel(tp)} · {n}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="text-xs">{v.pendentes} pend.</Badge>
                    {v.atrasadas > 0 && (
                      <Badge className="bg-orange-500/15 text-orange-700 border-orange-500/30 text-xs" variant="outline">
                        {v.atrasadas} atr.
                      </Badge>
                    )}
                    {v.escalonadas > 0 && (
                      <Badge className="bg-red-500/15 text-red-700 border-red-500/30 text-xs" variant="outline">
                        <Flame className="h-3 w-3 mr-0.5" />
                        {v.escalonadas}
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-card p-5 space-y-3">
          <header className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Carteira em risco (45+ dias sem contato)</h3>
          </header>
          {data.carteiraRisco.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Toda a carteira está em dia.</p>
          ) : (
            <ul className="divide-y max-h-96 overflow-auto">
              {data.carteiraRisco.map((c) => {
                const cls =
                  c.dias_sem_contato >= 60
                    ? "bg-red-500/10 text-red-700 border-red-500/30"
                    : "bg-orange-500/10 text-orange-700 border-orange-500/30";
                return (
                  <li key={c.lead_id} className="py-2 flex items-center justify-between gap-2">
                    <button
                      onClick={() => onOpenLead?.(c.lead_id)}
                      className="text-left min-w-0 flex-1 hover:text-primary"
                    >
                      <p className="text-sm font-medium truncate">
                        {c.company ?? "—"} <ChevronRight className="inline h-3 w-3" />
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {c.owner_name ?? "Sem dono"} · {c.stage}
                      </p>
                    </button>
                    <Badge variant="outline" className={cn("text-xs", cls)}>
                      {c.dias_sem_contato}d
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-card p-5 space-y-3">
          <header className="flex items-center gap-2">
            <Snowflake className="h-4 w-4 text-primary" />
            <h3 className="font-medium">Leads esfriando por etapa</h3>
          </header>
          {data.leadsEsfriando.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Nenhum lead parado além do limite.</p>
          ) : (
            <ul className="divide-y max-h-96 overflow-auto">
              {data.leadsEsfriando.map((c) => (
                <li key={c.lead_id} className="py-2 flex items-center justify-between gap-2">
                  <button
                    onClick={() => onOpenLead?.(c.lead_id)}
                    className="text-left min-w-0 flex-1 hover:text-primary"
                  >
                    <p className="text-sm font-medium truncate">
                      {c.company ?? "—"} <ChevronRight className="inline h-3 w-3" />
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {c.owner_name ?? "Sem dono"} · {c.stage}
                    </p>
                  </button>
                  <Badge
                    variant="outline"
                    className="text-xs bg-amber-500/10 text-amber-700 border-amber-500/30"
                  >
                    {c.dias_na_etapa}d
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone?: "warn" | "danger";
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-600"
      : tone === "warn"
      ? "text-orange-600"
      : "text-foreground";
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={cn("text-2xl font-semibold mt-1", toneClass)}>{value}</div>
    </div>
  );
}
