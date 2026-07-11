import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, Flame, DollarSign, Target } from "lucide-react";
import { format, isToday, isBefore, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useVisibleLeads,
  useVisibleTasks,
  useCurrentUser,
  formatBRL,
} from "@/lib/crm-store";
import { getPlacar } from "@/lib/placar.functions";

function saudacao(h: number) {
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export function ResumoDoDia() {
  const user = useCurrentUser();
  const leads = useVisibleLeads();
  const tasks = useVisibleTasks();
  const isAdmin = user.role === "admin";

  const now = new Date();
  const primeiro = (user.name || "").split(" ")[0] || "por aí";
  const dataExtenso = format(now, "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR });

  // 1) Tarefas
  const { tarefasHoje, tarefasAtrasadas } = useMemo(() => {
    const abertas = tasks.filter((t) => !t.done);
    const hoje = abertas.filter((t) => {
      const d = new Date(t.dueDate);
      return isToday(d) || isBefore(d, startOfDay(now));
    });
    const atrasadas = abertas.filter(
      (t) => isBefore(new Date(t.dueDate), startOfDay(now)),
    );
    return { tarefasHoje: hoje.length, tarefasAtrasadas: atrasadas.length };
  }, [tasks]);

  // 2) Sem resposta +24h
  const semResposta24h = useMemo(() => {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    return leads.filter(
      (l) =>
        l.stage !== "ganho" &&
        l.stage !== "perdido" &&
        new Date(l.lastContact ?? l.createdAt).getTime() < cutoff,
    ).length;
  }, [leads]);

  // 3) Propostas em aberto
  const { propostasValor, propostasQtd } = useMemo(() => {
    const abertas = leads.filter(
      (l) => l.stage === "proposta" || l.stage === "negociacao",
    );
    const valor = abertas.reduce((s, l) => s + (l.estimatedValue ?? 0), 0);
    return { propostasValor: valor, propostasQtd: abertas.length };
  }, [leads]);

  // 4) Meta do mês — via placar
  const fetchPlacar = useServerFn(getPlacar);
  const { data: placar, isLoading: loadingPlacar } = useQuery({
    queryKey: ["placar", "mes"],
    queryFn: () => fetchPlacar({ data: { periodo: "mes" } }),
    staleTime: 60_000,
  });

  const meta = useMemo(() => {
    const rows = placar?.vendedores ?? [];
    if (isAdmin) {
      const totalMeta = rows.reduce((s, v) => s + (v.meta_valor ?? 0), 0);
      const totalGanho = rows.reduce((s, v) => s + (v.ganhos_valor ?? 0), 0);
      const pct = totalMeta > 0 ? (totalGanho / totalMeta) * 100 : 0;
      return { pct, atingido: totalGanho, meta: totalMeta };
    }
    const self = rows.find((v) => v.vendedor_id === placar?.callerId);
    return {
      pct: self?.meta_pct ?? 0,
      atingido: self?.ganhos_valor ?? 0,
      meta: self?.meta_valor ?? 0,
    };
  }, [placar, isAdmin]);

  const metaCor =
    meta.pct >= 80
      ? "bg-emerald-500"
      : meta.pct >= 40
        ? "bg-amber-500"
        : "bg-destructive";

  const tudoZerado =
    tarefasHoje === 0 &&
    tarefasAtrasadas === 0 &&
    semResposta24h === 0 &&
    propostasQtd === 0 &&
    (meta.meta === 0 || meta.pct === 0);

  return (
    <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
      <CardContent className="p-4 md:p-6 space-y-4">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold">
            👋 {saudacao(now.getHours())}, {primeiro}.
          </h2>
          <p className="text-xs md:text-sm text-muted-foreground capitalize">
            {dataExtenso}
          </p>
        </div>

        {tudoZerado ? (
          <div className="rounded-lg border bg-background/60 p-4 text-center text-sm">
            Tudo em dia! Nenhuma pendência no momento. ✅
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Tarefas hoje */}
            <MetricCard
              to="/tarefas"
              icon={<Phone className="h-4 w-4" />}
              label="Tarefas hoje"
              tone="brand"
            >
              <div className="flex items-baseline gap-2">
                <span className="font-display text-2xl font-semibold">
                  {tarefasHoje}
                </span>
                <span className="text-xs text-muted-foreground">
                  {tarefasHoje === 1 ? "tarefa" : "tarefas"}
                </span>
              </div>
              {tarefasAtrasadas > 0 && (
                <Badge variant="destructive" className="mt-1 text-[10px]">
                  {tarefasAtrasadas} atrasada{tarefasAtrasadas > 1 ? "s" : ""}
                </Badge>
              )}
            </MetricCard>

            {/* Sem resposta +24h */}
            <MetricCard
              to="/pipeline"
              icon={<Flame className="h-4 w-4" />}
              label="Sem resposta +24h"
              tone={semResposta24h > 0 ? "danger" : "muted"}
            >
              <div className="flex items-baseline gap-2">
                <span className="font-display text-2xl font-semibold">
                  {semResposta24h}
                </span>
                <span className="text-xs text-muted-foreground">
                  {semResposta24h === 1 ? "cliente" : "clientes"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                há +24h sem resposta
              </p>
            </MetricCard>

            {/* Propostas em aberto */}
            <MetricCard
              to="/pipeline"
              icon={<DollarSign className="h-4 w-4" />}
              label="Propostas em aberto"
              tone="success"
            >
              <div className="font-display text-2xl font-semibold truncate">
                {formatBRL(propostasValor)}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                aguardando retorno ({propostasQtd})
              </p>
            </MetricCard>

            {/* Meta do mês */}
            <MetricCard
              to="/placar"
              icon={<Target className="h-4 w-4" />}
              label={isAdmin ? "Meta do time (mês)" : "Meta do mês"}
              tone="brand"
            >
              {loadingPlacar ? (
                <div className="h-6 w-16 rounded bg-muted animate-pulse" />
              ) : meta.meta > 0 ? (
                <>
                  <div className="font-display text-2xl font-semibold">
                    {meta.pct.toFixed(0)}%
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full ${metaCor}`}
                      style={{ width: `${Math.min(100, meta.pct)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground truncate">
                    {formatBRL(meta.atingido)} de {formatBRL(meta.meta)}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground italic">
                  Sem meta cadastrada
                </p>
              )}
            </MetricCard>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MetricCard({
  to,
  icon,
  label,
  tone,
  children,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  tone: "brand" | "success" | "danger" | "muted";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "brand"
      ? "bg-primary/10 text-primary"
      : tone === "success"
        ? "bg-emerald-500/15 text-emerald-600"
        : tone === "danger"
          ? "bg-destructive/15 text-destructive"
          : "bg-muted text-muted-foreground";

  return (
    <Link
      to={to as any}
      className="group focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-lg"
    >
      <div className="h-full rounded-lg border bg-card p-3 transition-shadow group-hover:shadow-md">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground truncate">
            {label}
          </span>
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${toneClass}`}
          >
            {icon}
          </span>
        </div>
        <div className="mt-2 min-w-0">{children}</div>
      </div>
    </Link>
  );
}
