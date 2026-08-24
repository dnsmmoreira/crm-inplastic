import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import {
  FlaskConical,
  Play,
  ArrowRight,
  Bell,
  CheckSquare,
  Megaphone,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAuth, hasPerm } from "@/hooks/use-auth";
import {
  listPedidosSimulaveis,
  simularCadenciaPedido,
} from "@/lib/cadencia-simulacao.functions";
import type { PedidoOpcao, SimResultado } from "@/lib/cadencia-simulacao.types";

export const Route = createFileRoute("/cadencia-simulador")({
  head: () => ({
    meta: [
      { title: "Simulador de cadência de pedidos — CRM Inplastic" },
      {
        name: "description",
        content:
          "Simule a cadência aplicada a um pedido: precedência cliente > família > padrão, prazos e tarefas/escalonamentos gerados.",
      },
      { property: "og:title", content: "Simulador de cadência de pedidos" },
      {
        property: "og:description",
        content:
          "Veja qual régua vale para cada pedido, em que datas os toques disparam e quem é cobrado.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CadenciaSimuladorPage,
});

const GRUPO_LABEL: Record<string, string> = {
  financeiro: "Financeiro",
  operacional: "Operacional",
  vendedor: "Vendedor do pedido",
};

function fmt(d: string) {
  try {
    return format(new Date(d), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return "—";
  }
}

function CadenciaSimuladorPage() {
  const { user } = useAuth();
  const podeVer = hasPerm(user, "agente_ia.editar_prompt");

  const listFn = useServerFn(listPedidosSimulaveis);
  const simFn = useServerFn(simularCadenciaPedido);

  const [pedidos, setPedidos] = useState<PedidoOpcao[]>([]);
  const [pedidoId, setPedidoId] = useState("");
  const [diasSimulados, setDiasSimulados] = useState("");
  const [res, setRes] = useState<SimResultado | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!podeVer) return;
    void (async () => {
      try {
        const r = (await listFn()) as PedidoOpcao[];
        setPedidos(r);
      } catch (e) {
        toast.error("Falha ao carregar pedidos", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeVer]);

  const porEtapa = useMemo(() => {
    const m = new Map<string, PedidoOpcao[]>();
    for (const p of pedidos) {
      const arr = m.get(p.stageLabel) ?? [];
      arr.push(p);
      m.set(p.stageLabel, arr);
    }
    return Array.from(m.entries());
  }, [pedidos]);

  async function simular() {
    if (!pedidoId) {
      toast.error("Selecione um pedido.");
      return;
    }
    setBusy(true);
    try {
      const dias = diasSimulados.trim() === "" ? null : Number(diasSimulados);
      const r = (await simFn({
        data: {
          pedidoId,
          diasSimulados: Number.isFinite(dias as number) ? (dias as number) : null,
        },
      })) as SimResultado;
      setRes(r);
    } catch (e) {
      toast.error("Não foi possível simular", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  if (!podeVer) {
    return (
      <div className="p-6">
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          Você não tem acesso ao simulador de cadência.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          Simulador de cadência
        </h1>
        <p className="text-sm text-muted-foreground">
          Escolha um pedido e veja exatamente o que o Xerife faria: qual régua vale (cliente &gt;
          família &gt; padrão), em que datas cada cobrança dispara e quem recebe tarefa,
          notificação ou alerta de diretoria. Nada é gravado.
        </p>
      </header>

      <section className="rounded-xl border bg-card p-5 space-y-3">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label>Pedido</Label>
            <Select value={pedidoId} onValueChange={setPedidoId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um pedido em etapa com cadência" />
              </SelectTrigger>
              <SelectContent>
                {porEtapa.map(([etapa, lista]) => (
                  <div key={etapa}>
                    <div className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                      {etapa}
                    </div>
                    {lista.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.number}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Simular “parado há” (dias)</Label>
            <Input
              inputMode="numeric"
              placeholder="usar tempo real"
              value={diasSimulados}
              onChange={(e) => setDiasSimulados(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <Button onClick={simular} disabled={busy}>
            <Play className="h-3.5 w-3.5 mr-1.5" />
            {busy ? "Simulando…" : "Simular"}
          </Button>
        </div>
      </section>

      {res && (
        <>
          <section className="rounded-xl border bg-card p-5 space-y-3">
            <h2 className="font-medium">Pedido {res.pedido.number}</h2>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div>
                <span className="text-muted-foreground">Etapa: </span>
                {res.pedido.stageLabel}
              </div>
              <div>
                <span className="text-muted-foreground">Na etapa desde: </span>
                {fmt(res.pedido.desde)} · {res.pedido.dias} dia(s)
              </div>
              <div>
                <span className="text-muted-foreground">Cliente: </span>
                {res.pedido.clienteNome ?? "— (pedido sem cliente vinculado)"}
              </div>
              <div>
                <span className="text-muted-foreground">Famílias dos itens: </span>
                {res.pedido.familias.length ? res.pedido.familias.join(", ") : "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Vendedor: </span>
                {res.pedido.vendedorNome ?? "—"}
              </div>
            </div>
            {!res.pedido.temCadencia && (
              <p className="text-sm text-amber-600">
                Esta etapa não possui cadência configurada — nenhum toque seria gerado.
              </p>
            )}
          </section>

          <section className="rounded-xl border bg-card p-5 space-y-3">
            <h2 className="font-medium">Precedência aplicada</h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {(["cliente", "familia", "padrao"] as const).map((f, i) => (
                <span key={f} className="flex items-center gap-2">
                  {i > 0 && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  <Badge
                    variant={res.precedencia.fonte === f ? "default" : "outline"}
                    className={cn(res.precedencia.fonte !== f && "text-muted-foreground")}
                  >
                    {f === "cliente" ? "Cliente" : f === "familia" ? "Família" : "Padrão"}
                  </Badge>
                </span>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">{res.precedencia.explicacao}</p>

            <div className="text-sm">
              <span className="text-muted-foreground">Régua padrão da etapa: </span>
              {res.reguaPadrao.length ? `${res.reguaPadrao.join("/")} dias` : "—"}
              <span className="mx-2 text-muted-foreground">→</span>
              <span className="font-medium">
                Régua efetiva: {res.reguaEfetiva.length ? `${res.reguaEfetiva.join("/")} dias` : "—"}
              </span>
            </div>

            {res.precedencia.candidatas.length > 0 && (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="text-left p-2">Escopo</th>
                      <th className="text-left p-2">Alvo</th>
                      <th className="text-left p-2">Régua</th>
                      <th className="text-left p-2">Diretoria</th>
                      <th className="text-left p-2">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.precedencia.candidatas.map((c, i) => (
                      <tr
                        key={i}
                        className={cn("border-t", c.aplicada && "bg-primary/5 font-medium")}
                      >
                        <td className="p-2">{c.escopo === "cliente" ? "Cliente" : "Família"}</td>
                        <td className="p-2">{c.alvo}</td>
                        <td className="p-2">{c.dias ? `${c.dias.join("/")}d` : "padrão"}</td>
                        <td className="p-2">{c.escalar_diretoria ? "sim" : "não"}</td>
                        <td className="p-2 text-muted-foreground">{c.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border bg-card p-5 space-y-3">
            <h2 className="font-medium">Toques que seriam gerados</h2>
            {res.passos.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum toque para esta etapa.</p>
            )}
            <ol className="space-y-3">
              {res.passos.map((p) => (
                <li
                  key={p.nivel}
                  className={cn(
                    "rounded-lg border p-4 space-y-2",
                    p.jaVencido ? "border-primary/40 bg-primary/5" : "bg-muted/10",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={p.jaVencido ? "default" : "outline"}>
                      {p.nivel}º toque · D+{p.dia}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      previsto para {fmt(p.dataPrevista)}
                    </span>
                    {p.jaVencido && (
                      <Badge variant="secondary">já vencido no cenário simulado</Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium">{p.titulo}</p>
                  <p className="text-sm text-muted-foreground">{p.descricao}</p>
                  <ul className="text-sm space-y-1">
                    <li className="flex items-start gap-2">
                      <CheckSquare className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                      <span>
                        Tarefa ({p.tipo}) para {GRUPO_LABEL[p.grupo] ?? p.grupo}:{" "}
                        {p.tarefaPara.length
                          ? p.tarefaPara.map((x) => x.nome).join(", ")
                          : "— nenhum destinatário encontrado"}
                      </span>
                    </li>
                    {p.escalarGestao && (
                      <li className="flex items-start gap-2">
                        <Bell className="h-4 w-4 mt-0.5 text-amber-500 shrink-0" />
                        <span>
                          Notificação na tela para:{" "}
                          {p.notificaNaTela.map((x) => x.nome).join(", ") || "—"}
                        </span>
                      </li>
                    )}
                    {p.avisaDiretoria ? (
                      <li className="flex items-start gap-2">
                        <Megaphone className="h-4 w-4 mt-0.5 text-red-500 shrink-0" />
                        <span>Alerta para a diretoria (Telegram)</span>
                      </li>
                    ) : (
                      p.ultimo && (
                        <li className="flex items-start gap-2 text-muted-foreground">
                          <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                          <span>Escalonamento à diretoria desligado para este caso</span>
                        </li>
                      )
                    )}
                  </ul>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
