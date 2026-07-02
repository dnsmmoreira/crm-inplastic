import { create } from "zustand";
import { persist } from "zustand/middleware";

export type StageId =
  | "novo"
  | "qualificacao"
  | "proposta"
  | "negociacao"
  | "ganho"
  | "perdido";

export const STAGES: { id: StageId; label: string; color: string }[] = [
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
  date: string; // ISO
  type: "email" | "call" | "meeting" | "note" | "whatsapp";
  content: string;
};

export type Lead = {
  id: string;
  company: string;
  contactName: string;
  email: string;
  phone: string;
  product: ProductType;
  quantity: number;
  estimatedValue: number;
  stage: StageId;
  tags: string[];
  source: string;
  createdAt: string;
  lastContact: string;
  nextFollowUp?: string;
  notes: string;
  interactions: Interaction[];
};

export type Task = {
  id: string;
  leadId: string;
  title: string;
  dueDate: string; // ISO
  done: boolean;
};

const now = new Date();
const iso = (daysFromNow: number) =>
  new Date(now.getTime() + daysFromNow * 86400000).toISOString();

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
    createdAt: iso(-20),
    lastContact: iso(-5),
    nextFollowUp: iso(3),
    notes: "Carga de 1.500kg por pallet. Precisam certificado de resistência.",
    interactions: [
      { id: "i5", date: iso(-20), type: "email", content: "Recebemos briefing via site." },
      { id: "i6", date: iso(-15), type: "call", content: "Confirmação de especificações." },
      { id: "i7", date: iso(-5), type: "email", content: "Proposta comercial enviada." },
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
    createdAt: iso(-7),
    lastContact: iso(-1),
    nextFollowUp: iso(2),
    notes: "Avaliando substituir pallets de madeira.",
    interactions: [
      { id: "i8", date: iso(-7), type: "email", content: "Orçamento solicitado no site." },
      { id: "i9", date: iso(-1), type: "call", content: "Levantamento de necessidades." },
    ],
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
    createdAt: iso(-1),
    lastContact: iso(-1),
    nextFollowUp: iso(1),
    notes: "Contrato anual. Norma NIMF-15 dispensada (plástico).",
    interactions: [
      { id: "i10", date: iso(-1), type: "email", content: "Novo lead do site — orçamento inicial." },
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
    createdAt: iso(-90),
    lastContact: iso(-3),
    notes: "Fechado! Entrega em 2 lotes.",
    interactions: [
      { id: "i11", date: iso(-3), type: "email", content: "Pedido confirmado." },
    ],
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
    createdAt: iso(-60),
    lastContact: iso(-7),
    nextFollowUp: iso(2),
    notes: "Aguardando aprovação do financeiro.",
    interactions: [
      { id: "i12", date: iso(-60), type: "email", content: "Orçamento inicial." },
      { id: "i13", date: iso(-7), type: "call", content: "Follow-up de negociação." },
    ],
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
    createdAt: iso(-35),
    lastContact: iso(-4),
    nextFollowUp: iso(4),
    notes: "Cargas de até 2.000 kg.",
    interactions: [
      { id: "i14", date: iso(-35), type: "email", content: "Solicitação recebida." },
      { id: "i15", date: iso(-4), type: "email", content: "Proposta v2 enviada." },
    ],
  },
];

const seedTasks: Task[] = [
  { id: "t1", leadId: "l1", title: "Ligar para Marcos — revisão contrato", dueDate: iso(0), done: false },
  { id: "t2", leadId: "l4", title: "Enviar proposta inicial AgroExport", dueDate: iso(0), done: false },
  { id: "t3", leadId: "l3", title: "Agendar visita técnica Ápice", dueDate: iso(1), done: false },
  { id: "t4", leadId: "l2", title: "Follow-up Renata (proposta)", dueDate: iso(2), done: false },
  { id: "t5", leadId: "l6", title: "Retorno financeiro Bebidas Cristal", dueDate: iso(3), done: false },
];

type CrmState = {
  leads: Lead[];
  tasks: Task[];
  addLead: (l: Omit<Lead, "id" | "createdAt" | "lastContact" | "interactions">) => void;
  updateLead: (id: string, patch: Partial<Lead>) => void;
  removeLead: (id: string) => void;
  moveLead: (id: string, stage: StageId) => void;
  addInteraction: (leadId: string, i: Omit<Interaction, "id">) => void;
  addTask: (t: Omit<Task, "id" | "done">) => void;
  toggleTask: (id: string) => void;
  removeTask: (id: string) => void;
};

const uid = () => Math.random().toString(36).slice(2, 10);

export const useCrm = create<CrmState>()(
  persist(
    (set) => ({
      leads: seedLeads,
      tasks: seedTasks,
      addLead: (l) =>
        set((s) => ({
          leads: [
            {
              ...l,
              id: uid(),
              createdAt: new Date().toISOString(),
              lastContact: new Date().toISOString(),
              interactions: [
                {
                  id: uid(),
                  date: new Date().toISOString(),
                  type: "note",
                  content: "Lead criado manualmente no CRM.",
                },
              ],
            },
            ...s.leads,
          ],
        })),
      updateLead: (id, patch) =>
        set((s) => ({
          leads: s.leads.map((l) => (l.id === id ? { ...l, ...patch } : l)),
        })),
      removeLead: (id) =>
        set((s) => ({
          leads: s.leads.filter((l) => l.id !== id),
          tasks: s.tasks.filter((t) => t.leadId !== id),
        })),
      moveLead: (id, stage) =>
        set((s) => ({
          leads: s.leads.map((l) =>
            l.id === id
              ? { ...l, stage, lastContact: new Date().toISOString() }
              : l,
          ),
        })),
      addInteraction: (leadId, i) =>
        set((s) => ({
          leads: s.leads.map((l) =>
            l.id === leadId
              ? {
                  ...l,
                  lastContact: i.date,
                  interactions: [{ ...i, id: uid() }, ...l.interactions],
                }
              : l,
          ),
        })),
      addTask: (t) =>
        set((s) => ({
          tasks: [...s.tasks, { ...t, id: uid(), done: false }],
        })),
      toggleTask: (id) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
        })),
      removeTask: (id) =>
        set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
    }),
    { name: "pdp-crm-v1" },
  ),
);

export const formatBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
