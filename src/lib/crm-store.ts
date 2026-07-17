import { create } from "zustand";
import { useMemo } from "react";
import { useAuth } from "@/hooks/use-auth";
import { DEFAULT_FLEET, type FleetVehicle } from "@/lib/logistica";


export type UserRole = "admin" | "vendedor";
export type User = { id: string; name: string; role: UserRole; avatarColor: string };

export const USERS: User[] = [
  { id: "u-admin", name: "Ana (Admin)", role: "admin", avatarColor: "#0f766e" },
  { id: "u-bruno", name: "Bruno Vendas", role: "vendedor", avatarColor: "#2563eb" },
  { id: "u-carla", name: "Carla Vendas", role: "vendedor", avatarColor: "#db2777" },
  { id: "u-diego", name: "Diego Vendas", role: "vendedor", avatarColor: "#ea580c" },
];


export type StageId =
  | "atendimento"
  | "novo"
  | "qualificacao"
  | "proposta"
  | "negociacao"
  | "ganho"
  | "perdido";

export const STAGES: { id: StageId; label: string; color: string }[] = [
  { id: "atendimento", label: "Em Atendimento", color: "var(--stage-atend, #22c55e)" },
  { id: "novo", label: "Nova Solicitação", color: "var(--stage-novo)" },
  { id: "qualificacao", label: "Qualificação", color: "var(--stage-qualif)" },
  { id: "proposta", label: "Proposta Enviada", color: "var(--stage-proposta)" },
  { id: "negociacao", label: "Negociação", color: "var(--stage-negoc)" },
  { id: "ganho", label: "Fechado / Ganho", color: "var(--stage-ganho)" },
  { id: "perdido", label: "Perdido", color: "var(--stage-perdido)" },
];

export type ProductType =
  | "Pallet Standard 1000x1200"
  | "Pallet Exportação"
  | "Pallet Higiênico"
  | "Pallet Reforçado"
  | "Pallet Sob Medida";

export const PRODUCTS: ProductType[] = [
  "Pallet Standard 1000x1200",
  "Pallet Exportação",
  "Pallet Higiênico",
  "Pallet Reforçado",
  "Pallet Sob Medida",
];

export type Interaction = {
  id: string;
  date: string;
  type: "email" | "call" | "meeting" | "note" | "whatsapp";
  content: string;
};

export type AiAction = {
  id: string;
  date: string;
  type: "followup" | "schedule" | "qualify" | "reply";
  content: string;
};

export type LeadAddress = {
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
};

export type Lead = {
  id: string;
  company: string;
  contactName: string;
  email: string;
  phone: string;
  product: string;
  productId?: string;
  quantity: number;
  estimatedValue: number;
  stage: StageId;
  tags: string[];
  segment?: string;
  source: string;
  createdAt: string;
  lastContact: string;
  nextFollowUp?: string;
  notes: string;
  interactions: Interaction[];
  aiActions?: AiAction[];
  ownerId: string;
  clienteId?: string | null;
  // Dados fiscais
  cnpj?: string;
  razaoSocial?: string;
  nomeFantasia?: string;
  inscricaoEstadual?: string;
  inscricaoMunicipal?: string;
  // Endereço
  endereco?: LeadAddress;
  // Contato ampliado
  emailFinanceiro?: string;
  emailNfXml?: string;
  telefoneFixo?: string;
  whatsapp?: string;
  site?: string;
  // Qualificação comercial
  porte?: string;
  cnaePrincipal?: string;
  faturamentoEstimado?: number;
  numFuncionarios?: number;
  decisorNome?: string;
  decisorCargo?: string;
  // Cadastro fiscal complementar (CNPJá)
  dataAbertura?: string;
  capitalSocial?: number;
  naturezaJuridica?: string;
  simplesOptante?: boolean;
  simplesDesde?: string;
  suframa?: { numero: string; status: string; desde: string; aprovado: boolean }[];
  socios?: { nome: string; qualificacao: string; desde: string; taxId?: string }[];

};


export const DEFAULT_LEAD_TAGS: string[] = [
  "Recorrente",
  "Alto Valor",
  "Exportação",
  "Urgente",
  "Indicação",
  "Novo Cliente",
];

export const DEFAULT_LEAD_SEGMENTS: string[] = [
  "Ind Alimentos",
  "Ind Farmaceutica",
  "Hospitais",
  "Supermercado",
  "Atacarejo",
  "Farmacia",
  "Ind Cosmetico",
  "Agropecuaria",
  "Energia",
  "Orgão Publico",
];


export type Task = {
  id: string;
  leadId: string;
  title: string;
  dueDate: string;
  done: boolean;
};

export type WhatsappMessage = {
  id: string;
  phone: string;
  name?: string;
  message: string;
  receivedAt: string;
  status: "novo" | "convertido" | "ignorado";
  leadId?: string;
};

export type CalendarSlot = {
  id: string;
  date: string;
  durationMin: number;
  status: "livre" | "ocupado" | "agendado_ia";
  title?: string;
  leadId?: string;
};

export type AgentSettings = {
  autoFollowUp: boolean;
  followUpDelayHours: number;
  autoSchedule: boolean;
  autoQualify: boolean;
  calendarConnected: boolean;
  calendarProvider: "google" | "outlook";
  vendorEmail: string;
  tone: "consultivo" | "direto" | "amigavel";
};

const now = new Date();
const iso = (daysFromNow: number, hour = 10, min = 0) => {
  const d = new Date(now.getTime() + daysFromNow * 86400000);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
};

const seedLeads: Lead[] = [
  {
    id: "l1",
    company: "Frigorífico Sul LTDA",
    contactName: "Marcos Andrade",
    email: "compras@frigosul.com.br",
    phone: "(51) 99887-1122",
    product: "Pallet Higiênico",
    quantity: 800,
    estimatedValue: 152000,
    stage: "negociacao",
    tags: ["Frigorífico", "Recorrente"],
    source: "Formulário Site",
    ownerId: "u-bruno",
    createdAt: iso(-45),
    lastContact: iso(-2),
    nextFollowUp: iso(1),
    notes: "Cliente exige certificação sanitária. Volume anual estimado 3.500 pallets.",
    interactions: [
      { id: "i1", date: iso(-45), type: "email", content: "Solicitação de orçamento via site." },
      { id: "i2", date: iso(-30), type: "call", content: "Alinhamento técnico com engenharia." },
      { id: "i3", date: iso(-10), type: "meeting", content: "Reunião com diretoria de compras." },
      { id: "i4", date: iso(-2), type: "whatsapp", content: "Enviada revisão da proposta comercial." },
    ],
    aiActions: [
      { id: "a1", date: iso(-6), type: "followup", content: "Lead ficou 4 dias sem resposta. IA enviou WhatsApp: \"Oi Marcos, tudo bem? Podemos agendar 15min para tirar dúvidas sobre a proposta?\"" },
      { id: "a2", date: iso(-3), type: "schedule", content: "IA agendou reunião com Marcos na agenda do vendedor para quinta-feira 15h — confirmada pelo lead via WhatsApp." },
    ],
  },
  {
    id: "l2",
    company: "Indústria Química Norte",
    contactName: "Renata Lima",
    email: "renata@iqnorte.com.br",
    phone: "(92) 98765-4321",
    product: "Pallet Reforçado",
    quantity: 450,
    estimatedValue: 98000,
    stage: "proposta",
    tags: ["Química", "Exportação"],
    source: "Formulário Site",
    ownerId: "u-carla",
    createdAt: iso(-20),
    lastContact: iso(-5),
    nextFollowUp: iso(3),
    notes: "Carga de 1.500kg por pallet. Precisam certificado de resistência.",
    interactions: [
      { id: "i5", date: iso(-20), type: "email", content: "Recebemos briefing via site." },
      { id: "i6", date: iso(-15), type: "call", content: "Confirmação de especificações." },
      { id: "i7", date: iso(-5), type: "email", content: "Proposta comercial enviada." },
    ],
    aiActions: [
      { id: "a3", date: iso(-2), type: "followup", content: "IA enviou lembrete automático: \"Renata, você teve chance de revisar a proposta? Posso ajudar em algum ponto técnico.\"" },
    ],
  },
  {
    id: "l3",
    company: "Logística Ápice",
    contactName: "Fernando Costa",
    email: "fernando@apicelog.com",
    phone: "(11) 3344-5566",
    product: "Pallet Standard 1000x1200",
    quantity: 1200,
    estimatedValue: 210000,
    stage: "qualificacao",
    tags: ["Logística"],
    source: "Formulário Site",
    ownerId: "u-bruno",
    createdAt: iso(-7),
    lastContact: iso(-1),
    nextFollowUp: iso(2),
    notes: "Avaliando substituir pallets de madeira.",
    interactions: [
      { id: "i8", date: iso(-7), type: "email", content: "Orçamento solicitado no site." },
      { id: "i9", date: iso(-1), type: "call", content: "Levantamento de necessidades." },
    ],
    aiActions: [],
  },
  {
    id: "l4",
    company: "AgroExport Brasil",
    contactName: "Juliana Prado",
    email: "juliana@agroexport.com.br",
    phone: "(62) 99123-4567",
    product: "Pallet Exportação",
    quantity: 2000,
    estimatedValue: 420000,
    stage: "novo",
    tags: ["Exportação", "Agro", "Alto Valor"],
    source: "Formulário Site",
    ownerId: "u-diego",
    createdAt: iso(-1),
    lastContact: iso(-1),
    nextFollowUp: iso(1),
    notes: "Contrato anual. Norma NIMF-15 dispensada (plástico).",
    interactions: [
      { id: "i10", date: iso(-1), type: "email", content: "Novo lead do site — orçamento inicial." },
    ],
    aiActions: [
      { id: "a4", date: iso(0), type: "qualify", content: "IA fez pré-qualificação automática: identificou volume alto (2.000 un) e mercado de exportação — priorizado como Alto Valor." },
    ],
  },
  {
    id: "l5",
    company: "Farma Distribuidora",
    contactName: "Carlos Vieira",
    email: "compras@farmadist.com.br",
    phone: "(21) 98800-7766",
    product: "Pallet Higiênico",
    quantity: 300,
    estimatedValue: 64000,
    stage: "ganho",
    tags: ["Farma"],
    source: "Formulário Site",
    ownerId: "u-carla",
    createdAt: iso(-90),
    lastContact: iso(-3),
    notes: "Fechado! Entrega em 2 lotes.",
    interactions: [
      { id: "i11", date: iso(-3), type: "email", content: "Pedido confirmado." },
    ],
    aiActions: [],
  },
  {
    id: "l6",
    company: "Bebidas Cristal",
    contactName: "Patrícia Souza",
    email: "patricia@bebidascristal.com",
    phone: "(48) 99911-2200",
    product: "Pallet Standard 1000x1200",
    quantity: 600,
    estimatedValue: 108000,
    stage: "negociacao",
    tags: ["Bebidas"],
    source: "Formulário Site",
    ownerId: "u-bruno",
    createdAt: iso(-60),
    lastContact: iso(-7),
    nextFollowUp: iso(2),
    notes: "Aguardando aprovação do financeiro.",
    interactions: [
      { id: "i12", date: iso(-60), type: "email", content: "Orçamento inicial." },
      { id: "i13", date: iso(-7), type: "call", content: "Follow-up de negociação." },
    ],
    aiActions: [],
  },
  {
    id: "l7",
    company: "Metalúrgica Vega",
    contactName: "Eduardo Rocha",
    email: "eduardo@metvega.com.br",
    phone: "(31) 3322-1100",
    product: "Pallet Reforçado",
    quantity: 250,
    estimatedValue: 58000,
    stage: "proposta",
    tags: ["Indústria Pesada"],
    source: "Formulário Site",
    ownerId: "u-diego",
    createdAt: iso(-35),
    lastContact: iso(-4),
    nextFollowUp: iso(4),
    notes: "Cargas de até 2.000 kg.",
    interactions: [
      { id: "i14", date: iso(-35), type: "email", content: "Solicitação recebida." },
      { id: "i15", date: iso(-4), type: "email", content: "Proposta v2 enviada." },
    ],
    aiActions: [],
  },
];

const seedTasks: Task[] = [
  { id: "t1", leadId: "l1", title: "Ligar para Marcos — revisão contrato", dueDate: iso(0), done: false },
  { id: "t2", leadId: "l4", title: "Enviar proposta inicial AgroExport", dueDate: iso(0), done: false },
  { id: "t3", leadId: "l3", title: "Agendar visita técnica Ápice", dueDate: iso(1), done: false },
  { id: "t4", leadId: "l2", title: "Follow-up Renata (proposta)", dueDate: iso(2), done: false },
  { id: "t5", leadId: "l6", title: "Retorno financeiro Bebidas Cristal", dueDate: iso(3), done: false },
];

const seedWhatsapp: WhatsappMessage[] = [
  {
    id: "w1",
    phone: "(11) 98555-2211",
    name: "Ricardo Menezes",
    message: "Bom dia! Preciso de orçamento de 500 pallets standard para agosto. Podem me atender?",
    receivedAt: iso(0, 9, 12),
    status: "novo",
  },
  {
    id: "w2",
    phone: "(19) 99432-1187",
    message: "Olá, vocês trabalham com pallet higiênico para frigorífico? Volume seria 1.200 un/mês.",
    receivedAt: iso(0, 8, 47),
    status: "novo",
  },
  {
    id: "w3",
    phone: "(21) 3344-1200",
    name: "Compras — Distribuidora Aliança",
    message: "Recebi o link no site. Gostaria de proposta para exportação (contêiner cheio).",
    receivedAt: iso(-1, 17, 30),
    status: "convertido",
    leadId: "l4",
  },
  {
    id: "w4",
    phone: "(41) 98800-4432",
    name: "Otávio (Logística RS)",
    message: "Ainda tem estoque de pallet reforçado? Preciso urgente 80 un.",
    receivedAt: iso(0, 7, 55),
    status: "novo",
  },
];

const seedCalendar: CalendarSlot[] = [
  { id: "c1", date: iso(0, 9, 0), durationMin: 60, status: "ocupado", title: "Reunião interna comercial" },
  { id: "c2", date: iso(0, 11, 0), durationMin: 30, status: "livre" },
  { id: "c3", date: iso(0, 14, 0), durationMin: 45, status: "agendado_ia", title: "Call — Marcos (Frigorífico Sul)", leadId: "l1" },
  { id: "c4", date: iso(0, 16, 0), durationMin: 30, status: "livre" },
  { id: "c5", date: iso(1, 9, 30), durationMin: 60, status: "ocupado", title: "Visita técnica Ápice" },
  { id: "c6", date: iso(1, 11, 0), durationMin: 30, status: "livre" },
  { id: "c7", date: iso(1, 15, 0), durationMin: 45, status: "agendado_ia", title: "Follow-up — Renata (IQ Norte)", leadId: "l2" },
  { id: "c8", date: iso(2, 10, 0), durationMin: 30, status: "livre" },
  { id: "c9", date: iso(2, 14, 0), durationMin: 60, status: "ocupado", title: "Apresentação AgroExport" },
  { id: "c10", date: iso(3, 9, 0), durationMin: 30, status: "livre" },
];

const defaultAgent: AgentSettings = {
  autoFollowUp: true,
  followUpDelayHours: 48,
  autoSchedule: true,
  autoQualify: true,
  calendarConnected: true,
  calendarProvider: "google",
  vendorEmail: "vendas@palletdeplastico.com.br",
  tone: "consultivo",
};

export type ProductUnit = "Un" | "Kg" | "Cj";
export const PRODUCT_UNITS: ProductUnit[] = ["Un", "Kg", "Cj"];

export type Product = {
  id: string;
  sku: string;
  name: string;
  description: string;
  unit: ProductUnit;
  weightKg: number;      // peso unitário
  heightCm: number;
  widthCm: number;
  lengthCm: number;
  ncm: string;
  defaultPrice: number;  // preço unitário sugerido
  active: boolean;
  pecasPorColuna: number; // logística: quantas peças empilham por coluna
  family?: string;        // agrupador opcional (ex.: "HV", "Container Bin")
};

const seedProducts: Product[] = [
  {
    id: "p-pbr1210",
    sku: "PBR-1210",
    name: "Pallet PBR 1210 Preto",
    description: "Pallet plástico padrão PBR 1000x1200mm, cor preta, alta resistência.",
    unit: "Un",
    weightKg: 18,
    heightCm: 14,
    widthCm: 100,
    lengthCm: 120,
    ncm: "3923.10.90",
    defaultPrice: 185,
    active: true,
    pecasPorColuna: 20,
    family: "PBR",
  },
  {
    id: "p-exp1210",
    sku: "EXP-1210",
    name: "Pallet Exportação 1210",
    description: "Pallet plástico para exportação, dispensa NIMF-15, empilhável.",
    unit: "Un",
    weightKg: 16,
    heightCm: 15,
    widthCm: 100,
    lengthCm: 120,
    ncm: "3923.10.90",
    defaultPrice: 210,
    active: true,
    pecasPorColuna: 18,
    family: "Exportação",
  },
  {
    id: "p-hig1210",
    sku: "HIG-1210",
    name: "Pallet Higiênico 1210",
    description: "Pallet higiênico para frigoríficos e farmacêutica, superfície fechada.",
    unit: "Un",
    weightKg: 22,
    heightCm: 15,
    widthCm: 100,
    lengthCm: 120,
    ncm: "3923.10.90",
    defaultPrice: 245,
    active: true,
    pecasPorColuna: 18,
    family: "Higiênico",
  },
  {
    id: "p-ref1210",
    sku: "REF-1210",
    name: "Pallet Reforçado 1210",
    description: "Pallet reforçado para cargas até 2.000 kg, indústria pesada.",
    unit: "Un",
    weightKg: 25,
    heightCm: 15,
    widthCm: 100,
    lengthCm: 120,
    ncm: "3923.10.90",
    defaultPrice: 275,
    active: true,
    pecasPorColuna: 15,
    family: "Reforçado",
  },
];

// ============ Propostas comerciais ============

export type ProposalItem = {
  id: string;
  productId: string;          // DEPRECATED — mantido só p/ compat com itens antigos
  omieCodigoProduto?: number; // Código do produto no Omie (novo campo canônico)
  description: string; // snapshot
  sku: string;         // snapshot
  unit: ProductUnit;
  quantity: number;
  unitPrice: number;
};

export type PaymentInstallment = {
  id: string;
  days: number;
  amount: number;
  notes: string;
};

export type TransportInfo = {
  carrier: string;
  freightPayer: "CIF" | "FOB";
  grossWeightKg: number;
  cubageM3: number;               // volume cúbico total (m³)
  volumes: number;
  freightValue: number;           // valor definitivo (usado para total)
  approxFreightValue: number;     // valor aproximado informado pelo vendedor
  deliveryCep?: string;           // CEP de entrega
  deliveryAddress?: string;       // endereço resolvido pela API
  distanceKm?: number;            // distância rodoviária origem → destino
};

export type FreightConfig = {
  originCep: string;
  originAddress: string;
  rateBRLPerKgKm: number;         // R$ por kg transportado por km
  cubageFactorKgPerM3: number;    // fator de cubagem rodoviário (padrão 300 kg/m³)
};

export const DEFAULT_FREIGHT_CONFIG: FreightConfig = {
  originCep: "22320-050",
  originAddress: "Rio de Janeiro - RJ",
  rateBRLPerKgKm: 0.001,
  cubageFactorKgPerM3: 300,
};

export type ProposalStatus =
  | "rascunho"
  | "enviada"
  | "aguardando_aprovacao"   // CIF fechado pelo vendedor, aguardando ADM
  | "aprovada"
  | "recusada"
  | "pedido";                // pedido efetivamente gerado (após aprovação ou FOB direto)

export type Proposal = {
  id: string;
  number: string;           // ex: 2026-0001
  leadId: string;
  ownerId: string;
  createdAt: string;
  status: ProposalStatus;
  validityDays: number;
  items: ProposalItem[];
  installments: PaymentInstallment[];
  transport: TransportInfo;
  observations: string;
  paymentTermId?: string;   // ADM-managed payment term chosen by seller
  emitterId: string;        // qual CNPJ do grupo emite esta proposta
  discountPercent: number;  // % de desconto aplicado sobre o subtotal (limite gerido pelo ADM)
  approvalRequestedAt?: string;
  approvalReason?: string;
  approvedByUserId?: string;
  approvedAt?: string;
  orderCreatedAt?: string;
  expectedDeliveryDate?: string; // yyyy-MM-dd — informa data prevista de entrega ao Omie
  // Solicitação/liberação de alteração em pedido já fechado
  editRequestedAt?: string;
  editRequestReason?: string;
  editRequestedByUserId?: string;
  editUnlockedAt?: string;
  editUnlockedByUserId?: string;
  // Rastreio da integração Omie (server-managed — não persistido pelo store)
  omieStatus?: "pendente" | "enviado" | "erro" | "nao_aplicavel" | null;
  omieNumeroPedido?: string | null;
  omieCodigoPedido?: number | null;
  omieErro?: string | null;
  omieEnviadoEm?: string | null;
};



export type PaymentMethod = "Boleto" | "PIX" | "Depósito em Conta" | "Cartão" | "Dinheiro";

export type PaymentTerm = {
  id: string;
  label: string;             // ex: "Boleto 30/60/90 dias"
  method: PaymentMethod;
  splits: number[];          // days per installment; [0] = à vista
  notes?: string;
  active: boolean;           // ADM toggle — only active terms show in seller dropdown
};

/** Seed de 20 condições comerciais mais usadas — o administrador pode editar. */
export const DEFAULT_PAYMENT_TERMS: PaymentTerm[] = [
  { id: "pix-avista",        label: "PIX à vista",                       method: "PIX",                splits: [0],              notes: "Com 3% de desconto", active: true },
  { id: "pix-7",             label: "PIX 7 dias",                        method: "PIX",                splits: [7],              active: true },
  { id: "pix-14",            label: "PIX 14 dias",                       method: "PIX",                splits: [14],             active: true },
  { id: "pix-28",            label: "PIX 28 dias",                       method: "PIX",                splits: [28],             active: true },
  { id: "dinheiro-avista",   label: "Dinheiro à vista",                  method: "Dinheiro",           splits: [0],              notes: "Com 5% de desconto", active: true },
  { id: "dep-avista",        label: "Depósito em Conta à vista",         method: "Depósito em Conta",  splits: [0],              active: true },
  { id: "dep-15",            label: "Depósito em Conta 15 dias",         method: "Depósito em Conta",  splits: [15],             active: true },
  { id: "boleto-avista",     label: "Boleto à vista",                    method: "Boleto",             splits: [0],              active: true },
  { id: "boleto-14",         label: "Boleto 14 dias",                    method: "Boleto",             splits: [14],             active: true },
  { id: "boleto-21",         label: "Boleto 21 dias",                    method: "Boleto",             splits: [21],             active: true },
  { id: "boleto-28",         label: "Boleto 28 dias",                    method: "Boleto",             splits: [28],             active: true },
  { id: "boleto-30",         label: "Boleto 30 dias",                    method: "Boleto",             splits: [30],             active: true },
  { id: "boleto-2x-30-60",   label: "Boleto 2x — 30/60 dias",            method: "Boleto",             splits: [30, 60],         active: true },
  { id: "boleto-3x-30-60-90",label: "Boleto 3x — 30/60/90 dias",         method: "Boleto",             splits: [30, 60, 90],     active: true },
  { id: "boleto-4x",         label: "Boleto 4x — 30/60/90/120 dias",     method: "Boleto",             splits: [30, 60, 90, 120], active: true },
  { id: "boleto-6x",         label: "Boleto 6x — 30 a 180 dias",         method: "Boleto",             splits: [30, 60, 90, 120, 150, 180], active: true },
  { id: "boleto-entrada-30", label: "Boleto — entrada + 30 dias",        method: "Boleto",             splits: [0, 30],          active: true },
  { id: "cartao-avista",     label: "Cartão à vista",                    method: "Cartão",             splits: [0],              active: true },
  { id: "cartao-3x",         label: "Cartão 3x sem juros",               method: "Cartão",             splits: [0, 30, 60],      active: true },
  { id: "cartao-6x",         label: "Cartão 6x sem juros",               method: "Cartão",             splits: [0, 30, 60, 90, 120, 150], active: true },
];

/** @deprecated use `useCrm(s => s.paymentTerms)` — kept for legacy imports. */
export const PAYMENT_TERMS = DEFAULT_PAYMENT_TERMS;


export type EmitterProfile = {
  id: string;
  brand: string;             // nome fantasia / marca curta usada no cabeçalho
  tagline?: string;          // subtítulo abaixo da marca no documento
  legalName: string;
  cnpj: string;
  ie: string;
  address: string;
  phone: string;
  whatsapp: string;
  email: string;
  website: string;
};

export const DEFAULT_EMITTERS: EmitterProfile[] = [
  {
    id: "taoplast",
    brand: "PALLET DE PLÁSTICO",
    tagline: "Indústria e comércio de produtos plásticos",
    legalName: "TAOPLAST Indústria e Comércio de Produtos Plásticos LTDA",
    cnpj: "00.000.000/0001-00",
    ie: "000.000.000.000",
    address: "Av. Industrial, 1000 — Distrito Industrial — São Paulo/SP — CEP 00000-000",
    phone: "(11) 4000-0000",
    whatsapp: "(11) 90000-0000",
    email: "vendas@palletdeplastico.com.br",
    website: "www.palletdeplastico.com.br",
  },
  {
    id: "inplastic",
    brand: "INPLASTIC",
    tagline: "Comércio de produtos plásticos",
    legalName: "INPLASTIC Comércio de Produtos Plásticos LTDA – ME",
    cnpj: "19.959.992/0001-07",
    ie: "143.366.452.110",
    address: "Rua Capitão Busse, 854 — Parque Edu Chaves — São Paulo/SP — CEP 02232-050",
    phone: "(11) 2372-2225",
    whatsapp: "(11) 2372-2225",
    email: "inplastic@inplastic.com.br",
    website: "www.inplastic.com.br",
  },
  {
    id: "licitaplas",
    brand: "LICITAPLAS",
    tagline: "Comércio de plásticos",
    legalName: "LICITAPLAS Comércio de Plásticos LTDA (Limitada Unipessoal – ME)",
    cnpj: "39.871.995/0001-00",
    ie: "—",
    address: "Rua Luis Sergio Person, 223 — Parque Mandaqui — São Paulo/SP — CEP 02422-230",
    phone: "(11) 2372-2225",
    whatsapp: "(11) 2372-2225",
    email: "contato@licitaplas.com.br",
    website: "www.licitaplas.com.br",
  },
];

const DEFAULT_EMITTER_ID = DEFAULT_EMITTERS[0].id;




type CrmState = {
  leads: Lead[];
  tasks: Task[];
  whatsapp: WhatsappMessage[];
  calendar: CalendarSlot[];
  agent: AgentSettings;
  currentUserId: string;
  setCurrentUser: (id: string) => void;
  addLead: (l: Omit<Lead, "id" | "createdAt" | "lastContact" | "interactions" | "ownerId"> & { ownerId?: string }) => string;
  updateLead: (id: string, patch: Partial<Lead>) => void;
  removeLead: (id: string) => void;
  moveLead: (id: string, stage: StageId) => void;
  addInteraction: (leadId: string, i: Omit<Interaction, "id">) => void;
  addAiAction: (leadId: string, a: Omit<AiAction, "id">) => void;
  addTask: (t: Omit<Task, "id" | "done">) => void;
  toggleTask: (id: string) => void;
  removeTask: (id: string) => void;
  receiveWhatsapp: (m: Omit<WhatsappMessage, "id" | "receivedAt" | "status">) => void;
  convertWhatsappToLead: (id: string) => string | null;
  ignoreWhatsapp: (id: string) => void;
  updateAgent: (patch: Partial<AgentSettings>) => void;
  bookSlotWithAi: (slotId: string, leadId: string, title: string) => void;
  runAiFollowUp: (leadId: string) => void;
  // Produtos
  products: Product[];
  addProduct: (p: Omit<Product, "id">) => string;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  removeProduct: (id: string) => void;
  // Propostas
  proposals: Proposal[];
  emitters: EmitterProfile[];
  defaultEmitterId: string;
  maxDiscountPercentVendedor: number; // limite (%) para desconto por vendedor; ADM só define
  setMaxDiscountPercentVendedor: (pct: number) => void;
  setDefaultEmitter: (id: string) => void;
  updateEmitter: (id: string, patch: Partial<Omit<EmitterProfile, "id">>) => void;

  createProposal: (leadId: string, ownerId?: string) => Promise<string>;
  updateProposal: (id: string, patch: Partial<Proposal>) => void;
  removeProposal: (id: string) => void;
  addProposalItem: (proposalId: string, productId: string, quantity: number) => void;
  addProposalItemFromOmie: (
    proposalId: string,
    omie: { omieCodigoProduto: number; description: string; sku: string; unit: string; unitPrice: number },
    quantity: number,
  ) => void;
  updateProposalItem: (proposalId: string, itemId: string, patch: Partial<ProposalItem>) => void;
  removeProposalItem: (proposalId: string, itemId: string) => void;
  setProposalStatus: (id: string, status: ProposalStatus) => void;
  // Payment terms (ADM-managed catalogue)
  paymentTerms: PaymentTerm[];
  addPaymentTerm: (t: Omit<PaymentTerm, "id">) => string;
  updatePaymentTerm: (id: string, patch: Partial<Omit<PaymentTerm, "id">>) => void;
  removePaymentTerm: (id: string) => void;
  togglePaymentTermActive: (id: string) => void;
  resetPaymentTerms: () => void;
  // Lead tags & segments (ADM-managed catalogue)
  leadTags: string[];
  leadSegments: string[];
  addLeadTag: (t: string) => void;
  removeLeadTag: (t: string) => void;
  addLeadSegment: (s: string) => void;
  removeLeadSegment: (s: string) => void;
  // Freight config (ADM-managed)
  freightConfig: FreightConfig;
  setFreightConfig: (patch: Partial<FreightConfig>) => void;

  // Frota (ADM-managed) — alimenta calculadora de logística
  fleet: FleetVehicle[];
  setFleet: (list: FleetVehicle[]) => void;
  upsertFleetVehicle: (v: FleetVehicle) => void;
  removeFleetVehicle: (id: string) => void;
};

const uid = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10);

export const useCrm = create<CrmState>()(
  (set, get) => ({
      leads: [],
      tasks: [],
      whatsapp: seedWhatsapp,

      calendar: seedCalendar,
      agent: defaultAgent,
      currentUserId: "",
      setCurrentUser: (id) => set({ currentUserId: id }),
      addLead: (l) => {
        const id = uid();
        const newCnpj = (l.cnpj ?? "").replace(/\D/g, "");
        if (newCnpj) {
          const dup = get().leads.find(
            (x) => (x.cnpj ?? "").replace(/\D/g, "") === newCnpj,
          );
          if (dup) {
            throw new Error(
              `CNPJ já cadastrado para "${dup.company}". Solicite ao ADM a transferência do lead.`,
            );
          }
        }
        set((s) => ({
          leads: [
            {
              ...l,
              ownerId: l.ownerId ?? get().currentUserId,
              id,
              createdAt: new Date().toISOString(),
              lastContact: new Date().toISOString(),
              interactions: [
                {
                  id: uid(),
                  date: new Date().toISOString(),
                  type: "note",
                  content: "Lead criado no CRM.",
                },
              ],
              aiActions: [],
            },
            ...s.leads,
          ],
        }));
        return id;
      },
      updateLead: (id, patch) => {
        if (patch.cnpj !== undefined) {
          const newCnpj = (patch.cnpj ?? "").replace(/\D/g, "");
          if (newCnpj) {
            const dup = get().leads.find(
              (x) => x.id !== id && (x.cnpj ?? "").replace(/\D/g, "") === newCnpj,
            );
            if (dup) {
              throw new Error(`CNPJ já cadastrado para "${dup.company}".`);
            }
          }
        }
        set((s) => ({ leads: s.leads.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
      },
      removeLead: (id) =>
        set((s) => ({
          leads: s.leads.filter((l) => l.id !== id),
          tasks: s.tasks.filter((t) => t.leadId !== id),
        })),
      moveLead: (id, stage) =>
        set((s) => ({
          leads: s.leads.map((l) =>
            l.id === id ? { ...l, stage, lastContact: new Date().toISOString() } : l,
          ),
        })),
      addInteraction: (leadId, i) =>
        set((s) => ({
          leads: s.leads.map((l) =>
            l.id === leadId
              ? { ...l, lastContact: i.date, interactions: [{ ...i, id: uid() }, ...l.interactions] }
              : l,
          ),
        })),
      addAiAction: (leadId, a) =>
        set((s) => ({
          leads: s.leads.map((l) =>
            l.id === leadId
              ? { ...l, aiActions: [{ ...a, id: uid() }, ...(l.aiActions ?? [])] }
              : l,
          ),
        })),
      addTask: (t) => set((s) => ({ tasks: [...s.tasks, { ...t, id: uid(), done: false }] })),
      toggleTask: (id) =>
        set((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)) })),
      removeTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
      receiveWhatsapp: (m) =>
        set((s) => ({
          whatsapp: [
            { ...m, id: uid(), receivedAt: new Date().toISOString(), status: "novo" },
            ...s.whatsapp,
          ],
        })),
      convertWhatsappToLead: (id) => {
        const msg = get().whatsapp.find((w) => w.id === id);
        if (!msg) return null;
        const leadId = uid();
        const nowIso = new Date().toISOString();
        set((s) => ({
          leads: [
            {
              id: leadId,
              company: msg.name ?? `Contato WhatsApp ${msg.phone}`,
              contactName: msg.name ?? "A identificar",
              email: "",
              phone: msg.phone,
              product: "Pallet Standard 1000x1200",
              quantity: 0,
              estimatedValue: 0,
              stage: "atendimento",
              tags: ["WhatsApp"],
              source: "WhatsApp",
              ownerId: get().currentUserId,
              createdAt: nowIso,
              lastContact: msg.receivedAt,
              notes: `Primeira mensagem: "${msg.message}"`,
              interactions: [
                { id: uid(), date: msg.receivedAt, type: "whatsapp", content: msg.message },
              ],
              aiActions: [
                {
                  id: uid(),
                  date: nowIso,
                  type: "qualify",
                  content: "IA capturou lead via WhatsApp automaticamente e iniciou triagem.",
                },
              ],
            },
            ...s.leads,
          ],
          whatsapp: s.whatsapp.map((w) =>
            w.id === id ? { ...w, status: "convertido", leadId } : w,
          ),
        }));
        return leadId;
      },
      ignoreWhatsapp: (id) =>
        set((s) => ({
          whatsapp: s.whatsapp.map((w) => (w.id === id ? { ...w, status: "ignorado" } : w)),
        })),
      updateAgent: (patch) => set((s) => ({ agent: { ...s.agent, ...patch } })),
      bookSlotWithAi: (slotId, leadId, title) =>
        set((s) => ({
          calendar: s.calendar.map((c) =>
            c.id === slotId ? { ...c, status: "agendado_ia", title, leadId } : c,
          ),
          leads: s.leads.map((l) =>
            l.id === leadId
              ? {
                  ...l,
                  aiActions: [
                    {
                      id: uid(),
                      date: new Date().toISOString(),
                      type: "schedule",
                      content: `IA agendou "${title}" na agenda do vendedor de forma autônoma.`,
                    },
                    ...(l.aiActions ?? []),
                  ],
                }
              : l,
          ),
        })),
      runAiFollowUp: (leadId) => {
        const lead = get().leads.find((l) => l.id === leadId);
        if (!lead) return;
        const nowIso = new Date().toISOString();
        set((s) => ({
          leads: s.leads.map((l) =>
            l.id === leadId
              ? {
                  ...l,
                  lastContact: nowIso,
                  aiActions: [
                    {
                      id: uid(),
                      date: nowIso,
                      type: "followup",
                      content: `IA enviou WhatsApp automático: "Olá ${lead.contactName.split(" ")[0]}, notei que ainda não tivemos retorno. Posso ajudar com dúvidas sobre a proposta?"`,
                    },
                    ...(l.aiActions ?? []),
                  ],
                }
              : l,
          ),
        }));
      },

      // ============ Produtos ============
      products: seedProducts,
      addProduct: (p) => {
        const id = uid();
        set((s) => ({ products: [{ ...p, id }, ...s.products] }));
        return id;
      },
      updateProduct: (id, patch) =>
        set((s) => ({ products: s.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      removeProduct: (id) =>
        set((s) => ({ products: s.products.filter((p) => p.id !== id) })),

      // ============ Propostas ============
      proposals: [],
      emitters: DEFAULT_EMITTERS,
      defaultEmitterId: DEFAULT_EMITTER_ID,
      maxDiscountPercentVendedor: 3,
      setMaxDiscountPercentVendedor: (pct) =>
        set({ maxDiscountPercentVendedor: Math.max(0, Math.min(100, pct)) }),
      setDefaultEmitter: (id) => set({ defaultEmitterId: id }),
      updateEmitter: (id, patch) =>
        set((s) => ({
          emitters: s.emitters.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),
      createProposal: async (leadId, ownerId) => {
        const id = uid();
        const year = new Date().getFullYear();
        const { supabase } = await import("@/integrations/supabase/client");
        const { toast } = await import("sonner");

        // Aloca número atomicamente no servidor para evitar colisão de UNIQUE
        // entre vendedores (RLS oculta propostas de terceiros no cliente).
        let number = `${year}-${String(get().proposals.filter((p) => p.number.startsWith(`${year}-`)).length + 1).padStart(4, "0")}`;
        try {
          const { data, error } = await supabase.rpc("next_proposta_number", { _year: year });
          if (!error && typeof data === "string" && data.length > 0) number = data;
        } catch {
          // fallback já definido acima
        }

        const finalOwnerId = ownerId ?? get().currentUserId;
        const emitterId = get().defaultEmitterId || get().emitters[0]?.id;
        if (!emitterId) {
          toast.error("Nenhum emitente configurado — peça ao admin para cadastrar um emitente antes de criar propostas.");
          throw new Error("no default emitter");
        }
        if (!finalOwnerId) {
          toast.error("Sessão expirada — faça login novamente.");
          throw new Error("no owner");
        }

        const proposal: Proposal = {
          id,
          number,
          leadId,
          ownerId: finalOwnerId,
          createdAt: new Date().toISOString(),
          status: "rascunho",
          validityDays: 15,
          emitterId,
          items: [],
          installments: [
            { id: uid(), days: 28, amount: 0, notes: "Boleto — 28 dias" },
          ],
          transport: {
            carrier: "A definir",
            freightPayer: "FOB",
            grossWeightKg: 0,
            cubageM3: 0,
            volumes: 0,
            freightValue: 0,
            approxFreightValue: 0,
          },
          observations:
            "Proposta comercial válida por 15 dias. Preços em reais, impostos inclusos conforme legislação vigente. Prazo de entrega a combinar após aprovação.",
          discountPercent: 0,
        };

        // Persistência direta e síncrona: cria no banco AGORA, com erro visível.
        // O sync batched só cobre updates subsequentes (que já sobrescrevem esta linha).
        const { error: insertError } = await supabase.from("propostas").insert({
          id: proposal.id,
          number: proposal.number,
          lead_id: proposal.leadId,
          owner_id: proposal.ownerId,
          emitter_id: proposal.emitterId,
          status: proposal.status,
          validity_days: proposal.validityDays,
          discount_percent: proposal.discountPercent,
          observations: proposal.observations,
          transport: proposal.transport as never,
          created_at: proposal.createdAt,
        });
        if (insertError) {
          console.error("[createProposal] insert error:", insertError);
          toast.error(`Erro ao salvar proposta: ${insertError.message}`);
          throw insertError;
        }

        set((s) => ({ proposals: [proposal, ...s.proposals] }));
        return id;
      },

      updateProposal: (id, patch) =>
        set((s) => ({ proposals: s.proposals.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      removeProposal: (id) =>
        set((s) => ({ proposals: s.proposals.filter((p) => p.id !== id) })),
      addProposalItem: (proposalId, productId, quantity) => {
        const product = get().products.find((p) => p.id === productId);
        if (!product) return;
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === proposalId
              ? {
                  ...p,
                  items: [
                    ...p.items,
                    {
                      id: uid(),
                      productId: product.id,
                      omieCodigoProduto: undefined,
                      description: product.name,
                      sku: product.sku,
                      unit: product.unit,
                      quantity,
                      unitPrice: product.defaultPrice,
                    },
                  ],
                }
              : p,
          ),
        }));
      },
      addProposalItemFromOmie: (proposalId, omie, quantity) => {
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === proposalId
              ? {
                  ...p,
                  items: [
                    ...p.items,
                    {
                      id: uid(),
                      productId: "",
                      omieCodigoProduto: omie.omieCodigoProduto,
                      description: omie.description,
                      sku: omie.sku,
                      unit: (omie.unit || "Un") as ProductUnit,
                      quantity,
                      unitPrice: omie.unitPrice,
                    },
                  ],
                }
              : p,
          ),
        }));
      },
      updateProposalItem: (proposalId, itemId, patch) =>
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === proposalId
              ? { ...p, items: p.items.map((it) => (it.id === itemId ? { ...it, ...patch } : it)) }
              : p,
          ),
        })),
      removeProposalItem: (proposalId, itemId) =>
        set((s) => ({
          proposals: s.proposals.map((p) =>
            p.id === proposalId ? { ...p, items: p.items.filter((it) => it.id !== itemId) } : p,
          ),
        })),
      setProposalStatus: (id, status) =>
        set((s) => ({
          proposals: s.proposals.map((p) => (p.id === id ? { ...p, status } : p)),
        })),

      // ============ Payment Terms (ADM catalogue) ============
      paymentTerms: DEFAULT_PAYMENT_TERMS,
      addPaymentTerm: (t) => {
        const id = uid();
        set((s) => ({ paymentTerms: [...s.paymentTerms, { ...t, id }] }));
        return id;
      },
      updatePaymentTerm: (id, patch) =>
        set((s) => ({
          paymentTerms: s.paymentTerms.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        })),
      removePaymentTerm: (id) =>
        set((s) => ({ paymentTerms: s.paymentTerms.filter((t) => t.id !== id) })),
      togglePaymentTermActive: (id) =>
        set((s) => ({
          paymentTerms: s.paymentTerms.map((t) => (t.id === id ? { ...t, active: !t.active } : t)),
        })),
      resetPaymentTerms: () => set({ paymentTerms: DEFAULT_PAYMENT_TERMS }),

      // ============ Lead tags & segments ============
      leadTags: DEFAULT_LEAD_TAGS,
      leadSegments: DEFAULT_LEAD_SEGMENTS,
      addLeadTag: (t) =>
        set((s) => {
          const v = t.trim();
          if (!v || s.leadTags.some((x) => x.toLowerCase() === v.toLowerCase())) return s;
          return { leadTags: [...s.leadTags, v] };
        }),
      removeLeadTag: (t) =>
        set((s) => ({ leadTags: s.leadTags.filter((x) => x !== t) })),
      addLeadSegment: (seg) =>
        set((s) => {
          const v = seg.trim();
          if (!v || s.leadSegments.some((x) => x.toLowerCase() === v.toLowerCase())) return s;
          return { leadSegments: [...s.leadSegments, v] };
        }),
      removeLeadSegment: (seg) =>
        set((s) => ({ leadSegments: s.leadSegments.filter((x) => x !== seg) })),

      // ============ Freight config ============
      freightConfig: DEFAULT_FREIGHT_CONFIG,
      setFreightConfig: (patch) =>
        set((s) => ({ freightConfig: { ...s.freightConfig, ...patch } })),

      fleet: DEFAULT_FLEET,
      setFleet: (list) => set({ fleet: list }),
      upsertFleetVehicle: (v) =>
        set((s) => {
          const idx = s.fleet.findIndex((x) => x.id === v.id);
          if (idx < 0) return { fleet: [...s.fleet, v] };
          const next = s.fleet.slice();
          next[idx] = v;
          return { fleet: next };
        }),
      removeFleetVehicle: (id) => set((s) => ({ fleet: s.fleet.filter((v) => v.id !== id) })),
    }),
);


export const formatBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

// Current user is derived from the authenticated session (see src/hooks/use-auth.tsx).
// Legacy USERS array is kept only to display owner names on seeded/legacy records.

export const useCurrentUser = (): User => {
  const { user } = useAuth();
  if (user) {
    return { id: user.id, name: user.name, role: user.role, avatarColor: user.avatarColor };
  }
  return { id: "__anon__", name: "Convidado", role: "vendedor", avatarColor: "#64748b" };
};

export const useIsAdmin = () => {
  const { user } = useAuth();
  return user?.role === "admin";
};

export const useVisibleLeads = () => {
  const leads = useCrm((s) => s.leads);
  const user = useCurrentUser();
  return useMemo(
    () => (user.role === "admin" ? leads : leads.filter((l) => l.ownerId === user.id)),
    [leads, user],
  );
};

export const useVisibleTasks = () => {
  const tasks = useCrm((s) => s.tasks);
  const leads = useVisibleLeads();
  return useMemo(() => {
    const ids = new Set(leads.map((l) => l.id));
    return tasks.filter((t) => ids.has(t.leadId));
  }, [tasks, leads]);
};

/** Best seller of the current month, based on ganho leads. */
export const useBestSellerOfMonth = () => {
  const leads = useCrm((s) => s.leads);
  return useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const totals = new Map<string, { value: number; deals: number }>();
    leads.forEach((l) => {
      if (l.stage !== "ganho") return;
      const d = new Date(l.lastContact ?? l.createdAt);
      if (d.getFullYear() !== y || d.getMonth() !== m) return;
      const cur = totals.get(l.ownerId) ?? { value: 0, deals: 0 };
      cur.value += l.estimatedValue;
      cur.deals += 1;
      totals.set(l.ownerId, cur);
    });
    // Fallback: if no wins this month, use last 90 days
    if (totals.size === 0) {
      const cutoff = Date.now() - 90 * 86400000;
      leads.forEach((l) => {
        if (l.stage !== "ganho") return;
        if (new Date(l.lastContact ?? l.createdAt).getTime() < cutoff) return;
        const cur = totals.get(l.ownerId) ?? { value: 0, deals: 0 };
        cur.value += l.estimatedValue;
        cur.deals += 1;
        totals.set(l.ownerId, cur);
      });
    }
    let bestId: string | null = null;
    let best = { value: 0, deals: 0 };
    totals.forEach((v, k) => {
      if (v.value > best.value) { best = v; bestId = k; }
    });
    const user = bestId ? USERS.find((u) => u.id === bestId) : null;
    return user ? { user, value: best.value, deals: best.deals } : null;
  }, [leads]);
};


export const useVisibleProposals = () => {
  const proposals = useCrm((s) => s.proposals);
  const user = useCurrentUser();
  return useMemo(
    () => (user.role === "admin" ? proposals : proposals.filter((p) => p.ownerId === user.id)),
    [proposals, user],
  );
};

export const proposalTotals = (p: Proposal) => {
  const items = Array.isArray(p?.items) ? p.items : [];
  const transport = p?.transport ?? ({} as Proposal["transport"]);
  const subtotal = items.reduce((s, i) => s + (Number(i?.quantity) || 0) * (Number(i?.unitPrice) || 0), 0);
  const pct = Math.max(0, Math.min(100, p?.discountPercent ?? 0));
  const discountAmount = +(subtotal * (pct / 100)).toFixed(2);
  const subtotalAfterDiscount = +(subtotal - discountAmount).toFixed(2);
  const total = subtotalAfterDiscount + (Number(transport?.freightValue) || 0);
  const qty = items.reduce((s, i) => s + (Number(i?.quantity) || 0), 0);
  return { subtotal, discountPercent: pct, discountAmount, subtotalAfterDiscount, total, qty, count: items.length };
};

/** Limite máximo de desconto (%) que um vendedor pode aplicar em uma proposta. Configurável pelo admin. */
export const useMaxDiscountForCurrentUser = () => {
  const max = useCrm((s) => s.maxDiscountPercentVendedor);
  const user = useCurrentUser();
  return user.role === "admin" ? 100 : max;
};

export type TemperatureLevel = "hot" | "warm" | "cold" | "frozen";
export type Temperature = {
  level: TemperatureLevel;
  label: string;
  days: number;
  emoji: string;
  className: string;
  hint: string;
};

/** Lead temperature based on inactivity (days since lastContact). */
export const leadTemperature = (
  lead: Pick<Lead, "lastContact" | "createdAt" | "stage">,
): Temperature => {
  const ref = new Date(lead.lastContact ?? lead.createdAt).getTime();
  const days = Math.max(0, Math.floor((Date.now() - ref) / 86400000));
  const hint = days === 0 ? "Contato hoje" : `${days} dia${days === 1 ? "" : "s"} sem contato`;
  if (lead.stage === "perdido")
    return { level: "frozen", label: "Congelado", days, emoji: "🧊",
      className: "bg-slate-500/15 text-slate-600 border-slate-500/30", hint };
  if (lead.stage === "ganho" || days <= 2)
    return { level: "hot", label: "Quente", days, emoji: "🔥",
      className: "bg-red-500/15 text-red-600 border-red-500/30", hint };
  if (days <= 5)
    return { level: "warm", label: "Morno", days, emoji: "☀️",
      className: "bg-amber-500/15 text-amber-700 border-amber-500/30", hint };
  if (days <= 14)
    return { level: "cold", label: "Frio", days, emoji: "❄️",
      className: "bg-blue-500/15 text-blue-600 border-blue-500/30", hint };
  return { level: "frozen", label: "Congelado", days, emoji: "🧊",
    className: "bg-slate-500/15 text-slate-600 border-slate-500/30", hint };
};

export type FollowupLevel = "urgent" | "attention" | "scheduled" | "ok";
export type FollowupTemperature = {
  level: FollowupLevel;
  label: string;
  emoji: string;
  className: string;
  hint: string;
  /** Positive = overdue days, negative = days until, null = no followup */
  overdueDays: number | null;
};

/** Agenda temperature: urgência de retorno baseada em nextFollowUp e inatividade. */
export const followupTemperature = (
  lead: Pick<Lead, "nextFollowUp" | "lastContact" | "createdAt" | "stage">,
): FollowupTemperature => {
  if (lead.stage === "ganho" || lead.stage === "perdido") {
    return { level: "ok", label: "Encerrado", emoji: "✓",
      className: "bg-slate-500/15 text-slate-600 border-slate-500/30",
      hint: "Lead encerrado", overdueDays: null };
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const inactivity = Math.floor(
    (Date.now() - new Date(lead.lastContact ?? lead.createdAt).getTime()) / 86400000,
  );

  if (!lead.nextFollowUp) {
    if (inactivity > 7)
      return { level: "urgent", label: "Sem retorno", emoji: "🔥",
        className: "bg-red-500/15 text-red-600 border-red-500/30",
        hint: `Sem agenda · ${inactivity}d sem contato`, overdueDays: inactivity };
    return { level: "attention", label: "Sem agenda", emoji: "⚠️",
      className: "bg-amber-500/15 text-amber-700 border-amber-500/30",
      hint: "Nenhum follow-up programado", overdueDays: null };
  }

  const due = new Date(lead.nextFollowUp); due.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - due.getTime()) / 86400000);

  if (diff > 3)
    return { level: "urgent", label: "Atrasado", emoji: "🔥",
      className: "bg-red-500/15 text-red-600 border-red-500/30",
      hint: `Follow-up atrasado ${diff}d`, overdueDays: diff };
  if (diff >= 1)
    return { level: "attention", label: "Atrasado", emoji: "⚠️",
      className: "bg-amber-500/15 text-amber-700 border-amber-500/30",
      hint: `Follow-up atrasado ${diff}d`, overdueDays: diff };
  if (diff === 0)
    return { level: "attention", label: "Hoje", emoji: "📅",
      className: "bg-amber-500/15 text-amber-700 border-amber-500/30",
      hint: "Retorno hoje", overdueDays: 0 };
  return { level: "scheduled", label: "Agendado", emoji: "❄️",
    className: "bg-blue-500/15 text-blue-600 border-blue-500/30",
    hint: `Retorno em ${-diff}d`, overdueDays: diff };
};
