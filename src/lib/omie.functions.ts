import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const WEBHOOK_URL = "https://dnsmm.app.n8n.cloud/webhook/crm-omie-pedido";

const EmpresaEnum = z.enum(["INPLASTIC", "TAOPLAST", "LICITAPLAS"]);

export type MoverParaGanhoOmieResult = {
  ok: boolean;
  omie_status: "enviado" | "erro" | "nao_aplicavel" | "pendente";
  omie_codigo_pedido?: number | null;
  omie_numero_pedido?: string | null;
  omie_codigo_cliente?: number | null;
  omie_erro?: string | null;
  validacao_erros?: string[];
};

function validarCnpj(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const s = raw.replace(/\D/g, "");
  if (s.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(s)) return false;
  const calc = (base: string, pesos: number[]) => {
    const sum = base.split("").reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(s.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(s.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(s[12]) && d2 === Number(s[13]);
}

function formatarDataBR(d: string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return "";
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${dt.getUTCFullYear()}`;
}

/**
 * Move um lead para "ganho" respeitando as regras do Omie:
 * - LICITAPLAS: marca omie_status = 'nao_aplicavel' e não envia nada.
 * - INPLASTIC/TAOPLAST: valida cliente + itens + condições comerciais e dispara o webhook n8n.
 * A mudança de etapa e o envio são atômicos do ponto de vista do CRM: se a validação falha,
 * o lead permanece na etapa atual e o motivo volta em `validacao_erros`.
 */
export const moverParaGanhoOmie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { lead_id: string }) =>
    z.object({ lead_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<MoverParaGanhoOmieResult> => {
    const { supabase } = context;
    const leadId = data.lead_id;

    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .maybeSingle();

    if (leadErr) throw new Error(`Falha ao carregar lead: ${leadErr.message}`);
    if (!lead) throw new Error("Lead não encontrado");

    const leadAny = lead as Record<string, unknown>;
    const empresaRaw = (leadAny.empresa as string | null) ?? null;
    const empresaParsed = EmpresaEnum.safeParse(empresaRaw);
    const erros: string[] = [];

    if (!empresaParsed.success) {
      erros.push("Escolha a empresa (INPLASTIC / TAOPLAST / LICITAPLAS) antes do Ganho.");
      return { ok: false, omie_status: "pendente", validacao_erros: erros };
    }
    const empresa = empresaParsed.data;

    // Bloqueia reenvio
    if (leadAny.omie_codigo_pedido) {
      return {
        ok: true,
        omie_status: "enviado",
        omie_codigo_pedido: leadAny.omie_codigo_pedido as number,
        omie_numero_pedido: (leadAny.omie_numero_pedido as string) ?? null,
        omie_codigo_cliente: (leadAny.omie_codigo_cliente as number) ?? null,
      };
    }

    // ==== LICITAPLAS: não usa Omie ====
    if (empresa === "LICITAPLAS") {
      const { error: upErr } = await supabase
        .from("leads")
        .update({
          stage: "ganho",
          omie_status: "nao_aplicavel",
          omie_erro: null,
        } as never)
        .eq("id", leadId);
      if (upErr) throw new Error(`Falha ao mover lead: ${upErr.message}`);
      return { ok: true, omie_status: "nao_aplicavel" };
    }

    // ==== INPLASTIC / TAOPLAST: validações ====
    const razaoSocial = ((leadAny.razao_social as string | null) ?? "").trim();
    const cnpj = ((leadAny.cnpj as string | null) ?? "").trim();
    const endereco = ((leadAny.endereco as string | null) ?? "").trim();
    const bairro = ((leadAny.bairro as string | null) ?? "").trim();
    const cep = ((leadAny.cep as string | null) ?? "").trim();
    const cidade = ((leadAny.cidade as string | null) ?? "").trim();
    const estado = ((leadAny.estado as string | null) ?? "").trim();
    const telefone = (
      ((leadAny.telefone as string | null) ?? (leadAny.whatsapp as string | null) ?? "") + ""
    ).trim();

    if (!razaoSocial) erros.push("Razão social é obrigatória.");
    else if (/^cliente\s/i.test(razaoSocial))
      erros.push('Razão social não pode começar com "Cliente " (bloqueio do Omie).');
    if (!validarCnpj(cnpj)) erros.push("CNPJ inválido (14 dígitos com DV correto).");
    if (!endereco) erros.push("Endereço é obrigatório.");
    if (!bairro) erros.push("Bairro é obrigatório.");
    if (!cep) erros.push("CEP é obrigatório.");
    if (!cidade) erros.push("Cidade é obrigatória.");
    if (!estado) erros.push("Estado é obrigatório.");
    if (!telefone) erros.push("Telefone é obrigatório.");

    const { data: itens, error: itensErr } = await supabase
      .from("lead_itens" as never)
      .select("*")
      .eq("lead_id", leadId);
    if (itensErr) throw new Error(`Falha ao carregar itens: ${itensErr.message}`);
    const itensArr = (itens as unknown as Array<Record<string, unknown>>) ?? [];
    if (itensArr.length === 0) erros.push("Adicione pelo menos 1 produto ao lead.");
    else if (itensArr.some((i) => Number(i.valor_unitario) <= 0))
      erros.push("Todos os itens precisam de valor unitário maior que zero.");

    if (erros.length > 0) {
      return { ok: false, omie_status: "pendente", validacao_erros: erros };
    }

    const valorEstimado = itensArr.reduce(
      (s, i) =>
        s +
        Number(
          i.valor_total ??
            Number(i.quantidade ?? 0) * Number(i.valor_unitario ?? 0),
        ),
      0,
    );

    // Marca como pendente e move a etapa antes de disparar o webhook.
    const { error: preErr } = await supabase
      .from("leads")
      .update({
        stage: "ganho",
        omie_status: "pendente",
        omie_erro: null,
      } as never)
      .eq("id", leadId);
    if (preErr) throw new Error(`Falha ao mover lead: ${preErr.message}`);

    const token = process.env.N8N_OMIE_TOKEN;
    if (!token) {
      await supabase
        .from("leads")
        .update({ omie_status: "erro", omie_erro: "N8N_OMIE_TOKEN não configurado." } as never)
        .eq("id", leadId);
      return { ok: false, omie_status: "erro", omie_erro: "N8N_OMIE_TOKEN não configurado." };
    }

    const payload = {
      lead_id: leadId,
      empresa,
      razao_social: razaoSocial,
      nome_fantasia: (leadAny.nome_fantasia as string) ?? null,
      cnpj: cnpj.replace(/\D/g, ""),
      inscricao_estadual: (leadAny.inscricao_estadual as string) ?? null,
      endereco,
      numero: (leadAny.numero as string) ?? null,
      complemento: (leadAny.complemento as string) ?? null,
      bairro,
      cep,
      cidade,
      estado,
      contato:
        (leadAny.nome_contato as string) ??
        (leadAny.contact_name as string) ??
        (leadAny.name as string) ??
        null,
      email: (leadAny.email as string) ?? null,
      telefone,
      telefone2: (leadAny.telefone2 as string) ?? null,
      observacao_cliente: (leadAny.observacao_cliente as string) ?? null,
      vendedor: (leadAny.owner_id as string) ?? null,
      valor_estimado: valorEstimado,
      codigo_parcela: (leadAny.codigo_parcela as string) ?? null,
      data_previsao_entrega: formatarDataBR(leadAny.data_previsao_entrega as string),
      modalidade_frete: (leadAny.modalidade_frete as string) ?? null,
      valor_frete: Number(leadAny.valor_frete ?? 0),
      desconto_pedido: Number(leadAny.desconto_pedido ?? 0),
      observacoes_venda: (leadAny.observacoes_venda as string) ?? null,
      itens: itensArr.map((i) => ({
        codigo_produto: Number(i.codigo_produto),
        quantidade: Number(i.quantidade),
        valor_unitario: Number(i.valor_unitario),
        desconto_percentual: Number(i.desconto_percentual ?? 0),
        desconto_valor: Number(i.desconto_valor ?? 0),
      })),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let resp: Response;
    try {
      resp = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-crm-token": token,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabase
        .from("leads")
        .update({ omie_status: "erro", omie_erro: msg } as never)
        .eq("id", leadId);
      return { ok: false, omie_status: "erro", omie_erro: msg };
    } finally {
      clearTimeout(timeout);
    }

    const bodyText = await resp.text();
    let result: {
      ok?: boolean;
      omie_codigo_pedido?: number;
      omie_numero_pedido?: string;
      omie_codigo_cliente?: number;
      erro?: string;
    } = {};
    try {
      result = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      result = { erro: bodyText || `HTTP ${resp.status}` };
    }

    if (resp.ok && result.ok) {
      await supabase
        .from("leads")
        .update({
          omie_codigo_pedido: result.omie_codigo_pedido ?? null,
          omie_numero_pedido: result.omie_numero_pedido ?? null,
          omie_codigo_cliente: result.omie_codigo_cliente ?? null,
          omie_status: "enviado",
          omie_erro: null,
          omie_enviado_em: new Date().toISOString(),
        } as never)
        .eq("id", leadId);
      return {
        ok: true,
        omie_status: "enviado",
        omie_codigo_pedido: result.omie_codigo_pedido ?? null,
        omie_numero_pedido: result.omie_numero_pedido ?? null,
        omie_codigo_cliente: result.omie_codigo_cliente ?? null,
      };
    }

    const erro = result.erro || `HTTP ${resp.status}: ${bodyText.slice(0, 500)}`;
    await supabase
      .from("leads")
      .update({ omie_status: "erro", omie_erro: erro } as never)
      .eq("id", leadId);
    return { ok: false, omie_status: "erro", omie_erro: erro };
  });

/**
 * Reenvio manual (após corrigir dados). Zera o rastreio e chama moverParaGanhoOmie novamente.
 */
export const reenviarPedidoOmie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { lead_id: string }) =>
    z.object({ lead_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({
        omie_codigo_pedido: null,
        omie_numero_pedido: null,
        omie_codigo_cliente: null,
        omie_status: null,
        omie_erro: null,
        omie_enviado_em: null,
      } as never)
      .eq("id", data.lead_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
