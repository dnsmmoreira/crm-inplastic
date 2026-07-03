import { create } from "zustand";
import { persist } from "zustand/middleware";

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
  aiActions?: AiAction[];
};

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

type CrmState = {
  leads: Lead[];
  tasks: Task[];
  whatsapp: WhatsappMessage[];
  calendar: CalendarSlot[];
  agent: AgentSettings;
  addLead: (l: Omit<Lead, "id" | "createdAt" | "lastContact" | "interactions">) => string;
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
};

const uid = () => Math.random().toString(36).slice(2, 10);

export const useCrm = create<CrmState>()(
  persist(
    (set, get) => ({
      leads: seedLeads,
      tasks: seedTasks,
      whatsapp: seedWhatsapp,
      calendar: seedCalendar,
      agent: defaultAgent,
      addLead: (l) => {
        const id = uid();
        set((s) => ({
          leads: [
            {
              ...l,
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
      updateLead: (id, patch) =>
        set((s) => ({ leads: s.leads.map((l) => (l.id === id ? { ...l, ...patch } : l)) })),
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
    }),
    { name: "pdp-crm-v2" },
  ),
);

export const formatBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
