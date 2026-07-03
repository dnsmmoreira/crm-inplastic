/**
 * Ponte entre a autenticação Supabase e o store CRM.
 *
 * - Ao logar: carrega `system_workspace` (cadastros globais) e o(s) `user_workspaces` visíveis pelo usuário
 *   (vendedor vê o próprio; admin vê todos e recebe uma união em memória).
 * - Ao alterar qualquer coisa no store: agenda um autosave debounced que reparticiona o estado por
 *   dono e grava cada workspace afetado. Cadastros globais (produtos, condições, empresas) vão para
 *   `system_workspace` (a RLS bloqueia gravação por não-admins, o que é o comportamento desejado).
 * - Ao deslogar: limpa memória.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  useCrm,
  DEFAULT_EMITTERS,
  DEFAULT_PAYMENT_TERMS,
  type Lead,
  type Task,
  type Proposal,
  type Product,
  type EmitterProfile,
  type PaymentTerm,
  type AgentSettings,
} from "@/lib/crm-store";

type SystemPayload = {
  products?: Product[];
  paymentTerms?: PaymentTerm[];
  emitters?: EmitterProfile[];
  defaultEmitterId?: string;
  maxDiscountPercentVendedor?: number;
};

type UserPayload = {
  leads?: Lead[];
  tasks?: Task[];
  proposals?: Proposal[];
  agent?: AgentSettings;
};

let currentUserId: string | null = null;
let currentRole: "admin" | "vendedor" | null = null;
let hydrated = false;
let subscribed = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSavedJson = new Map<string, string>(); // key = "user:<id>" or "system"
let lastSystemSavedJson: string | null = null;

const seedProductsList: Product[] = [
  {
    id: "p-pbr1210", sku: "PBR-1210", name: "Pallet PBR 1210 Preto",
    description: "Pallet plástico padrão PBR 1000x1200mm, cor preta, alta resistência.",
    unit: "Un", weightKg: 18, heightCm: 14, widthCm: 100, lengthCm: 120,
    ncm: "3923.10.90", defaultPrice: 185, active: true,
  },
  {
    id: "p-exp1210", sku: "EXP-1210", name: "Pallet Exportação 1210",
    description: "Pallet plástico para exportação, dispensa NIMF-15, empilhável.",
    unit: "Un", weightKg: 16, heightCm: 15, widthCm: 100, lengthCm: 120,
    ncm: "3923.10.90", defaultPrice: 210, active: true,
  },
  {
    id: "p-hig1210", sku: "HIG-1210", name: "Pallet Higiênico 1210",
    description: "Pallet higiênico para frigoríficos e farmacêutica, superfície fechada.",
    unit: "Un", weightKg: 22, heightCm: 15, widthCm: 100, lengthCm: 120,
    ncm: "3923.10.90", defaultPrice: 245, active: true,
  },
  {
    id: "p-ref1210", sku: "REF-1210", name: "Pallet Reforçado 1210",
    description: "Pallet reforçado para cargas até 2.000 kg, indústria pesada.",
    unit: "Un", weightKg: 25, heightCm: 15, widthCm: 100, lengthCm: 120,
    ncm: "3923.10.90", defaultPrice: 275, active: true,
  },
];

export async function hydrateCrmForUser(userId: string, role: "admin" | "vendedor") {
  currentUserId = userId;
  currentRole = role;
  hydrated = false;

  // ---- Sistema (cadastros globais) ----
  const { data: sysRow, error: sysErr } = await supabase
    .from("system_workspace")
    .select("data")
    .eq("id", 1)
    .maybeSingle();
  if (sysErr) console.warn("[crm-sync] system_workspace read:", sysErr.message);

  const sys = (sysRow?.data ?? {}) as SystemPayload;
  const needsSeed = !sys.products || sys.products.length === 0;
  const systemState: Required<SystemPayload> = {
    products: sys.products?.length ? sys.products : seedProductsList,
    paymentTerms: sys.paymentTerms?.length ? sys.paymentTerms : DEFAULT_PAYMENT_TERMS,
    emitters: sys.emitters?.length ? sys.emitters : DEFAULT_EMITTERS,
    defaultEmitterId:
      sys.defaultEmitterId && (sys.emitters ?? DEFAULT_EMITTERS).some((e) => e.id === sys.defaultEmitterId)
        ? sys.defaultEmitterId
        : (sys.emitters ?? DEFAULT_EMITTERS)[0].id,
    maxDiscountPercentVendedor:
      typeof sys.maxDiscountPercentVendedor === "number" ? sys.maxDiscountPercentVendedor : 3,
  };

  // Se o sistema está vazio e o usuário é admin, grava o seed inicial (a RLS impede vendedor).
  if (needsSeed && role === "admin") {
    const { error } = await supabase
      .from("system_workspace")
      .update({ data: systemState })
      .eq("id", 1);
    if (error) console.warn("[crm-sync] system seed write:", error.message);
  }

  // ---- Workspaces de usuário ----
  const leads: Lead[] = [];
  const tasks: Task[] = [];
  const proposals: Proposal[] = [];
  let agent: AgentSettings | null = null;

  if (role === "admin") {
    const { data: rows, error } = await supabase
      .from("user_workspaces")
      .select("user_id, data");
    if (error) console.warn("[crm-sync] admin workspaces read:", error.message);
    (rows ?? []).forEach((row) => {
      const d = (row.data ?? {}) as UserPayload;
      if (Array.isArray(d.leads)) leads.push(...d.leads);
      if (Array.isArray(d.tasks)) tasks.push(...d.tasks);
      if (Array.isArray(d.proposals)) proposals.push(...d.proposals);
      if (row.user_id === userId && d.agent) agent = d.agent;
      lastSavedJson.set(`user:${row.user_id}`, JSON.stringify(d));
    });
  } else {
    const { data: row, error } = await supabase
      .from("user_workspaces")
      .select("data")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) console.warn("[crm-sync] user workspace read:", error.message);
    const d = (row?.data ?? {}) as UserPayload;
    if (Array.isArray(d.leads)) leads.push(...d.leads);
    if (Array.isArray(d.tasks)) tasks.push(...d.tasks);
    if (Array.isArray(d.proposals)) proposals.push(...d.proposals);
    if (d.agent) agent = d.agent;
    lastSavedJson.set(`user:${userId}`, JSON.stringify(d));
  }

  lastSystemSavedJson = JSON.stringify(systemState);

  useCrm.setState({
    products: systemState.products,
    paymentTerms: systemState.paymentTerms,
    emitters: systemState.emitters,
    defaultEmitterId: systemState.defaultEmitterId,
    maxDiscountPercentVendedor: systemState.maxDiscountPercentVendedor,
    leads,
    tasks,
    proposals,
    ...(agent ? { agent } : {}),
    currentUserId: userId,
  });

  hydrated = true;

  if (!subscribed) {
    subscribed = true;
    useCrm.subscribe(() => scheduleSave());
  }
}

export function clearCrmState() {
  currentUserId = null;
  currentRole = null;
  hydrated = false;
  lastSavedJson.clear();
  lastSystemSavedJson = null;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  useCrm.setState({
    leads: [],
    tasks: [],
    proposals: [],
    currentUserId: "",
  });
}

function scheduleSave() {
  if (!hydrated || !currentUserId) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void doSave().catch((e) => console.warn("[crm-sync] save failed:", e));
  }, 600);
}

async function doSave() {
  if (!hydrated || !currentUserId || !currentRole) return;
  const state = useCrm.getState();

  // ---- Cadastros globais ----
  const systemPayload: Required<SystemPayload> = {
    products: state.products,
    paymentTerms: state.paymentTerms,
    emitters: state.emitters,
    defaultEmitterId: state.defaultEmitterId,
    maxDiscountPercentVendedor: state.maxDiscountPercentVendedor,
  };
  const systemJson = JSON.stringify(systemPayload);
  if (systemJson !== lastSystemSavedJson && currentRole === "admin") {
    const { error } = await supabase
      .from("system_workspace")
      .update({ data: systemPayload })
      .eq("id", 1);
    if (error) console.warn("[crm-sync] system save:", error.message);
    else lastSystemSavedJson = systemJson;
  }

  // ---- Workspaces por dono ----
  const owners = new Set<string>();
  owners.add(currentUserId);
  state.leads.forEach((l) => owners.add(l.ownerId));
  state.proposals.forEach((p) => owners.add(p.ownerId));

  const writable =
    currentRole === "admin" ? Array.from(owners) : [currentUserId];

  for (const ownerId of writable) {
    const ownerLeads = state.leads.filter((l) => l.ownerId === ownerId);
    const ownerLeadIds = new Set(ownerLeads.map((l) => l.id));
    const ownerTasks = state.tasks.filter((t) => ownerLeadIds.has(t.leadId));
    const ownerProposals = state.proposals.filter((p) => p.ownerId === ownerId);
    const payload: UserPayload = {
      leads: ownerLeads,
      tasks: ownerTasks,
      proposals: ownerProposals,
      ...(ownerId === currentUserId ? { agent: state.agent } : {}),
    };
    const json = JSON.stringify(payload);
    if (json === lastSavedJson.get(`user:${ownerId}`)) continue;

    const { error } = await supabase
      .from("user_workspaces")
      .upsert({ user_id: ownerId, data: payload }, { onConflict: "user_id" });
    if (error) console.warn(`[crm-sync] workspace save ${ownerId}:`, error.message);
    else lastSavedJson.set(`user:${ownerId}`, json);
  }
}
