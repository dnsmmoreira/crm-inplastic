import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { normalizarTexto, normalizarEmail } from "@/lib/normalizacao";

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

/**
 * Listagem global de pessoas (tela /contatos).
 * Reaproveita os mesmos tipos/colunas usados pelo ContatosSection e traz o nome
 * da empresa vinculada (lead ou cliente) por embed do PostgREST.
 * Visibilidade: RLS de `contatos` (e dos embeds) — sem client de serviço.
 */
export type ContatoListaRow = ContatoRow & {
  vinculo: "lead" | "cliente" | null;
  empresa: string | null;
};

export const listTodosContatos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data?: { q?: string; page?: number; pageSize?: number }) => ({
    q: (data?.q ?? "").trim(),
    page: Math.max(1, Number(data?.page ?? 1)),
    pageSize: Math.min(100, Math.max(1, Number(data?.pageSize ?? 25))),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let query = supabase
      .from("contatos")
      .select(
        `${SELECT_COLS}, lead:leads(company), cliente:clientes(razao_social, nome_fantasia)`,
        { count: "exact" },
      );

    const term = data.q;
    if (term) {
      const like = `%${term}%`;
      const partes = [
        `nome.ilike.${like}`,
        `telefone.ilike.${like}`,
        `telefone2.ilike.${like}`,
        `email.ilike.${like}`,
      ];

      // Busca por empresa: resolve ids de leads/clientes que batem com o termo.
      const [leadsRes, clientesRes] = await Promise.all([
        supabase.from("leads").select("id").ilike("company", like).limit(300),
        supabase
          .from("clientes")
          .select("id")
          .or(`razao_social.ilike.${like},nome_fantasia.ilike.${like}`)
          .limit(300),
      ]);
      const leadIds = (leadsRes.data ?? []).map((r) => r.id);
      const clienteIds = (clientesRes.data ?? []).map((r) => r.id);
      if (leadIds.length) partes.push(`lead_id.in.(${leadIds.join(",")})`);
      if (clienteIds.length) partes.push(`cliente_id.in.(${clienteIds.join(",")})`);

      query = query.or(partes.join(","));
    }

    query = query
      .order("ativo", { ascending: false })
      .order("nome", { ascending: true })
      .range(from, to);

    const { data: rows, count, error } = await query;
    if (error) throw new Error(error.message);

    const lista: ContatoListaRow[] = (
      (rows ?? []) as unknown as (ContatoRow & {
        lead: { company: string | null } | null;
        cliente: { razao_social: string | null; nome_fantasia: string | null } | null;
      })[]
    ).map((r) => {
      const { lead, cliente, ...rest } = r;
      const empresa = lead
        ? lead.company
        : cliente
          ? cliente.razao_social || cliente.nome_fantasia
          : null;
      return {
        ...rest,
        vinculo: r.lead_id ? "lead" : r.cliente_id ? "cliente" : null,
        empresa: empresa || null,
      };
    });

    return { rows: lista, count: count ?? 0 };
  });

export const criarContato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
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
      nome: normalizarTexto(data?.nome),
      papel: String(data?.papel ?? "outro"),
      cargo: normalizarTexto(data?.cargo) || null,
      telefone: data?.telefone?.trim() || null,
      email: normalizarEmail(data?.email) || null,
    }),
  )
  .handler(async ({ data, context }) => {
    if (!data.nome) throw new Error("Informe o nome do contato");
    if (!data.leadId && !data.clienteId)
      throw new Error("Contato precisa estar vinculado a um lead ou cliente");
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
    if (!row)
      throw new Error("Não foi possível criar o contato (sem permissão para este registro).");
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
