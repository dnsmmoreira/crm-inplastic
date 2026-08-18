import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Info, Plus } from "lucide-react";

import { getArenaKelly, listArenaLicitacoes, saveArenaLicitacao } from "@/lib/arena.functions";
import { ARENA_LICITACAO_SITUACOES, formatBRLCompact, pct } from "@/lib/arena";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Kelly = Awaited<ReturnType<typeof getArenaKelly>>;
type Licitacao = Record<string, unknown>;

const emptyLic = {
  orgao: "",
  objeto: "",
  modalidade: "",
  numero: "",
  situacao: "identificada",
  valorEstimado: "0",
  valorProposto: "0",
  valorHomologado: "0",
  valorEmpenhado: "0",
  valorRecebido: "0",
  dataIdentificacao: "",
  dataPregao: "",
  dataHomologacao: "",
  observacao: "",
};

export function ArenaKellyPanel() {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getUTCFullYear());
  const [mes, setMes] = useState(hoje.getUTCMonth() + 1);
  const [k, setK] = useState<Kelly>(null);
  const [lics, setLics] = useState<Licitacao[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyLic);
  const [carregado, setCarregado] = useState(false);

  const loadKelly = useServerFn(getArenaKelly);
  const loadLics = useServerFn(listArenaLicitacoes);
  const salvar = useServerFn(saveArenaLicitacao);

  const recarregar = useCallback(async () => {
    try {
      const kk = await loadKelly({ data: { ano, mes } });
      setK(kk);
      const ll = kk ? await loadLics({ data: { userId: kk.userId } }) : [];
      setLics(ll as Licitacao[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar o canal representante");
    } finally {
      setCarregado(true);
    }
  }, [ano, mes, loadKelly, loadLics]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  if (!carregado) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  if (!k) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        Nenhum vendedor marcado como <strong className="mx-1">representante</strong> na aba ARENA do cadastro de
        usuários. Defina o tipo comercial para habilitar o regime de dois bolsos.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Badge variant="outline" className="h-9 px-3 text-sm">{k.nome}</Badge>
        <div className="space-y-1">
          <Label htmlFor="kl-ano">Ano</Label>
          <Input id="kl-ano" type="number" className="w-28" value={String(ano)} onChange={(e) => setAno(Number(e.target.value) || ano)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="kl-mes">Mês</Label>
          <Input id="kl-mes" type="number" min={1} max={12} className="w-20" value={String(mes)} onChange={(e) => setMes(Math.min(12, Math.max(1, Number(e.target.value) || 1)))} />
        </div>
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => { setForm(emptyLic); setOpen(true); }}>
          <Plus className="mr-1 h-4 w-4" /> Nova licitação
        </Button>
      </div>

      {k.avisoBasesDiferentes && (
        <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700">
          BASES DE CÁLCULO DIFERENTES — canal representante em “{k.bolso1.baseCalculo}”, demais em “{k.baseCalculoDefault}”.
          Os números abaixo não são comparáveis diretamente com o placar interno.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Bolso 1 · Canal representante (Logiscal)</CardTitle>
            <p className="text-xs text-muted-foreground">Referência interna de gestão — não é meta pública de placar.</p>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {!k.bolso1.temLancamento ? (
              <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                Sem receita lançada em {String(mes).padStart(2, "0")}/{ano}. Referência do canal:{" "}
                {formatBRLCompact(k.bolso1.referencia)}/mês.
              </div>
            ) : (
              <>
                <div className="text-2xl font-semibold">
                  {k.bolso1.pctReferencia === null ? "—" : pct(k.bolso1.pctReferencia)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatBRLCompact(k.bolso1.base)} ({k.bolso1.baseCalculo}) de {formatBRLCompact(k.bolso1.referencia)}
                </p>
              </>
            )}
            <dl className="grid grid-cols-2 gap-2 pt-2 text-xs">
              <div><dt className="text-muted-foreground">Faturado</dt><dd>{formatBRLCompact(k.bolso1.faturado)}</dd></div>
              <div><dt className="text-muted-foreground">Recebido</dt><dd>{formatBRLCompact(k.bolso1.recebido)}</dd></div>
              <div><dt className="text-muted-foreground">Comissão Logiscal ({pct(k.bolso1.comissaoLogiscalPct)})</dt><dd>{formatBRLCompact(k.bolso1.comissaoLogiscalValor)}</dd></div>
              <div><dt className="text-muted-foreground">Comissão individual ({pct(k.bolso1.comissaoKellyPct)})</dt><dd>{formatBRLCompact(k.bolso1.comissaoKellyValor)}</dd></div>
              <div className="col-span-2"><dt className="text-muted-foreground">Custo incremental do canal</dt><dd>{formatBRLCompact(k.bolso1.custoIncremental)}</dd></div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Bolso 2 · Licitações (funil próprio)</CardTitle>
            <p className="text-xs text-muted-foreground">Ciclo longo — avaliado por etapa, não por meta mensal.</p>
          </CardHeader>
          <CardContent>
            {k.bolso2.total === 0 ? (
              <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                Nenhuma licitação cadastrada.
              </div>
            ) : (
              <dl className="grid grid-cols-2 gap-2 text-xs">
                <div><dt className="text-muted-foreground">Identificadas</dt><dd className="text-base font-semibold">{k.bolso2.identificadas}</dd></div>
                <div><dt className="text-muted-foreground">Habilitações</dt><dd className="text-base font-semibold">{k.bolso2.habilitacoes}</dd></div>
                <div><dt className="text-muted-foreground">Propostas</dt><dd className="text-base font-semibold">{k.bolso2.propostas}</dd></div>
                <div><dt className="text-muted-foreground">Pregões</dt><dd className="text-base font-semibold">{k.bolso2.pregoes}</dd></div>
                <div><dt className="text-muted-foreground">Vitórias</dt><dd className="text-base font-semibold">{k.bolso2.vitorias}</dd></div>
                <div><dt className="text-muted-foreground">Empenhos</dt><dd className="text-base font-semibold">{k.bolso2.empenhos}</dd></div>
                <div><dt className="text-muted-foreground">Taxa de sucesso</dt><dd>{k.bolso2.taxaSucesso === null ? "—" : pct(k.bolso2.taxaSucesso)}</dd></div>
                <div><dt className="text-muted-foreground">Ciclo médio</dt><dd>{k.bolso2.cicloMedioDias === null ? "—" : `${Math.round(k.bolso2.cicloMedioDias)} dias`}</dd></div>
                <div><dt className="text-muted-foreground">Pipeline</dt><dd>{formatBRLCompact(k.bolso2.pipeline)}</dd></div>
                <div><dt className="text-muted-foreground">Receita futura contratada</dt><dd>{formatBRLCompact(k.bolso2.valorFuturo)}</dd></div>
                <div><dt className="text-muted-foreground">Empenhado</dt><dd>{formatBRLCompact(k.bolso2.valorEmpenhado)}</dd></div>
                <div><dt className="text-muted-foreground">Recebido</dt><dd>{formatBRLCompact(k.bolso2.valorRecebido)}</dd></div>
              </dl>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Licitações</CardTitle></CardHeader>
        <CardContent>
          {lics.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma licitação cadastrada.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Órgão</TableHead>
                  <TableHead>Objeto</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Estimado</TableHead>
                  <TableHead className="text-right">Empenhado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lics.map((l) => (
                  <TableRow key={String(l["id"])}>
                    <TableCell>{String(l["orgao"])}</TableCell>
                    <TableCell className="max-w-[280px] truncate">{String(l["objeto"] ?? "")}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {ARENA_LICITACAO_SITUACOES.find((s) => s.id === l["situacao"])?.label ?? String(l["situacao"])}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatBRLCompact(Number(l["valor_estimado"]))}</TableCell>
                    <TableCell className="text-right">{formatBRLCompact(Number(l["valor_empenhado"]))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova licitação</DialogTitle></DialogHeader>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="li-orgao">Órgão</Label>
              <Input id="li-orgao" value={form.orgao} onChange={(e) => setForm((f) => ({ ...f, orgao: e.target.value }))} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label htmlFor="li-objeto">Objeto</Label>
              <Input id="li-objeto" value={form.objeto} onChange={(e) => setForm((f) => ({ ...f, objeto: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="li-mod">Modalidade</Label>
              <Input id="li-mod" value={form.modalidade} onChange={(e) => setForm((f) => ({ ...f, modalidade: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="li-num">Número</Label>
              <Input id="li-num" value={form.numero} onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))} />
            </div>
            <div className="space-y-1 md:col-span-2">
              <Label>Situação</Label>
              <Select value={form.situacao} onValueChange={(v) => setForm((f) => ({ ...f, situacao: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ARENA_LICITACAO_SITUACOES.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {([
              ["valorEstimado", "Valor estimado"],
              ["valorProposto", "Valor proposto"],
              ["valorHomologado", "Valor homologado"],
              ["valorEmpenhado", "Valor empenhado"],
              ["valorRecebido", "Valor recebido"],
            ] as const).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`li-${key}`}>{label} (R$)</Label>
                <Input id={`li-${key}`} type="number" min={0} step="0.01" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            {([
              ["dataIdentificacao", "Identificação"],
              ["dataPregao", "Pregão"],
              ["dataHomologacao", "Homologação"],
            ] as const).map(([key, label]) => (
              <div key={key} className="space-y-1">
                <Label htmlFor={`li-${key}`}>{label}</Label>
                <Input id={`li-${key}`} type="date" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={async () => {
                try {
                  await salvar({
                    data: {
                      userId: k.userId,
                      orgao: form.orgao.trim(),
                      objeto: form.objeto.trim(),
                      modalidade: form.modalidade.trim() || null,
                      numero: form.numero.trim() || null,
                      situacao: form.situacao as "identificada",
                      valorEstimado: Number(form.valorEstimado) || 0,
                      valorProposto: Number(form.valorProposto) || 0,
                      valorHomologado: Number(form.valorHomologado) || 0,
                      valorEmpenhado: Number(form.valorEmpenhado) || 0,
                      valorRecebido: Number(form.valorRecebido) || 0,
                      dataIdentificacao: form.dataIdentificacao || null,
                      dataPregao: form.dataPregao || null,
                      dataHomologacao: form.dataHomologacao || null,
                      observacao: form.observacao.trim() || null,
                    },
                  });
                  toast.success("Licitação salva");
                  setOpen(false);
                  void recarregar();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha ao salvar");
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
