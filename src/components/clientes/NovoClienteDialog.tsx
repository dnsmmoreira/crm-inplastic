import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { isValidCnpj, onlyDigitsCnpj, friendlyCnpjError } from "@/lib/cnpj";
import { friendlyClienteError } from "@/lib/clientes";
import { lookupCnpj } from "@/lib/cnpj.functions";
import { createCliente, listVendedores, reativarCliente, type ClienteRow } from "@/lib/clientes.functions";
import { ClienteFormFields, emptyCliente, type ClienteFormState } from "./ClienteFormFields";
import { useAuth } from "@/hooks/use-auth";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cnpjInicial?: string;
  onClienteCriado?: (c: ClienteRow) => void;
};

export function NovoClienteDialog({ open, onOpenChange, cnpjInicial, onClienteCriado }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [state, setState] = useState<ClienteFormState>(() => emptyCliente(cnpjInicial ?? ""));
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [saving, setSaving] = useState(false);

  const lookupFn = useServerFn(lookupCnpj);
  const createFn = useServerFn(createCliente);
  const listVendedoresFn = useServerFn(listVendedores);

  const vendedoresQ = useQuery({
    queryKey: ["vendedores"],
    queryFn: () => listVendedoresFn(),
    enabled: !!isAdmin && open,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (open) {
      setState(emptyCliente(cnpjInicial ?? ""));
    }
  }, [open, cnpjInicial]);

  useEffect(() => {
    // Default vendedor = usuário atual
    if (open && user?.id && !state.vendedor_id) {
      setState((s) => ({ ...s, vendedor_id: user.id }));
    }
  }, [open, user?.id, state.vendedor_id]);

  const patch = (p: Partial<ClienteFormState>) => setState((s) => ({ ...s, ...p }));

  const handleLookup = async () => {
    const digits = onlyDigitsCnpj(state.cnpj);
    if (digits.length !== 14) { toast.error("Informe um CNPJ com 14 dígitos"); return; }
    if (!isValidCnpj(digits)) { toast.error("CNPJ inválido — confira os dígitos"); return; }
    setLoadingLookup(true);
    try {
      const r = await lookupFn({ data: { cnpj: digits } });
      setState((s) => ({
        ...s,
        razao_social: s.razao_social || r.razaoSocial,
        nome_fantasia: s.nome_fantasia || r.nomeFantasia,
        inscricao_estadual: s.inscricao_estadual || r.inscricaoEstadual,
        endereco: s.endereco || r.endereco.logradouro,
        numero: s.numero || r.endereco.numero,
        complemento: s.complemento || r.endereco.complemento,
        bairro: s.bairro || r.endereco.bairro,
        cep: s.cep || onlyDigitsCnpj(r.endereco.cep).slice(0, 8),
        cidade: s.cidade || r.endereco.cidade,
        estado: s.estado || r.endereco.uf,
        email: s.email || r.email,
        telefone: s.telefone || r.telefone,
      }));
      toast.success("Dados carregados da Receita");
    } catch (e) {
      const raw = e instanceof Error ? e.message : "";
      if (/não encontrado/i.test(raw)) toast.error("CNPJ não encontrado na Receita. Preencha manualmente.");
      else toast.error(friendlyCnpjError(e));
    } finally {
      setLoadingLookup(false);
    }
  };

  const reativarFn = useServerFn(reativarCliente);

  const doReativar = async (id: string) => {
    try {
      const cli = await reativarFn({ data: { id } });
      toast.success("Cliente reativado");
      onClienteCriado?.(cli);
      onOpenChange(false);
    } catch (e) {
      toast.error(friendlyClienteError(e));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await createFn({ data: {
        cnpj: state.cnpj,
        razao_social: state.razao_social,
        nome_fantasia: state.nome_fantasia,
        inscricao_estadual: state.inscricao_estadual,
        ie_isento: state.ie_isento,
        endereco: state.endereco,
        numero: state.numero,
        complemento: state.complemento,
        bairro: state.bairro,
        cep: state.cep,
        cidade: state.cidade,
        estado: state.estado,
        contato: state.contato,
        email: state.email,
        telefone: state.telefone,
        telefone2: state.telefone2,
        website: state.website,
        observacao: state.observacao,
        empresa_padrao: state.empresa_padrao,
        vendedor_id: isAdmin ? state.vendedor_id : undefined,
      } });

      if (res.ok) {
        toast.success("Cliente cadastrado");
        onClienteCriado?.(res.cliente);
        onOpenChange(false);
        return;
      }

      if (res.podeReativar && res.clienteId) {
        const clienteId = res.clienteId;
        toast(res.message, {
          action: {
            label: "Reativar",
            onClick: () => { void doReativar(clienteId); },
          },
          duration: 8000,
        });
      } else {
        toast.error(res.message);
      }
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
          <DialogTitle>Novo cliente</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 pb-2">
          <Button type="button" variant="outline" onClick={handleLookup} disabled={loadingLookup} className="gap-2">
            {loadingLookup ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Buscar dados na Receita
          </Button>
          <span className="text-xs text-muted-foreground self-center">
            Digite o CNPJ e clique para auto-preencher.
          </span>
        </div>

        <ClienteFormFields
          value={state}
          onChange={patch}
          cnpjDisabled={!!cnpjInicial}
          isAdmin={isAdmin}
          vendedores={vendedoresQ.data ?? []}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar cliente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
