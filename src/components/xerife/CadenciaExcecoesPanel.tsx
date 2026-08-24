import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, SlidersHorizontal, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CADENCIA_PEDIDO, etapasComCadencia } from "@/lib/pedidos-cadencia";
import { stageLabel } from "@/lib/pedidos-stages";
import {
  deleteCadenciaExcecao,
  getCadenciaOpcoes,
  listCadenciaExcecoes,
  saveCadenciaExcecao,
  type ExcecaoRow,
} from "@/lib/cadencia-excecoes.functions";

type Form = {
  id?: string;
  escopo: "cliente" | "familia";
  cliente_id: string;
  familia: string;
  stage: string;
  dias: string;
  escalar_diretoria: boolean;
  ativo: boolean;
  observacao: string;
};

const stages = etapasComCadencia();

const vazio = (): Form => ({
  escopo: "cliente",
  cliente_id: "",
  familia: "",
  stage: stages[0]!,
  dias: "",
  escalar_diretoria: true,
  ativo: true,
  observacao: "",
});

function parseDias(s: string): number[] {
  return Array.from(
    new Set(
      s
        .split(/[,;\s]+/)
        .map((x) => Number(x.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
        .map((n) => Math.trunc(n)),
    ),
  ).sort((a, b) => a - b);
}

export function CadenciaExcecoesPanel() {
  const listFn = useServerFn(listCadenciaExcecoes);
  const opcoesFn = useServerFn(getCadenciaOpcoes);
  const saveFn = useServerFn(saveCadenciaExcecao);
  const delFn = useServerFn(deleteCadenciaExcecao);

  const [rows, setRows] = useState<ExcecaoRow[]>([]);
  const [clientes, setClientes] = useState<{ id: string; nome: string }[]>([]);
  const [familias, setFamilias] = useState<string[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);

  async function recarregar() {
    const r = (await listFn()) as ExcecaoRow[];
    setRows(r);
  }

  useEffect(() => {
    void (async () => {
      try {
        const [r, o] = await Promise.all([listFn(), opcoesFn()]);
        setRows(r as ExcecaoRow[]);
        setClientes((o as any).clientes ?? []);
        setFamilias((o as any).familias ?? []);
      } catch (e) {
        toast.error("Falha ao carregar exceções", {
          description: e instanceof Error ? e.message : String(e),
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clienteNome = useMemo(
    () => new Map(clientes.map((c) => [c.id, c.nome])),
    [clientes],
  );

  async function salvar() {
    if (!form) return;
    setBusy(true);
    try {
      await saveFn({
        data: {
          id: form.id,
          escopo: form.escopo,
          cliente_id: form.escopo === "cliente" ? form.cliente_id || null : null,
          familia: form.escopo === "familia" ? form.familia || null : null,
          stage: form.stage,
          dias: form.dias.trim() ? parseDias(form.dias) : null,
          escalar_diretoria: form.escalar_diretoria,
          ativo: form.ativo,
          observacao: form.observacao.trim() || null,
        },
      });
      toast.success("Exceção salva");
      setForm(null);
      await recarregar();
    } catch (e) {
      toast.error("Não foi possível salvar", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  async function excluir(id: string) {
    setBusy(true);
    try {
      await delFn({ data: { id } });
      toast.success("Exceção removida");
      await recarregar();
    } catch (e) {
      toast.error("Não foi possível remover", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5 space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" />
          <h3 className="font-medium">Exceções de cadência (cliente / tipo de produto)</h3>
        </div>
        {!form && (
          <Button size="sm" onClick={() => setForm(vazio())}>
            <Plus className="h-3.5 w-3.5 mr-1.5" /> Nova exceção
          </Button>
        )}
      </header>

      <p className="text-xs text-muted-foreground">
        A régua padrão por etapa continua valendo para todo mundo. Aqui você ajusta apenas as
        exceções: uma régua diferente (em dias) e o escalonamento à diretoria, para um cliente
        específico ou para uma família (tipo) de produto. Precedência: cliente vence família.
      </p>

      <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Padrão atual: </span>
        {stages
          .map((s) => `${stageLabel(s)} ${CADENCIA_PEDIDO[s]!.dias.join("/")}d`)
          .join(" · ")}
      </div>

      {form && (
        <div className="rounded-lg border p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Escopo</Label>
              <Select
                value={form.escopo}
                onValueChange={(v) =>
                  setForm({ ...form, escopo: v as Form["escopo"], cliente_id: "", familia: "" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cliente">Cliente</SelectItem>
                  <SelectItem value="familia">Tipo de produto (família)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.escopo === "cliente" ? (
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <Select
                  value={form.cliente_id}
                  onValueChange={(v) => setForm({ ...form, cliente_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o cliente" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Tipo de produto</Label>
                <Select
                  value={form.familia}
                  onValueChange={(v) => setForm({ ...form, familia: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a família" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {familias.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Etapa do pedido</Label>
              <Select value={form.stage} onValueChange={(v) => setForm({ ...form, stage: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s} value={s}>
                      {stageLabel(s)} (padrão {CADENCIA_PEDIDO[s]!.dias.join("/")}d)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Régua em dias (ex.: 2, 5, 9)</Label>
              <Input
                value={form.dias}
                placeholder="vazio = mantém o padrão da etapa"
                onChange={(e) => setForm({ ...form, dias: e.target.value })}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch
                checked={form.escalar_diretoria}
                onCheckedChange={(v) => setForm({ ...form, escalar_diretoria: v })}
              />
              <Label className="text-sm">Escalar à diretoria no último toque</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.ativo}
                onCheckedChange={(v) => setForm({ ...form, ativo: v })}
              />
              <Label className="text-sm">Exceção ativa</Label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Observação (por que existe esta exceção)</Label>
            <Input
              value={form.observacao}
              onChange={(e) => setForm({ ...form, observacao: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setForm(null)} disabled={busy}>
              <X className="h-3.5 w-3.5 mr-1.5" /> Cancelar
            </Button>
            <Button size="sm" onClick={salvar} disabled={busy}>
              {busy ? "Salvando..." : "Salvar exceção"}
            </Button>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Nenhuma exceção cadastrada — todo mundo segue a régua padrão.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((r) => (
            <li key={r.id} className="p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-[10px]">
                    {r.escopo === "cliente" ? "Cliente" : "Tipo de produto"}
                  </Badge>
                  <span className="text-sm font-medium">
                    {r.escopo === "cliente"
                      ? (r.cliente_nome ?? clienteNome.get(r.cliente_id ?? "") ?? "—")
                      : r.familia}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {stageLabel(r.stage)}
                  </Badge>
                  {!r.ativo && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      inativa
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Régua:{" "}
                  {r.dias && r.dias.length
                    ? `${r.dias.join("/")} dias`
                    : `padrão (${CADENCIA_PEDIDO[r.stage]?.dias.join("/") ?? "—"} dias)`}{" "}
                  · Diretoria: {r.escalar_diretoria ? "sim" : "não"}
                  {r.observacao ? ` · ${r.observacao}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setForm({
                      id: r.id,
                      escopo: r.escopo,
                      cliente_id: r.cliente_id ?? "",
                      familia: r.familia ?? "",
                      stage: r.stage,
                      dias: r.dias?.join(", ") ?? "",
                      escalar_diretoria: r.escalar_diretoria,
                      ativo: r.ativo,
                      observacao: r.observacao ?? "",
                    })
                  }
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void excluir(r.id)}
                  disabled={busy}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
