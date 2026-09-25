/**
 * Criação de proposta a partir de um cliente já conhecido.
 *
 * Reaproveita o lead existente vinculado ao cliente; se não houver, cria um
 * lead novo e vincula. Depois cria a proposta e navega pra tela de edição.
 * Mesmo padrão de `use-duplicar-proposta`.
 *
 * Quem tem `propostas.criar_para_outros` é perguntado "em nome de quem" antes
 * de criar; os demais seguem sem nenhum clique extra. O chamador precisa
 * renderizar `dialogoEmNomeDe`.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { vincularClienteAoLead } from "@/lib/clientes.functions";
import { persistLeadNow } from "@/lib/crm-sync";
import { useCrm, useVisibleLeads } from "@/lib/crm-store";
import { useAuth } from "@/hooks/use-auth";
import { opcoesDonoProposta, type OpcoesDonoProposta } from "@/lib/propostas-dono";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Button } from "@/components/ui/button";

/** Formato mínimo aceito — compatível com `ClienteRow` e com o retorno de `getCliente`. */
export type ClienteParaProposta = {
  id: string;
  razao_social: string;
  nome_fantasia?: string | null;
  cnpj?: string | null;
  contato?: string | null;
  email?: string | null;
  telefone?: string | null;
};

type Escolha = { id: string; nome: string } | null;

export function useCriarPropostaParaCliente() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const leads = useVisibleLeads();
  const addLead = useCrm((s) => s.addLead);
  const createProposal = useCrm((s) => s.createProposal);
  const vincularFn = useServerFn(vincularClienteAoLead);
  const [criando, setCriando] = useState(false);

  // Permissão carregada uma vez (RPC tem_permissao, não has_role).
  const [podeOutros, setPodeOutros] = useState(false);
  useEffect(() => {
    if (!user?.id) return;
    let vivo = true;
    void supabase
      .rpc("tem_permissao", { _user_id: user.id, _chave: "propostas.criar_para_outros" })
      .then(({ data }) => {
        if (vivo) setPodeOutros(data === true);
      });
    return () => {
      vivo = false;
    };
  }, [user?.id]);

  const [dlg, setDlg] = useState<{ open: boolean; dados: OpcoesDonoProposta | null }>({
    open: false,
    dados: null,
  });
  const [selecionado, setSelecionado] = useState<string>("");
  const resolverRef = useRef<((e: Escolha) => void) | null>(null);

  const perguntarDono = async (): Promise<Escolha> => {
    const eu = user?.id ?? "";
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, ativo, deleted_at")
      .eq("ativo", true)
      .is("deleted_at", null);
    if (error) throw new Error("Não foi possível carregar a lista de pessoas");
    const dados = opcoesDonoProposta(data ?? [], eu);
    setSelecionado(dados.padrao);
    setDlg({ open: true, dados });
    return new Promise<Escolha>((resolve) => {
      resolverRef.current = resolve;
    });
  };

  const fecharCom = (e: Escolha) => {
    setDlg((d) => ({ ...d, open: false }));
    const r = resolverRef.current;
    resolverRef.current = null;
    r?.(e);
  };

  const criarPropostaDoLead = async (leadId: string, opts?: { onSuccess?: () => void }) => {
    let ownerId: string | undefined;
    let ownerNome: string | null = null;
    if (podeOutros) {
      let escolha: Escolha;
      try {
        escolha = await perguntarDono();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao carregar pessoas");
        return;
      }
      if (!escolha) return; // Cancelar: não cria nada.
      ownerId = escolha.id;
      if (escolha.id !== user?.id) ownerNome = escolha.nome;
    }
    setCriando(true);
    try {
      // O save do CRM é batched (debounce). Se o lead acabou de ser criado
      // localmente, a proposta (INSERT imediato com `lead_id`) violaria a FK.
      // Persistir o lead agora fecha essa corrida; para leads já salvos é um
      // upsert idempotente.
      await persistLeadNow(leadId);
      const propId = await createProposal(leadId, ownerId);

      toast.success(
        ownerNome ? `Proposta criada em nome de ${ownerNome}.` : "Proposta criada — adicione os itens",
      );
      opts?.onSuccess?.();
      await navigate({ to: "/propostas/$id", params: { id: propId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar proposta");
    } finally {
      setCriando(false);
    }
  };

  const criarPropostaParaCliente = async (
    c: ClienteParaProposta,
    opts?: { onSuccess?: () => void },
  ) => {
    try {
      // Reaproveita o lead do cliente. Se o vínculo ainda não existe, procura
      // pelo documento — é o mesmo cadastro, só sem a ligação gravada.
      const doc = (c.cnpj ?? "").replace(/\D/g, "");
      const existente =
        leads.find((l) => l.clienteId === c.id) ??
        (doc ? leads.find((l) => (l.cnpj ?? "").replace(/\D/g, "") === doc) : undefined);
      let leadId: string;
      if (existente) {
        leadId = existente.id;
        if (!existente.clienteId) {
          await vincularFn({ data: { leadId, clienteId: c.id } }).catch((err) => {
            toast.error(err instanceof Error ? err.message : "Erro ao vincular cliente ao lead");
          });
        }
      } else {
        leadId = addLead({
          company: c.razao_social,
          contactName: c.contato ?? "",
          email: c.email ?? "",
          phone: c.telefone ?? "",
          product: "",
          quantity: 0,
          estimatedValue: 0,
          stage: "novo",
          tags: [],
          source: "Cliente",
          notes: "",
          cnpj: c.cnpj ?? undefined,
          razaoSocial: c.razao_social,
          nomeFantasia: c.nome_fantasia ?? undefined,
          clienteId: c.id,
        });
        // O save do CRM é batched; a proposta é inserida na hora e referencia
        // `lead_id`. Persistimos o lead agora pra não violar a FK.
        await persistLeadNow(leadId);
        vincularFn({ data: { leadId, clienteId: c.id } }).catch((err) => {
          toast.error(err instanceof Error ? err.message : "Erro ao vincular cliente ao lead");
        });
      }
      await criarPropostaDoLead(leadId, opts);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao cadastrar cliente");
    }
  };

  const dialogoEmNomeDe = (
    <Dialog open={dlg.open} onOpenChange={(o) => !o && fecharCom(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Proposta em nome de</DialogTitle>
          <DialogDescription>
            Atendimento de representante? Escolha o nome dele. Licitação ou venda sua? Deixe o seu
            nome.
          </DialogDescription>
        </DialogHeader>
        <Select value={selecionado} onValueChange={setSelecionado}>
          <SelectTrigger>
            <SelectValue placeholder="Escolha a pessoa" />
          </SelectTrigger>
          <SelectContent>
            {(dlg.dados?.opcoes ?? []).map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="outline" onClick={() => fecharCom(null)}>
            Cancelar
          </Button>
          <Button
            disabled={!selecionado}
            onClick={() => {
              const o = dlg.dados?.opcoes.find((x) => x.id === selecionado);
              fecharCom({ id: selecionado, nome: o?.nome ?? "" });
            }}
          >
            Criar proposta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { criando, setCriando, criarPropostaDoLead, criarPropostaParaCliente, dialogoEmNomeDe };
}
