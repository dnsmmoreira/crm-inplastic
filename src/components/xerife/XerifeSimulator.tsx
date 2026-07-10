import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Play, Beaker, ChevronRight, AlertTriangle, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { simulateXerifeEngine } from "@/lib/xerife.functions";
import type { XerifePlanItem } from "@/routes/api/public/hooks/xerife-engine";

type Result = {
  ran: boolean;
  reason?: string;
  stats: Record<string, number>;
  plan: XerifePlanItem[];
  dryRun: boolean;
};

const TIPO_LABEL: Record<string, string> = {
  primeiro_contato: "1º contato",
  follow_up: "Follow-up",
  resposta_pendente: "Responder WhatsApp",
  cadencia_proposta: "Cadência proposta",
  resgate_carteira: "Resgate carteira",
  reativacao_lead: "Reativação",
  pos_venda_confirmacao: "Pós-venda D+3",
  pos_venda_satisfacao: "Pós-venda D+15",
  pos_venda_recompra: "Recompra D+45",
  alerta_diretoria: "Alerta diretoria",
  esfriando: "Marcar esfriando",
};
const tipoLabel = (t: string) => TIPO_LABEL[t] ?? t;

export function XerifeSimulator({
  onOpenLead,
}: {
  onOpenLead?: (leadId: string) => void;
}) {
  const run = useServerFn(simulateXerifeEngine);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [filter, setFilter] = useState<string>("all");

  async function simulate() {
    setBusy(true);
    try {
      const r = (await run()) as Result;
      setResult(r);
      if (!r.ran) toast.info("Simulação não executou", { description: r.reason });
      else
        toast.success("Simulação concluída", {
          description: `${r.plan.length} ação(ões) planejada(s)`,
        });
    } catch (e) {
      toast.error("Falha ao simular", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  const regras = result ? Array.from(new Set(result.plan.map((p) => p.regra))).sort() : [];
  const plan = result
    ? result.plan.filter((p) => filter === "all" || p.regra === filter)
    : [];

  return (
    <section className="rounded-xl border bg-card p-5 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Beaker className="h-4 w-4 text-primary" />
          <h3 className="font-medium">Simulação do Motor Xerife</h3>
        </div>
        <Button size="sm" onClick={simulate} disabled={busy}>
          <Play className="h-3.5 w-3.5 mr-1.5" />
          {busy ? "Simulando..." : "Simular com config atual"}
        </Button>
      </header>
      <p className="text-xs text-muted-foreground">
        Executa todas as regras (A1–A4, B1–B3, C) com a configuração atual sem gravar tarefas,
        logs ou enviar WhatsApp. Mostra exatamente o que o Xerife faria agora.
      </p>

      {!result && (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Clique em "Simular" para ver o plano.
        </p>
      )}

      {result && !result.ran && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
          <span>Motor não executou: {result.reason ?? "sem motivo"}.</span>
        </div>
      )}

      {result && result.ran && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2">
            {Object.entries(result.stats).map(([k, v]) => (
              <div key={k} className="rounded-lg border bg-muted/30 p-2">
                <div className="text-[10px] uppercase text-muted-foreground">{k}</div>
                <div className={cn("text-lg font-semibold", v > 0 ? "text-primary" : "text-muted-foreground")}>
                  {v}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Filtrar por regra:</span>
            <button
              onClick={() => setFilter("all")}
              className={cn(
                "text-xs px-2 py-0.5 rounded-md border",
                filter === "all" ? "bg-primary text-primary-foreground" : "bg-background",
              )}
            >
              Todas ({result.plan.length})
            </button>
            {regras.map((r) => (
              <button
                key={r}
                onClick={() => setFilter(r)}
                className={cn(
                  "text-xs px-2 py-0.5 rounded-md border",
                  filter === r ? "bg-primary text-primary-foreground" : "bg-background",
                )}
              >
                {r} ({result.plan.filter((p) => p.regra === r).length})
              </button>
            ))}
          </div>

          {plan.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhuma ação seria criada agora.
            </p>
          ) : (
            <ul className="divide-y max-h-[500px] overflow-auto rounded-lg border">
              {plan.map((p, i) => (
                <li key={`${p.regra}-${p.lead_id}-${i}`} className="p-3 flex items-start gap-3">
                  <div
                    className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center shrink-0",
                      p.acao === "notificar_diretoria"
                        ? "bg-red-500/10 text-red-600"
                        : p.acao === "marcar_esfriando"
                        ? "bg-amber-500/10 text-amber-600"
                        : "bg-primary/10 text-primary",
                    )}
                  >
                    {p.acao === "notificar_diretoria" ? (
                      <Flame className="h-4 w-4" />
                    ) : (
                      <Beaker className="h-4 w-4" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        className="text-sm font-medium hover:text-primary text-left"
                        onClick={() => onOpenLead?.(p.lead_id)}
                      >
                        {p.lead_company ?? "—"} <ChevronRight className="inline h-3 w-3" />
                      </button>
                      <Badge variant="outline" className="text-[10px]">
                        {tipoLabel(p.tipo)}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {p.regra}
                      </Badge>
                      {p.prioridade <= 1 && (
                        <Badge className="bg-red-500/15 text-red-700 border-red-500/30 text-[10px]" variant="outline">
                          P{p.prioridade}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-foreground/90 mt-0.5">{p.titulo}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.motivo}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
