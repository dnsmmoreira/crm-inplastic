import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, Users, Shield, User as UserIcon, Loader2, UserPlus, ListOrdered, ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { createUser } from "@/lib/invites.functions";
import { listFila, addFilaMember, removeFilaMember, toggleFilaAtivo, reorderFila } from "@/lib/fila.functions";

export const Route = createFileRoute("/usuarios")({
  component: UsuariosPage,
});

type Row = {
  id: string;
  name: string;
  avatarColor: string;
  createdAt: string;
  role: AppRole;
};

function UsuariosPage() {
  const { user, loading } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: profiles, error: pErr }, { data: roles, error: rErr }] = await Promise.all([
      supabase.from("profiles").select("id, name, avatar_color, created_at").order("created_at", { ascending: true }),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (pErr) { toast.error(pErr.message); return; }
    if (rErr) { toast.error(rErr.message); return; }
    const roleByUser = new Map<string, AppRole>();
    (roles ?? []).forEach((r) => {
      const cur = roleByUser.get(r.user_id);
      if (cur === "admin") return;
      roleByUser.set(r.user_id, r.role as AppRole);
    });
    setRows(
      (profiles ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        avatarColor: p.avatar_color,
        createdAt: p.created_at,
        role: roleByUser.get(p.id) ?? "vendedor",
      })),
    );
  }, []);

  useEffect(() => { if (user?.role === "admin") void load(); }, [user, load]);

  const setRole = async (userId: string, role: AppRole) => {
    setSaving(userId);
    try {
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) throw error;
      toast.success(`Papel atualizado para ${role === "admin" ? "Administrador" : "Vendedor"}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <div className="p-8 text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!user || user.role !== "admin") {
    return (
      <div className="p-8">
        <Card className="max-w-md">
          <CardHeader className="flex flex-row items-center gap-3">
            <ShieldAlert className="h-6 w-6 text-destructive" />
            <CardTitle>Acesso restrito</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground space-y-3">
            <p>Somente administradores podem gerenciar usuários.</p>
            <Button asChild variant="outline"><Link to="/">Voltar ao Dashboard</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Users className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-xl font-semibold">Usuários</h1>
          <p className="text-sm text-muted-foreground">Gerencie quem tem acesso ao CRM e o papel de cada um.</p>
        </div>
      </div>

      <CreateUserCard onCreated={load} />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Equipe cadastrada</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!rows ? (
            <div className="p-6 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Nenhum usuário cadastrado ainda.</div>
          ) : (
            <div className="divide-y">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-4 p-4">
                  <div
                    className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
                    style={{ background: r.avatarColor }}
                  >
                    {r.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate flex items-center gap-2">
                      {r.name || "Sem nome"}
                      {r.id === user.id && <Badge variant="outline" className="text-[10px]">você</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">Cadastrado em {new Date(r.createdAt).toLocaleDateString("pt-BR")}</div>
                  </div>
                  <Badge variant={r.role === "admin" ? "default" : "secondary"} className="gap-1">
                    {r.role === "admin" ? <Shield className="h-3 w-3" /> : <UserIcon className="h-3 w-3" />}
                    {r.role === "admin" ? "Administrador" : "Vendedor"}
                  </Badge>
                  <div className="flex gap-2">
                    {r.role === "admin" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={saving === r.id || r.id === user.id}
                        onClick={() => setRole(r.id, "vendedor")}
                      >
                        {saving === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Tornar vendedor"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={saving === r.id}
                        onClick={() => setRole(r.id, "admin")}
                      >
                        {saving === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Promover a admin"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <FilaVendedoresCard vendedores={rows ?? []} />


      <div className="mt-4 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
        <p>
          <strong>Sem senha definida?</strong> Envie ao usuário o link{" "}
          <Link to="/primeiro-acesso" className="text-primary underline">/primeiro-acesso</Link>
          {" "}— ele digita o e-mail cadastrado e cria a própria senha (funciona uma única vez).
        </p>
        <p>Se você definir uma senha inicial no formulário acima, o usuário já pode entrar direto pela tela de login com esse e-mail e senha.</p>
      </div>
    </div>
  );
}


function CreateUserCard({ onCreated }: { onCreated: () => Promise<void> | void }) {
  const create = useServerFn(createUser);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("vendedor");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password && password.length < 6) {
      toast.error("Senha inicial precisa ter pelo menos 6 caracteres (ou deixe em branco).");
      return;
    }
    setBusy(true);
    try {
      const res = await create({ data: { email, name, password: password || undefined, role } });
      if (res.requiresFirstAccess) {
        toast.success(`Usuário ${email} criado`, {
          description: "Envie o link /primeiro-acesso para ele definir a senha.",
        });
      } else {
        toast.success(`Usuário ${email} criado com senha definida`);
      }
      setEmail("");
      setName("");
      setPassword("");
      setRole("vendedor");
      await onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao criar usuário");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" /> Cadastrar novo usuário
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="cu-name">Nome</Label>
            <Input id="cu-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do vendedor" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cu-email">E-mail</Label>
            <Input id="cu-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cu-password">
              Senha inicial <span className="text-muted-foreground font-normal">(opcional)</span>
            </Label>
            <Input
              id="cu-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Deixe vazio → usuário define via /primeiro-acesso"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cu-role">Papel</Label>
            <select
              id="cu-role"
              value={role}
              onChange={(e) => setRole(e.target.value as AppRole)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="vendedor">Vendedor</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button type="submit" disabled={busy} className="gap-1">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              Criar usuário
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}


type FilaRow = { user_id: string; posicao: number; ativo: boolean; name: string; avatar_color: string };

function FilaVendedoresCard({ vendedores }: { vendedores: Row[] }) {
  const list = useServerFn(listFila);
  const add = useServerFn(addFilaMember);
  const remove = useServerFn(removeFilaMember);
  const toggle = useServerFn(toggleFilaAtivo);
  const reorder = useServerFn(reorderFila);

  const [rows, setRows] = useState<FilaRow[] | null>(null);
  const [selUser, setSelUser] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await list();
      setRows(r as FilaRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar fila");
    }
  }, [list]);

  useEffect(() => { void load(); }, [load]);

  const naFila = new Set((rows ?? []).map((r) => r.user_id));
  const disponiveis = vendedores.filter((v) => !naFila.has(v.id));

  const handleAdd = async () => {
    if (!selUser) return;
    setBusy("add");
    try {
      await add({ data: { userId: selUser } });
      setSelUser("");
      await load();
      toast.success("Vendedor adicionado à fila");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    } finally { setBusy(null); }
  };

  const handleRemove = async (userId: string) => {
    setBusy(userId);
    try {
      await remove({ data: { userId } });
      await load();
      toast.success("Removido da fila");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    } finally { setBusy(null); }
  };

  const handleToggle = async (userId: string, ativo: boolean) => {
    setBusy(userId);
    try {
      await toggle({ data: { userId, ativo } });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha");
    } finally { setBusy(null); }
  };

  const move = async (idx: number, dir: -1 | 1) => {
    if (!rows) return;
    const next = idx + dir;
    if (next < 0 || next >= rows.length) return;
    const newOrder = [...rows];
    [newOrder[idx], newOrder[next]] = [newOrder[next], newOrder[idx]];
    setRows(newOrder);
    setBusy("reorder");
    try {
      await reorder({ data: { order: newOrder.map((r) => r.user_id) } });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao reordenar");
      await load();
    } finally { setBusy(null); }
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ListOrdered className="h-4 w-4 text-primary" /> Fila de distribuição (round-robin)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Ordem em que os leads qualificados serão atribuídos automaticamente. Vendedores <strong>inativos</strong> são pulados.
        </p>

        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[200px] space-y-1">
            <Label>Adicionar vendedor</Label>
            <select
              value={selUser}
              onChange={(e) => setSelUser(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="">Selecione…</option>
              {disponiveis.map((v) => (
                <option key={v.id} value={v.id}>{v.name} ({v.role})</option>
              ))}
            </select>
          </div>
          <Button onClick={handleAdd} disabled={!selUser || busy === "add"} className="gap-1">
            {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Adicionar
          </Button>
        </div>

        {!rows ? (
          <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground p-4 rounded border border-dashed text-center">
            Nenhum vendedor na fila. Adicione ao menos um para que a IA consiga qualificar leads.
          </div>
        ) : (
          <ul className="divide-y border rounded-lg">
            {rows.map((r, idx) => (
              <li key={r.user_id} className="flex items-center gap-3 p-3">
                <div className="text-xs font-mono w-6 text-muted-foreground text-center">{idx + 1}</div>
                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                  style={{ background: r.avatar_color }}
                >
                  {r.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.name}</div>
                  <div className="text-[11px] text-muted-foreground">Posição {r.posicao}</div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className={r.ativo ? "text-emerald-600" : "text-muted-foreground"}>
                    {r.ativo ? "Ativo" : "Inativo"}
                  </span>
                  <Switch
                    checked={r.ativo}
                    disabled={busy === r.user_id}
                    onCheckedChange={(v) => handleToggle(r.user_id, v)}
                  />
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" disabled={idx === 0 || busy !== null} onClick={() => move(idx, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" disabled={idx === rows.length - 1 || busy !== null} onClick={() => move(idx, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" disabled={busy === r.user_id} onClick={() => handleRemove(r.user_id)}>
                    {busy === r.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
