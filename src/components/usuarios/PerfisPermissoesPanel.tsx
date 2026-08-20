import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Save, Shield, Trash2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listPerfis,
  listCatalogoPermissoes,
  listPerfilPermissoes,
  savePerfil,
  deletePerfil,
  setPerfilPermissoes,
  type PerfilRow,
  type PermissaoCatalogo,
} from "@/lib/perfis.functions";

const GRUPO_LABEL: Record<string, string> = {
  leads: "Leads",
  propostas: "Propostas",
  pedidos: "Pedidos",
  relatorios: "Relatórios",
  whatsapp: "WhatsApp",
  xerife: "Xerife",
  agente_ia: "Agente de IA",
  canais: "Canais",
  usuarios: "Usuários",
  metas: "Metas",
  precos: "Preços",
  clientes: "Clientes",
  estoque: "Estoque",
};

type Estado = Record<string, { ativa: boolean; valor: string }>;

export function PerfisPermissoesPanel() {
  const carregarPerfis = useServerFn(listPerfis);
  const carregarCatalogo = useServerFn(listCatalogoPermissoes);
  const carregarMatriz = useServerFn(listPerfilPermissoes);
  const gravarPerfil = useServerFn(savePerfil);
  const excluirPerfil = useServerFn(deletePerfil);
  const gravarMatriz = useServerFn(setPerfilPermissoes);

  const [perfis, setPerfis] = useState<PerfilRow[] | null>(null);
  const [catalogo, setCatalogo] = useState<PermissaoCatalogo[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<null | {
    id?: string;
    nome: string;
    descricao: string;
    papel: "Vendas" | "Operacional" | "Administrador";
    ativo: boolean;
  }>(null);

  const load = useCallback(async () => {
    try {
      const [ps, cat] = await Promise.all([carregarPerfis({}), carregarCatalogo({})]);
      setPerfis(ps as PerfilRow[]);
      setCatalogo(cat as PermissaoCatalogo[]);
      setSelecionado((atual) => atual ?? (ps as PerfilRow[])[0]?.id ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar perfis");
    }
  }, [carregarPerfis, carregarCatalogo]);

  useEffect(() => { void load(); }, [load]);

  const perfilAtual = useMemo(
    () => (perfis ?? []).find((p) => p.id === selecionado) ?? null,
    [perfis, selecionado],
  );

  const loadMatriz = useCallback(
    async (perfilId: string) => {
      try {
        const rows = await carregarMatriz({ data: { perfilId } });
        const next: Estado = {};
        for (const r of rows as Array<{ chave: string; valorNumerico: number | null }>) {
          next[r.chave] = { ativa: true, valor: r.valorNumerico === null ? "" : String(r.valorNumerico) };
        }
        setEstado(next);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao carregar permissões");
      }
    },
    [carregarMatriz],
  );

  useEffect(() => { if (selecionado) void loadMatriz(selecionado); }, [selecionado, loadMatriz]);

  const grupos = useMemo(() => {
    const map = new Map<string, PermissaoCatalogo[]>();
    for (const p of catalogo) {
      const arr = map.get(p.grupo) ?? [];
      arr.push(p);
      map.set(p.grupo, arr);
    }
    return [...map.entries()];
  }, [catalogo]);

  const readOnly = !perfilAtual || perfilAtual.protegido;

  const toggle = (chave: string, tipo: PermissaoCatalogo["tipo"]) => {
    setEstado((s) => {
      const atual = s[chave];
      if (atual?.ativa) {
        const { [chave]: _drop, ...rest } = s;
        return rest;
      }
      return { ...s, [chave]: { ativa: true, valor: tipo === "numerica" ? "0" : "" } };
    });
  };

  const salvarMatriz = async () => {
    if (!perfilAtual || perfilAtual.protegido) return;
    setBusy("matriz");
    try {
      const permissoes = Object.entries(estado)
        .filter(([, v]) => v.ativa)
        .map(([chave, v]) => {
          const tipo = catalogo.find((c) => c.chave === chave)?.tipo ?? "booleana";
          return {
            chave,
            valorNumerico: tipo === "numerica" ? (v.valor.trim() === "" ? 0 : Number(v.valor)) : null,
          };
        });
      await gravarMatriz({ data: { perfilId: perfilAtual.id, permissoes } });
      toast.success("Permissões salvas");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar permissões");
    } finally {
      setBusy(null);
    }
  };

  const salvarPerfil = async () => {
    if (!form) return;
    if (form.nome.trim().length < 2) { toast.error("Informe o nome do perfil."); return; }
    setBusy("perfil");
    try {
      const res = await gravarPerfil({
        data: {
          id: form.id,
          nome: form.nome.trim(),
          descricao: form.descricao.trim() || null,
          papel: form.papel,
          ativo: form.ativo,
        },
      });
      toast.success(form.id ? "Perfil atualizado" : "Perfil criado");
      setForm(null);
      await load();
      if (!form.id) setSelecionado((res as { id: string }).id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar perfil");
    } finally {
      setBusy(null);
    }
  };

  const remover = async (p: PerfilRow) => {
    if (!window.confirm(`Excluir o perfil "${p.nome}"?`)) return;
    setBusy(p.id);
    try {
      await excluirPerfil({ data: { perfilId: p.id } });
      toast.success("Perfil excluído");
      setSelecionado(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir perfil");
    } finally {
      setBusy(null);
    }
  };

  const alternarAtivo = async (p: PerfilRow, ativo: boolean) => {
    setBusy(p.id);
    try {
      await gravarPerfil({
        data: { id: p.id, nome: p.nome, descricao: p.descricao, papel: p.papel, ativo },
      });
      toast.success(ativo ? "Perfil ativado" : "Perfil desativado");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao alterar o perfil");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Perfis</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setForm({ nome: "", descricao: "", papel: "Vendas", ativo: true })}
          >
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {!perfis ? (
            <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : perfis.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">Nenhum perfil cadastrado.</div>
          ) : (
            <div className="divide-y">
              {perfis.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelecionado(p.id)}
                  className={`w-full text-left p-3 hover:bg-muted/50 ${selecionado === p.id ? "bg-muted" : ""}`}
                >
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{p.nome}</span>
                    <Badge variant={p.baseRole === "admin" ? "default" : "secondary"} className="text-[10px]">
                      {p.papel}
                    </Badge>
                    {!p.ativo && <Badge variant="outline" className="text-[10px]">inativo</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 truncate">
                    {p.descricao || "sem descrição"}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {p.usuarios} usuário(s) · {p.permissoes} permissão(ões)
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">
              {perfilAtual ? `Permissões — ${perfilAtual.nome}` : "Permissões"}
            </CardTitle>
            {perfilAtual && (
              <div className="flex items-center gap-2">
                {!perfilAtual.protegido && (
                  <>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      Ativo
                      <Switch
                        checked={perfilAtual.ativo}
                        disabled={busy !== null}
                        onCheckedChange={(v) => void alternarAtivo(perfilAtual, v)}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setForm({
                          id: perfilAtual.id,
                          nome: perfilAtual.nome,
                          descricao: perfilAtual.descricao ?? "",
                          papel: perfilAtual.papel,
                          ativo: perfilAtual.ativo,
                        })
                      }
                    >
                      <Pencil className="h-4 w-4 mr-1" /> Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => void remover(perfilAtual)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </>
                )}
                <Button size="sm" disabled={readOnly || busy !== null} onClick={salvarMatriz}>
                  {busy === "matriz" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <><Save className="h-4 w-4 mr-1" /> Salvar</>
                  )}
                </Button>
              </div>
            )}
          </div>
          {perfilAtual?.protegido && (
            <p className="text-xs text-amber-600">
              Perfil padrão do sistema — matriz somente leitura.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-5">
          {!perfilAtual ? (
            <p className="text-sm text-muted-foreground">Selecione um perfil ao lado.</p>
          ) : (
            grupos.map(([grupo, itens]) => (
              <div key={grupo} className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {GRUPO_LABEL[grupo] ?? grupo}
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {itens.map((perm) => {
                    const atual = estado[perm.chave];
                    return (
                      <div key={perm.chave} className="flex items-start gap-2 rounded-md border p-2">
                        <Checkbox
                          id={`perm-${perm.chave}`}
                          checked={!!atual?.ativa}
                          disabled={readOnly}
                          onCheckedChange={() => toggle(perm.chave, perm.tipo)}
                        />
                        <div className="min-w-0 flex-1">
                          <Label htmlFor={`perm-${perm.chave}`} className="text-sm font-normal">
                            {perm.rotulo}
                          </Label>
                          <div className="text-[11px] text-muted-foreground truncate">{perm.chave}</div>
                          {perm.tipo === "numerica" && atual?.ativa && (
                            <Input
                              type="number"
                              className="mt-1 h-8"
                              value={atual.valor}
                              disabled={readOnly}
                              onChange={(e) =>
                                setEstado((s) => ({
                                  ...s,
                                  [perm.chave]: { ativa: true, valor: e.target.value },
                                }))
                              }
                              placeholder="Valor"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!form} onOpenChange={(v) => { if (!v) setForm(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar perfil" : "Novo perfil"}</DialogTitle>
            <DialogDescription>
              O papel define o escopo de dados do usuário e é aplicado a quem tiver este perfil.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="pf-nome">Nome</Label>
                <Input
                  id="pf-nome"
                  value={form.nome}
                  maxLength={80}
                  onChange={(e) => setForm({ ...form, nome: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pf-desc">Descrição</Label>
                <Textarea
                  id="pf-desc"
                  value={form.descricao}
                  maxLength={300}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pf-papel">Papel</Label>
                <select
                  id="pf-papel"
                  value={form.papel}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      papel: e.target.value as "Vendas" | "Operacional" | "Administrador",
                    })
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  <option value="Vendas">Vendas</option>
                  <option value="Operacional">Operacional</option>
                  <option value="Administrador">Administrador</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  O escopo de dados é derivado do papel: Administrador → admin; Vendas e
                  Operacional → vendedor.
                </p>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="text-sm font-medium">Perfil ativo</div>
                <Switch checked={form.ativo} onCheckedChange={(v) => setForm({ ...form, ativo: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
            <Button disabled={busy !== null} onClick={salvarPerfil}>
              {busy === "perfil" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
