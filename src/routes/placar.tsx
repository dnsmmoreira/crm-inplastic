import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trophy, TrendingUp, TrendingDown, Minus, Target, Settings2, History, AlertTriangle } from "lucide-react";
import {
  getPlacar, listMetas, setMeta, listMetasHistorico,
  type PlacarPeriodo, type PlacarVendedor,
} from "@/lib/placar.functions";
import { formatBRL } from "@/lib/crm-store";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  periodo: z.enum(["semana", "mes", "trimestre"]).catch("mes"),
});

export const Route = createFileRoute("/placar")({
  validateSearch: searchSchema,
  component: PlacarPage,
  head: () => ({
    meta: [
      { title: "Placar de Vendedores — INPLASTIC - CRM" },
      { name: "description", content: "Ranking competitivo do time comercial." },
    ],
  }),
});

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };
const PERIODO_LABEL: Record<PlacarPeriodo, string> = {
  semana: "Esta semana",
  mes: "Este mês",
  trimestre: "Este trimestre",
};
const MESES_PT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function PlacarPage() {
  const { periodo } = Route.useSearch() as { periodo: PlacarPeriodo };
  const navigate = useNavigate({ from: Route.fullPath });
  const fetchPlacar = useServerFn(getPlacar);
  const { data, isLoading } = useQuery({
    queryKey: ["placar", periodo],
    queryFn: () => fetchPlacar({ data: { periodo } }),
    staleTime: 60_000,
  });

  const vendedores = data?.vendedores ?? [];
  const lider = vendedores.find((v) => v.score > 0) ?? null;
  const maxScore = Math.max(1, ...vendedores.map((v) => v.score));
  const isAdmin = data?.callerIsAdmin ?? false;
  const selfId = data?.callerId;
  const self = vendedores.find((v) => v.vendedor_id === selfId) ?? null;
  const showMetaCol = periodo === "mes";

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold flex items-center gap-2">
            <Trophy className="h-7 w-7 text-amber-500" />
            Placar de Vendedores
          </h1>
          <p className="text-sm text-muted-foreground">
            Fonte única de ranking · visível para todo o time
          </p>
        </div>
        <div className="flex items-center gap-2">
          <HistoricoDialog isAdmin={isAdmin} />
          {isAdmin && <MetasAdminDialog />}
          <Tabs
            value={periodo}
            onValueChange={(v) => navigate({ search: { periodo: v as PlacarPeriodo } })}
          >
            <TabsList>
              <TabsTrigger value="semana">Semana</TabsTrigger>
              <TabsTrigger value="mes">Mês</TabsTrigger>
              <TabsTrigger value="trimestre">Trimestre</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Minha meta (vendedor logado, período = mês) */}
      {self && showMetaCol && self.meta_valor != null && self.meta_valor > 0 && (
        <MinhaMetaCard v={self} />
      )}

      {/* Hero do líder */}
      {lider ? (
        <Card className="relative overflow-hidden border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-transparent to-transparent">
          <CardContent className="p-6 flex items-center gap-5">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full text-white font-display text-xl font-semibold shadow"
              style={{ background: lider.avatar_color }}
            >
              {initials(lider.nome)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs uppercase tracking-wider text-amber-700 font-semibold">
                🏆 Líder — {PERIODO_LABEL[periodo]}
              </div>
              <div className="mt-1 font-display text-2xl font-semibold truncate">{lider.nome}</div>
              <div className="text-sm text-muted-foreground">
                {lider.ganhos_qtd} venda(s) · {formatBRL(lider.ganhos_valor)} fechado(s)
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Score</div>
              <div className="font-display text-3xl font-semibold text-primary">
                {lider.score.toFixed(0)}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Sem atividade pontuada em {PERIODO_LABEL[periodo].toLowerCase()} ainda.
          </CardContent>
        </Card>
      )}

      {/* Tabela */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando placar…</div>
          ) : vendedores.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Nenhum vendedor cadastrado.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <Th>#</Th>
                  <Th>Vendedor</Th>
                  <Th className="text-right">Score</Th>
                  <Th>Progresso</Th>
                  <Th className="text-right">Ganhos</Th>
                  {showMetaCol && <Th className="text-right">Meta</Th>}
                  <Th className="text-right">Propostas</Th>
                  <Th className="text-right">Conv.</Th>
                  <Th className="text-right">Perdas</Th>
                  <Th className="text-right">Sem proposta</Th>
                  <Th className="text-right">1ª resp.</Th>
                  <Th className="text-right">SLAs</Th>
                  <Th className="text-right">Carteira em risco</Th>
                  <Th className="text-right">Pós-venda</Th>
                </tr>
              </thead>
              <tbody>
                {vendedores.map((v) => (
                  <Row
                    key={v.vendedor_id}
                    v={v}
                    maxScore={maxScore}
                    lider={lider?.vendedor_id === v.vendedor_id}
                    showMetaCol={showMetaCol}
                  />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Meta em R$ é individual (apenas você vê a sua; admin vê todas). Bônus escalonado no score: 50% · 80% · 100% · 120%.
      </p>
    </div>
  );
}

function MinhaMetaCard({ v }: { v: PlacarVendedor }) {
  const meta = v.meta_valor ?? 0;
  const pct = v.meta_pct ?? 0;
  const pace = v.meta_pace_esperado_pct ?? 0;
  const faltando = Math.max(0, meta - v.ganhos_valor);
  // Projeção só é exibida com 2+ vendas no mês (evita extrapolação de venda única em ciclo B2B)
  const showProjecao = v.ganhos_qtd >= 2 && pace > 0;
  const projPct = showProjecao ? Math.round((pct / pace) * 100) : null;
  // status: adiantado se +5pp acima do pace, no pace se ±5pp, atrasado se -5pp
  const gap = pct - pace;
  const status: "adiantado" | "no_pace" | "atrasado" | "batida" =
    v.meta_batida ? "batida"
    : gap >= 5 ? "adiantado"
    : gap <= -5 ? "atrasado"
    : "no_pace";
  const statusLabel = {
    batida: "🎉 meta batida",
    adiantado: "🚀 adiantado",
    no_pace: "no pace do mês",
    atrasado: "⚠️ abaixo do pace",
  }[status];
  const cls = status === "batida"
    ? "border-emerald-500/40 bg-emerald-50/60"
    : status === "atrasado"
      ? "border-destructive/40 bg-destructive/5"
      : status === "adiantado"
        ? "border-primary/50 bg-primary/5"
        : "border-border";

  return (
    <Card className={cn("border", cls)}>
      <CardContent className="p-5 flex flex-wrap items-center gap-4">
        <Target className={cn("h-6 w-6",
          status === "batida" ? "text-emerald-600"
          : status === "atrasado" ? "text-destructive"
          : "text-primary"
        )} />
        <div className="flex-1 min-w-[240px]">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Sua meta do mês</div>
          <div className="mt-0.5 font-display text-lg font-semibold">
            {formatBRL(v.ganhos_valor)} <span className="text-muted-foreground text-sm font-normal">de {formatBRL(meta)}</span>
          </div>
          <div className="relative mt-2 h-2.5 rounded-full bg-muted overflow-hidden">
            {/* marca do pace esperado */}
            {pace > 0 && !v.meta_batida && (
              <div
                className="absolute top-0 h-full w-px bg-foreground/50"
                style={{ left: `${Math.min(100, pace)}%` }}
                title={`Pace esperado: ${pace.toFixed(0)}%`}
              />
            )}
            <div
              className={cn("h-full rounded-full",
                status === "batida" ? "bg-emerald-500"
                : status === "atrasado" ? "bg-destructive"
                : "bg-primary"
              )}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{statusLabel}</span>
            {!v.meta_batida && pace > 0 && (
              <span>· pace {pace.toFixed(0)}%</span>
            )}
            {showProjecao && !v.meta_batida && (
              <span className="ml-auto font-medium text-foreground">
                Projeção: {projPct}% da meta no fim do mês
              </span>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-xl font-semibold">
            {pct.toFixed(0)}%
          </div>
          <div className="text-xs text-muted-foreground">
            {v.meta_batida ? "meta atingida" : `faltam ${formatBRL(faltando)}`}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({
  v, maxScore, lider, showMetaCol,
}: {
  v: PlacarVendedor;
  maxScore: number;
  lider: boolean;
  showMetaCol: boolean;
}) {
  const medal = MEDALS[v.posicao];
  const delta = v.score - v.score_periodo_anterior;
  const trend = delta > 0.5 ? "up" : delta < -0.5 ? "down" : "flat";
  const carteira = v.carteira_60_mais > 0
    ? { text: `${v.carteira_60_mais} · 60d+`, cls: "text-destructive font-semibold" }
    : v.carteira_45_60 > 0
      ? { text: `${v.carteira_45_60} · 45-60d`, cls: "text-amber-600 font-medium" }
      : { text: "—", cls: "text-muted-foreground" };
  const progressPct = maxScore > 0 ? Math.max(0, Math.min(100, (v.score / maxScore) * 100)) : 0;
  const dsp = v.dias_sem_proposta;
  const dspOver = dsp != null && dsp >= v.dias_sem_proposta_limite;
  const dspWarn = dsp != null && dsp >= Math.max(1, v.dias_sem_proposta_limite - 3);
  const dspCls = dsp == null ? "text-muted-foreground"
    : dspOver ? "text-destructive font-semibold"
    : dspWarn ? "text-amber-600 font-medium"
    : "text-muted-foreground";

  return (
    <tr className={cn("border-t", lider && "bg-primary/5")}>
      <Td className="w-10 text-center text-lg">{medal ?? v.posicao}</Td>
      <Td>
        <div className="flex items-center gap-2">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full text-white text-xs font-semibold shrink-0"
            style={{ background: v.avatar_color }}
          >
            {initials(v.nome)}
          </div>
          <span className="font-medium">{v.nome}</span>
          {v.meta_batida && (
            <span title="Meta do mês batida" className="text-xs">🎯</span>
          )}
        </div>
      </Td>
      <Td className="text-right">
        <div className="inline-flex items-center gap-1 font-display font-semibold text-base">
          {v.score.toFixed(0)}
          {trend === "up" && <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />}
          {trend === "down" && <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
          {trend === "flat" && <Minus className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </Td>
      <Td className="min-w-[140px]">
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className={cn("h-full rounded-full", lider ? "bg-amber-500" : "bg-primary")}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </Td>
      <Td className="text-right whitespace-nowrap">
        <div className="font-medium">{v.ganhos_qtd}</div>
        <div className="text-xs text-muted-foreground">{formatBRL(v.ganhos_valor)}</div>
      </Td>
      {showMetaCol && (
        <Td className="text-right whitespace-nowrap min-w-[130px]">
          {v.meta_valor == null ? (
            <span className="text-muted-foreground italic text-xs">privado</span>
          ) : v.meta_valor === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <div className="inline-flex flex-col items-end">
              <span className={cn("font-medium", v.meta_batida && "text-emerald-600")}>
                {(v.meta_pct ?? 0).toFixed(0)}%
              </span>
              <span className="text-xs text-muted-foreground">de {formatBRL(v.meta_valor)}</span>
            </div>
          )}
        </Td>
      )}
      <Td className="text-right">{v.propostas_qtd}</Td>
      <Td className="text-right">
        {v.conversao === null ? "—" : `${v.conversao.toFixed(1)}%`}
      </Td>
      <Td className="text-right">{v.perdas_qtd}</Td>
      <Td className={cn("text-right whitespace-nowrap", dspCls)}>
        {dsp == null ? "—" : (
          <span className="inline-flex items-center gap-1">
            {dspOver && <AlertTriangle className="h-3.5 w-3.5" />}
            {dsp}d
          </span>
        )}
      </Td>
      <Td className="text-right">
        {v.tempo_medio_primeira_resposta_min > 0
          ? `${fmtMinutes(v.tempo_medio_primeira_resposta_min)}`
          : "—"}
      </Td>
      <Td className="text-right">
        {v.slas_estourados > 0 ? (
          <span className="text-destructive font-medium">{v.slas_estourados}</span>
        ) : (
          <span className="text-muted-foreground">0</span>
        )}
      </Td>
      <Td className={cn("text-right whitespace-nowrap", carteira.cls)}>{carteira.text}</Td>
      <Td className="text-right">
        {v.pos_venda_no_prazo_pct === null ? "—" : `${v.pos_venda_no_prazo_pct.toFixed(0)}%`}
      </Td>
    </tr>
  );
}

function HistoricoDialog({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const fetchHist = useServerFn(listMetasHistorico);
  const { data, isLoading } = useQuery({
    queryKey: ["placar", "historico", 6],
    queryFn: () => fetchHist({ data: { meses: 6 } }),
    enabled: open,
  });

  // agrupa por vendedor
  const grupos = new Map<string, { nome: string; color: string; rows: any[] }>();
  (data ?? []).forEach((r) => {
    if (!grupos.has(r.user_id)) grupos.set(r.user_id, { nome: r.nome, color: r.avatar_color, rows: [] });
    grupos.get(r.user_id)!.rows.push(r);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <History className="h-4 w-4" />
          Histórico
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Histórico de metas — últimos 6 meses</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum mês fechado ainda. O snapshot roda no fechamento do último dia útil do mês.
          </p>
        ) : (
          <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
            {Array.from(grupos.entries()).map(([uid, g]) => (
              <div key={uid} className="space-y-2">
                <div className="flex items-center gap-2">
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full text-white text-xs font-semibold shrink-0"
                    style={{ background: g.color }}
                  >
                    {initials(g.nome)}
                  </div>
                  <span className="font-medium">{g.nome}</span>
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <Th>Mês</Th>
                        <Th className="text-right">Meta</Th>
                        <Th className="text-right">Fechado</Th>
                        <Th className="text-right">Vendas</Th>
                        <Th className="text-right">Atingido</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.rows.map((r) => (
                        <tr key={`${r.ano}-${r.mes}`} className="border-t">
                          <Td className="capitalize">{MESES_PT[r.mes - 1]}/{String(r.ano).slice(2)}</Td>
                          <Td className="text-right text-muted-foreground">{formatBRL(r.meta_valor)}</Td>
                          <Td className="text-right font-medium">{formatBRL(r.ganhos_valor)}</Td>
                          <Td className="text-right">{r.ganhos_qtd}</Td>
                          <Td className={cn(
                            "text-right font-medium",
                            r.bateu ? "text-emerald-600" : r.atingido_pct < 60 ? "text-destructive" : "text-foreground",
                          )}>
                            {r.atingido_pct.toFixed(0)}% {r.bateu && "🎯"}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
        {isAdmin && (
          <p className="text-xs text-muted-foreground">
            Admin: snapshots são gerados automaticamente no fechamento do último dia útil de cada mês.
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MetasAdminDialog() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const fetchMetas = useServerFn(listMetas);
  const saveMeta = useServerFn(setMeta);
  const { data: metas } = useQuery({
    queryKey: ["placar", "metas"],
    queryFn: () => fetchMetas(),
    enabled: open,
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: async ({ user_id, valor }: { user_id: string; valor: number }) =>
      saveMeta({ data: { user_id, meta_valor_mensal: valor } }),
    onSuccess: () => {
      toast.success("Meta atualizada");
      qc.invalidateQueries({ queryKey: ["placar"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          Metas
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Metas mensais (R$)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {(metas ?? []).map((m: any) => {
            const current = drafts[m.user_id] ?? String(m.meta_valor_mensal ?? 0);
            return (
              <div key={m.user_id} className="flex items-center gap-3">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full text-white text-xs font-semibold shrink-0"
                  style={{ background: m.avatar_color }}
                >
                  {initials(m.nome)}
                </div>
                <Label className="flex-1 truncate">{m.nome}</Label>
                <Input
                  type="number"
                  min={0}
                  step={1000}
                  className="w-40"
                  value={current}
                  onChange={(e) => setDrafts((s) => ({ ...s, [m.user_id]: e.target.value }))}
                />
                <Button
                  size="sm"
                  disabled={mutation.isPending}
                  onClick={() =>
                    mutation.mutate({ user_id: m.user_id, valor: Number(current) || 0 })
                  }
                >
                  Salvar
                </Button>
              </div>
            );
          })}
          {(metas ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum vendedor cadastrado.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={cn("px-3 py-2 text-left font-medium", className)}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-3 py-2 align-middle", className)}>{children}</td>;
}
function initials(name: string) {
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}
function fmtMinutes(min: number) {
  if (min < 60) return `${min.toFixed(0)}min`;
  const h = min / 60;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}
