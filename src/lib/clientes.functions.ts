import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidCnpj, onlyDigitsCnpj } from "@/lib/cnpj";

export type ClienteRow = {
  id: string;
  cnpj: string;
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
  cnpj: string;
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
  const cnpj = onlyDigitsCnpj(d.cnpj);
  if (cnpj.length !== 14) errors.push("CNPJ deve conter 14 dígitos");
  else if (!isValidCnpj(cnpj)) errors.push("CNPJ inválido (dígitos verificadores)");

  const razao = (d.razao_social ?? "").trim();
  if (!razao) errors.push("Razão social obrigatória");
  else if (/^cliente\s/i.test(razao)) errors.push('Razão social não pode começar com "Cliente "');

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
      cnpj,
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

export const createCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ClienteInput) => data)
  .handler(async ({ data, context }): Promise<CreateClienteResult> => {
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
        cnpj: clean.cnpj,
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
  });

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
      cnpj: (current as ClienteRow).cnpj, // CNPJ é imutável
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
