import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const WEBHOOK_URL = "https://dnsmm.app.n8n.cloud/webhook/crm-omie-pedido";

const EmpresaEnum = z.enum(["INPLASTIC", "TAOPLAST", "LICITAPLAS"]);

export type OmieResult = {
  ok: boolean;
  omie_status: "enviado" | "erro" | "nao_aplicavel" | "pendente";
  omie_codigo_pedido?: number | null;
  omie_numero_pedido?: string | null;
  omie_codigo_cliente?: number | null;
  omie_erro?: string | null;
  validacao_erros?: string[];
  proposta_id?: string;
};

// Backwards-compat alias (a UI antiga usava este tipo)
export type MoverParaGanhoOmieResult = OmieResult;

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

function mapFreightPayer(fp: string | undefined | null): string {
  const map: Record<string, string> = {
    CIF: "0",
    FOB: "1",
    THIRD_PARTY: "2",
    NONE: "9",
  };
  return map[fp ?? ""] ?? "9";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

/** Retorna um wrapper "any-like" para acessar tabelas fora dos types gerados. */
function relaxSupabase(sb: unknown): LooseClient {
  return sb as LooseClient;
}

/**
 * Envia uma proposta específica para o Omie (via webhook n8n).
 *
 * Fluxo:
 * 1. Carrega proposta + lead + cliente + itens + emitter.
 * 2. Se `status` != 'pedido' ainda, seta `status='pedido'` + `order_created_at=now` (idempotente).
 * 3. Valida cliente + itens + emitter.omie_key.
 * 4. LICITAPLAS: marca `omie_status='nao_aplicavel'` e move lead p/ ganho.
 * 5. INPLASTIC/TAOPLAST: monta payload, chama webhook, persiste rastreio em propostas + leads + clientes.
 * 6. Sempre move `lead.stage='ganho'` (mesmo se Omie der erro — venda já fechada comercialmente).
 */
export const gerarPedidoOmie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { proposta_id: string; requer_aprovacao?: boolean }) =>
    z
      .object({
        proposta_id: z.string().uuid(),
        requer_aprovacao: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<OmieResult> => {
    const { supabase, userId } = context;
    const loose: LooseClient = relaxSupabase(supabase);
    const propostaId = data.proposta_id;

    // ==== 1. Carrega proposta ====
    const { data: proposta, error: propErr } = await loose
      .from("propostas")
      .select("*")
      .eq("id", propostaId)
      .maybeSingle();
    if (propErr) throw new Error(`Falha ao carregar proposta: ${propErr.message}`);
    if (!proposta) throw new Error("Proposta não encontrada");

    // Se pedido já foi enviado ao Omie com sucesso, apenas retorna (idempotente)
    if (proposta.omie_status === "enviado" && proposta.omie_codigo_pedido) {
      return {
        ok: true,
        omie_status: "enviado",
        omie_codigo_pedido: proposta.omie_codigo_pedido as number,
        omie_numero_pedido: (proposta.omie_numero_pedido as string) ?? null,
        omie_codigo_cliente: (proposta.omie_codigo_cliente as number) ?? null,
        proposta_id: propostaId,
      };
    }

    const leadId = proposta.lead_id as string;
    if (!leadId) throw new Error("Proposta sem lead vinculado.");

    // ==== 2. Se ainda não virou 'pedido', vira agora (fluxo automático). ====
    if (proposta.status !== "pedido") {
      if (data.requer_aprovacao) {
        await loose
          .from("propostas")
          .update({
            status: "aguardando_aprovacao",
            approval_requested_at: new Date().toISOString(),
            approval_reason: "Geração de pedido requer autorização do supervisor",
          })
          .eq("id", propostaId);
        return {
          ok: false,
          omie_status: "pendente",
          proposta_id: propostaId,
          validacao_erros: ["Aguardando liberação do supervisor para gerar pedido."],
        };
      }
      await loose
        .from("propostas")
        .update({
          status: "pedido",
          approved_by_user_id: userId,
          approved_at: new Date().toISOString(),
          order_created_at: new Date().toISOString(),
        })
        .eq("id", propostaId);
      proposta.status = "pedido";
      proposta.order_created_at = new Date().toISOString();
    }

    // ==== 3. Carrega dependências: lead, cliente, itens, emitter ====
    const { data: lead, error: leadErr } = await loose
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .maybeSingle();
    if (leadErr) throw new Error(`Falha ao carregar lead: ${leadErr.message}`);
    if (!lead) throw new Error("Lead vinculado à proposta não encontrado.");

    const erros: string[] = [];

    const clienteId = (lead.cliente_id as string | null) ?? null;
    if (!clienteId) {
      erros.push("Vincule um cliente ao lead desta proposta antes de gerar o pedido.");
      return { ok: false, omie_status: "pendente", validacao_erros: erros, proposta_id: propostaId };
    }

    const [{ data: cliente, error: cliErr }, { data: emitter, error: emErr }, itensResp] = await Promise.all([
      loose.from("clientes").select("*").eq("id", clienteId).maybeSingle(),
      loose.from("emitters").select("*").eq("id", proposta.emitter_id as string).maybeSingle(),
      loose
        .from("proposta_itens")
        .select("id, product_id, omie_codigo_produto, sku, description, quantity, unit_price")
        .eq("proposta_id", propostaId),
    ]);
    if (cliErr) throw new Error(`Falha ao carregar cliente: ${cliErr.message}`);
    if (emErr) throw new Error(`Falha ao carregar emitente: ${emErr.message}`);
    if (!cliente) {
      erros.push("Cliente vinculado a esta proposta não foi encontrado (ou você não tem acesso a ele).");
      return { ok: false, omie_status: "pendente", validacao_erros: erros, proposta_id: propostaId };
    }
    if (!emitter) {
      erros.push("Empresa emissora da proposta não foi encontrada. Escolha um emitente válido.");
      return { ok: false, omie_status: "pendente", validacao_erros: erros, proposta_id: propostaId };
    }

    const empresaParsed = EmpresaEnum.safeParse(emitter.omie_key);
    if (!empresaParsed.success) {
      erros.push(
        `Emissora "${(emitter.brand as string) ?? emitter.id}" não está mapeada para o Omie (falta preencher omie_key em Empresas do Grupo).`,
      );
      return { ok: false, omie_status: "pendente", validacao_erros: erros, proposta_id: propostaId };
    }
    const empresa = empresaParsed.data;

    // ==== 4. LICITAPLAS não integra ao Omie ====
    if (empresa === "LICITAPLAS") {
      await Promise.all([
        loose
          .from("propostas")
          .update({ omie_status: "nao_aplicavel", omie_erro: null })
          .eq("id", propostaId),
        loose
          .from("leads")
          .update({ stage: "ganho", empresa, omie_status: "nao_aplicavel", omie_erro: null })
          .eq("id", leadId),
      ]);
      return { ok: true, omie_status: "nao_aplicavel", proposta_id: propostaId };
    }

    // ==== 5. Validações do cliente ====
    const str = (v: unknown) => String(v ?? "").trim();
    const razaoSocial = str(cliente.razao_social);
    const cnpj = str(cliente.cnpj);
    const endereco = str(cliente.endereco);
    const bairro = str(cliente.bairro);
    const cep = str(cliente.cep);
    const cidade = str(cliente.cidade);
    const estado = str(cliente.estado);
    const telefone = str(cliente.telefone) || str(cliente.telefone2);

    const clienteRef = `Complete o cadastro do cliente "${razaoSocial || "sem nome"}" antes de gerar o pedido.`;
    if (!razaoSocial) erros.push(`${clienteRef} — razão social é obrigatória.`);
    else if (/^cliente\s/i.test(razaoSocial))
      erros.push(`${clienteRef} — razão social não pode começar com "Cliente ".`);
    if (!validarCnpj(cnpj)) erros.push(`${clienteRef} — CNPJ inválido (14 dígitos com DV correto).`);
    if (!endereco) erros.push(`${clienteRef} — endereço é obrigatório.`);
    if (!bairro) erros.push(`${clienteRef} — bairro é obrigatório.`);
    if (!cep) erros.push(`${clienteRef} — CEP é obrigatório.`);
    if (!cidade) erros.push(`${clienteRef} — cidade é obrigatória.`);
    if (!estado) erros.push(`${clienteRef} — estado é obrigatório.`);
    if (!telefone) erros.push(`${clienteRef} — telefone é obrigatório.`);

    const itensErr = (itensResp as { error: { message: string } | null }).error;
    if (itensErr) throw new Error(`Falha ao carregar itens da proposta: ${itensErr.message}`);
    const itensRaw = (itensResp as { data: Array<Record<string, unknown>> | null }).data ?? [];
    if (itensRaw.length === 0) erros.push("Adicione pelo menos 1 item à proposta antes de gerar o pedido.");
    else if (itensRaw.some((i) => Number(i.unit_price) <= 0))
      erros.push("Todos os itens precisam de valor unitário maior que zero.");

    // Fase D: itens já apontam direto pro produto Omie via proposta_itens.omie_codigo_produto.
    // Fallback: se algum item antigo ainda estiver sem omie_codigo_produto, resolve via produtos.codigo_produto_omie.
    const itensSemOmie = itensRaw.filter((i) => !i.omie_codigo_produto && i.product_id);
    const legacyMap = new Map<string, number | null>();
    if (itensSemOmie.length > 0) {
      const ids = Array.from(new Set(itensSemOmie.map((i) => i.product_id as string)));
      const { data: prodRows, error: prodErr } = await loose
        .from("produtos")
        .select("id, codigo_produto_omie")
        .in("id", ids);
      if (prodErr) throw new Error(`Falha ao carregar produtos: ${prodErr.message}`);
      (prodRows ?? []).forEach((p: Record<string, unknown>) =>
        legacyMap.set(p.id as string, (p.codigo_produto_omie as number | null) ?? null),
      );
    }

    const itensMapeados = itensRaw.map((i) => {
      const codigoOmie =
        (i.omie_codigo_produto as number | null) ??
        (i.product_id ? legacyMap.get(i.product_id as string) ?? null : null);
      if (!codigoOmie) {
        erros.push(
          `Produto "${(i.description as string) ?? i.sku ?? "?"}" não está mapeado no Omie. Remova e adicione novamente pelo catálogo Omie.`,
        );
      }
      return {
        codigo_produto: codigoOmie,
        quantidade: Number(i.quantity ?? 0),
        valor_unitario: Number(i.unit_price ?? 0),
        desconto_percentual: 0,
        desconto_valor: 0,
      };
    });

    if (erros.length > 0) {
      return { ok: false, omie_status: "pendente", validacao_erros: erros, proposta_id: propostaId };
    }

    // ==== 6. Payload + webhook ====
    const valorEstimado = itensMapeados.reduce(
      (s, i) => s + Number(i.quantidade) * Number(i.valor_unitario),
      0,
    );
    const transport = (proposta.transport ?? {}) as Record<string, unknown>;

    const token = process.env.N8N_OMIE_TOKEN;
    if (!token) {
      const msg = "N8N_OMIE_TOKEN não configurado.";
      await Promise.all([
        loose.from("propostas").update({ omie_status: "erro", omie_erro: msg }).eq("id", propostaId),
        loose.from("leads").update({ omie_status: "erro", omie_erro: msg } as never).eq("id", leadId),
      ]);
      return { ok: false, omie_status: "erro", omie_erro: msg, proposta_id: propostaId };
    }

    // Marca pendente + move lead p/ ganho já (venda fechada comercialmente)
    await Promise.all([
      loose
        .from("propostas")
        .update({ omie_status: "pendente", omie_erro: null })
        .eq("id", propostaId),
      loose
        .from("leads")
        .update({
          stage: "ganho",
          empresa,
          omie_status: "pendente",
          omie_erro: null,
        } as never)
        .eq("id", leadId),
    ]);

    const omieCodigoClienteExistente =
      empresa === "INPLASTIC"
        ? ((cliente.omie_codigo_cliente_inplastic as number | null) ?? null)
        : ((cliente.omie_codigo_cliente_taoplast as number | null) ?? null);

    const payload = {
      lead_id: leadId,
      proposta_id: propostaId,
      cliente_id: clienteId,
      empresa,
      omie_codigo_cliente: omieCodigoClienteExistente,
      razao_social: razaoSocial,
      nome_fantasia: (cliente.nome_fantasia as string) ?? null,
      cnpj: cnpj.replace(/\D/g, ""),
      inscricao_estadual: cliente.ie_isento ? "" : ((cliente.inscricao_estadual as string) ?? ""),
      ie_isento: Boolean(cliente.ie_isento ?? false),
      endereco,
      numero: (cliente.numero as string) ?? null,
      complemento: (cliente.complemento as string) ?? null,
      bairro,
      cep,
      cidade,
      estado,
      contato: (cliente.contato as string) ?? null,
      email: (cliente.email as string) ?? null,
      telefone,
      telefone2: (cliente.telefone2 as string) ?? null,
      observacao_cliente: (cliente.observacao as string) ?? null,
      vendedor: (proposta.owner_id as string) ?? null,
      valor_estimado: valorEstimado,
      codigo_parcela: "",
      data_previsao_entrega: formatarDataBR(proposta.expected_delivery_date as string | null),
      modalidade_frete: mapFreightPayer(transport.freightPayer as string | undefined),
      valor_frete: Number(transport.freightValue ?? transport.value ?? 0),
      desconto_pedido: Number(proposta.discount_percent ?? 0),
      observacoes_venda: (proposta.observations as string) ?? null,
      itens: itensMapeados,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let resp: Response;
    try {
      resp = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "content-type": "application/json", "x-crm-token": token },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await Promise.all([
        loose.from("propostas").update({ omie_status: "erro", omie_erro: msg }).eq("id", propostaId),
        loose.from("leads").update({ omie_status: "erro", omie_erro: msg } as never).eq("id", leadId),
      ]);
      return { ok: false, omie_status: "erro", omie_erro: msg, proposta_id: propostaId };
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
      const nowIso = new Date().toISOString();
      await Promise.all([
        loose
          .from("propostas")
          .update({
            omie_codigo_pedido: result.omie_codigo_pedido ?? null,
            omie_numero_pedido: result.omie_numero_pedido ?? null,
            omie_codigo_cliente: result.omie_codigo_cliente ?? null,
            omie_status: "enviado",
            omie_erro: null,
            omie_enviado_em: nowIso,
          })
          .eq("id", propostaId),
        loose
          .from("leads")
          .update({
            omie_codigo_pedido: result.omie_codigo_pedido ?? null,
            omie_numero_pedido: result.omie_numero_pedido ?? null,
            omie_codigo_cliente: result.omie_codigo_cliente ?? null,
            omie_status: "enviado",
            omie_erro: null,
            omie_enviado_em: nowIso,
          } as never)
          .eq("id", leadId),
      ]);
      if (result.omie_codigo_cliente) {
        const patch =
          empresa === "INPLASTIC"
            ? { omie_codigo_cliente_inplastic: result.omie_codigo_cliente }
            : { omie_codigo_cliente_taoplast: result.omie_codigo_cliente };
        await loose.from("clientes").update(patch).eq("id", clienteId);
      }
      return {
        ok: true,
        omie_status: "enviado",
        omie_codigo_pedido: result.omie_codigo_pedido ?? null,
        omie_numero_pedido: result.omie_numero_pedido ?? null,
        omie_codigo_cliente: result.omie_codigo_cliente ?? null,
        proposta_id: propostaId,
      };
    }

    const erro = result.erro || `HTTP ${resp.status}: ${bodyText.slice(0, 500)}`;
    await Promise.all([
      loose.from("propostas").update({ omie_status: "erro", omie_erro: erro }).eq("id", propostaId),
      loose.from("leads").update({ omie_status: "erro", omie_erro: erro } as never).eq("id", leadId),
    ]);
    return { ok: false, omie_status: "erro", omie_erro: erro, proposta_id: propostaId };
  });

/**
 * Gate do kanban: usuário arrastou o lead p/ Ganho. Só é permitido se houver
 * proposta com `status='pedido'` vinculada. Redireciona para gerarPedidoOmie.
 */
export const moverParaGanhoOmie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { lead_id: string }) =>
    z.object({ lead_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<OmieResult> => {
    const loose: LooseClient = relaxSupabase(context.supabase);
    const { data: prop, error } = await loose
      .from("propostas")
      .select("id, omie_status, omie_codigo_pedido")
      .eq("lead_id", data.lead_id)
      .eq("status", "pedido")
      .order("order_created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`Falha ao localizar proposta: ${error.message}`);
    if (!prop) {
      return {
        ok: false,
        omie_status: "pendente",
        validacao_erros: [
          "Nenhuma proposta gerada como pedido para este lead. Gere o pedido em uma proposta antes de mover para Ganho.",
        ],
      };
    }
    // Delega ao fluxo canônico (idempotente se já foi enviado).
    return gerarPedidoOmie({ data: { proposta_id: prop.id as string } });
  });

/**
 * Reenvio manual (após corrigir dados). Zera rastreio na proposta + lead e chama gerarPedidoOmie.
 */
export const reenviarPedidoOmie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { lead_id?: string; proposta_id?: string }) =>
    z.object({ lead_id: z.string().uuid().optional(), proposta_id: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<OmieResult> => {
    const loose: LooseClient = relaxSupabase(context.supabase);

    let propostaId = data.proposta_id ?? null;
    if (!propostaId && data.lead_id) {
      const { data: prop } = await loose
        .from("propostas")
        .select("id")
        .eq("lead_id", data.lead_id)
        .eq("status", "pedido")
        .order("order_created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      propostaId = (prop?.id as string | undefined) ?? null;
    }
    if (!propostaId) throw new Error("Proposta não encontrada para reenvio.");

    await loose
      .from("propostas")
      .update({
        omie_codigo_pedido: null,
        omie_numero_pedido: null,
        omie_codigo_cliente: null,
        omie_status: null,
        omie_erro: null,
        omie_enviado_em: null,
      })
      .eq("id", propostaId);

    if (data.lead_id) {
      await loose
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
    }

    return gerarPedidoOmie({ data: { proposta_id: propostaId } });
  });
