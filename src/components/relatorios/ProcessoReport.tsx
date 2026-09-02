/**
 * Aba "Processo" dos relatórios — placar de velocidade do processo comercial.
 * Somente leitura: consome `getRelatorioProcesso` e apenas apresenta.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/crm-store";
import {
  getRelatorioProcesso,
  type RelatorioProcesso,
  type ResumoDuracaoView,
} from "./processo-tipos";

const PERIODOS = [30, 90, 180] as const;

function fmtHoras(h: number | null): string {
  if (h === null) return "—";
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

function Celula({ r }: { r: ResumoDuracaoView }) {
  return (
    <div className="whitespace-nowrap">
      <span className="font-medium">{fmtHoras(r.mediana)}</span>
      <span className="text-muted-foreground text-xs">
        {" "}
        · méd {fmtHoras(r.media)} · {r.casos} caso{r.casos === 1 ? "" : "s"}
      </span>
    </div>
  );
}

function Card({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground">{titulo}</div>
      <div className="text-2xl font-semibold mt-1">{valor}</div>
      {sub ? <div className="text-xs text-muted-foreground mt-1">{sub}</div> : null}
    </div>
  );
}

export function ProcessoReport() {
  const fetchProcesso = useServerFn(getRelatorioProcesso);
  const [periodo, setPeriodo] = useState<30 | 90 | 180>(90);
  const { data, isLoading, error } = useQuery({
    queryKey: ["relatorio-processo", periodo],
    queryFn: () => fetchProcesso({ data: { periodoDias: periodo } }),
  });

  const d = data as RelatorioProcesso | undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 no-print">
        <span className="text-xs font-medium text-muted-foreground">Período:</span>
        {PERIODOS.map((p) => (
          <Button
            key={p}
            size="sm"
            variant={periodo === p ? "default" : "outline"}
            className="h-8"
            onClick={() => setPeriodo(p)}
          >
            {p} dias
          </Button>
        ))}
        {d?.escopo_proprio ? (
          <Badge variant="outline" className="font-normal">
            Apenas os seus números
          </Badge>
        ) : null}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando…</div>
      ) : error ? (
        <div className="text-sm text-destructive">{(error as Error).message}</div>
      ) : !d ? null : (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Card
              titulo="Lead → proposta enviada (mediana)"
              valor={fmtHoras(d.geral.funil.lead_para_proposta.mediana)}
              sub={`${d.geral.funil.lead_para_proposta.casos} casos`}
            />
            <Card
              titulo="Ponta a ponta: lead → faturado"
              valor={fmtHoras(d.geral.funil.total_ponta_a_ponta.mediana)}
              sub={`${d.geral.funil.total_ponta_a_ponta.casos} casos`}
            />
            <Card
              titulo="1ª resposta humana (WhatsApp)"
              valor={fmtHoras(d.geral.primeira_resposta.mediana)}
              sub={`${d.geral.primeira_resposta.casos} conversas · ${d.geral.primeira_resposta.so_ia} atendidas só pela IA`}
            />
            <Card
              titulo="Propostas paradas / leads sem contato"
              valor={`${d.propostas_paradas.length} / ${d.leads_sem_contato.length}`}
              sub="Enviadas há +15 dias · leads há +24h sem contato"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Tempos em horas corridas — não descontam fim de semana nem feriado.
          </p>

          {/* Tabela por vendedor */}
          <div className="rounded-lg border bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr className="border-b">
                  <th className="px-3 py-2 font-medium">Vendedor</th>
                  <th className="px-3 py-2 font-medium">Lead → proposta</th>
                  <th className="px-3 py-2 font-medium">Proposta → pedido</th>
                  <th className="px-3 py-2 font-medium">Pedido → faturado</th>
                  <th className="px-3 py-2 font-medium">Ponta a ponta</th>
                  <th className="px-3 py-2 font-medium">1ª resposta</th>
                  <th className="px-3 py-2 font-medium text-right">Paradas</th>
                  <th className="px-3 py-2 font-medium text-right">Sem contato</th>
                </tr>
              </thead>
              <tbody>
                {d.por_vendedor.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                      Nenhum movimento no período — nada a mostrar ainda.
                    </td>
                  </tr>
                ) : (
                  d.por_vendedor.map((v) => (
                    <tr key={v.vendedor_id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{v.nome}</td>
                      <td className="px-3 py-2"><Celula r={v.funil.lead_para_proposta} /></td>
                      <td className="px-3 py-2"><Celula r={v.funil.proposta_para_pedido} /></td>
                      <td className="px-3 py-2"><Celula r={v.funil.pedido_para_faturado} /></td>
                      <td className="px-3 py-2"><Celula r={v.funil.total_ponta_a_ponta} /></td>
                      <td className="px-3 py-2">
                        <Celula r={v.primeira_resposta} />
                        <div className="text-[11px] text-muted-foreground">
                          {v.primeira_resposta.so_ia} só IA
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">{v.propostas_paradas}</td>
                      <td className="px-3 py-2 text-right">{v.leads_sem_contato}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Propostas paradas */}
          <div className="rounded-lg border bg-card overflow-x-auto">
            <div className="px-3 py-2 border-b text-sm font-medium">
              Propostas enviadas paradas há mais de 15 dias
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr className="border-b">
                  <th className="px-3 py-2 font-medium">Nº</th>
                  <th className="px-3 py-2 font-medium">Cliente</th>
                  <th className="px-3 py-2 font-medium">Dono</th>
                  <th className="px-3 py-2 font-medium text-right">Dias</th>
                  <th className="px-3 py-2 font-medium text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {d.propostas_paradas.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      Nenhuma proposta parada. Bom sinal.
                    </td>
                  </tr>
                ) : (
                  d.propostas_paradas.map((p) => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium whitespace-nowrap">
                        <Link to="/propostas/$id" params={{ id: p.id }} className="underline">
                          {p.number}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{p.cliente ?? "—"}</td>
                      <td className="px-3 py-2">{p.dono ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{p.dias}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">{formatBRL(p.valor)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Leads sem 1º contato */}
          <div className="rounded-lg border bg-card overflow-x-auto">
            <div className="px-3 py-2 border-b text-sm font-medium">
              Leads abertos sem 1º contato há mais de 24h
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr className="border-b">
                  <th className="px-3 py-2 font-medium">Lead</th>
                  <th className="px-3 py-2 font-medium">Dono</th>
                  <th className="px-3 py-2 font-medium text-right">Horas</th>
                </tr>
              </thead>
              <tbody>
                {d.leads_sem_contato.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                      Todo lead do período já teve um primeiro contato.
                    </td>
                  </tr>
                ) : (
                  d.leads_sem_contato.map((l) => (
                    <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <Link to="/leads" search={{ lead: l.id }} className="underline">
                          {l.company}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{l.dono ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{l.horas}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
