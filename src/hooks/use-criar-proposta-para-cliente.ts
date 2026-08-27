/**
 * Criação de proposta a partir de um cliente já conhecido.
 *
 * Reaproveita o lead existente vinculado ao cliente; se não houver, cria um
 * lead novo e vincula. Depois cria a proposta e navega pra tela de edição.
 * Mesmo padrão de `use-duplicar-proposta`.
 */
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { vincularClienteAoLead } from "@/lib/clientes.functions";
import { persistLeadNow } from "@/lib/crm-sync";
import { useCrm, useVisibleLeads } from "@/lib/crm-store";

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

export function useCriarPropostaParaCliente() {
  const navigate = useNavigate();
  const leads = useVisibleLeads();
  const addLead = useCrm((s) => s.addLead);
  const createProposal = useCrm((s) => s.createProposal);
  const vincularFn = useServerFn(vincularClienteAoLead);
  const [criando, setCriando] = useState(false);

  const criarPropostaDoLead = async (leadId: string, opts?: { onSuccess?: () => void }) => {
    setCriando(true);
    try {
      const propId = await createProposal(leadId);
      toast.success("Proposta criada — adicione os itens");
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
      const existente = leads.find((l) => l.clienteId === c.id);
      let leadId: string;
      if (existente) {
        leadId = existente.id;
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

  return { criando, setCriando, criarPropostaDoLead, criarPropostaParaCliente };
}
