import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { escolherSugestaoTransportadora, normalizarUf, type UsoTransportadora } from "@/lib/transportadoras";

export type TransportadoraRow = {
  id: string;
  nome: string;
  ativo: boolean;
  cnpj?: string | null;
  razao_social?: string | null;
  ie?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  telefone?: string | null;
  email?: string | null;
  abrangencia_ufs?: string[];
};

const COLS_TRANSP =
  "id, nome, ativo, cnpj, razao_social, ie, cep, logradouro, numero, complemento, bairro, cidade, uf, telefone, email, abrangencia_ufs";

const dadosTransportadora = z.object({
  nome: z.string().trim().min(2).max(120),
  cnpj: z.string().trim().max(20).nullable().optional(),
  razao_social: z.string().trim().max(160).nullable().optional(),
  ie: z.string().trim().max(40).nullable().optional(),
  cep: z.string().trim().max(12).nullable().optional(),
  logradouro: z.string().trim().max(160).nullable().optional(),
  numero: z.string().trim().max(20).nullable().optional(),
  complemento: z.string().trim().max(80).nullable().optional(),
  bairro: z.string().trim().max(80).nullable().optional(),
  cidade: z.string().trim().max(80).nullable().optional(),
  uf: z.string().trim().max(2).nullable().optional(),
  telefone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().max(160).nullable().optional(),
  abrangencia_ufs: z.array(z.string().trim().length(2)).max(27).optional(),
});

export const listarTransportadoras = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("transportadoras")
      .select(COLS_TRANSP)
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as TransportadoraRow[];
  });

export const listarTransportadorasAtivas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("transportadoras")
      .select(COLS_TRANSP)
      .eq("ativo", true)
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as TransportadoraRow[];
  });

export const criarTransportadora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => dadosTransportadora.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("transportadoras")
      .insert(data)
      .select(COLS_TRANSP)
      .single();
    if (error) throw new Error(error.message);
    return row as TransportadoraRow;
  });

export const atualizarTransportadora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    dadosTransportadora
        .partial()
        .extend({ id: z.string().uuid(), ativo: z.boolean().optional() })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id: _id, ...resto } = data;
    const patch = Object.fromEntries(
      Object.entries(resto).filter(([, v]) => v !== undefined),
    );
    const { data: row, error } = await context.supabase
      .from("transportadoras")
      .update(patch as never)
      .eq("id", data.id)
      .select(COLS_TRANSP)
      .single();
    if (error) throw new Error(error.message);
    return row as TransportadoraRow;
  });

export const excluirTransportadora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("transportadoras").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Sugere a transportadora mais usada em propostas de clientes do mesmo UF.
 * Só considera `transport.carrierTransportadoraId` (id estruturado) — texto
 * livre e opções especiais nunca entram na conta. Sem base, retorna null.
 */
export const sugerirTransportadora = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ uf: z.string().nullable().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const uf = normalizarUf(data.uf);
    if (!uf) return null;

    const { data: rows, error } = await context.supabase
      .from("propostas")
      .select("transport, leads!inner(estado, clientes(estado))")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const usos: UsoTransportadora[] = (rows ?? []).map((r) => {
      const t = (r as { transport?: Record<string, unknown> | null }).transport ?? {};
      const lead = (r as { leads?: { estado?: string | null; clientes?: { estado?: string | null } | null } | null }).leads;
      return {
        transportadoraId: (t as { carrierTransportadoraId?: string | null }).carrierTransportadoraId ?? null,
        uf: lead?.clientes?.estado ?? lead?.estado ?? null,
      };
    });

    const escolha = escolherSugestaoTransportadora(usos, uf);
    if (!escolha) return null;

    const { data: t } = await context.supabase
      .from("transportadoras")
      .select(COLS_TRANSP)
      .eq("id", escolha.transportadoraId)
      .eq("ativo", true)
      .maybeSingle();
    if (!t) return null;
    return { ...(t as TransportadoraRow), usos: escolha.usos, uf };
  });

const dadosRapidos = z.object({
  nome: z.string().trim().min(2, "Informe o nome da transportadora").max(120),
  cnpj: z.string().trim().max(20).nullable().optional(),
  razao_social: z.string().trim().max(160).nullable().optional(),
  endereco: z
    .object({
      cep: z.string().trim().max(12).optional(),
      logradouro: z.string().trim().max(160).optional(),
      numero: z.string().trim().max(20).optional(),
      complemento: z.string().trim().max(80).optional(),
      bairro: z.string().trim().max(80).optional(),
      cidade: z.string().trim().max(80).optional(),
      uf: z.string().trim().max(2).optional(),
      telefone: z.string().trim().max(40).optional(),
      email: z.string().trim().max(160).optional(),
    })
    .nullable()
    .optional(),
});

export type TransportadoraRapida = {
  id: string;
  nome: string;
  cnpj: string | null;
  ativo: boolean;
  reaproveitada: boolean;
};

/**
 * Cadastro rápido a partir da proposta: qualquer usuário autenticado pode criar
 * uma transportadora mínima (nome + CNPJ opcional). A escrita acontece dentro de
 * `criar_transportadora_rapida` (SECURITY DEFINER) — a policy da tabela continua
 * exigindo admin para editar/desativar. CNPJ já cadastrado devolve a existente.
 */
export const criarTransportadoraRapida = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => dadosRapidos.parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("criar_transportadora_rapida", {
      _nome: data.nome,
      _cnpj: data.cnpj ?? null,
      _razao_social: data.razao_social ?? null,
      _endereco: (data.endereco ?? null) as never,
    });
    if (error) throw new Error(error.message);
    const row = (rows as TransportadoraRapida[] | null)?.[0];
    if (!row) throw new Error("Não foi possível cadastrar a transportadora.");
    return row;
  });
