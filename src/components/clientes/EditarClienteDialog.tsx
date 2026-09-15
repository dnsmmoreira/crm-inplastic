import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { friendlyClienteError } from "@/lib/clientes";
import {
  getCliente,
  updateCliente,
  listVendedores,
  type ClienteRow,
} from "@/lib/clientes.functions";
import { ClienteFormFields, fromRow, type ClienteFormState } from "./ClienteFormFields";
import { useAuth } from "@/hooks/use-auth";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clienteId: string | null;
  onSaved?: (c: ClienteRow) => void;
};

export function EditarClienteDialog({ open, onOpenChange, clienteId, onSaved }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const getFn = useServerFn(getCliente);
  const updateFn = useServerFn(updateCliente);
  const listVendedoresFn = useServerFn(listVendedores);

  const [form, setForm] = useState<ClienteFormState | null>(null);
  const [saving, setSaving] = useState(false);

  const clienteQ = useQuery({
    queryKey: ["cliente", clienteId],
    queryFn: () => getFn({ data: { id: clienteId as string } }),
    enabled: open && !!clienteId,
  });

  const vendedoresQ = useQuery({
    queryKey: ["vendedores"],
    queryFn: () => listVendedoresFn(),
    enabled: !!isAdmin && open,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (open && clienteQ.data) setForm(fromRow(clienteQ.data));
    if (!open) setForm(null);
  }, [open, clienteQ.data]);

  const isOwner = !!(clienteQ.data && user && clienteQ.data.vendedor_id === user.id);
  const canEdit = !!(isAdmin || isOwner);

  const handleSave = async () => {
    if (!form || !clienteId) return;
    setSaving(true);
    try {
      const updated = await updateFn({
        data: {
          id: clienteId,
          patch: {
            razao_social: form.razao_social,
            nome_fantasia: form.nome_fantasia,
            inscricao_estadual: form.inscricao_estadual,
            ie_isento: form.ie_isento,
            endereco: form.endereco,
            numero: form.numero,
            complemento: form.complemento,
            bairro: form.bairro,
            cep: form.cep,
            cidade: form.cidade,
            estado: form.estado,
            contato: form.contato,
            email: form.email,
            telefone: form.telefone,
            telefone2: form.telefone2,
            website: form.website,
            observacao: form.observacao,
            empresa_padrao: form.empresa_padrao,
            ativo: form.ativo,
            condicao_pagamento_padrao_id: form.condicao_pagamento_padrao_id ?? null,
            email_nf: form.email_nf ?? null,
            regras_faturamento: form.regras_faturamento ?? null,
            aceite_desconto_duplicata: !!form.aceite_desconto_duplicata,
            simples_optante: form.simples_optante ?? null,
            suframa_isento: form.suframa_isento ?? null,
            suframa_numero: form.suframa_numero ?? null,
          },
        },
      });
      toast.success("Cliente atualizado");
      onSaved?.(updated);
      onOpenChange(false);
    } catch (e) {
      toast.error(friendlyClienteError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar cliente</DialogTitle>
        </DialogHeader>

        {clienteQ.isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <Loader2 className="inline h-4 w-4 animate-spin mr-2" /> Carregando...
          </div>
        ) : !clienteQ.data ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Cliente não encontrado ou você não tem acesso.
          </div>
        ) : (
          form && (
            <ClienteFormFields
              value={form}
              onChange={(p) => setForm((f) => (f ? { ...f, ...p } : f))}
              cnpjDisabled
              readOnly={!canEdit}
              isAdmin={isAdmin}
              vendedores={vendedoresQ.data ?? []}
            />
          )
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          {canEdit && form && (
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar alterações
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
