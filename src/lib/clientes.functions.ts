import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { isValidCnpj, onlyDigitsCnpj, isValidCpf, onlyDigitsCpf } from "@/lib/cnpj";

export type TipoPessoa = "PJ" | "PF";

export type ClienteRow = {
  id: string;
  tipo_pessoa: TipoPessoa;
  cnpj: string | null;
  cpf: string | null;
  razao_social: string;
  nome_fantasia: string | null;
  inscricao_estadual: string | null;
  ie_isento: boolean | null;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  cidade: string | null;
  estado: string | null;
  contato: string | null;
  email: string | null;
  telefone: string | null;
  telefone2: string | null;
  website: string | null;
  observacao: string | null;
  empresa_padrao: string | null;
  vendedor_id: string | null;
  criado_por: string | null;
  criado_em: string;
  atualizado_em: string;
  ativo: boolean;
  omie_codigo_cliente_inplastic: number | null;
  omie_codigo_cliente_taoplast: number | null;
  simples_optante: boolean | null;
  suframa_isento: boolean | null;
  suframa_numero: string | null;
};

export type ClienteInput = {
  tipo_pessoa?: TipoPessoa;
  cnpj: string;
  cpf?: string | null;
  razao_social: string;
  nome_fantasia?: string | null;
  inscricao_estadual?: string | null;
  ie_isento?: boolean;
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cep?: string | null;
  cidade?: string | null;
  estado?: string | null;
  contato?: string | null;
  email?: string | null;
  telefone?: string | null;
  telefone2?: string | null;
  website?: string | null;
  observacao?: string | null;
  empresa_padrao: string;
  vendedor_id?: string | null;
  ativo?: boolean;
  simples_optante?: boolean | null;
  suframa_isento?: boolean | null;
  suframa_numero?: string | null;
};

function validateInput(d: ClienteInput): { errors: string[]; clean: ClienteInput } {
  const errors: string[] = [];
  const tipo: TipoPessoa = d.tipo_pessoa === "PF" ? "PF" : "PJ";

  const cnpj = onlyDigitsCnpj(d.cnpj ?? "");
  const cpf = onlyDigitsCpf(d.cpf ?? "");

  if (tipo === "PF") {
    if (cpf.length !== 11) errors.push("CPF deve conter 11 dígitos");
    else if (!isValidCpf(cpf)) errors.push("CPF inválido (dígitos verificadores)");
  } else {
    if (cnpj.length !== 14) errors.push("CNPJ deve conter 14 dígitos");
    else if (!isValidCnpj(cnpj)) errors.push("CNPJ inválido (dígitos verificadores)");
  }

  const razao = (d.razao_social ?? "").trim();
  if (!razao) errors.push(tipo === "PF" ? "Nome completo obrigatório" : "Razão social obrigatória");
  else if (/^cliente\s/i.test(razao)) errors.push('Nome não pode começar com "Cliente "');

  const empresa = (d.empresa_padrao ?? "").trim();
  if (!["INPLASTIC", "TAOPLAST", "LICITAPLAS"].includes(empresa)) {
    errors.push("Empresa padrão obrigatória");
  }

  const uf = (d.estado ?? "").trim().toUpperCase();
  if (uf && uf.length !== 2) errors.push("Estado (UF) deve ter 2 letras");

  return {
    errors,
    clean: {
      ...d,
      tipo_pessoa: tipo,
      cnpj: tipo === "PF" ? "" : cnpj,
      cpf: tipo === "PF" ? cpf : null,
      // PF não tem IE / Simples / SUFRAMA
      inscricao_estadual: tipo === "PF" ? null : d.inscricao_estadual ?? null,
      ie_isento: tipo === "PF" ? false : !!d.ie_isento,
      simples_optante: tipo === "PF" ? null : d.simples_optante ?? null,
      suframa_isento: tipo === "PF" ? null : d.suframa_isento ?? null,
      suframa_numero: tipo === "PF" ? null : d.suframa_numero ?? null,
      razao_social: razao,
      empresa_padrao: empresa,
      estado: uf || null,
    },
  };
}

// ==========================
// LIST
// ==========================
export const listClientes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    q?: string;
    empresa?: string;
    vendedorId?: string;
    somenteAtivos?: boolean;
    page?: number;
    pageSize?: number;
  }) => ({
    q: (data?.q ?? "").trim(),
    empresa: data?.empresa ?? "",
    vendedorId: data?.vendedorId ?? "",
    somenteAtivos: data?.somenteAtivos !== false,
    page: Math.max(1, Number(data?.page ?? 1)),
    pageSize: Math.min(100, Math.max(1, Number(data?.pageSize ?? 25))),
  }))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let query = supabase.from("clientes").select("*", { count: "exact" });

    if (data.somenteAtivos) query = query.eq("ativo", true);
    if (data.empresa) query = query.eq("empresa_padrao", data.empresa);
    if (data.vendedorId) query = query.eq("vendedor_id", data.vendedorId);

    const q = data.q.trim();
    if (q) {
      const digits = onlyDigitsCnpj(q);
      if (digits.length >= 3) {
        query = query.ilike("cnpj", `%${digits}%`);
      } else {
        const like = `%${q}%`;
        query = query.or(`razao_social.ilike.${like},nome_fantasia.ilike.${like}`);
      }
    }

    query = query.order("atualizado_em", { ascending: false }).range(from, to);

    const { data: rows, count, error } = await query;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as ClienteRow[], count: count ?? 0 };
  });

// ==========================
// GET BY ID
// ==========================
export const getCliente = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => ({ id: String(data?.id ?? "") }))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("clientes")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    return row as ClienteRow;
  });

// ==========================
// GET BY CNPJ (para dialog Nova Proposta)
// ==========================
export const getClienteByCnpj = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { cnpj: string }) => {
    const digits = onlyDigitsCnpj(data?.cnpj ?? "");
    return { cnpj: digits };
  })
  .handler(async ({ data, context }) => {
    if (data.cnpj.length !== 14) return null;
    // Nota: uso ilike em cnpj para tolerar formatações antigas no banco
    const { data: rows, error } = await context.supabase
      .from("clientes")
      .select("*")
      .ilike("cnpj", `%${data.cnpj}%`)
      .limit(5);
    if (error) throw new Error(error.message);
    const match = (rows ?? []).find(
      (r) => onlyDigitsCnpj((r as { cnpj: string }).cnpj) === data.cnpj,
    );
    return (match as ClienteRow | undefined) ?? null;
  });

// ==========================
// CREATE
// ==========================
export type CreateClienteResult =
  | { ok: true; cliente: ClienteRow }
  | {
      ok: false;
      code: "duplicate_active" | "duplicate_inactive" | "duplicate_other";
      message: string;
      podeReativar?: boolean;
      clienteId?: string;
    };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDb = any;

/**
 * Núcleo do cadastro de cliente — MESMA lógica usada por `createCliente`.
 * Extraído para poder ser reutilizado por fluxos internos do servidor
 * (ex.: promoção automática de lead → cliente ao marcar Ganho).
 */
export async function criarClienteCore(
  supabase: LooseDb,
  userId: string,
  data: ClienteInput,
): Promise<CreateClienteResult> {
  const context = { supabase, userId };
  {
    const { errors, clean } = validateInput(data);
    if (errors.length) throw new Error(errors.join("; "));


    // Checagem via RPC SECURITY DEFINER (enxerga cross-vendor sem expor dados sensíveis)
    const { data: statusRows, error: statusErr } = await context.supabase
      .rpc("cnpj_status", { _cnpj: clean.cnpj });

    if (statusErr) {
      // Falha na verificação preliminar: não abortar; o mapeamento 23505 abaixo cuida da duplicidade.
      console.warn("cnpj_status falhou:", statusErr.message);
    } else {
      const st = (statusRows ?? [])[0] as
        | { existe: boolean; ativo: boolean; mesmo_vendedor: boolean; cliente_id: string | null }
        | undefined;
      if (st?.existe) {
        if (st.ativo && st.mesmo_vendedor) {
          return {
            ok: false,
            code: "duplicate_active",
            message: "Você já tem um cliente ativo com este CNPJ.",
            clienteId: st.cliente_id ?? undefined,
          };
        }
        if (st.ativo && !st.mesmo_vendedor) {
          return {
            ok: false,
            code: "duplicate_other",
            message: "Já existe um cliente com este CNPJ.",
          };
        }
        if (!st.ativo && st.mesmo_vendedor) {
          return {
            ok: false,
            code: "duplicate_inactive",
            message: "Você tem um cliente inativo com este CNPJ. Deseja reativá-lo?",
            podeReativar: true,
            clienteId: st.cliente_id ?? undefined,
          };
        }
        return {
          ok: false,
          code: "duplicate_inactive",
          message: "Já existe um cliente inativo com este CNPJ. Peça a um admin para reativar.",
        };
      }
    }

    const vendedorId = clean.vendedor_id ?? context.userId;

    const { data: inserted, error } = await context.supabase
      .from("clientes")
      .insert({
        tipo_pessoa: clean.tipo_pessoa ?? "PJ",
        cnpj: clean.tipo_pessoa === "PF" ? null : clean.cnpj,
        cpf: clean.tipo_pessoa === "PF" ? (clean.cpf ?? null) : null,

        razao_social: clean.razao_social,
        nome_fantasia: clean.nome_fantasia ?? null,
        inscricao_estadual: clean.ie_isento ? null : (clean.inscricao_estadual ?? null),
        ie_isento: !!clean.ie_isento,
        endereco: clean.endereco ?? null,
        numero: clean.numero ?? null,
        complemento: clean.complemento ?? null,
        bairro: clean.bairro ?? null,
        cep: clean.cep ? onlyDigitsCnpj(clean.cep).slice(0, 8) : null,
        cidade: clean.cidade ?? null,
        estado: clean.estado ?? null,
        contato: clean.contato ?? null,
        email: clean.email ?? null,
        telefone: clean.telefone ?? null,
        telefone2: clean.telefone2 ?? null,
        website: clean.website ?? null,
        observacao: clean.observacao ?? null,
        empresa_padrao: clean.empresa_padrao,
        vendedor_id: vendedorId,
        criado_por: context.userId,
        ativo: clean.ativo !== false,
        simples_optante: clean.simples_optante ?? null,
        suframa_isento: clean.suframa_isento ?? null,
        suframa_numero: (clean.suframa_numero ?? "").trim() || null,
      })
      .select("*")
      .single();

    if (error) {
      const errCode = (error as { code?: string }).code;
      const errMsg = error.message ?? "";
      if (errCode === "23505" || /clientes_cnpj_key/i.test(errMsg) || /duplicate key/i.test(errMsg)) {
        return {
          ok: false,
          code: "duplicate_other",
          message: "Já existe um cliente com este CNPJ.",
        };
      }
      throw new Error("Não foi possível salvar o cliente. Tente novamente.");
    }
    return { ok: true, cliente: inserted as ClienteRow };
  }
}

export const createCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ClienteInput) => data)
  .handler(async ({ data, context }): Promise<CreateClienteResult> =>
    criarClienteCore(context.supabase, context.userId, data),
  );


// ==========================
// REATIVAR CLIENTE (dono ou admin, via RLS de UPDATE)
// ==========================
export const reativarCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => ({ id: String(data?.id ?? "") }))
  .handler(async ({ data, context }) => {
    if (!data.id) throw new Error("id obrigatório");
    const { data: updated, error } = await context.supabase
      .from("clientes")
      .update({ ativo: true, atualizado_em: new Date().toISOString() })
      .eq("id", data.id)
      .select("*")
      .maybeSingle();
    if (error) {
      throw new Error("Não foi possível reativar o cliente.");
    }
    if (!updated) {
      throw new Error("Você não tem permissão para reativar este cliente.");
    }
    return updated as ClienteRow;
  });

// ==========================
// UPDATE
// ==========================
export const updateCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; patch: Partial<ClienteInput> }) => data)
  .handler(async ({ data, context }) => {
    const { id, patch } = data;
    if (!id) throw new Error("id obrigatório");

    // Buscar registro atual para validar
    const { data: current, error: err0 } = await context.supabase
      .from("clientes").select("*").eq("id", id).maybeSingle();
    if (err0) throw new Error(err0.message);
    if (!current) throw new Error("Cliente não encontrado ou sem acesso");

    const merged: ClienteInput = {
      tipo_pessoa: ((current as ClienteRow).tipo_pessoa === "PF" ? "PF" : "PJ"),
      cnpj: (current as ClienteRow).cnpj ?? "", // documento é imutável
      cpf: (current as ClienteRow).cpf ?? null,
      razao_social: patch.razao_social ?? (current as ClienteRow).razao_social,
      empresa_padrao: patch.empresa_padrao ?? (current as ClienteRow).empresa_padrao ?? "",
      nome_fantasia: patch.nome_fantasia ?? (current as ClienteRow).nome_fantasia,
      inscricao_estadual: patch.inscricao_estadual ?? (current as ClienteRow).inscricao_estadual,
      ie_isento: patch.ie_isento ?? (current as ClienteRow).ie_isento ?? false,
      endereco: patch.endereco ?? (current as ClienteRow).endereco,
      numero: patch.numero ?? (current as ClienteRow).numero,
      complemento: patch.complemento ?? (current as ClienteRow).complemento,
      bairro: patch.bairro ?? (current as ClienteRow).bairro,
      cep: patch.cep ?? (current as ClienteRow).cep,
      cidade: patch.cidade ?? (current as ClienteRow).cidade,
      estado: patch.estado ?? (current as ClienteRow).estado,
      contato: patch.contato ?? (current as ClienteRow).contato,
      email: patch.email ?? (current as ClienteRow).email,
      telefone: patch.telefone ?? (current as ClienteRow).telefone,
      telefone2: patch.telefone2 ?? (current as ClienteRow).telefone2,
      website: patch.website ?? (current as ClienteRow).website,
      observacao: patch.observacao ?? (current as ClienteRow).observacao,
      vendedor_id: patch.vendedor_id ?? (current as ClienteRow).vendedor_id,
      ativo: patch.ativo ?? (current as ClienteRow).ativo,
      simples_optante:
        patch.simples_optante !== undefined
          ? patch.simples_optante
          : (current as ClienteRow).simples_optante,
      suframa_isento:
        patch.suframa_isento !== undefined
          ? patch.suframa_isento
          : (current as ClienteRow).suframa_isento,
      suframa_numero:
        patch.suframa_numero !== undefined
          ? patch.suframa_numero
          : (current as ClienteRow).suframa_numero,
    };
    const { errors, clean } = validateInput(merged);
    if (errors.length) throw new Error(errors.join("; "));

    const updateFields = {
      razao_social: clean.razao_social,
      nome_fantasia: clean.nome_fantasia ?? null,
      inscricao_estadual: clean.ie_isento ? null : (clean.inscricao_estadual ?? null),
      ie_isento: !!clean.ie_isento,
      endereco: clean.endereco ?? null,
      numero: clean.numero ?? null,
      complemento: clean.complemento ?? null,
      bairro: clean.bairro ?? null,
      cep: clean.cep ? onlyDigitsCnpj(clean.cep).slice(0, 8) : null,
      cidade: clean.cidade ?? null,
      estado: clean.estado ?? null,
      contato: clean.contato ?? null,
      email: clean.email ?? null,
      telefone: clean.telefone ?? null,
      telefone2: clean.telefone2 ?? null,
      website: clean.website ?? null,
      observacao: clean.observacao ?? null,
      empresa_padrao: clean.empresa_padrao,
      ativo: clean.ativo !== false,
      simples_optante: clean.simples_optante ?? null,
      suframa_isento: clean.suframa_isento ?? null,
      suframa_numero: (clean.suframa_numero ?? "")?.toString().trim() || null,
      atualizado_em: new Date().toISOString(),
      ...(patch.vendedor_id !== undefined ? { vendedor_id: patch.vendedor_id } : {}),
    };

    const { data: updated, error } = await context.supabase
      .from("clientes").update(updateFields).eq("id", id).select("*").single();
    if (error) throw new Error("Não foi possível salvar o cliente. Tente novamente.");
    return updated as ClienteRow;
  });

// ==========================
// PROPOSTAS/LEADS DO CLIENTE
// ==========================
export const listLeadsByCliente = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { clienteId: string }) => ({ clienteId: String(data?.clienteId ?? "") }))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("leads")
      .select("id, company, contact_name, stage, estimated_value, created_at, owner_id, omie_status, omie_numero_pedido")
      .eq("cliente_id", data.clienteId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

// ==========================
// LISTAR VENDEDORES (para filtro/atribuição de admin)
// ==========================
export const listVendedores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRows, error: err1 } = await context.supabase
      .from("user_roles")
      .select("user_id, role");
    if (err1) throw new Error(err1.message);
    const ids = Array.from(new Set((roleRows ?? []).map((r) => r.user_id as string)));
    if (ids.length === 0) return [];
    const { data: profiles, error: err2 } = await context.supabase
      .from("profiles")
      .select("id, name, avatar_color")
      .in("id", ids);
    if (err2) throw new Error(err2.message);
    const rolesById = new Map<string, string[]>();
    for (const r of roleRows ?? []) {
      const arr = rolesById.get(r.user_id as string) ?? [];
      arr.push(r.role as string);
      rolesById.set(r.user_id as string, arr);
    }
    return (profiles ?? []).map((p) => ({
      id: p.id as string,
      name: (p.name as string) ?? "Usuário",
      avatarColor: (p.avatar_color as string) ?? "#64748b",
      roles: rolesById.get(p.id as string) ?? [],
    }));
  });

// ==========================
// VINCULAR CLIENTE A UM LEAD (usado pelo fluxo Nova Proposta)
// ==========================
export const vincularClienteAoLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { leadId: string; clienteId: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("leads")
      .update({ cliente_id: data.clienteId })
      .eq("id", data.leadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ==========================
// VENDEDOR REAL DA PROPOSTA (nome + e-mail de login)
// ==========================
export type VendedorContato = { id: string; name: string; email: string | null };

export const getVendedorDaProposta = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { leadId?: string | null; ownerId?: string | null }) => ({
    leadId: data?.leadId ? String(data.leadId) : null,
    ownerId: data?.ownerId ? String(data.ownerId) : null,
  }))
  .handler(async ({ data, context }): Promise<VendedorContato | null> => {
    let vendedorId: string | null = null;

    if (data.leadId) {
      const { data: lead } = await context.supabase
        .from("leads")
        .select("owner_id, cliente_id")
        .eq("id", data.leadId)
        .maybeSingle();
      const clienteId = (lead as { cliente_id?: string | null } | null)?.cliente_id ?? null;
      if (clienteId) {
        const { data: cli } = await context.supabase
          .from("clientes")
          .select("vendedor_id")
          .eq("id", clienteId)
          .maybeSingle();
        vendedorId = (cli as { vendedor_id?: string | null } | null)?.vendedor_id ?? null;
      }
      if (!vendedorId) vendedorId = (lead as { owner_id?: string | null } | null)?.owner_id ?? null;
    }
    if (!vendedorId) vendedorId = data.ownerId;
    if (!vendedorId) return null;

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("id, name")
      .eq("id", vendedorId)
      .maybeSingle();

    let email: string | null = null;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(vendedorId);
      email = authUser?.user?.email ?? null;
    } catch {
      email = null;
    }

    return {
      id: vendedorId,
      name: (profile as { name?: string } | null)?.name ?? "—",
      email,
    };
  });

// ==========================
// PROMOÇÃO AUTOMÁTICA LEAD → CLIENTE (usada ao marcar o lead como GANHO)
// ==========================
export type PromocaoClienteResult =
  | { ok: true; clienteId: string; criado: boolean; jaVinculado?: boolean }
  | { ok: false; erros: string[] };

/** Mensagem de erro rica: diz de QUEM é o cliente que trava a promoção. */
async function mensagemClienteDeOutroVendedor(
  supabase: LooseDb,
  clienteId: string | null | undefined,
): Promise<string> {
  const generico =
    "Já existe um cliente com este CNPJ vinculado a outro vendedor. Transfira o cliente antes de gerar o pedido.";
  if (!clienteId) return generico;
  const { data: cli } = await supabase
    .from("clientes")
    .select("razao_social, vendedor_id")
    .eq("id", clienteId)
    .maybeSingle();
  if (!cli) return generico;
  let vendedor = "outro vendedor";
  if (cli.vendedor_id) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", cli.vendedor_id)
      .maybeSingle();
    if (prof?.full_name) vendedor = String(prof.full_name);
  }
  return `Este CNPJ já pertence ao cliente "${cli.razao_social ?? "sem razão social"}", vinculado ao vendedor ${vendedor}. Transfira o cliente antes de gerar o pedido.`;
}

/**
 * Garante que o lead tenha um cliente vinculado (`leads.cliente_id`).
 * - Idempotente: se já houver `cliente_id`, apenas mantém o vínculo.
 * - Exige CNPJ (14) ou CPF (11) válido no lead — mesma validação do cadastro.
 * - Se já existir cliente com o mesmo documento, apenas vincula (sem duplicar).
 * - Caso contrário, cria o cliente pelo MESMO fluxo de `createCliente`.
 * Opera com o client do usuário autenticado → respeita RLS (vendedor_id/owner_id).
 */
export async function garantirClienteDoLead(
  supabase: LooseDb,
  userId: string,
  leadId: string,
): Promise<PromocaoClienteResult> {
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select(
      "id, cliente_id, cnpj, razao_social, nome_fantasia, company, contact_name, email, phone, telefone_whatsapp, telefone2, empresa, endereco, numero, complemento, bairro, cep, cidade, estado, inscricao_estadual, owner_id",
    )
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr) return { ok: false, erros: [leadErr.message] };
  if (!lead) return { ok: false, erros: ["Lead não encontrado ou sem acesso."] };

  // (C) Idempotência — já vinculado, nada a fazer.
  if (lead.cliente_id) {
    return { ok: true, clienteId: lead.cliente_id as string, criado: false, jaVinculado: true };
  }

  // (A) Documento obrigatório e válido — mesma validação do cadastro de cliente.
  const digits = onlyDigitsCnpj(String(lead.cnpj ?? ""));
  const DOC_MSG = "Preencha o CNPJ ou CPF do contato antes de marcar como Ganho.";
  let tipo: TipoPessoa;
  if (digits.length === 14) {
    if (!isValidCnpj(digits)) return { ok: false, erros: ["CNPJ inválido (dígitos verificadores)."] };
    tipo = "PJ";
  } else if (digits.length === 11) {
    if (!isValidCpf(digits)) return { ok: false, erros: ["CPF inválido (dígitos verificadores)."] };
    tipo = "PF";
  } else {
    return { ok: false, erros: [DOC_MSG] };
  }

  // (B1) Já existe cliente com o mesmo documento? → apenas vincula.
  let existenteId: string | null = null;

  if (tipo === "PJ") {
    // Checagem cross-vendor via RPC SECURITY DEFINER (sobrecarga de 2 args):
    // a pergunta correta é "o cliente é do DONO DO LEAD?" — não "é meu?".
    const donoLead = (lead.owner_id as string | null) ?? userId;
    const { data: statusRows } = await supabase.rpc("cnpj_status", {
      _cnpj: digits,
      _vendedor_id: donoLead,
    });
    const st = (statusRows ?? [])[0] as
      | { existe: boolean; ativo: boolean; mesmo_vendedor: boolean; cliente_id: string | null }
      | undefined;
    if (st?.existe) {
      if (!st.mesmo_vendedor) {
        return { ok: false, erros: [await mensagemClienteDeOutroVendedor(supabase, st.cliente_id)] };
      }
      existenteId = st.cliente_id ?? null;
    }
  } else {
    const { data: rows } = await supabase
      .from("clientes")
      .select("id, cpf")
      .ilike("cpf", `%${digits}%`)
      .limit(5);
    const match = (rows ?? []).find(
      (r: { cpf: string | null }) => onlyDigitsCpf(String(r.cpf ?? "")) === digits,
    );
    existenteId = (match as { id: string } | undefined)?.id ?? null;
  }

  if (existenteId) {
    const { error: linkErr } = await supabase
      .from("leads")
      .update({ cliente_id: existenteId })
      .eq("id", leadId);
    if (linkErr) return { ok: false, erros: [linkErr.message] };
    await registrarAuditoriaPromocao(supabase, {
      leadId,
      clienteId: existenteId,
      criado: false,
      userId,
    });
    return { ok: true, clienteId: existenteId, criado: false };
  }


  // (B2) Não existe → cria pelo mesmo fluxo do cadastro manual.
  const empresaPadrao = ["INPLASTIC", "TAOPLAST", "LICITAPLAS"].includes(
    String(lead.empresa ?? "").toUpperCase(),
  )
    ? String(lead.empresa).toUpperCase()
    : "INPLASTIC";

  const nome =
    String(lead.razao_social ?? "").trim() ||
    String(lead.company ?? "").trim() ||
    String(lead.contact_name ?? "").trim();
  if (!nome) {
    return { ok: false, erros: ["Preencha a razão social ou o nome da empresa antes de marcar como Ganho."] };
  }

  const res = await criarClienteCore(supabase, userId, {
    tipo_pessoa: tipo,
    cnpj: tipo === "PJ" ? digits : "",
    cpf: tipo === "PF" ? digits : null,
    razao_social: nome,
    nome_fantasia: (lead.nome_fantasia as string | null) ?? null,
    inscricao_estadual: tipo === "PJ" ? ((lead.inscricao_estadual as string | null) ?? null) : null,
    endereco: (lead.endereco as string | null) ?? null,
    numero: (lead.numero as string | null) ?? null,
    complemento: (lead.complemento as string | null) ?? null,
    bairro: (lead.bairro as string | null) ?? null,
    cep: (lead.cep as string | null) ?? null,
    cidade: (lead.cidade as string | null) ?? null,
    estado: (lead.estado as string | null) ?? null,
    contato: (lead.contact_name as string | null) ?? null,
    email: (lead.email as string | null) ?? null,
    telefone: ((lead.phone as string | null) ?? (lead.telefone_whatsapp as string | null)) ?? null,
    telefone2: (lead.telefone2 as string | null) ?? null,
    empresa_padrao: empresaPadrao,
    vendedor_id: (lead.owner_id as string | null) ?? userId,
  });

  if (!res.ok) return { ok: false, erros: [res.message] };

  const { error: linkErr } = await supabase
    .from("leads")
    .update({ cliente_id: res.cliente.id })
    .eq("id", leadId);
  if (linkErr) return { ok: false, erros: [linkErr.message] };

  await registrarAuditoriaPromocao(supabase, {
    leadId,
    clienteId: res.cliente.id,
    criado: true,
    userId,
  });

  return { ok: true, clienteId: res.cliente.id, criado: true };
}

/**
 * Auditoria da promoção lead → cliente.
 * Reutiliza o mecanismo JÁ existente (`lead_interactions`, append-only,
 * mesmo padrão usado em `canais.functions.ts`). Nenhuma tabela nova.
 * Falha aqui nunca bloqueia a promoção.
 */
export async function registrarAuditoriaPromocao(
  supabase: LooseDb,
  args: { leadId: string; clienteId: string; criado: boolean; userId: string },
): Promise<void> {
  try {
    await supabase.from("lead_interactions").insert({
      lead_id: args.leadId,
      owner_id: args.userId,
      type: "note",
      content: `Promoção lead → cliente: cliente ${
        args.criado ? "criado" : "vinculado"
      } (cliente_id=${args.clienteId}) por usuário ${args.userId}.`,
    });
  } catch (e) {
    console.error("[promocao_cliente] falha ao registrar auditoria:", e);
  }
}

