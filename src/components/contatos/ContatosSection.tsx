import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Mail, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listContatos,
  criarContato,
  alternarAtivoContato,
  papelLabel,
  PAPEIS_CONTATO,
} from "@/lib/contatos.functions";

type Props = {
  leadId?: string | null;
  clienteId?: string | null;
  readOnly?: boolean;
};

const emptyForm = () => ({
  nome: "",
  papel: "comprador" as string,
  cargo: "",
  telefone: "",
  email: "",
});

export function ContatosSection({ leadId, clienteId, readOnly }: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(listContatos);
  const criarFn = useServerFn(criarContato);
  const alternarFn = useServerFn(alternarAtivoContato);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const key = ["contatos", leadId ?? null, clienteId ?? null];

  const q = useQuery({
    queryKey: key,
    queryFn: () => listFn({ data: { leadId: leadId ?? null, clienteId: clienteId ?? null } }),
    enabled: !!(leadId || clienteId),
  });

  const refetch = () => qc.invalidateQueries({ queryKey: key });

  const handleSave = async () => {
    if (!form.nome.trim()) {
      toast.error("Informe o nome do contato");
      return;
    }
    setSaving(true);
    try {
      await criarFn({
        data: {
          leadId: leadId ?? null,
          clienteId: clienteId ?? null,
          nome: form.nome,
          papel: form.papel,
          cargo: form.cargo,
          telefone: form.telefone,
          email: form.email,
        },
      });
      toast.success("Contato adicionado");
      setForm(emptyForm());
      setShowForm(false);
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao adicionar contato");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string, ativo: boolean) => {
    try {
      await alternarFn({ data: { id, ativo } });
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao atualizar contato");
    }
  };

  const contatos = q.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Contatos</h3>
        {!readOnly && (
          <Button size="sm" variant="outline" onClick={() => setShowForm((s) => !s)} className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            Adicionar contato
          </Button>
        )}
      </div>

      {showForm && !readOnly && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Nome</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Nome do contato"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Papel</Label>
              <Select value={form.papel} onValueChange={(v) => setForm((f) => ({ ...f, papel: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAPEIS_CONTATO.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Cargo (opcional)</Label>
              <Input
                value={form.cargo}
                onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Telefone</Label>
              <Input
                value={form.telefone}
                onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowForm(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
              Salvar contato
            </Button>
          </div>
        </div>
      )}

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground py-4">
          <Loader2 className="inline h-4 w-4 animate-spin mr-2" />Carregando contatos...
        </div>
      ) : contatos.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4">Nenhum contato cadastrado.</div>
      ) : (
        <div className="space-y-2">
          {contatos.map((c) => (
            <div
              key={c.id}
              className={`rounded-lg border p-3 flex items-start justify-between gap-3 ${c.ativo ? "" : "opacity-60"}`}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm">{c.nome}</span>
                  <Badge variant="outline" className="text-[10px]">{papelLabel(c.papel)}</Badge>
                  {c.cargo && <span className="text-xs text-muted-foreground">{c.cargo}</span>}
                  {!c.ativo && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {c.telefone && (
                    <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{c.telefone}</span>
                  )}
                  {c.email && (
                    <span className="inline-flex items-center gap-1 break-all"><Mail className="h-3 w-3" />{c.email}</span>
                  )}
                </div>
              </div>
              {!readOnly && (
                <div className="flex items-center gap-2 shrink-0">
                  <Switch
                    checked={c.ativo}
                    onCheckedChange={(v) => void handleToggle(c.id, v)}
                    aria-label={c.ativo ? "Inativar contato" : "Ativar contato"}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
