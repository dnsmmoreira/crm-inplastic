/**
 * Ponte entre a autenticação Supabase e o store CRM (Zustand).
 *
 * ETAPA 1 — agora hidrata a partir das tabelas relacionais reais
 * (leads, tarefas, propostas, produtos, emitters, condicoes_pagamento,
 * lead_interactions, lead_ai_actions) e replica cada mutação do store
 * de volta para o banco. RLS garante o isolamento por usuário.
 *
 * Configurações globais leves (leadTags, leadSegments, freightConfig,
 * defaultEmitterId, maxDiscountPercentVendedor) e o agent do usuário
 * continuam em `system_workspace` / `user_workspaces`.
 *
 * A camada visual (componentes/rotas) NÃO precisa mudar: o hook
 * `useCrm(...)` mantém a mesma assinatura.
 */

import { isIntentionalDelete, clearDeleteIntent, markDeleted } from "@/lib/delete-intents";
import { reportarFalhaSync } from "@/lib/sync-falhas";
import {
  planejarEventoRealtime,
  mesclarPorId,
  removerPorId,
  type ColecaoRealtime,
  type EventoRealtime,
  type TabelaRealtime,
} from "@/lib/crm-realtime";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
import { normalizarParcelas } from "@/lib/condicoes-comerciais";
import { normalizarTexto, normalizarEmail } from "@/lib/normalizacao";

import {
  useCrm,
  DEFAULT_EMITTERS,
  DEFAULT_PAYMENT_TERMS,
  DEFAULT_LEAD_TAGS,
  DEFAULT_LEAD_SEGMENTS,
  DEFAULT_FREIGHT_CONFIG,
  type Lead,
  type Task,
  type Proposal,
  type ProposalItem,
  type PaymentInstallment,
  type TransportInfo,
  type Interaction,
  type AiAction,
  type Product,
  type ProductUnit,
  type EmitterProfile,
  type PaymentTerm,
  type PaymentMethod,
  type PaymentForm,
  type AgentSettings,
  type FreightConfig,
  type LeadAddress,
  type StageId,
  type ProposalStatus,
} from "@/lib/crm-store";

type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
type TaskRow = Database["public"]["Tables"]["tarefas"]["Row"];
type TaskInsert = Database["public"]["Tables"]["tarefas"]["Insert"];
type ProductRow = Database["public"]["Tables"]["produtos"]["Row"];
type ProductInsert = Database["public"]["Tables"]["produtos"]["Insert"];
type EmitterRow = Database["public"]["Tables"]["emitters"]["Row"];
type EmitterInsert = Database["public"]["Tables"]["emitters"]["Insert"];
type PayTermRow = Database["public"]["Tables"]["condicoes_pagamento"]["Row"];
type PayTermInsert = Database["public"]["Tables"]["condicoes_pagamento"]["Insert"];
type ProposalRow = Database["public"]["Tables"]["propostas"]["Row"];
type ProposalInsert = Database["public"]["Tables"]["propostas"]["Insert"];
type PItemRow = Database["public"]["Tables"]["proposta_itens"]["Row"];
type PParcelaRow = Database["public"]["Tables"]["proposta_parcelas"]["Row"];
type InteractionRow = Database["public"]["Tables"]["lead_interactions"]["Row"];
type AiActionRow = Database["public"]["Tables"]["lead_ai_actions"]["Row"];

// ---------------- state module-level ----------------
let currentUserId: string | null = null;
let currentRole: "admin" | "vendedor" | null = null;
let hydrated = false;
let subscribed = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let realtimeChannels: Array<ReturnType<typeof supabase.channel>> = [];
let reloadTimer: ReturnType<typeof setTimeout> | null = null;
let resyncTimer: ReturnType<typeof setInterval> | null = null;
let suppressSave = false; // evita loop write→realtime→reload→write

// Snapshot da última versão persistida — usado para diff
type Snapshot = {
  products: Map<string, string>;
  emitters: Map<string, string>;
  paymentTerms: Map<string, string>;
  leads: Map<string, string>;
  tasks: Map<string, string>;
  proposals: Map<string, string>;
  proposalItems: Map<string, string>; // key = itemId
  proposalParcelas: Map<string, string>;
  interactions: Set<string>; // append-only
  aiActions: Set<string>;
  defaultEmitterId: string | null;
  systemJson: string | null;
  userJson: string | null;
};

const snapshot: Snapshot = {
  products: new Map(),
  emitters: new Map(),
  paymentTerms: new Map(),
  leads: new Map(),
  tasks: new Map(),
  proposals: new Map(),
  proposalItems: new Map(),
  proposalParcelas: new Map(),
  interactions: new Set(),
  aiActions: new Set(),
  defaultEmitterId: null,
  systemJson: null,
  userJson: null,
};

function resetSnapshot() {
  snapshot.products.clear();
  snapshot.emitters.clear();
  snapshot.paymentTerms.clear();
  snapshot.leads.clear();
  snapshot.tasks.clear();
  snapshot.proposals.clear();
  snapshot.proposalItems.clear();
  snapshot.proposalParcelas.clear();
  snapshot.interactions.clear();
  snapshot.aiActions.clear();
  snapshot.defaultEmitterId = null;
  snapshot.systemJson = null;
  snapshot.userJson = null;
}

// ============ Mappers ============

function rowToProduct(r: ProductRow): Product {
  return {
    id: r.id,
    sku: r.sku,
    name: r.name,
    description: r.description ?? "",
    unit: (r.unit as ProductUnit) ?? "Un",
    weightKg: Number(r.weight_kg ?? 0),
    heightCm: Number(r.height_cm ?? 0),
    widthCm: Number(r.width_cm ?? 0),
    lengthCm: Number(r.length_cm ?? 0),
    ncm: r.ncm ?? "",
    defaultPrice: Number(r.default_price ?? 0),
    active: !!r.active,
    pecasPorColuna: Number((r as unknown as { pecas_por_coluna?: number }).pecas_por_coluna ?? 1) || 1,
    stackHeightCm: (() => {
      const v = (r as unknown as { stack_height_cm?: number | string | null }).stack_height_cm;
      if (v === null || v === undefined || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    })(),
    family: (r as unknown as { family?: string | null }).family ?? undefined,
  };
}
function productToInsert(p: Product): ProductInsert {
  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    description: p.description ?? "",
    unit: p.unit,
    weight_kg: p.weightKg,
    height_cm: p.heightCm,
    width_cm: p.widthCm,
    length_cm: p.lengthCm,
    ncm: p.ncm ?? null,
    default_price: p.defaultPrice,
    active: p.active,
    pecas_por_coluna: p.pecasPorColuna ?? 1,
    stack_height_cm: p.stackHeightCm ?? null,
    family: p.family ?? null,
  };
}

function rowToEmitter(r: EmitterRow): EmitterProfile {
  return {
    id: r.id,
    brand: r.brand,
    tagline: r.tagline ?? undefined,
    legalName: r.legal_name,
    cnpj: r.cnpj,
    ie: r.ie ?? "",
    address: r.address ?? "",
    phone: r.phone ?? "",
    whatsapp: r.whatsapp ?? "",
    email: r.email ?? "",
    website: r.website ?? "",
    banco: (r as { banco?: string | null }).banco ?? undefined,
    agencia: (r as { agencia?: string | null }).agencia ?? undefined,
    conta: (r as { conta?: string | null }).conta ?? undefined,
    pix: (r as { pix?: string | null }).pix ?? undefined,
  };
}
function emitterToInsert(e: EmitterProfile, isDefault: boolean): EmitterInsert {
  return {
    id: e.id,
    brand: e.brand,
    tagline: e.tagline ?? null,
    legal_name: e.legalName,
    cnpj: e.cnpj,
    ie: e.ie ?? null,
    address: e.address ?? null,
    phone: e.phone ?? null,
    whatsapp: e.whatsapp ?? null,
    email: e.email ?? null,
    website: e.website ?? null,
    is_default: isDefault,
    banco: e.banco ?? null,
    agencia: e.agencia ?? null,
    conta: e.conta ?? null,
    pix: e.pix ?? null,
  } as EmitterInsert;
}

function rowToPayTerm(r: PayTermRow): PaymentTerm {
  const loose = r as unknown as {
    permite_pf?: boolean | null;
    acrescimo_percent?: number | null;
    parcelas?: unknown;
    ordem?: number | null;
  };
  const splits = Array.isArray(r.splits) ? (r.splits as number[]) : [];
  return {
    id: r.id,
    label: r.label,
    method: r.method as PaymentMethod,
    splits,
    parcelas: normalizarParcelas(loose.parcelas, splits),
    notes: r.notes ?? undefined,
    active: !!r.active,
    permitePf: !!loose.permite_pf,
    acrescimoPercent: Number(loose.acrescimo_percent ?? 0),
    ordem: Number(loose.ordem ?? 0),
  };
}
function payTermToInsert(t: PaymentTerm): PayTermInsert {
  // `parcelas` é NOT NULL no banco: nunca gravar nulo/vazio. Sem parcelas
  // informadas, cai no legado `splits` e, em último caso, em "à vista 100%".
  const derivadas = normalizarParcelas(t.parcelas, t.splits ?? []);
  const parcelas = derivadas.length > 0 ? derivadas : [{ dias: 0, percentual: 100 }];
  return {
    id: t.id,
    label: t.label,
    method: t.method,
    // `splits` é mantida em sincronia com os dias das parcelas (leitores legados).
    splits: parcelas.map((p) => p.dias) as unknown as Json,
    parcelas: parcelas as unknown as Json,
    notes: t.notes ?? null,
    active: t.active,
    permite_pf: !!t.permitePf,
    acrescimo_percent: Number(t.acrescimoPercent ?? 0),
    ordem: Number(t.ordem ?? 0),
  } as PayTermInsert;
}



export function rowToLead(
  r: LeadRow,
  interactions: Interaction[],
  aiActions: AiAction[],
): Lead {
  const endereco = (r.endereco ?? undefined) as LeadAddress | undefined;
  return {
    id: r.id,
    company: r.company,
    contactName: r.contact_name ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    product: r.product ?? "",
    productId: r.product_id ?? undefined,
    quantity: Number(r.quantity ?? 0),
    estimatedValue: Number(r.estimated_value ?? 0),
    stage: r.stage as StageId,
    tags: r.tags ?? [],
    segment: r.segment ?? undefined,
    source: r.source ?? "",
    createdAt: r.created_at,
    // Consolida os dois campos: triggers do banco (WhatsApp vendedor, tarefa
    // concluída, lead_interactions) tocam last_contact_at; mudanças de estágio
    // e edições manuais pelo frontend gravam last_contact. Usamos o mais recente
    // para que o card "sem resposta +24h" não acuse falso positivo.
    lastContact: (() => {
      const a = r.last_contact_at ? new Date(r.last_contact_at).getTime() : 0;
      const b = r.last_contact ? new Date(r.last_contact).getTime() : 0;
      const max = Math.max(a, b);
      return max > 0 ? new Date(max).toISOString() : r.created_at;
    })(),
    nextFollowUp: r.next_followup ?? undefined,
    notes: r.notes ?? "",
    interactions,
    aiActions,
    ownerId: r.owner_id ?? "",
    clienteId: (r as { cliente_id?: string | null }).cliente_id ?? null,
    cnpj: r.cnpj ?? undefined,
    razaoSocial: r.razao_social ?? undefined,
    nomeFantasia: r.nome_fantasia ?? undefined,
    inscricaoEstadual: r.inscricao_estadual ?? undefined,
    inscricaoMunicipal: r.inscricao_municipal ?? undefined,
    endereco,
    emailFinanceiro: r.email_financeiro ?? undefined,
    emailNfXml: (r as any).email_nf_xml ?? undefined,
    telefoneFixo: r.telefone_fixo ?? undefined,
    whatsapp: r.whatsapp ?? undefined,
    site: r.site ?? undefined,
    porte: r.porte ?? undefined,
    cnaePrincipal: r.cnae_principal ?? undefined,
    faturamentoEstimado: r.faturamento_estimado ?? undefined,
    numFuncionarios: r.num_funcionarios ?? undefined,
    decisorNome: r.decisor_nome ?? undefined,
    decisorCargo: r.decisor_cargo ?? undefined,
    // Cadastro fiscal complementar (CNPJá) — alimenta o score do lead
    dataAbertura: r.data_abertura ?? undefined,
    capitalSocial:
      r.capital_social !== null && r.capital_social !== undefined
        ? Number(r.capital_social)
        : undefined,
    simplesOptante: r.simples_optante ?? undefined,
    socios: (Array.isArray(r.socios) ? r.socios : undefined) as Lead["socios"],
  };
}
function normalizarEnderecoLead(e: Lead["endereco"]): Lead["endereco"] | null {
  if (!e) return null;
  const out = { ...e } as Record<string, unknown>;
  for (const k of ["logradouro", "bairro", "cidade", "complemento", "uf"]) {
    if (typeof out[k] === "string") out[k] = normalizarTexto(out[k] as string);
  }
  return out as Lead["endereco"];
}

export function leadToInsert(l: Lead): LeadInsert {
  return {
    id: l.id,
    company: normalizarTexto(l.company),
    contact_name: normalizarTexto(l.contactName),
    email: normalizarEmail(l.email) || null,
    phone: l.phone || null,
    product: l.product || null,
    product_id: l.productId ?? null,
    quantity: l.quantity ?? 0,
    estimated_value: l.estimatedValue ?? 0,
    stage: l.stage,
    tags: l.tags ?? [],
    segment: l.segment ?? null,
    source: l.source ?? "",
    created_at: l.createdAt,
    last_contact: l.lastContact ?? null,
    next_followup: l.nextFollowUp ?? null,
    notes: l.notes ?? "",
    owner_id: l.ownerId || null,
    cliente_id: l.clienteId ?? null,
    cnpj: l.cnpj ?? null,
    razao_social: l.razaoSocial ? normalizarTexto(l.razaoSocial) : null,
    nome_fantasia: l.nomeFantasia ? normalizarTexto(l.nomeFantasia) : null,
    inscricao_estadual: l.inscricaoEstadual ?? null,
    inscricao_municipal: l.inscricaoMunicipal ?? null,
    endereco: (normalizarEnderecoLead(l.endereco) ?? null) as unknown as Json,
    email_financeiro: l.emailFinanceiro ? normalizarEmail(l.emailFinanceiro) : null,
    email_nf_xml: l.emailNfXml ? normalizarEmail(l.emailNfXml) : null,
    telefone_fixo: l.telefoneFixo ?? null,
    whatsapp: l.whatsapp ?? null,
    site: l.site ?? null,
    porte: l.porte ?? null,
    cnae_principal: l.cnaePrincipal ?? null,
    faturamento_estimado: l.faturamentoEstimado ?? null,
    num_funcionarios: l.numFuncionarios ?? null,
    decisor_nome: l.decisorNome ? normalizarTexto(l.decisorNome) : null,
    decisor_cargo: l.decisorCargo ? normalizarTexto(l.decisorCargo) : null,
    data_abertura: l.dataAbertura || null,
    capital_social: l.capitalSocial ?? null,
    simples_optante: l.simplesOptante ?? null,
    socios: (l.socios?.length ? l.socios : null) as unknown as Json,
  };
}


function rowToTask(r: TaskRow): Task {
  return {
    id: r.id,
    leadId: r.lead_id ?? "",
    title: r.title,
    dueDate: r.due_date,
    done: !!r.done,
  };
}
function taskToInsert(t: Task, ownerId: string | null): TaskInsert {
  return {
    id: t.id,
    lead_id: t.leadId || null,
    title: t.title,
    due_date: t.dueDate,
    done: t.done,
    owner_id: ownerId,
  };
}

function rowToInteraction(r: InteractionRow): Interaction {
  return { id: r.id, date: r.occurred_at, type: r.type, content: r.content };
}
function rowToAiAction(r: AiActionRow): AiAction {
  return {
    id: r.id,
    date: r.occurred_at,
    type: r.type as AiAction["type"],
    content: r.content,
  };
}

function rowToProposal(
  r: ProposalRow,
  items: ProposalItem[],
  installments: PaymentInstallment[],
): Proposal {
  const t = (r.transport ?? {}) as Partial<TransportInfo>;
  return {
    id: r.id,
    number: r.number,
    leadId: r.lead_id,
    ownerId: r.owner_id,
    createdAt: r.created_at,
    status: r.status as ProposalStatus,
    validityDays: Number(r.validity_days ?? 15),
    items,
    installments,
    transport: {
      carrier: t.carrier ?? "A definir",
      carrierTransportadoraId: t.carrierTransportadoraId ?? null,
      freightPayer: (t.freightPayer as "CIF" | "FOB") ?? "FOB",
      grossWeightKg: Number(t.grossWeightKg ?? 0),
      cubageM3: Number(t.cubageM3 ?? 0),
      volumes: Number(t.volumes ?? 0),
      freightValue: Number(t.freightValue ?? 0),
      approxFreightValue: Number(t.approxFreightValue ?? 0),
      deliveryCep: t.deliveryCep,
      deliveryAddress: t.deliveryAddress,
      distanceKm: t.distanceKm,
      lalamoveAtivo: t.lalamoveAtivo ?? false,
      lalamoveValor: t.lalamoveValor ?? null,
      lalamoveDistanciaKm: t.lalamoveDistanciaKm ?? null,
      lalamoveServiceType: t.lalamoveServiceType ?? null,
      lalamoveQuotationId: t.lalamoveQuotationId ?? null,
      lalamoveCotadoEm: t.lalamoveCotadoEm ?? null,
    },
    observations: r.observations ?? "",
    customerOrderNumber: (r as unknown as { numero_pedido_cliente?: string | null }).numero_pedido_cliente ?? undefined,
    orderNotes: (r as unknown as { observacoes_pedido?: string | null }).observacoes_pedido ?? undefined,
    tratativaComercial:
      (r as unknown as { tratativa_comercial?: string | null }).tratativa_comercial ?? undefined,
    paymentTermId: r.payment_term_id ?? undefined,
    formaPagamento:
      ((r as unknown as { forma_pagamento?: string | null }).forma_pagamento as PaymentForm | null) ?? undefined,
    billingForecastDate: (r as unknown as { previsao_faturamento?: string | null }).previsao_faturamento ?? undefined,
    emNegociacao: Boolean((r as unknown as { em_negociacao?: boolean | null }).em_negociacao ?? false),
    emitterId: r.emitter_id,
    discountPercent: Number(r.discount_percent ?? 0),
    approvalRequestedAt: r.approval_requested_at ?? undefined,
    approvalReason: r.approval_reason ?? undefined,
    approvedByUserId: r.approved_by_user_id ?? undefined,
    approvedAt: r.approved_at ?? undefined,
    orderCreatedAt: r.order_created_at ?? undefined,
    sentAt: r.sent_at ?? undefined,
    editRequestedAt: r.edit_requested_at ?? undefined,
    editRequestReason: r.edit_request_reason ?? undefined,
    editRequestedByUserId: r.edit_requested_by_user_id ?? undefined,
    editUnlockedAt: r.edit_unlocked_at ?? undefined,
    editUnlockedByUserId: r.edit_unlocked_by_user_id ?? undefined,
    expectedDeliveryDate: (r as unknown as { expected_delivery_date?: string | null }).expected_delivery_date ?? undefined,
    omieStatus: (r as unknown as { omie_status?: Proposal["omieStatus"] }).omie_status ?? null,
    omieNumeroPedido: (r as unknown as { omie_numero_pedido?: string | null }).omie_numero_pedido ?? null,
    omieCodigoPedido: (r as unknown as { omie_codigo_pedido?: number | null }).omie_codigo_pedido ?? null,
    omieErro: (r as unknown as { omie_erro?: string | null }).omie_erro ?? null,
    omieEnviadoEm: (r as unknown as { omie_enviado_em?: string | null }).omie_enviado_em ?? null,
  };
}
function proposalToInsert(p: Proposal): ProposalInsert {
  return {
    id: p.id,
    number: p.number,
    lead_id: p.leadId,
    owner_id: p.ownerId,
    created_at: p.createdAt,
    status: p.status,
    validity_days: p.validityDays,
    emitter_id: p.emitterId,
    em_negociacao: p.emNegociacao ?? false,
    observations: p.observations ?? "",
    payment_term_id: p.paymentTermId ?? null,
    forma_pagamento: p.formaPagamento ?? null,
    previsao_faturamento: p.billingForecastDate ?? null,
    discount_percent: p.discountPercent ?? 0,
    transport: p.transport as unknown as Json,
    approval_requested_at: p.approvalRequestedAt ?? null,
    approval_reason: p.approvalReason ?? null,
    approved_by_user_id: p.approvedByUserId ?? null,
    approved_at: p.approvedAt ?? null,
    order_created_at: p.orderCreatedAt ?? null,
    sent_at: p.sentAt ?? null,
    edit_requested_at: p.editRequestedAt ?? null,
    edit_request_reason: p.editRequestReason ?? null,
    edit_requested_by_user_id: p.editRequestedByUserId ?? null,
    edit_unlocked_at: p.editUnlockedAt ?? null,
    edit_unlocked_by_user_id: p.editUnlockedByUserId ?? null,
    ...(p.expectedDeliveryDate !== undefined
      ? { expected_delivery_date: p.expectedDeliveryDate ?? null }
      : {}),
    numero_pedido_cliente: p.customerOrderNumber ?? null,
    observacoes_pedido: p.orderNotes ?? null,
    tratativa_comercial: p.tratativaComercial ?? null,
  } as ProposalInsert;
}

// ============ Hidratação ============

export async function hydrateCrmForUser(
  userId: string,
  role: "admin" | "vendedor",
) {
  currentUserId = userId;
  currentRole = role;
  hydrated = false;
  resetSnapshot();

  suppressSave = true;
  try {
    await loadAll(userId);
  } finally {
    suppressSave = false;
  }

  hydrated = true;

  if (!subscribed) {
    subscribed = true;
    useCrm.subscribe(() => scheduleSave());
  }

  attachRealtime(userId, role);
}

// ---- colunas explícitas (evita `select("*")` puxando colunas que nenhum
// `rowTo*` lê — menos bytes por hidratação/recarga de coleção) ----
const COLS_PRODUTOS =
  "id,sku,name,description,unit,weight_kg,height_cm,width_cm,length_cm,ncm,default_price,active,pecas_por_coluna,stack_height_cm,family,created_at";
const COLS_EMITTERS =
  "id,brand,tagline,legal_name,cnpj,ie,address,phone,whatsapp,email,website,is_default,banco,agencia,conta,pix";
const COLS_TERMOS =
  "id,label,method,splits,notes,active,permite_pf,acrescimo_percent,parcelas,ordem";
const COLS_LEADS =
  "id,company,contact_name,email,phone,product,product_id,quantity,estimated_value,stage,tags,segment,source,created_at,last_contact,last_contact_at,next_followup,notes,owner_id,cliente_id,cnpj,razao_social,nome_fantasia,inscricao_estadual,inscricao_municipal,endereco,email_financeiro,email_nf_xml,telefone_fixo,whatsapp,site,porte,cnae_principal,faturamento_estimado,num_funcionarios,decisor_nome,decisor_cargo,data_abertura,capital_social,simples_optante,socios";
const COLS_TAREFAS = "id,lead_id,title,due_date,done";
const COLS_PROPOSTAS =
  "id,number,lead_id,owner_id,emitter_id,status,validity_days,payment_term_id,forma_pagamento,previsao_faturamento,discount_percent,observations,transport,approval_requested_at,approval_reason,approved_by_user_id,approved_at,order_created_at,sent_at,created_at,expected_delivery_date,numero_pedido_cliente,observacoes_pedido,tratativa_comercial,em_negociacao,edit_requested_at,edit_request_reason,edit_requested_by_user_id,edit_unlocked_at,edit_unlocked_by_user_id,omie_status,omie_numero_pedido,omie_codigo_pedido,omie_erro,omie_enviado_em";
const COLS_PITENS =
  "id,proposta_id,position,product_id,omie_codigo_produto,description,sku,ncm,unit,quantity,unit_price";
const COLS_PPARCELAS = "id,proposta_id,position,days,amount,notes,percentual,due_date";
const COLS_INTERACOES = "id,lead_id,type,content,occurred_at";

/**
 * Janelas de tempo em coleções que só crescem.
 *
 * - `tarefas`: todas as abertas + as concluídas nos últimos 30 dias. As telas
 *   de tarefas/agenda/dashboard só olham pendentes e conclusões recentes.
 * - `lead_interactions` / `lead_ai_actions`: últimos 90 dias. O histórico
 *   completo de um lead antigo não é usado por nenhuma tela hoje (o LeadDrawer
 *   mostra a timeline recente); se precisar, buscar sob demanda por lead.
 */
const DIAS_TAREFAS_CONCLUIDAS = 30;
const DIAS_HISTORICO_LEAD = 90;
function isoDiasAtras(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
}

function queryProdutos() {
  return supabase.from("produtos").select(COLS_PRODUTOS).order("created_at", { ascending: false });
}
function queryEmitters() {
  return supabase.from("emitters").select(COLS_EMITTERS).order("brand");
}
function queryTermos() {
  return supabase.from("condicoes_pagamento").select(COLS_TERMOS).order("ordem").order("label");
}
function queryLeads() {
  return supabase.from("leads").select(COLS_LEADS).order("created_at", { ascending: false });
}
function queryTarefas() {
  return supabase
    .from("tarefas")
    .select(COLS_TAREFAS)
    .or(`done.eq.false,updated_at.gte.${isoDiasAtras(DIAS_TAREFAS_CONCLUIDAS)}`)
    .order("due_date");
}
function queryPropostas() {
  return supabase.from("propostas").select(COLS_PROPOSTAS).order("created_at", { ascending: false });
}
function queryItens() {
  return supabase.from("proposta_itens").select(COLS_PITENS).order("position");
}
function queryParcelas() {
  return supabase.from("proposta_parcelas").select(COLS_PPARCELAS).order("position");
}
function queryInteracoes() {
  return supabase
    .from("lead_interactions")
    .select(COLS_INTERACOES)
    .gte("occurred_at", isoDiasAtras(DIAS_HISTORICO_LEAD))
    .order("occurred_at", { ascending: false });
}
function queryAiActions() {
  return supabase
    .from("lead_ai_actions")
    .select(COLS_INTERACOES)
    .gte("occurred_at", isoDiasAtras(DIAS_HISTORICO_LEAD))
    .order("occurred_at", { ascending: false });
}

async function loadAll(userId: string) {
  const [
    { data: sysRow },
    { data: userRow },
    { data: prodRows },
    { data: emitRows },
    { data: termRows },
    { data: leadRows },
    { data: taskRows },
    { data: interRows },
    { data: aiRows },
    { data: propRows },
    { data: pItemRows },
    { data: pParcRows },
  ] = await Promise.all([
    supabase.from("system_workspace").select("data").eq("id", 1).maybeSingle(),
    supabase.from("user_workspaces").select("data").eq("user_id", userId).maybeSingle(),
    queryProdutos(),
    queryEmitters(),
    queryTermos(),
    queryLeads(),
    queryTarefas(),
    queryInteracoes(),
    queryAiActions(),
    queryPropostas(),
    queryItens(),
    queryParcelas(),
  ]);


  // ---- system settings (globais leves) ----
  type SysPayload = {
    leadTags?: string[];
    leadSegments?: string[];
    freightConfig?: FreightConfig;
    defaultEmitterId?: string;
    maxDiscountPercentVendedor?: number;
    fleet?: import("@/lib/logistica").FleetVehicle[];
  };
  const sys = (sysRow?.data ?? {}) as SysPayload;
  snapshot.systemJson = JSON.stringify(sys);

  type UserPayload = { agent?: AgentSettings };
  const usr = (userRow?.data ?? {}) as UserPayload;
  snapshot.userJson = JSON.stringify(usr);

  // ---- produtos ----
  const products =
    prodRows && prodRows.length
      ? prodRows.map(rowToProduct)
      : []; // vazio até admin cadastrar
  products.forEach((p) => snapshot.products.set(p.id, JSON.stringify(productToInsert(p))));

  // ---- emitters ----
  const emitters =
    emitRows && emitRows.length ? emitRows.map(rowToEmitter) : DEFAULT_EMITTERS;
  const defaultRow = (emitRows ?? []).find((r) => r.is_default);
  const defaultEmitterId =
    sys.defaultEmitterId && emitters.some((e) => e.id === sys.defaultEmitterId)
      ? sys.defaultEmitterId
      : defaultRow?.id ?? emitters[0]?.id ?? DEFAULT_EMITTERS[0].id;
  emitters.forEach((e) =>
    snapshot.emitters.set(e.id, JSON.stringify(emitterToInsert(e, e.id === defaultEmitterId))),
  );
  snapshot.defaultEmitterId = defaultEmitterId;

  // ---- payment terms ----
  const paymentTerms =
    termRows && termRows.length ? termRows.map(rowToPayTerm) : DEFAULT_PAYMENT_TERMS;
  paymentTerms.forEach((t) => snapshot.paymentTerms.set(t.id, JSON.stringify(payTermToInsert(t))));

  // ---- interactions & ai actions por lead ----
  const { interByLead, aiByLead } = indexarHistoricoLead(interRows ?? [], aiRows ?? []);

  // ---- leads ----
  const leads = montarLeads((leadRows ?? []) as LeadRow[], interByLead, aiByLead);

  // ---- tasks ----
  const ownerPorLead = new Map<string, string | null>();
  ((leadRows ?? []) as LeadRow[]).forEach((r) => ownerPorLead.set(r.id, r.owner_id));
  const tasks = montarTasks((taskRows ?? []) as TaskRow[], (id) => ownerPorLead.get(id) ?? null);

  // ---- proposals ----
  const proposals = montarPropostas(
    (propRows ?? []) as ProposalRow[],
    (pItemRows ?? []) as PItemRow[],
    (pParcRows ?? []) as PParcelaRow[],
  );


  // ---- aplica no store ----
  const s = useCrm.getState();
  useCrm.setState({
    products,
    emitters,
    defaultEmitterId,
    paymentTerms,
    leads,
    tasks,
    proposals,
    leadTags: sys.leadTags?.length ? sys.leadTags : DEFAULT_LEAD_TAGS,
    leadSegments: sys.leadSegments?.length ? sys.leadSegments : DEFAULT_LEAD_SEGMENTS,
    freightConfig: sys.freightConfig ?? DEFAULT_FREIGHT_CONFIG,
    fleet: sys.fleet && sys.fleet.length ? sys.fleet : (await import("@/lib/logistica")).DEFAULT_FLEET,
    maxDiscountPercentVendedor:
      typeof sys.maxDiscountPercentVendedor === "number" ? sys.maxDiscountPercentVendedor : 3,
    agent: usr.agent ?? s.agent,
    currentUserId: userId,
  });
}

// ============ Builders (compartilhados por loadAll e pela recarga por coleção) ============

function indexarHistoricoLead(interRows: InteractionRow[], aiRows: AiActionRow[]) {
  const interByLead = new Map<string, Interaction[]>();
  interRows.forEach((r) => {
    if (!r.lead_id) return;
    snapshot.interactions.add(r.id);
    const arr = interByLead.get(r.lead_id) ?? [];
    arr.push(rowToInteraction(r));
    interByLead.set(r.lead_id, arr);
  });
  const aiByLead = new Map<string, AiAction[]>();
  aiRows.forEach((r) => {
    if (!r.lead_id) return;
    snapshot.aiActions.add(r.id);
    const arr = aiByLead.get(r.lead_id) ?? [];
    arr.push(rowToAiAction(r));
    aiByLead.set(r.lead_id, arr);
  });
  return { interByLead, aiByLead };
}

function montarLeads(
  leadRows: LeadRow[],
  interByLead: Map<string, Interaction[]>,
  aiByLead: Map<string, AiAction[]>,
): Lead[] {
  const leads = leadRows.map((r) =>
    rowToLead(r, interByLead.get(r.id) ?? [], aiByLead.get(r.id) ?? []),
  );
  leads.forEach((l) => snapshot.leads.set(l.id, JSON.stringify(leadToInsert(l))));
  return leads;
}

function montarTasks(taskRows: TaskRow[], ownerOf: (leadId: string) => string | null): Task[] {
  const tasks = taskRows.map(rowToTask);
  tasks.forEach((t) => {
    const owner = ownerOf(t.leadId);
    snapshot.tasks.set(t.id, JSON.stringify(taskToInsert(t, owner)));
  });
  return tasks;
}

/** Mesma forma do `toJson` do save — snapshot e save comparam o mesmo objeto. */
function itemRowJson(r: PItemRow, position: number): string {
  return JSON.stringify({
    id: r.id,
    proposta_id: r.proposta_id,
    position,
    product_id: r.product_id || null,
    omie_codigo_produto:
      (r as unknown as { omie_codigo_produto?: number | null }).omie_codigo_produto ?? null,
    description: r.description,
    sku: r.sku,
    ncm: (r as unknown as { ncm?: string | null }).ncm ?? null,
    unit: r.unit,
    quantity: Number(r.quantity ?? 0),
    unit_price: Number(r.unit_price ?? 0),
  });
}
function parcelaRowJson(r: PParcelaRow, position: number): string {
  const loose = r as unknown as { due_date?: string | null; percentual?: number | null };
  return JSON.stringify({
    id: r.id,
    proposta_id: r.proposta_id,
    position,
    days: r.days,
    amount: Number(r.amount ?? 0),
    notes: r.notes ?? "",
    percentual: loose.percentual == null ? null : Number(loose.percentual),
    due_date: loose.due_date ?? null,
  });
}

function montarPropostas(
  propRows: ProposalRow[],
  pItemRows: PItemRow[],
  pParcRows: PParcelaRow[],
): Proposal[] {
  const itemsByProp = new Map<string, ProposalItem[]>();
  pItemRows.forEach((r) => {
    const item: ProposalItem = {
      id: r.id,
      productId: r.product_id ?? "",
      omieCodigoProduto:
        (r as unknown as { omie_codigo_produto?: number | null }).omie_codigo_produto ?? undefined,
      description: r.description,
      sku: r.sku,
      ncm: (r as unknown as { ncm?: string | null }).ncm ?? undefined,
      unit: r.unit as ProductUnit,
      quantity: Number(r.quantity ?? 0),
      unitPrice: Number(r.unit_price ?? 0),
    };
    const arr = itemsByProp.get(r.proposta_id) ?? [];
    arr.push(item);
    itemsByProp.set(r.proposta_id, arr);
    snapshot.proposalItems.set(r.id, itemRowJson(r, arr.length - 1));
  });
  const parcByProp = new Map<string, PaymentInstallment[]>();
  pParcRows.forEach((r) => {
    const loose = r as unknown as { due_date?: string | null; percentual?: number | null };
    const p: PaymentInstallment = {
      id: r.id,
      days: r.days,
      amount: Number(r.amount ?? 0),
      notes: r.notes ?? "",
      percentual: loose.percentual == null ? undefined : Number(loose.percentual),
      dueDate: loose.due_date ?? undefined,
    };
    const arr = parcByProp.get(r.proposta_id) ?? [];
    arr.push(p);
    parcByProp.set(r.proposta_id, arr);
    snapshot.proposalParcelas.set(r.id, parcelaRowJson(r, arr.length - 1));
  });
  const proposals = propRows.map((r) =>
    rowToProposal(r, itemsByProp.get(r.id) ?? [], parcByProp.get(r.id) ?? []),
  );
  proposals.forEach((p) => snapshot.proposals.set(p.id, JSON.stringify(proposalToInsert(p))));
  return proposals;
}



// ============ Persistência imediata ============

/**
 * Persiste AGORA um lead do estado local no banco (INSERT/UPSERT aguardado).
 *
 * O save do CRM é batched (debounce de 500ms), então um `addLead` seguido de um
 * INSERT dependente (ex.: `createProposal`, que grava `propostas.lead_id`)
 * quebrava com violação de FK. Use esta função para fechar essa corrida.
 * Atualiza o snapshot para o save batched não reenviar a mesma linha.
 */
export async function persistLeadNow(leadId: string): Promise<void> {
  const lead = useCrm.getState().leads.find((l) => l.id === leadId);
  if (!lead) throw new Error("Lead não encontrado no estado local");
  const payload = leadToInsert(lead);
  const { error } = await supabase.from("leads").upsert(payload, { onConflict: "id" });
  if (error) {
    throw new Error(error.message || "Falha ao salvar o lead no banco");
  }
  snapshot.leads.set(lead.id, JSON.stringify(payload));
}

// ============ Cleanup ============


export function clearCrmState() {
  currentUserId = null;
  currentRole = null;
  hydrated = false;
  resetSnapshot();
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = null;
  recargasPendentes.clear();
  detachRealtime();
  useCrm.setState({
    leads: [],
    tasks: [],
    proposals: [],
    currentUserId: "",
  });
}

// ============ Realtime ============

function attachRealtime(userId: string, role: "admin" | "vendedor") {
  detachRealtime();
  const tables: TabelaRealtime[] = [
    "leads",
    "tarefas",
    "propostas",
    "proposta_itens",
    "proposta_parcelas",
    "lead_interactions",
    "lead_ai_actions",
    "produtos",
    "emitters",
    "condicoes_pagamento",
  ];
  // um único canal com N listeners (antes: um canal por tabela = 10 subscriptions)
  let ch = supabase.channel(`crm-sync-${userId}`);
  tables.forEach((table) => {
    ch = ch.on(
      "postgres_changes",
      { event: "*", schema: "public", table },
      (payload) =>
        tratarEventoRealtime({
          table,
          eventType: payload.eventType as EventoRealtime["eventType"],
          new: payload.new as Record<string, unknown> | null,
          old: payload.old as Record<string, unknown> | null,
        }),
    );
  });
  realtimeChannels.push(ch.subscribe());
  agendarResyncSeguranca();
  void role; // reservado para uso futuro (canais específicos por role)
}

function detachRealtime() {
  realtimeChannels.forEach((c) => {
    try {
      void supabase.removeChannel(c);
    } catch {
      /* noop */
    }
  });
  realtimeChannels = [];
  if (resyncTimer) clearInterval(resyncTimer);
  resyncTimer = null;
}

/** Snapshot por coleção — usado para detectar eco da própria escrita. */
const SNAPSHOT_POR_COLECAO: Record<ColecaoRealtime, () => Map<string, string>> = {
  leads: () => snapshot.leads,
  tasks: () => snapshot.tasks,
  proposals: () => snapshot.proposals,
  products: () => snapshot.products,
  emitters: () => snapshot.emitters,
  paymentTerms: () => snapshot.paymentTerms,
};

/**
 * Eco da própria aba: o payload, convertido para a mesma forma do que
 * gravamos, é idêntico ao snapshot do dirty-tracking daquele id.
 */
function ehEscritaPropria(colecao: ColecaoRealtime, row: Record<string, unknown>): boolean {
  const id = row["id"] as string;
  const atual = SNAPSHOT_POR_COLECAO[colecao]().get(id);
  if (!atual) return false;
  const convertido = converterRow(colecao, row);
  if (!convertido) return false;
  return convertido.json === atual;
}

/** Converte a linha do payload no objeto do store + json equivalente ao salvo. */
function converterRow(
  colecao: ColecaoRealtime,
  row: Record<string, unknown>,
): { item: { id: string }; json: string } | null {
  const state = useCrm.getState();
  try {
    switch (colecao) {
      case "leads": {
        const anterior = state.leads.find((l) => l.id === row["id"]);
        const lead = rowToLead(
          row as unknown as LeadRow,
          anterior?.interactions ?? [],
          anterior?.aiActions ?? [],
        );
        return { item: lead, json: JSON.stringify(leadToInsert(lead)) };
      }
      case "tasks": {
        const task = rowToTask(row as unknown as TaskRow);
        const owner = state.leads.find((l) => l.id === task.leadId)?.ownerId ?? null;
        return { item: task, json: JSON.stringify(taskToInsert(task, owner)) };
      }
      case "proposals": {
        const anterior = state.proposals.find((p) => p.id === row["id"]);
        const prop = rowToProposal(
          row as unknown as ProposalRow,
          anterior?.items ?? [],
          anterior?.installments ?? [],
        );
        return { item: prop, json: JSON.stringify(proposalToInsert(prop)) };
      }
      case "products": {
        const p = rowToProduct(row as unknown as ProductRow);
        return { item: p, json: JSON.stringify(productToInsert(p)) };
      }
      case "emitters": {
        const e = rowToEmitter(row as unknown as EmitterRow);
        return {
          item: e,
          json: JSON.stringify(emitterToInsert(e, e.id === state.defaultEmitterId)),
        };
      }
      case "paymentTerms": {
        const t = rowToPayTerm(row as unknown as PayTermRow);
        return { item: t, json: JSON.stringify(payTermToInsert(t)) };
      }
    }
  } catch (e) {
    console.warn("[crm-sync] payload realtime não convertível:", e);
    return null;
  }
}

const CAMPO_STORE: Record<ColecaoRealtime, "leads" | "tasks" | "proposals" | "products" | "emitters" | "paymentTerms"> =
  {
    leads: "leads",
    tasks: "tasks",
    proposals: "proposals",
    products: "products",
    emitters: "emitters",
    paymentTerms: "paymentTerms",
  };

/** Aplica no store sem disparar o save (o dado veio do banco). */
function aplicarNoStore(fn: () => void) {
  suppressSave = true;
  try {
    fn();
  } finally {
    suppressSave = false;
  }
}

function tratarEventoRealtime(ev: EventoRealtime) {
  if (!currentUserId || !hydrated) return;
  const plano = planejarEventoRealtime(ev, { ehEscritaPropria });
  if (plano.acao === "ignorar") return;

  if (plano.acao === "recarregar") {
    agendarRecarga(plano.colecao);
    return;
  }

  if (plano.acao === "remover") {
    const campo = CAMPO_STORE[plano.colecao];
    aplicarNoStore(() => {
      const lista = useCrm.getState()[campo] as Array<{ id: string }>;
      useCrm.setState({ [campo]: removerPorId(lista, plano.id) } as never);
    });
    SNAPSHOT_POR_COLECAO[plano.colecao]().delete(plano.id);
    return;
  }

  // merge
  const convertido = converterRow(plano.colecao, plano.row);
  if (!convertido) {
    agendarRecarga(plano.colecao);
    return;
  }
  const campo = CAMPO_STORE[plano.colecao];
  aplicarNoStore(() => {
    const lista = useCrm.getState()[campo] as Array<{ id: string }>;
    useCrm.setState({ [campo]: mesclarPorId(lista, convertido.item) } as never);
  });
  SNAPSHOT_POR_COLECAO[plano.colecao]().set(convertido.item.id, convertido.json);
}

// ---- recarga por coleção (1 query; nunca loadAll) ----
const recargasPendentes = new Set<ColecaoRealtime>();

function agendarRecarga(colecao: ColecaoRealtime) {
  recargasPendentes.add(colecao);
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    const pendentes = Array.from(recargasPendentes);
    recargasPendentes.clear();
    void Promise.all(pendentes.map((c) => recarregarColecao(c))).catch((e) =>
      console.warn("[crm-sync] recarga de coleção:", e),
    );
  }, 800);
}

async function recarregarColecao(colecao: ColecaoRealtime) {
  if (!currentUserId || !hydrated) return;
  switch (colecao) {
    case "leads": {
      const [{ data: leadRows }, { data: interRows }, { data: aiRows }] = await Promise.all([
        queryLeads(),
        queryInteracoes(),
        queryAiActions(),
      ]);
      const { interByLead, aiByLead } = indexarHistoricoLead(
        (interRows ?? []) as InteractionRow[],
        (aiRows ?? []) as AiActionRow[],
      );
      const leads = montarLeads((leadRows ?? []) as LeadRow[], interByLead, aiByLead);
      aplicarNoStore(() => useCrm.setState({ leads }));
      return;
    }
    case "tasks": {
      const { data } = await queryTarefas();
      const leadsAtuais = useCrm.getState().leads;
      const tasks = montarTasks(
        (data ?? []) as TaskRow[],
        (id) => leadsAtuais.find((l) => l.id === id)?.ownerId ?? null,
      );
      aplicarNoStore(() => useCrm.setState({ tasks }));
      return;
    }
    case "proposals": {
      const [{ data: propRows }, { data: itemRows }, { data: parcRows }] = await Promise.all([
        queryPropostas(),
        queryItens(),
        queryParcelas(),
      ]);
      const proposals = montarPropostas(
        (propRows ?? []) as ProposalRow[],
        (itemRows ?? []) as PItemRow[],
        (parcRows ?? []) as PParcelaRow[],
      );
      aplicarNoStore(() => useCrm.setState({ proposals }));
      return;
    }
    case "products": {
      const { data } = await queryProdutos();
      const products = ((data ?? []) as ProductRow[]).map(rowToProduct);
      products.forEach((p) => snapshot.products.set(p.id, JSON.stringify(productToInsert(p))));
      aplicarNoStore(() => useCrm.setState({ products }));
      return;
    }
    case "emitters": {
      const { data } = await queryEmitters();
      const emitters = ((data ?? []) as EmitterRow[]).map(rowToEmitter);
      if (!emitters.length) return;
      const def = useCrm.getState().defaultEmitterId;
      emitters.forEach((e) =>
        snapshot.emitters.set(e.id, JSON.stringify(emitterToInsert(e, e.id === def))),
      );
      aplicarNoStore(() => useCrm.setState({ emitters }));
      return;
    }
    case "paymentTerms": {
      const { data } = await queryTermos();
      const paymentTerms = ((data ?? []) as PayTermRow[]).map(rowToPayTerm);
      if (!paymentTerms.length) return;
      paymentTerms.forEach((t) =>
        snapshot.paymentTerms.set(t.id, JSON.stringify(payTermToInsert(t))),
      );
      aplicarNoStore(() => useCrm.setState({ paymentTerms }));
      return;
    }
  }
}

/**
 * Rede de segurança: um `loadAll` a cada 10 min, só com a aba visível
 * (evento perdido por queda de socket / volta de offline).
 */
function agendarResyncSeguranca() {
  if (resyncTimer) clearInterval(resyncTimer);
  resyncTimer = setInterval(
    () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      resyncAgora();
    },
    10 * 60 * 1000,
  );
}

export function resyncAgora() {
  if (!currentUserId || !hydrated) return;
  const uid = currentUserId;
  suppressSave = true;
  void loadAll(uid)
    .catch((e) => console.warn("[crm-sync] resync:", e))
    .finally(() => {
      suppressSave = false;
    });
}


// ============ Save (write-through com diff) ============

/**
 * Gargalo 3 — diff O(n) a cada 500 ms.
 *
 * Escolhida a alternativa de MENOR RISCO: em vez de instrumentar todas as
 * actions do store com um `Set` de ids sujos (invasivo, ~40 actions, fácil de
 * esquecer uma e perder escrita), o diff continua igual, mas só roda nas
 * coleções cujo array mudou de REFERÊNCIA desde o último save — comparação
 * `===`, O(1) por coleção. O zustand já cria array novo em toda action que
 * altera a coleção, então isso é conservador: no máximo roda um diff a mais.
 * Coleções com falha de gravação ficam marcadas para reprocessar no próximo
 * ciclo (senão o retry do registro sujo nunca aconteceria).
 */
const ultimoRefSalvo = new Map<string, unknown>();
const forcarColecao = new Set<string>();

function precisaDiff(nome: string, ...refs: unknown[]): boolean {
  const chave = JSON.stringify(refs.map((_, i) => i)); // só para tamanho fixo
  void chave;
  const anterior = ultimoRefSalvo.get(nome) as unknown[] | undefined;
  const mudou =
    !anterior || anterior.length !== refs.length || refs.some((r, i) => r !== anterior[i]);
  if (!mudou && !forcarColecao.has(nome)) return false;
  ultimoRefSalvo.set(nome, refs);
  forcarColecao.delete(nome);
  return true;
}

/** Referências das fatias persistidas no último agendamento — evita agendar save
 *  para mudanças de estado puramente locais/efêmeras (filtros, UI, seleção). */
let lastPersistedRefs: unknown[] = [];


function persistedRefs() {
  const s = useCrm.getState();
  return [
    s.leads,
    s.tasks,
    s.proposals,
    s.products,
    s.emitters,
    s.paymentTerms,
    s.defaultEmitterId,
    s.leadTags,
    s.leadSegments,
    s.freightConfig,
    s.fleet,
    s.maxDiscountPercentVendedor,
    s.agent,
  ];
}

function scheduleSave() {
  if (!hydrated || !currentUserId || suppressSave) return;
  const refs = persistedRefs();
  if (
    lastPersistedRefs.length === refs.length &&
    refs.every((r, i) => r === lastPersistedRefs[i])
  ) {
    return;
  }
  lastPersistedRefs = refs;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void doSave().catch((e) => console.warn("[crm-sync] save:", e));
  }, 500);
}

async function doSave() {
  if (!hydrated || !currentUserId || !currentRole) return;
  const state = useCrm.getState();
  const userId = currentUserId;
  const isAdmin = currentRole === "admin";

  // ---- system_workspace (leve, admin-only via RLS) ----
  const sysPayload = {
    leadTags: state.leadTags,
    leadSegments: state.leadSegments,
    freightConfig: state.freightConfig,
    defaultEmitterId: state.defaultEmitterId,
    maxDiscountPercentVendedor: state.maxDiscountPercentVendedor,
    fleet: state.fleet,
  };
  const sysJson = JSON.stringify(sysPayload);
  if (sysJson !== snapshot.systemJson && isAdmin) {
    const { error } = await supabase
      .from("system_workspace")
      .update({ data: sysPayload })
      .eq("id", 1);
    if (error) {
      reportarFalhaSync("configurações", "upsert", error, { tabela: "system_workspace" });
    } else {
      snapshot.systemJson = sysJson;
    }
  }

  // ---- user_workspaces (agent do próprio usuário) ----
  const usrPayload = { agent: state.agent };
  const usrJson = JSON.stringify(usrPayload);
  if (usrJson !== snapshot.userJson) {
    const { error } = await supabase
      .from("user_workspaces")
      .upsert({ user_id: userId, data: usrPayload }, { onConflict: "user_id" });
    if (error) {
      reportarFalhaSync("configurações", "upsert", error, { tabela: "user_workspaces" });
    } else {
      snapshot.userJson = usrJson;
    }
  }

  // ---- produtos (admin-only via RLS) ----
  if (isAdmin) {
    await syncCollection<Product>({
      current: state.products,
      snapshot: snapshot.products,
      toKey: (p) => p.id,
      toJson: (p) => JSON.stringify(productToInsert(p)),
      upsert: (items) =>
        supabase.from("produtos").upsert(items.map(productToInsert), { onConflict: "id" }),
      del: (ids) => supabase.from("produtos").delete().in("id", ids),
    isIntentionalDelete: isIntentionalDelete("products"),
    collectionName: "products",
    onDeleted: (ids) => clearDeleteIntent("products", ids),
    });

    // ---- emitters ----
    const emitCurrent = state.emitters;
    await syncCollection<EmitterProfile>({
      current: emitCurrent,
      snapshot: snapshot.emitters,
      toKey: (e) => e.id,
      toJson: (e) =>
        JSON.stringify(emitterToInsert(e, e.id === state.defaultEmitterId)),
      upsert: (items) =>
        supabase
          .from("emitters")
          .upsert(
            items.map((e) => emitterToInsert(e, e.id === state.defaultEmitterId)),
            { onConflict: "id" },
          ),
      del: (ids) => supabase.from("emitters").delete().in("id", ids),
    isIntentionalDelete: isIntentionalDelete("emitters"),
    collectionName: "emitters",
    onDeleted: (ids) => clearDeleteIntent("emitters", ids),
    });
    // update default flag isolado se apenas ele mudou
    if (state.defaultEmitterId !== snapshot.defaultEmitterId) {
      const limpar = await supabase
        .from("emitters")
        .update({ is_default: false })
        .neq("id", state.defaultEmitterId);
      const marcar = await supabase
        .from("emitters")
        .update({ is_default: true })
        .eq("id", state.defaultEmitterId);
      const erroDefault = limpar.error ?? marcar.error;
      if (erroDefault) {
        reportarFalhaSync("emitters", "upsert", erroDefault, {
          campo: "is_default",
          emitterId: state.defaultEmitterId,
        });
      } else {
        snapshot.defaultEmitterId = state.defaultEmitterId;
      }
    }

    // ---- payment terms ----
    await syncCollection<PaymentTerm>({
      current: state.paymentTerms,
      snapshot: snapshot.paymentTerms,
      toKey: (t) => t.id,
      toJson: (t) => JSON.stringify(payTermToInsert(t)),
      upsert: (items) =>
        supabase
          .from("condicoes_pagamento")
          .upsert(items.map(payTermToInsert), { onConflict: "id" }),
      del: (ids) => supabase.from("condicoes_pagamento").delete().in("id", ids),
    isIntentionalDelete: isIntentionalDelete("paymentTerms"),
    collectionName: "paymentTerms",
    onDeleted: (ids) => clearDeleteIntent("paymentTerms", ids),
    });
  }

  // ---- leads (RLS filtra por owner_id) ----
  await syncCollection<Lead>({
    current: state.leads,
    snapshot: snapshot.leads,
    toKey: (l) => l.id,
    toJson: (l) => JSON.stringify(leadToInsert(l)),
    upsert: (items) =>
      supabase.from("leads").upsert(items.map(leadToInsert), { onConflict: "id" }),
    del: (ids) => supabase.from("leads").delete().in("id", ids),
    isIntentionalDelete: isIntentionalDelete("leads"),
    collectionName: "leads",
    onDeleted: (ids) => clearDeleteIntent("leads", ids),
  });

  // ---- tarefas ----
  const leadOwnerMap = new Map<string, string>();
  state.leads.forEach((l) => leadOwnerMap.set(l.id, l.ownerId));
  await syncCollection<Task>({
    current: state.tasks,
    snapshot: snapshot.tasks,
    toKey: (t) => t.id,
    toJson: (t) => JSON.stringify(taskToInsert(t, leadOwnerMap.get(t.leadId) ?? userId)),
    upsert: (items) =>
      supabase
        .from("tarefas")
        .upsert(
          items.map((t) => taskToInsert(t, leadOwnerMap.get(t.leadId) ?? userId)),
          { onConflict: "id" },
        ),
    del: (ids) => supabase.from("tarefas").delete().in("id", ids),
    isIntentionalDelete: isIntentionalDelete("tasks"),
    collectionName: "tasks",
    onDeleted: (ids) => clearDeleteIntent("tasks", ids),
  });

  // ---- propostas ----
  await syncCollection<Proposal>({
    current: state.proposals,
    snapshot: snapshot.proposals,
    toKey: (p) => p.id,
    toJson: (p) => JSON.stringify(proposalToInsert(p)),
    upsert: (items) =>
      supabase.from("propostas").upsert(items.map(proposalToInsert), { onConflict: "id" }),
    del: (ids) => supabase.from("propostas").delete().in("id", ids),
    isIntentionalDelete: isIntentionalDelete("proposals"),
    collectionName: "proposals",
    onDeleted: (ids) => clearDeleteIntent("proposals", ids),
  });

  // ---- proposta_itens ----
  const allItems: Array<{ propId: string; index: number; item: ProposalItem }> = [];
  state.proposals.forEach((p) =>
    p.items.forEach((it, idx) => allItems.push({ propId: p.id, index: idx, item: it })),
  );
  await syncCollection({
    current: allItems,
    snapshot: snapshot.proposalItems,
    toKey: (x) => x.item.id,
    toJson: (x) =>
      JSON.stringify({
        id: x.item.id,
        proposta_id: x.propId,
        position: x.index,
        product_id: x.item.productId || null,
        omie_codigo_produto: x.item.omieCodigoProduto ?? null,
        description: x.item.description,
        sku: x.item.sku,
        ncm: x.item.ncm ?? null,
        unit: x.item.unit,
        quantity: x.item.quantity,
        unit_price: x.item.unitPrice,
      }),
    upsert: (rows) =>
      supabase.from("proposta_itens").upsert(
        rows.map((x) => ({
          id: x.item.id,
          proposta_id: x.propId,
          position: x.index,
          product_id: x.item.productId || null,
          omie_codigo_produto: x.item.omieCodigoProduto ?? null,
          description: x.item.description,
          sku: x.item.sku,
          ncm: x.item.ncm ?? null,
          unit: x.item.unit,
          quantity: x.item.quantity,
          unit_price: x.item.unitPrice,
        })) as never,
        { onConflict: "id" },
      ),
    del: (ids) => supabase.from("proposta_itens").delete().in("id", ids),
    isIntentionalDelete: isIntentionalDelete("proposalItems"),
    collectionName: "proposalItems",
    onDeleted: (ids) => clearDeleteIntent("proposalItems", ids),
  });

  // ---- proposta_parcelas ----
  // Regra: sem previsão de faturamento não existe vencimento calculável, então
  // NENHUMA linha é gravada. Linhas que já existam nesse estado são apagadas
  // (exclusão intencional) em vez de ficarem como parcela fantasma zerada.
  const allParc: Array<{ propId: string; index: number; parc: PaymentInstallment }> = [];
  state.proposals.forEach((p) => {
    if (!p.billingForecastDate) {
      if (p.installments.length > 0) {
        markDeleted("proposalParcelas", ...p.installments.map((pa) => pa.id));
      }
      return;
    }
    p.installments.forEach((pa, idx) => allParc.push({ propId: p.id, index: idx, parc: pa }));
  });

  await syncCollection({
    current: allParc,
    snapshot: snapshot.proposalParcelas,
    toKey: (x) => x.parc.id,
    toJson: (x) =>
      JSON.stringify({
        id: x.parc.id,
        proposta_id: x.propId,
        position: x.index,
        days: x.parc.days,
        amount: x.parc.amount,
        notes: x.parc.notes ?? "",
        percentual: x.parc.percentual ?? null,
        due_date: x.parc.dueDate ?? null,
      }),
    upsert: (rows) =>
      supabase.from("proposta_parcelas").upsert(
        rows.map((x) => ({
          id: x.parc.id,
          proposta_id: x.propId,
          position: x.index,
          days: x.parc.days,
          amount: x.parc.amount,
          notes: x.parc.notes ?? "",
          percentual: x.parc.percentual ?? null,
          due_date: x.parc.dueDate ?? null,
        })),
        { onConflict: "id" },
      ),

    del: (ids) => supabase.from("proposta_parcelas").delete().in("id", ids),
    isIntentionalDelete: isIntentionalDelete("proposalParcelas"),
    collectionName: "proposalParcelas",
    onDeleted: (ids) => clearDeleteIntent("proposalParcelas", ids),
  });

  // ---- lead_interactions (append-only) ----
  const newInter: Array<{ leadId: string; ownerId: string; i: Interaction }> = [];
  state.leads.forEach((l) =>
    l.interactions.forEach((i) => {
      if (!snapshot.interactions.has(i.id)) newInter.push({ leadId: l.id, ownerId: l.ownerId, i });
    }),
  );
  if (newInter.length) {
    const { error } = await supabase.from("lead_interactions").insert(
      newInter.map((x) => ({
        id: x.i.id,
        lead_id: x.leadId,
        owner_id: x.ownerId || null,
        type: x.i.type,
        content: x.i.content,
        occurred_at: x.i.date,
      })),
    );
    if (!error) newInter.forEach((x) => snapshot.interactions.add(x.i.id));
  }

  // ---- lead_ai_actions (append-only) ----
  const newAi: Array<{ leadId: string; ownerId: string; a: AiAction }> = [];
  state.leads.forEach((l) =>
    (l.aiActions ?? []).forEach((a) => {
      if (!snapshot.aiActions.has(a.id)) newAi.push({ leadId: l.id, ownerId: l.ownerId, a });
    }),
  );
  if (newAi.length) {
    const { error } = await supabase.from("lead_ai_actions").insert(
      newAi.map((x) => ({
        id: x.a.id,
        lead_id: x.leadId,
        owner_id: x.ownerId || null,
        type: x.a.type,
        content: x.a.content,
        occurred_at: x.a.date,
      })),
    );
    if (!error) newAi.forEach((x) => snapshot.aiActions.add(x.a.id));
  }
}

// Genérico: diff snapshot vs current → upsert/delete
async function syncCollection<T>(opts: {
  current: T[];
  snapshot: Map<string, string>;
  toKey: (item: T) => string;
  toJson: (item: T) => string;
  upsert: (items: T[]) => PromiseLike<{ error: unknown }>;
  del: (ids: string[]) => PromiseLike<{ error: unknown }>;
  /** Se fornecido, só ids aprovados pelo predicado são apagados no banco. */
  isIntentionalDelete?: (id: string) => boolean;
  /** Rótulo apenas para log. */
  collectionName?: string;
  /** Chamado após DELETE bem-sucedido (para limpar o registro de intenção). */
  onDeleted?: (ids: string[]) => void;
}) {
  const {
    current,
    snapshot: snap,
    toKey,
    toJson,
    upsert,
    del,
    isIntentionalDelete,
    collectionName,
    onDeleted,
  } = opts;
  const currentIds = new Set<string>();
  const toUpsert: T[] = [];
  for (const item of current) {
    const k = toKey(item);
    currentIds.add(k);
    const j = toJson(item);
    if (snap.get(k) !== j) toUpsert.push(item);
  }
  const missing: string[] = [];
  snap.forEach((_, k) => {
    if (!currentIds.has(k)) missing.push(k);
  });

  let toDelete = missing;
  if (isIntentionalDelete) {
    toDelete = missing.filter((k) => isIntentionalDelete(k));
    const skipped = missing.filter((k) => !isIntentionalDelete(k));
    if (skipped.length) {
      console.warn(
        `[crm-sync] ${collectionName ?? "collection"}: ${skipped.length} id(s) sumiram do estado local sem intenção de exclusão — ignorados (não apagados):`,
        skipped,
      );
    }
  }

  if (toUpsert.length) {
    const { error } = await upsert(toUpsert);
    if (!error) {
      toUpsert.forEach((item) => snap.set(toKey(item), toJson(item)));
    } else {
      // Snapshot intocado de propósito: o registro segue "sujo" e é reenviado
      // no próximo ciclo de save.
      reportarFalhaSync(collectionName ?? "collection", "upsert", error, {
        registros: toUpsert.length,
      });
    }
  }
  if (toDelete.length) {
    const { error } = await del(toDelete);
    if (!error) {
      toDelete.forEach((k) => snap.delete(k));
      onDeleted?.(toDelete);
    } else {
      reportarFalhaSync(collectionName ?? "collection", "delete", error, { ids: toDelete });
    }
  }
}
