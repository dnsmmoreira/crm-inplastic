import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, Users, Shield, User as UserIcon, Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { createUser } from "@/lib/invites.functions";

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

      <p className="text-xs text-muted-foreground mt-4">
        Após criar o usuário acima, informe o e-mail e a senha definidos para que ele acesse o CRM.
      </p>
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
    setBusy(true);
    try {
      await create({ data: { email, name, password, role } });
      toast.success(`Usuário ${email} criado com sucesso`);
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
            <Label htmlFor="cu-password">Senha inicial</Label>
            <Input
              id="cu-password"
              type="text"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
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
