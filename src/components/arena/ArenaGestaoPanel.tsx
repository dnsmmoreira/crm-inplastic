import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, GraduationCap, Info, Plus } from "lucide-react";

import {
  getArenaGestao,
  listArenaLancamentos,
  saveArenaCusto,
  saveArenaReceita,
  deleteArenaCusto,
  type ArenaGestao,
} from "@/lib/arena.functions";
import { ARENA_CATEGORIAS_CUSTO, faseRampaLabel, formatBRLCompact, pct } from "@/lib/arena";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Lanc = { custos: Array<Record<string, unknown>>; receitas: Array<Record<string, unknown>> };

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function ArenaGestaoPanel() {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getUTCFullYear());
  const [mes, setMes] = useState(hoje.getUTCMonth() + 1);
  const [g, setG] = useState<ArenaGestao | null>(null);
  const [lanc, setLanc] = useState<Lanc>({ custos: [], receitas: [] });

  const loadGestao = useServerFn(getArenaGestao);
  const loadLanc = useServerFn(listArenaLancamentos);
  const salvarCusto = useServerFn(saveArenaCusto);
  const salvarReceita = useServerFn(saveArenaReceita);
  const excluirCusto = useServerFn(deleteArenaCusto);

  const [custoOpen, setCustoOpen] = useState(false);
  const [receitaOpen, setReceitaOpen] = useState(false);
  const [cForm, setCForm] = useState({ canal: "interno", categoria: "salario", valor: "0", formacao: false, observacao: "" });
  const [rForm, setRForm] = useState({ canal: "interno", faturado: "0", recebido: "0" });

  const recarregar = useCallback(async () => {
    try {
      const [gg, ll] = await Promise.all([
        loadGestao({ data: { ano, mes } }),
        loadLanc({ data: { ano, mes } }),
      ]);
      setG(gg as ArenaGestao);
      setLanc(ll as unknown as Lanc);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar a gestão");
    }
  }, [ano, mes, loadGestao, loadLanc]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  if (!g) return <p className="text-sm text-muted-foreground">Carregando indicadores…</p>;

  const semCusto = !g.temSalario;
  const semReceita = !g.temReceita;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="ag-ano">Ano</Label>
          <Input id="ag-ano" type="number" className="w-28" value={String(ano)} onChange={(e) => setAno(Number(e.target.value) || ano)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ag-mes">Mês</Label>
          <Input id="ag-mes" type="number" min={1} max={12} className="w-20" value={String(mes)} onChange={(e) => setMes(Math.min(12, Math.max(1, Number(e.target.value) || 1)))} />
        </div>
        <Badge variant="outline">Base de cálculo: {g.baseCalculo}</Badge>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setCustoOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Lançar custo
          </Button>
          <Button size="sm" variant="outline" onClick={() => setReceitaOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Lançar receita
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {/* 1. Custo comercial interno */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Custo Comercial Interno</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {semCusto || semReceita ? (
              <Vazio>
                Sem lançamentos de {semCusto ? "custo" : "receita"} para {String(mes).padStart(2, "0")}/{ano}. Use
                “Lançar custo/receita” para calcular o % sobre o teto de {pct(g.tetoPct)}.
              </Vazio>
            ) : (
              <>
                <div className="text-2xl font-semibold">{pct(g.custoInternoPct ?? 0)}</div>
                <p className="text-xs text-muted-foreground">
                  {formatBRLCompact(g.custoInterno)} sobre {formatBRLCompact(g.baseCalculo === "faturado" ? g.receitaFaturada : g.receitaRecebida)} · teto {pct(g.tetoPct)}
                </p>
                {g.acimaDoTeto && (
                  <div className={`flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs ${g.acimaDoTetoPorFormacao ? "border-sky-500/50 bg-sky-500/10 text-sky-700" : "border-destructive/50 bg-destructive/10 text-destructive"}`}>
                    {g.acimaDoTetoPorFormacao ? <GraduationCap className="mt-0.5 h-3.5 w-3.5" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5" />}
                    <span>
                      {g.acimaDoTetoPorFormacao
                        ? `Acima do teto por INVESTIMENTO EM FORMAÇÃO — sem os custos de carência o índice seria ${pct(g.custoInternoPctSemFormacao ?? 0)}.`
                        : "Acima do teto por INEFICIÊNCIA — o excedente não é explicado por vendedores em carência."}
                    </span>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* 2. Custo incremental do canal */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Custo Incremental do Canal Representante</CardTitle></CardHeader>
          <CardContent>
            {g.custoIncrementalCanal === 0 ? (
              <Vazio>Nenhum custo do canal representante lançado neste mês.</Vazio>
            ) : (
              <>
                <div className="text-2xl font-semibold">{formatBRLCompact(g.custoIncrementalCanal)}</div>
                <p className="text-xs text-muted-foreground">Comissões e custos exclusivos do canal.</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* 3. Consolidado */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Custo Consolidado Econômico</CardTitle></CardHeader>
          <CardContent>
            {semCusto ? (
              <Vazio>Sem lançamentos de custo no período.</Vazio>
            ) : (
              <>
                <div className="text-2xl font-semibold">{formatBRLCompact(g.custoConsolidado)}</div>
                <p className="text-xs text-muted-foreground">Interno + canal representante.</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* 4. Margem */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Margem</CardTitle></CardHeader>
          <CardContent>
            {semCusto || semReceita ? (
              <Vazio>Margem exige custo e receita lançados no mês.</Vazio>
            ) : (
              <>
                <div className="text-2xl font-semibold">{pct(g.margemPct ?? 0)}</div>
                <p className="text-xs text-muted-foreground">{formatBRLCompact(g.margemValor ?? 0)} após custo comercial.</p>
              </>
            )}
          </CardContent>
        </Card>

        {/* 5. Custo ARENA Premiação */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Custo ARENA Premiação</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{formatBRLCompact(g.custoArenaMes)}</div>
            <p className="text-xs text-muted-foreground">no mês · {formatBRLCompact(g.custoArenaTemporada)} na temporada</p>
          </CardContent>
        </Card>

        {/* 6. Meta do time */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Meta do Time</CardTitle></CardHeader>
          <CardContent>
            {g.metaTimeValor === 0 ? (
              <Vazio>Nenhuma meta cadastrada para os participantes da ARENA.</Vazio>
            ) : semReceita ? (
              <Vazio>
                Meta do time: {formatBRLCompact(g.metaTimeValor)}. Sem receita lançada no mês — o % realizado não é
                calculado com dados inventados.
              </Vazio>
            ) : (
              <>
                <div className="text-2xl font-semibold">{pct(g.metaTimePct ?? 0)}</div>
                <p className="text-xs text-muted-foreground">
                  {formatBRLCompact(g.baseCalculo === "faturado" ? g.receitaFaturada : g.receitaRecebida)} ({g.baseCalculo}) de {formatBRLCompact(g.metaTimeValor)}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* 7. Carência */}
        <Card className="xl:col-span-3">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Carência · investimento em formação</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {g.vendedoresEmRampa.length === 0 ? (
              <Vazio>Nenhum vendedor em carência nesta data.</Vazio>
            ) : (
              <>
                <p className="text-sm">
                  <span className="text-2xl font-semibold">{g.emCarencia}</span> em rampa ·{" "}
                  custo de formação no mês: {g.custoFormacaoTotal > 0 ? formatBRLCompact(g.custoFormacaoTotal) : "não lançado"}
                </p>
                <div className="flex flex-wrap gap-2">
                  {g.vendedoresEmRampa.map((v) => (
                    <Badge key={v.userId} variant="secondary">
                      {v.nome} · {faseRampaLabel(v.faseRampa)}
                    </Badge>
                  ))}
                </div>
                {g.custoFormacaoTotal === 0 && (
                  <Vazio>
                    Marque os lançamentos de custo desses vendedores como “investimento em formação” para separar
                    ineficiência de formação no card de custo interno.
                  </Vazio>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lançamentos */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Lançamentos do período</CardTitle></CardHeader>
        <CardContent>
          {lanc.custos.length === 0 && lanc.receitas.length === 0 ? (
            <Vazio>Nenhum lançamento em {String(mes).padStart(2, "0")}/{ano}.</Vazio>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Formação</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lanc.custos.map((c) => (
                  <TableRow key={String(c["id"])}>
                    <TableCell>Custo</TableCell>
                    <TableCell>{String(c["canal"])}</TableCell>
                    <TableCell>{String(c["categoria"])}</TableCell>
                    <TableCell className="text-right">{formatBRLCompact(Number(c["valor"]))}</TableCell>
                    <TableCell>{c["formacao"] ? "Sim" : "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await excluirCusto({ data: { id: String(c["id"]) } });
                          toast.success("Lançamento excluído");
                          void recarregar();
                        }}
                      >
                        Excluir
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {lanc.receitas.map((r) => (
                  <TableRow key={String(r["id"])}>
                    <TableCell>Receita</TableCell>
                    <TableCell>{String(r["canal"])}</TableCell>
                    <TableCell>faturado / recebido</TableCell>
                    <TableCell className="text-right">
                      {formatBRLCompact(Number(r["valor_faturado"]))} / {formatBRLCompact(Number(r["valor_recebido"]))}
                    </TableCell>
                    <TableCell>—</TableCell>
                    <TableCell />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Dialog custo */}
      <Dialog open={custoOpen} onOpenChange={setCustoOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Lançar custo · {String(mes).padStart(2, "0")}/{ano}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Canal</Label>
              <Select value={cForm.canal} onValueChange={(v) => setCForm((f) => ({ ...f, canal: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="interno">Interno</SelectItem>
                  <SelectItem value="representante">Representante</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Categoria</Label>
              <Select value={cForm.categoria} onValueChange={(v) => setCForm((f) => ({ ...f, categoria: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ARENA_CATEGORIAS_CUSTO.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ac-valor">Valor (R$)</Label>
              <Input id="ac-valor" type="number" min={0} step="0.01" value={cForm.valor} onChange={(e) => setCForm((f) => ({ ...f, valor: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="text-sm">Investimento em formação (carência)</div>
              <Switch checked={cForm.formacao} onCheckedChange={(v) => setCForm((f) => ({ ...f, formacao: v }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ac-obs">Observação</Label>
              <Input id="ac-obs" value={cForm.observacao} onChange={(e) => setCForm((f) => ({ ...f, observacao: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                try {
                  await salvarCusto({
                    data: {
                      ano,
                      mes,
                      userId: null,
                      canal: cForm.canal as "interno" | "representante",
                      categoria: cForm.categoria,
                      valor: Number(cForm.valor) || 0,
                      formacao: cForm.formacao,
                      observacao: cForm.observacao.trim() || null,
                    },
                  });
                  toast.success("Custo lançado");
                  setCustoOpen(false);
                  void recarregar();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha ao lançar");
                }
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog receita */}
      <Dialog open={receitaOpen} onOpenChange={setReceitaOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Lançar receita · {String(mes).padStart(2, "0")}/{ano}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Canal</Label>
              <Select value={rForm.canal} onValueChange={(v) => setRForm((f) => ({ ...f, canal: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="interno">Interno</SelectItem>
                  <SelectItem value="representante">Representante</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="ar-fat">Faturado (R$)</Label>
                <Input id="ar-fat" type="number" min={0} step="0.01" value={rForm.faturado} onChange={(e) => setRForm((f) => ({ ...f, faturado: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ar-rec">Recebido (R$)</Label>
                <Input id="ar-rec" type="number" min={0} step="0.01" value={rForm.recebido} onChange={(e) => setRForm((f) => ({ ...f, recebido: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                try {
                  await salvarReceita({
                    data: {
                      ano,
                      mes,
                      userId: null,
                      canal: rForm.canal as "interno" | "representante",
                      valorFaturado: Number(rForm.faturado) || 0,
                      valorRecebido: Number(rForm.recebido) || 0,
                    },
                  });
                  toast.success("Receita lançada");
                  setReceitaOpen(false);
                  void recarregar();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha ao lançar");
                }
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
