import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/auth.middleware";

export const PAPEIS_CONTATO = [
  { value: "comprador", label: "Comprador" },
  { value: "financeiro", label: "Financeiro" },
  { value: "nf_xml", label: "Envio de NF/XML" },
  { value: "decisor", label: "Decisor" },
  { value: "outro", label: "Outro" },
] as const;

export type PapelContato = (typeof PAPEIS_CONTATO)[number]["value"];

export function papelLabel(papel: string): string {
  return PAPEIS_CONTATO.find((p) => p.value === papel)?.label ?? papel;
}

export type ContatoRow = {
  id: string;
  nome: string;
  papel: string;
  cargo: string | null;
  telefone: string | null;
  telefone2: string | null;
  email: string | null;
  observacao: string | null;
  lead_id: string | null;
  cliente_id: string | null;
  ativo: boolean;
  criado_em: string;
};

const SELECT_COLS =
  "id, nome, papel, cargo, telefone, telefone2, email, observacao, lead_id, cliente_id, ativo, criado_em";

const ORDEM_PAPEL: Record<string, number> = {
  comprador: 0,
  decisor: 1,
  financeiro: 2,
  nf_xml: 3,
  outro: 4,
};

function ordenar(rows: ContatoRow[]): ContatoRow[] {
  return [...rows].sort((a, b) => {
    if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
    const pa = ORDEM_PAPEL[a.papel] ?? 99;
    const pb = ORDEM_PAPEL[b.papel] ?? 99;
    if (pa !== pb) return pa - pb;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });
}

export const listContatos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { leadId?: string | null; clienteId?: string | null }) => ({
    leadId: data?.leadId ? String(data.leadId) : null,
    clienteId: data?.clienteId ? String(data.clienteId) : null,
  }))
  .handler(async ({ data, context }) => {
    if (!data.leadId && !data.clienteId) return [] as ContatoRow[];
    let q = context.supabase.from("contatos").select(SELECT_COLS);
    q = data.leadId ? q.eq("lead_id", data.leadId) : q.eq("cliente_id", data.clienteId as string);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return ordenar((rows ?? []) as ContatoRow[]);
  });

export const criarContato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    leadId?: string | null;
    clienteId?: string | null;
    nome: string;
    papel: string;
    cargo?: string | null;
    telefone?: string | null;
    email?: string | null;
  }) => ({
    leadId: data?.leadId ? String(data.leadId) : null,
    clienteId: data?.clienteId ? String(data.clienteId) : null,
    nome: String(data?.nome ?? "").trim(),
    papel: String(data?.papel ?? "outro"),
    cargo: data?.cargo?.trim() || null,
    telefone: data?.telefone?.trim() || null,
    email: data?.email?.trim() || null,
  }))
  .handler(async ({ data, context }) => {
    if (!data.nome) throw new Error("Informe o nome do contato");
    if (!data.leadId && !data.clienteId) throw new Error("Contato precisa estar vinculado a um lead ou cliente");
    if (!PAPEIS_CONTATO.some((p) => p.value === data.papel)) throw new Error("Papel inválido");

    const { data: row, error } = await context.supabase
      .from("contatos")
      .insert({
        nome: data.nome,
        papel: data.papel,
        cargo: data.cargo,
        telefone: data.telefone,
        email: data.email,
        lead_id: data.leadId,
        cliente_id: data.clienteId,
        criado_por: context.userId,
      })
      .select(SELECT_COLS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Não foi possível criar o contato (sem permissão para este registro).");
    return row as ContatoRow;
  });

export const alternarAtivoContato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; ativo: boolean }) => ({
    id: String(data?.id ?? ""),
    ativo: !!data?.ativo,
  }))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("contatos")
      .update({ ativo: data.ativo })
      .eq("id", data.id)
      .select(SELECT_COLS)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Não foi possível atualizar o contato (sem permissão).");
    return row as ContatoRow;
  });
