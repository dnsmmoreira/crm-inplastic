/**
 * Módulo de Licitações.
 *
 * ESCOPO: esta tela NÃO cria lead, NÃO cria proposta, NÃO cria pedido e NÃO
 * toca no pipeline/funil de vendas. Licitação tem ciclo próprio
 * (identificação → habilitação → pregão → homologação → empenho → recebimento).
 * Não acople nada do funil aqui.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Gavel, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  listLicitacoes,
  saveLicitacao,
  deleteLicitacao,
  SITUACOES_LICITACAO,
  type LicitacaoRow,
  type SituacaoLicitacao,
} from "@/lib/licitacoes.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/licitacoes")({
  head: () => ({
    meta: [
      { title: "Licitações — CRM" },
      {
        name: "description",
        content:
          "Controle de licitações públicas: identificação, habilitação, pregão, homologação, empenho e recebimento.",
      },
      { property: "og:title", content: "Licitações — CRM" },
      {
        property: "og:description",
        content:
          "Controle de licitações públicas: identificação, habilitação, pregão, homologação, empenho e recebimento.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LicitacoesPage,
});

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

const fmtDate = (d: string | null) =>
  d ? new Date(`${d}T12:00:00`).toLocaleDateString("pt-BR") : "—";

type FormState = {
  id: string | null;
  orgao: string;
  objeto: string;
  modalidade: string;
  numero: string;
  situacao: SituacaoLicitacao;
  valor_estimado: string;
  valor_proposto: string;
  valor_homologado: string;
  valor_empenhado: string;
  valor_recebido: string;
  data_identificacao: string;
  data_habilitacao: string;
  data_pregao: string;
  data_homologacao: string;
  data_empenho: string;
  observacao: string;
};

const emptyForm: FormState = {
  id: null,
  orgao: "",
  objeto: "",
  modalidade: "",
  numero: "",
  situacao: "Identificada",
  valor_estimado: "",
  valor_proposto: "",
  valor_homologado: "",
  valor_empenhado: "",
  valor_recebido: "",
  data_identificacao: "",
  data_habilitacao: "",
  data_pregao: "",
  data_homologacao: "",
  data_empenho: "",
  observacao: "",
};

function toForm(row: LicitacaoRow): FormState {
  return {
    id: row.id,
    orgao: row.orgao,
    objeto: row.objeto,
    modalidade: row.modalidade ?? "",
    numero: row.numero ?? "",
    situacao: (SITUACOES_LICITACAO as readonly string[]).includes(row.situacao)
      ? (row.situacao as SituacaoLicitacao)
      : "Identificada",
    valor_estimado: String(row.valor_estimado ?? 0),
    valor_proposto: String(row.valor_proposto ?? 0),
    valor_homologado: String(row.valor_homologado ?? 0),
    valor_empenhado: String(row.valor_empenhado ?? 0),
    valor_recebido: String(row.valor_recebido ?? 0),
    data_identificacao: row.data_identificacao ?? "",
    data_habilitacao: row.data_habilitacao ?? "",
    data_pregao: row.data_pregao ?? "",
    data_homologacao: row.data_homologacao ?? "",
    data_empenho: row.data_empenho ?? "",
    observacao: row.observacao ?? "",
  };
}

const num = (s: string) => {
  const n = Number(String(s).replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function LicitacoesPage() {
  const fetchList = useServerFn(listLicitacoes);
  const save = useServerFn(saveLicitacao);
  const remove = useServerFn(deleteLicitacao);

  const [rows, setRows] = useState<LicitacaoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [situacao, setSituacao] = useState<string>("todas");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchList({
        data: {
          situacao: situacao === "todas" ? null : situacao,
          de: de || null,
          ate: ate || null,
        },
      });
      setRows(data);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar licitações.");
    } finally {
      setLoading(false);
    }
  }, [fetchList, situacao, de, ate]);

  useEffect(() => {
    void load();
  }, [load]);

  const totais = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.qtd += 1;
        acc.estimado += Number(r.valor_estimado) || 0;
        acc.homologado += Number(r.valor_homologado) || 0;
        acc.recebido += Number(r.valor_recebido) || 0;
        return acc;
      },
      { qtd: 0, estimado: 0, homologado: 0, recebido: 0 },
    );
  }, [rows]);

  async function handleSave() {
    if (!form) return;
    if (!form.orgao.trim() || !form.objeto.trim()) {
      toast.error("Informe órgão e objeto.");
      return;
    }
    setSaving(true);
    try {
      await save({
        data: {
          id: form.id,
          values: {
            orgao: form.orgao.trim(),
            objeto: form.objeto.trim(),
            modalidade: form.modalidade.trim() || null,
            numero: form.numero.trim() || null,
            situacao: form.situacao,
            valor_estimado: num(form.valor_estimado),
            valor_proposto: num(form.valor_proposto),
            valor_homologado: num(form.valor_homologado),
            valor_empenhado: num(form.valor_empenhado),
            valor_recebido: num(form.valor_recebido),
            data_identificacao: form.data_identificacao || null,
            data_habilitacao: form.data_habilitacao || null,
            data_pregao: form.data_pregao || null,
            data_homologacao: form.data_homologacao || null,
            data_empenho: form.data_empenho || null,
            observacao: form.observacao.trim() || null,
          },
        },
      });
      toast.success(form.id ? "Licitação atualizada." : "Licitação criada.");
      setForm(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Excluir esta licitação?")) return;
    try {
      await remove({ data: { id } });
      toast.success("Licitação excluída.");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir.");
    }
  }

  const stepIndex = form ? SITUACOES_LICITACAO.indexOf(form.situacao) : -1;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Gavel className="h-6 w-6 text-primary" /> Licitações
          </h1>
          <p className="text-sm text-muted-foreground">
            Licitação não gera proposta e não passa pelo funil de vendas.
          </p>
        </div>
        <Button onClick={() => setForm({ ...emptyForm })}>
          <Plus className="h-4 w-4 mr-2" /> Nova licitação
        </Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Licitações</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{totais.qtd}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Valor estimado</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{brl(totais.estimado)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Valor homologado</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{brl(totais.homologado)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Valor recebido</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-semibold">{brl(totais.recebido)}</CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-52">
          <Label className="text-xs">Situação</Label>
          <Select value={situacao} onValueChange={setSituacao}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas</SelectItem>
              {SITUACOES_LICITACAO.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Pregão de</Label>
          <Input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Pregão até</Label>
          <Input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
        </div>
        {(situacao !== "todas" || de || ate) && (
          <Button
            variant="ghost"
            onClick={() => {
              setSituacao("todas");
              setDe("");
              setAte("");
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Órgão</TableHead>
              <TableHead>Objeto</TableHead>
              <TableHead>Modalidade</TableHead>
              <TableHead>Número</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Estimado</TableHead>
              <TableHead className="text-right">Proposto</TableHead>
              <TableHead className="text-right">Homologado</TableHead>
              <TableHead>Pregão</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!loading && erro && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-destructive py-8">
                  {erro}
                </TableCell>
              </TableRow>
            )}
            {!loading && !erro && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                  Nenhuma licitação encontrada.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              !erro &&
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.orgao}</TableCell>
                  <TableCell className="max-w-[280px] truncate" title={r.objeto}>
                    {r.objeto}
                  </TableCell>
                  <TableCell>{r.modalidade || "—"}</TableCell>
                  <TableCell>{r.numero || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{r.situacao}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{brl(Number(r.valor_estimado) || 0)}</TableCell>
                  <TableCell className="text-right">{brl(Number(r.valor_proposto) || 0)}</TableCell>
                  <TableCell className="text-right">
                    {brl(Number(r.valor_homologado) || 0)}
                  </TableCell>
                  <TableCell>{fmtDate(r.data_pregao)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setForm(toForm(r))}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => void handleDelete(r.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar licitação" : "Nova licitação"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/40 p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {SITUACOES_LICITACAO.map((s, i) => (
                    <span key={s} className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, situacao: s })}
                        className={`rounded-full px-2.5 py-1 text-xs border transition-colors ${
                          i === stepIndex
                            ? "bg-primary text-primary-foreground border-primary"
                            : i < stepIndex
                              ? "bg-primary/10 border-primary/30"
                              : "bg-background text-muted-foreground"
                        }`}
                      >
                        {s}
                      </button>
                      {i < SITUACOES_LICITACAO.length - 1 && (
                        <span className="text-muted-foreground/50">›</span>
                      )}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Licitação não gera proposta e não passa pelo funil de vendas.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Órgão</Label>
                  <Input
                    value={form.orgao}
                    onChange={(e) => setForm({ ...form, orgao: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Número</Label>
                  <Input
                    value={form.numero}
                    onChange={(e) => setForm({ ...form, numero: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Objeto</Label>
                  <Input
                    value={form.objeto}
                    onChange={(e) => setForm({ ...form, objeto: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Modalidade</Label>
                  <Input
                    value={form.modalidade}
                    onChange={(e) => setForm({ ...form, modalidade: e.target.value })}
                    placeholder="Pregão eletrônico, dispensa…"
                  />
                </div>
                <div>
                  <Label>Situação</Label>
                  <Select
                    value={form.situacao}
                    onValueChange={(v) => setForm({ ...form, situacao: v as SituacaoLicitacao })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SITUACOES_LICITACAO.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Valor estimado</Label>
                  <Input
                    inputMode="decimal"
                    value={form.valor_estimado}
                    onChange={(e) => setForm({ ...form, valor_estimado: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Valor proposto</Label>
                  <Input
                    inputMode="decimal"
                    value={form.valor_proposto}
                    onChange={(e) => setForm({ ...form, valor_proposto: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Valor homologado</Label>
                  <Input
                    inputMode="decimal"
                    value={form.valor_homologado}
                    onChange={(e) => setForm({ ...form, valor_homologado: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Valor empenhado</Label>
                  <Input
                    inputMode="decimal"
                    value={form.valor_empenhado}
                    onChange={(e) => setForm({ ...form, valor_empenhado: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Valor recebido</Label>
                  <Input
                    inputMode="decimal"
                    value={form.valor_recebido}
                    onChange={(e) => setForm({ ...form, valor_recebido: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Identificação</Label>
                  <Input
                    type="date"
                    value={form.data_identificacao}
                    onChange={(e) => setForm({ ...form, data_identificacao: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Habilitação</Label>
                  <Input
                    type="date"
                    value={form.data_habilitacao}
                    onChange={(e) => setForm({ ...form, data_habilitacao: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Pregão</Label>
                  <Input
                    type="date"
                    value={form.data_pregao}
                    onChange={(e) => setForm({ ...form, data_pregao: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Homologação</Label>
                  <Input
                    type="date"
                    value={form.data_homologacao}
                    onChange={(e) => setForm({ ...form, data_homologacao: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Empenho</Label>
                  <Input
                    type="date"
                    value={form.data_empenho}
                    onChange={(e) => setForm({ ...form, data_empenho: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <Label>Observação</Label>
                <Textarea
                  rows={3}
                  value={form.observacao}
                  onChange={(e) => setForm({ ...form, observacao: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
