import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  updateUsuario,
  encerrarSessoes,
  listAuditoriaUsuario,
  PERMISSAO_KEYS,
  type UsuarioRow,
  type PermissoesUsuario,
} from "@/lib/usuarios.functions";
import { getPerfilDoUsuario, setPerfilDoUsuario } from "@/lib/perfis.functions";
import { DefinirSenhaDialog } from "@/components/usuarios/DefinirSenhaDialog";

type PerfilOpcao = { id: string; nome: string; baseRole: "admin" | "vendedor"; ativo: boolean };

const FUSOS = [
  "America/Sao_Paulo",
  "America/Manaus",
  "America/Cuiaba",
  "America/Belem",
  "America/Fortaleza",
  "America/Rio_Branco",
  "America/Noronha",
];

const CANAIS = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "site", label: "Site" },
  { id: "indicacao", label: "Indicação" },
  { id: "telefone", label: "Telefone" },
  { id: "evento", label: "Evento" },
  { id: "outro", label: "Outro" },
];

const PERM_LABEL: Record<(typeof PERMISSAO_KEYS)[number], string> = {
  ver_todos_leads: "Ver todos os leads (não só os próprios)",
  editar_propostas: "Editar propostas",
  excluir_propostas: "Excluir propostas",
  exportar_dados: "Exportar dados",
  ver_relatorios: "Ver relatórios",
  gerenciar_usuarios: "Gerenciar usuários",
  configurar_integracoes: "Configurar integrações",
};

const AVATAR_CORES = ["#0f766e", "#2563eb", "#db2777", "#ea580c", "#7c3aed", "#0891b2", "#64748b"];

type AuditRow = {
  id: string;
  campo: string;
  anterior: string | null;
  novo: string | null;
  criadoEm: string;
  ator: string;
};

export function UsuarioEditDialog({
  usuario,
  currentUserId,
  open,
  onOpenChange,
  onSaved,
}: {
  usuario: UsuarioRow | null;
  currentUserId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => Promise<void> | void;
}) {
  const save = useServerFn(updateUsuario);
  const encerrar = useServerFn(encerrarSessoes);
  const loadAudit = useServerFn(listAuditoriaUsuario);
  const loadPerfil = useServerFn(getPerfilDoUsuario);
  const savePerfilVinculo = useServerFn(setPerfilDoUsuario);

  const isSelf = usuario?.id === currentUserId;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [cargo, setCargo] = useState("");
  const [telefone, setTelefone] = useState("");
  const [fuso, setFuso] = useState("America/Sao_Paulo");
  const [avatarColor, setAvatarColor] = useState("#64748b");
  const [role, setRole] = useState<"admin" | "vendedor">("vendedor");
  const [ativo, setAtivo] = useState(true);
  const [meta, setMeta] = useState("0");
  const [naFila, setNaFila] = useState(false);
  const [filaAtivo, setFilaAtivo] = useState(true);
  const [limite, setLimite] = useState("");
  const [canais, setCanais] = useState<string[]>([]);
  const [perms, setPerms] = useState<PermissoesUsuario | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [senhaOpen, setSenhaOpen] = useState(false);
  const [perfis, setPerfis] = useState<PerfilOpcao[]>([]);
  const [perfilId, setPerfilId] = useState<string>("");
  const [perfilInicial, setPerfilInicial] = useState<string>("");

  useEffect(() => {
    if (!usuario) return;
    setName(usuario.name);
    setEmail(usuario.email);
    setCargo(usuario.cargo ?? "");
    setTelefone(usuario.telefoneWhatsapp ?? "");
    setFuso(usuario.fusoHorario);
    setAvatarColor(usuario.avatarColor);
    setRole(usuario.role);
    setAtivo(usuario.ativo);
    setMeta(String(usuario.metaMensal ?? 0));
    setNaFila(usuario.naFila);
    setFilaAtivo(usuario.filaAtivo);
    setLimite(usuario.limiteLeads === null ? "" : String(usuario.limiteLeads));
    setCanais(usuario.canaisEntrada);
    setPerms({ ...usuario.permissoes });
    setAudit(null);
    void (async () => {
      try {
        const res = (await loadPerfil({ data: { userId: usuario.id } })) as {
          perfilId: string | null;
          perfis: PerfilOpcao[];
        };
        setPerfis(res.perfis);
        setPerfilId(res.perfilId ?? "");
        setPerfilInicial(res.perfilId ?? "");
      } catch (e) {
        console.error("getPerfilDoUsuario", e);
      }
    })();
  }, [usuario, loadPerfil]);

  const carregarAuditoria = useCallback(async () => {
    if (!usuario) return;
    try {
      const rows = await loadAudit({ data: { userId: usuario.id } });
      setAudit(rows as AuditRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar auditoria");
    }
  }, [loadAudit, usuario]);

  const emailValido = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()), [email]);

  if (!usuario || !perms) return null;

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Informe o nome."); return; }
    if (!emailValido) { toast.error("E-mail inválido."); return; }
    setBusy("save");
    try {
      await save({
        data: {
          userId: usuario.id,
          dados: {
            name: name.trim(),
            email: email.trim(),
            cargo: cargo.trim() || null,
            telefoneWhatsapp: telefone.trim() || null,
            fusoHorario: fuso,
            avatarColor,
          },
          acesso: { role, ativo },
          vendas: {
            metaMensal: Number(meta) || 0,
            naFila,
            filaAtivo,
            limiteLeads: limite.trim() === "" ? null : Math.max(0, Number(limite) || 0),
            canaisEntrada: canais,
          },
          permissoes: perms,
        },
      });
      toast.success("Usuário atualizado");
      await onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setBusy(null);
    }
  };

  const handleEncerrar = async () => {
    setBusy("sessions");
    try {
      await encerrar({ data: { userId: usuario.id } });
      toast.success("Sessões encerradas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao encerrar sessões");
    } finally { setBusy(null); }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Editar usuário
            {isSelf && <Badge variant="outline" className="text-[10px]">você</Badge>}
          </DialogTitle>
          <DialogDescription>{usuario.email}</DialogDescription>
        </DialogHeader>

        <Tabs
          defaultValue="dados"
          onValueChange={(v) => { if (v === "auditoria" && audit === null) void carregarAuditoria(); }}
        >
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="dados">Dados</TabsTrigger>
            <TabsTrigger value="acesso">Acesso</TabsTrigger>
            <TabsTrigger value="vendas">Vendas</TabsTrigger>
            <TabsTrigger value="permissoes">Permissões</TabsTrigger>
            <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
          </TabsList>

          {/* 1. Dados cadastrais */}
          <TabsContent value="dados" className="space-y-4 pt-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ue-name">Nome</Label>
                <Input id="ue-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ue-email">E-mail</Label>
                <Input
                  id="ue-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={255}
                  aria-invalid={!emailValido}
                />
                {!emailValido && <p className="text-xs text-destructive">E-mail inválido.</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="ue-tel">Telefone / WhatsApp</Label>
                <Input id="ue-tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} maxLength={30} placeholder="(11) 90000-0000" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ue-cargo">Cargo</Label>
                <Input id="ue-cargo" value={cargo} onChange={(e) => setCargo(e.target.value)} maxLength={120} placeholder="Consultor de vendas" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ue-fuso">Fuso horário</Label>
                <select
                  id="ue-fuso"
                  value={fuso}
                  onChange={(e) => setFuso(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                >
                  {FUSOS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label>Avatar (cor e iniciais)</Label>
                <div className="flex items-center gap-2">
                  <div
                    className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-semibold shrink-0"
                    style={{ background: avatarColor }}
                  >
                    {name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?"}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {AVATAR_CORES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setAvatarColor(c)}
                        aria-label={`Cor ${c}`}
                        className={`h-6 w-6 rounded-full border-2 ${avatarColor === c ? "border-foreground" : "border-transparent"}`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* 2. Acesso e segurança */}
          <TabsContent value="acesso" className="space-y-4 pt-4">
            <div className="space-y-1">
              <Label htmlFor="ue-role">Papel</Label>
              <select
                id="ue-role"
                value={role}
                onChange={(e) => setRole(e.target.value as "admin" | "vendedor")}
                disabled={isSelf}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60"
              >
                <option value="vendedor">Vendedor</option>
                <option value="admin">Administrador</option>
              </select>
              {isSelf && <p className="text-xs text-muted-foreground">Você não pode alterar o próprio papel.</p>}
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Conta ativa</div>
                <p className="text-xs text-muted-foreground">Inativo bloqueia o login sem apagar o histórico.</p>
              </div>
              <Switch checked={ativo} disabled={isSelf} onCheckedChange={setAtivo} />
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Definir senha</div>
                <p className="text-xs text-muted-foreground">
                  Define uma senha provisória; o usuário é obrigado a trocá-la no próximo login.
                </p>
              </div>
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => setSenhaOpen(true)}>
                Definir senha
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Encerrar sessões ativas</div>
                <p className="text-xs text-muted-foreground">Desconecta o usuário de todos os dispositivos.</p>
              </div>
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={handleEncerrar}>
                {busy === "sessions" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Encerrar"}
              </Button>
            </div>

            {usuario.senhaResetExigido && (
              <p className="text-xs text-amber-600">Este usuário está pendente de definir uma nova senha.</p>
            )}
          </TabsContent>

          {/* 3. Vendas */}
          <TabsContent value="vendas" className="space-y-4 pt-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="ue-meta">Meta mensal (R$)</Label>
                <Input id="ue-meta" type="number" min={0} step="100" value={meta} onChange={(e) => setMeta(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ue-limite">Limite de leads simultâneos</Label>
                <Input
                  id="ue-limite"
                  type="number"
                  min={0}
                  value={limite}
                  onChange={(e) => setLimite(e.target.value)}
                  placeholder="Vazio = sem limite"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">Participa da fila round-robin</div>
                <p className="text-xs text-muted-foreground">
                  {usuario.filaPosicao !== null ? `Posição atual: ${usuario.filaPosicao}` : "Fora da fila"}
                </p>
              </div>
              <Switch checked={naFila} onCheckedChange={setNaFila} />
            </div>

            {naFila && (
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium">Recebendo leads agora</div>
                  <p className="text-xs text-muted-foreground">Desligado, o vendedor é pulado na distribuição.</p>
                </div>
                <Switch checked={filaAtivo} onCheckedChange={setFilaAtivo} />
              </div>
            )}

            <div className="space-y-2">
              <Label>Canais de entrada permitidos</Label>
              <p className="text-xs text-muted-foreground">Nenhum selecionado = todos os canais.</p>
              <div className="flex flex-wrap gap-2">
                {CANAIS.map((c) => {
                  const on = canais.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setCanais((prev) => (on ? prev.filter((x) => x !== c.id) : [...prev, c.id]))
                      }
                      className={`rounded-full border px-3 py-1 text-xs ${on ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* 4. Permissões */}
          <TabsContent value="permissoes" className="space-y-2 pt-4">
            {PERMISSAO_KEYS.map((k) => (
              <div key={k} className="flex items-center justify-between rounded-lg border p-3">
                <div className="text-sm">{PERM_LABEL[k]}</div>
                <Switch
                  checked={perms[k]}
                  disabled={isSelf && k === "gerenciar_usuarios"}
                  onCheckedChange={(v) => setPerms((p) => (p ? { ...p, [k]: v } : p))}
                />
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-1">
              Administradores mantêm acesso total à gestão de usuários, independentemente destes ajustes.
            </p>
          </TabsContent>

          {/* 5. Auditoria */}
          <TabsContent value="auditoria" className="space-y-3 pt-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Cadastrado em</div>
                <div>{new Date(usuario.createdAt).toLocaleString("pt-BR")}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">Último acesso</div>
                <div>{usuario.ultimoAcesso ? new Date(usuario.ultimoAcesso).toLocaleString("pt-BR") : "Nunca acessou"}</div>
              </div>
            </div>
            {audit === null ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando histórico…
              </div>
            ) : audit.length === 0 ? (
              <div className="text-sm text-muted-foreground">Nenhuma alteração registrada.</div>
            ) : (
              <ul className="divide-y border rounded-lg text-sm">
                {audit.map((a) => (
                  <li key={a.id} className="p-3">
                    <div className="font-medium">{a.campo}</div>
                    <div className="text-xs text-muted-foreground">
                      {a.anterior ?? "—"} → {a.novo ?? "—"} · {a.ator} ·{" "}
                      {new Date(a.criadoEm).toLocaleString("pt-BR")}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy === "save"}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={busy !== null} className="gap-1">
            {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
      <DefinirSenhaDialog
        usuario={{ id: usuario.id, name: usuario.name, email: usuario.email }}
        open={senhaOpen}
        onOpenChange={setSenhaOpen}
        onDone={onSaved}
      />
    </>
  );
}
