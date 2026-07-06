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

import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";
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
  };
}

function rowToPayTerm(r: PayTermRow): PaymentTerm {
  return {
    id: r.id,
    label: r.label,
    method: r.method as PaymentMethod,
    splits: Array.isArray(r.splits) ? (r.splits as number[]) : [],
    notes: r.notes ?? undefined,
    active: !!r.active,
  };
}
function payTermToInsert(t: PaymentTerm): PayTermInsert {
  return {
    id: t.id,
    label: t.label,
    method: t.method,
    splits: t.splits as unknown as Json,
    notes: t.notes ?? null,
    active: t.active,
  };
}

function rowToLead(
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
    lastContact: r.last_contact ?? r.created_at,
    nextFollowUp: r.next_followup ?? undefined,
    notes: r.notes ?? "",
    interactions,
    aiActions,
    ownerId: r.owner_id ?? "",
    cnpj: r.cnpj ?? undefined,
    razaoSocial: r.razao_social ?? undefined,
    nomeFantasia: r.nome_fantasia ?? undefined,
    inscricaoEstadual: r.inscricao_estadual ?? undefined,
    inscricaoMunicipal: r.inscricao_municipal ?? undefined,
    endereco,
    emailFinanceiro: r.email_financeiro ?? undefined,
    telefoneFixo: r.telefone_fixo ?? undefined,
    whatsapp: r.whatsapp ?? undefined,
    site: r.site ?? undefined,
    porte: r.porte ?? undefined,
    cnaePrincipal: r.cnae_principal ?? undefined,
    faturamentoEstimado: r.faturamento_estimado ?? undefined,
    numFuncionarios: r.num_funcionarios ?? undefined,
    decisorNome: r.decisor_nome ?? undefined,
    decisorCargo: r.decisor_cargo ?? undefined,
  };
}
function leadToInsert(l: Lead): LeadInsert {
  return {
    id: l.id,
    company: l.company,
    contact_name: l.contactName ?? "",
    email: l.email || null,
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
    cnpj: l.cnpj ?? null,
    razao_social: l.razaoSocial ?? null,
    nome_fantasia: l.nomeFantasia ?? null,
    inscricao_estadual: l.inscricaoEstadual ?? null,
    inscricao_municipal: l.inscricaoMunicipal ?? null,
    endereco: (l.endereco ?? null) as unknown as Json,
    email_financeiro: l.emailFinanceiro ?? null,
    telefone_fixo: l.telefoneFixo ?? null,
    whatsapp: l.whatsapp ?? null,
    site: l.site ?? null,
    porte: l.porte ?? null,
    cnae_principal: l.cnaePrincipal ?? null,
    faturamento_estimado: l.faturamentoEstimado ?? null,
    num_funcionarios: l.numFuncionarios ?? null,
    decisor_nome: l.decisorNome ?? null,
    decisor_cargo: l.decisorCargo ?? null,
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
      freightPayer: (t.freightPayer as "CIF" | "FOB") ?? "FOB",
      grossWeightKg: Number(t.grossWeightKg ?? 0),
      cubageM3: Number(t.cubageM3 ?? 0),
      volumes: Number(t.volumes ?? 0),
      freightValue: Number(t.freightValue ?? 0),
      approxFreightValue: Number(t.approxFreightValue ?? 0),
      deliveryCep: t.deliveryCep,
      deliveryAddress: t.deliveryAddress,
      distanceKm: t.distanceKm,
    },
    observations: r.observations ?? "",
    paymentTermId: r.payment_term_id ?? undefined,
    emitterId: r.emitter_id,
    discountPercent: Number(r.discount_percent ?? 0),
    approvalRequestedAt: r.approval_requested_at ?? undefined,
    approvalReason: r.approval_reason ?? undefined,
    approvedByUserId: r.approved_by_user_id ?? undefined,
    approvedAt: r.approved_at ?? undefined,
    orderCreatedAt: r.order_created_at ?? undefined,
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
    observations: p.observations ?? "",
    payment_term_id: p.paymentTermId ?? null,
    discount_percent: p.discountPercent ?? 0,
    transport: p.transport as unknown as Json,
    approval_requested_at: p.approvalRequestedAt ?? null,
    approval_reason: p.approvalReason ?? null,
    approved_by_user_id: p.approvedByUserId ?? null,
    approved_at: p.approvedAt ?? null,
    order_created_at: p.orderCreatedAt ?? null,
  };
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
    supabase.from("produtos").select("*").order("created_at", { ascending: false }),
    supabase.from("emitters").select("*").order("brand"),
    supabase.from("condicoes_pagamento").select("*").order("label"),
    supabase.from("leads").select("*").order("created_at", { ascending: false }),
    supabase.from("tarefas").select("*").order("due_date"),
    supabase.from("lead_interactions").select("*").order("occurred_at", { ascending: false }),
    supabase.from("lead_ai_actions").select("*").order("occurred_at", { ascending: false }),
    supabase.from("propostas").select("*").order("created_at", { ascending: false }),
    supabase.from("proposta_itens").select("*").order("position"),
    supabase.from("proposta_parcelas").select("*").order("position"),
  ]);

  // ---- system settings (globais leves) ----
  type SysPayload = {
    leadTags?: string[];
    leadSegments?: string[];
    freightConfig?: FreightConfig;
    defaultEmitterId?: string;
    maxDiscountPercentVendedor?: number;
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
  const interByLead = new Map<string, Interaction[]>();
  (interRows ?? []).forEach((r) => {
    if (!r.lead_id) return;
    snapshot.interactions.add(r.id);
    const arr = interByLead.get(r.lead_id) ?? [];
    arr.push(rowToInteraction(r));
    interByLead.set(r.lead_id, arr);
  });
  const aiByLead = new Map<string, AiAction[]>();
  (aiRows ?? []).forEach((r) => {
    if (!r.lead_id) return;
    snapshot.aiActions.add(r.id);
    const arr = aiByLead.get(r.lead_id) ?? [];
    arr.push(rowToAiAction(r));
    aiByLead.set(r.lead_id, arr);
  });

  // ---- leads ----
  const leads: Lead[] = (leadRows ?? []).map((r) =>
    rowToLead(r, interByLead.get(r.id) ?? [], aiByLead.get(r.id) ?? []),
  );
  leads.forEach((l) => snapshot.leads.set(l.id, JSON.stringify(leadToInsert(l))));

  // ---- tasks ----
  const tasks: Task[] = (taskRows ?? []).map(rowToTask);
  const leadOwnerMap = new Map<string, string | null>();
  (leadRows ?? []).forEach((r) => leadOwnerMap.set(r.id, r.owner_id));
  tasks.forEach((t) => {
    const owner = leadOwnerMap.get(t.leadId) ?? null;
    snapshot.tasks.set(t.id, JSON.stringify(taskToInsert(t, owner)));
  });

  // ---- proposals ----
  const itemsByProp = new Map<string, ProposalItem[]>();
  (pItemRows ?? []).forEach((r: PItemRow) => {
    const item: ProposalItem = {
      id: r.id,
      productId: r.product_id ?? "",
      description: r.description,
      sku: r.sku,
      unit: r.unit as ProductUnit,
      quantity: Number(r.quantity ?? 0),
      unitPrice: Number(r.unit_price ?? 0),
    };
    const arr = itemsByProp.get(r.proposta_id) ?? [];
    arr.push(item);
    itemsByProp.set(r.proposta_id, arr);
    snapshot.proposalItems.set(r.id, JSON.stringify({ ...r }));
  });
  const parcByProp = new Map<string, PaymentInstallment[]>();
  (pParcRows ?? []).forEach((r: PParcelaRow) => {
    const p: PaymentInstallment = {
      id: r.id,
      days: r.days,
      amount: Number(r.amount ?? 0),
      notes: r.notes ?? "",
    };
    const arr = parcByProp.get(r.proposta_id) ?? [];
    arr.push(p);
    parcByProp.set(r.proposta_id, arr);
    snapshot.proposalParcelas.set(r.id, JSON.stringify({ ...r }));
  });
  const proposals: Proposal[] = (propRows ?? []).map((r) =>
    rowToProposal(r, itemsByProp.get(r.id) ?? [], parcByProp.get(r.id) ?? []),
  );
  proposals.forEach((p) => snapshot.proposals.set(p.id, JSON.stringify(proposalToInsert(p))));

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
    maxDiscountPercentVendedor:
      typeof sys.maxDiscountPercentVendedor === "number" ? sys.maxDiscountPercentVendedor : 3,
    agent: usr.agent ?? s.agent,
    currentUserId: userId,
  });
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
  const tables = [
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
  tables.forEach((table) => {
    const ch = supabase
      .channel(`crm-sync-${table}-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => scheduleReload(),
      )
      .subscribe();
    realtimeChannels.push(ch);
  });
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
}

function scheduleReload() {
  if (!currentUserId || !hydrated) return;
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => {
    if (!currentUserId) return;
    const uid = currentUserId;
    suppressSave = true;
    void loadAll(uid)
      .catch((e) => console.warn("[crm-sync] realtime reload:", e))
      .finally(() => {
        suppressSave = false;
      });
  }, 800);
}

// ============ Save (write-through com diff) ============

function scheduleSave() {
  if (!hydrated || !currentUserId || suppressSave) return;
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
  };
  const sysJson = JSON.stringify(sysPayload);
  if (sysJson !== snapshot.systemJson && isAdmin) {
    const { error } = await supabase
      .from("system_workspace")
      .update({ data: sysPayload })
      .eq("id", 1);
    if (!error) snapshot.systemJson = sysJson;
  }

  // ---- user_workspaces (agent do próprio usuário) ----
  const usrPayload = { agent: state.agent };
  const usrJson = JSON.stringify(usrPayload);
  if (usrJson !== snapshot.userJson) {
    const { error } = await supabase
      .from("user_workspaces")
      .upsert({ user_id: userId, data: usrPayload }, { onConflict: "user_id" });
    if (!error) snapshot.userJson = usrJson;
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
    });
    // update default flag isolado se apenas ele mudou
    if (state.defaultEmitterId !== snapshot.defaultEmitterId) {
      await supabase.from("emitters").update({ is_default: false }).neq("id", state.defaultEmitterId);
      await supabase
        .from("emitters")
        .update({ is_default: true })
        .eq("id", state.defaultEmitterId);
      snapshot.defaultEmitterId = state.defaultEmitterId;
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
        description: x.item.description,
        sku: x.item.sku,
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
          description: x.item.description,
          sku: x.item.sku,
          unit: x.item.unit,
          quantity: x.item.quantity,
          unit_price: x.item.unitPrice,
        })),
        { onConflict: "id" },
      ),
    del: (ids) => supabase.from("proposta_itens").delete().in("id", ids),
  });

  // ---- proposta_parcelas ----
  const allParc: Array<{ propId: string; index: number; parc: PaymentInstallment }> = [];
  state.proposals.forEach((p) =>
    p.installments.forEach((pa, idx) => allParc.push({ propId: p.id, index: idx, parc: pa })),
  );
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
        })),
        { onConflict: "id" },
      ),
    del: (ids) => supabase.from("proposta_parcelas").delete().in("id", ids),
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
}) {
  const { current, snapshot: snap, toKey, toJson, upsert, del } = opts;
  const currentIds = new Set<string>();
  const toUpsert: T[] = [];
  for (const item of current) {
    const k = toKey(item);
    currentIds.add(k);
    const j = toJson(item);
    if (snap.get(k) !== j) toUpsert.push(item);
  }
  const toDelete: string[] = [];
  snap.forEach((_, k) => {
    if (!currentIds.has(k)) toDelete.push(k);
  });

  if (toUpsert.length) {
    const { error } = await upsert(toUpsert);
    if (!error) {
      toUpsert.forEach((item) => snap.set(toKey(item), toJson(item)));
    } else {
      console.warn("[crm-sync] upsert error:", error);
    }
  }
  if (toDelete.length) {
    const { error } = await del(toDelete);
    if (!error) {
      toDelete.forEach((k) => snap.delete(k));
    } else {
      console.warn("[crm-sync] delete error:", error);
    }
  }
}
