import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";

export const ARENA_TIPOS = [
  { id: "interno", label: "Comercial interno" },
  { id: "representante", label: "Representante" },
  { id: "licitacoes", label: "Licitações" },
  { id: "nao_comercial", label: "Não comercial" },
] as const;

export type ArenaTipoComercial = (typeof ARENA_TIPOS)[number]["id"];

export type ArenaParticipacao = {
  participaArena: boolean;
  tipoComercial: ArenaTipoComercial;
  carenciaInicio: string | null;
  carenciaMeses: number;
  faseRampa: number;
  observacao: string | null;
};

export const ARENA_PARTICIPACAO_PADRAO: ArenaParticipacao = {
  participaArena: false,
  tipoComercial: "nao_comercial",
  carenciaInicio: null,
  carenciaMeses: 6,
  faseRampa: 0,
  observacao: null,
};

/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores podem acessar a ARENA.");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/* ------------------------------------------------------------------ */
/* Participação por usuário (admin-only)                               */
/* ------------------------------------------------------------------ */

export const getArenaParticipacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<ArenaParticipacao> => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();
    const { data: row, error } = await sb
      .from("arena_participacao")
      .select("participa_arena, tipo_comercial, carencia_inicio, carencia_meses, fase_rampa, observacao")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { ...ARENA_PARTICIPACAO_PADRAO };
    return {
      participaArena: row.participa_arena,
      tipoComercial: row.tipo_comercial as ArenaTipoComercial,
      carenciaInicio: row.carencia_inicio,
      carenciaMeses: Number(row.carencia_meses ?? 6),
      faseRampa: Number(row.fase_rampa ?? 0),
      observacao: row.observacao,
    };
  });

const saveSchema = z.object({
  userId: z.string().uuid(),
  participaArena: z.boolean(),
  tipoComercial: z.enum(["interno", "representante", "licitacoes", "nao_comercial"]),
  carenciaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  carenciaMeses: z.number().int().min(0).max(60),
  faseRampa: z.number().int().min(0).max(10),
  observacao: z.string().trim().max(500).nullable(),
});

export const saveArenaParticipacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => saveSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const sb = await admin();

    const { data: atual, error: rErr } = await sb
      .from("arena_participacao")
      .select("participa_arena, tipo_comercial, carencia_inicio, carencia_meses, fase_rampa, observacao")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (rErr) throw new Error(rErr.message);

    const novo = {
      user_id: data.userId,
      participa_arena: data.participaArena,
      tipo_comercial: data.tipoComercial,
      carencia_inicio: data.carenciaInicio,
      carencia_meses: data.carenciaMeses,
      fase_rampa: data.faseRampa,
      observacao: data.observacao,
    };

    const { error } = await sb
      .from("arena_participacao")
      .upsert(novo, { onConflict: "user_id" });
    if (error) throw new Error(error.message);

    const campos: Array<[string, unknown, unknown]> = [
      ["arena_participa", atual?.participa_arena ?? false, data.participaArena],
      ["arena_tipo_comercial", atual?.tipo_comercial ?? "nao_comercial", data.tipoComercial],
      ["arena_carencia_inicio", atual?.carencia_inicio ?? null, data.carenciaInicio],
      ["arena_carencia_meses", atual?.carencia_meses ?? 6, data.carenciaMeses],
      ["arena_fase_rampa", atual?.fase_rampa ?? 0, data.faseRampa],
      ["arena_observacao", atual?.observacao ?? null, data.observacao],
    ];
    const rows = campos
      .filter(([, a, n]) => String(a ?? "") !== String(n ?? ""))
      .map(([campo, a, n]) => ({
        alvo_user_id: data.userId,
        ator_user_id: context.userId,
        campo: campo as string,
        valor_anterior: a === null || a === undefined ? null : String(a),
        valor_novo: n === null || n === undefined ? null : String(n),
      }));
    if (rows.length > 0) {
      const { error: aErr } = await sb.from("user_audit_log").insert(rows);
      if (aErr) console.error("[arena] auditoria falhou:", aErr.message);
    }

    return { ok: true, alteracoes: rows.length };
  });

/* ------------------------------------------------------------------ */
/* Configuração econômica (admin-only — nunca exposta a vendedor)      */
/* ------------------------------------------------------------------ */

export const getArenaConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { data, error } = await context.supabase
      .from("arena_config")
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });
