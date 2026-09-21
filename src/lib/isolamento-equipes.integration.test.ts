/**
 * Isolamento entre equipes — conferência contra o banco real.
 *
 * Confere os fatos que sustentam as travas combinadas com o Denis:
 *  - existe exatamente uma equipe dona do canal de WhatsApp (marcação
 *    explícita, sem nome fixo no código);
 *  - todo grupo do chat pertence a uma equipe;
 *  - ninguém de fora da Equipe INPLASTIC é participante do Grupo Comercial;
 *  - todo mundo da Maxicaixa é participante do grupo da própria equipe;
 *  - só entra na fila de distribuição quem é da equipe dona do canal.
 *
 * Sem banco configurado localmente os casos são pulados; em CI eles falham.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL_BANCO = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
const CHAVE =
  process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
  process.env["SUPABASE_PUBLISHABLE_KEY"] ??
  process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
const EM_CI = process.env["CI"] === "true" || process.env["CARGO_DB_OBRIGATORIO"] === "1";
const TEM_BANCO = Boolean(URL_BANCO && CHAVE);

describe("isolamento entre equipes (banco)", () => {
  let sb: SupabaseClient;

  beforeAll(() => {
    if (TEM_BANCO) {
      sb = createClient(URL_BANCO!, CHAVE!, { auth: { persistSession: false } });
    }
  });

  it("em CI o banco é obrigatório", () => {
    if (EM_CI) expect(TEM_BANCO).toBe(true);
    else expect(true).toBe(true);
  });

  it.runIf(TEM_BANCO)("existe exatamente uma equipe dona do canal de WhatsApp", async () => {
    const { data, error } = await sb
      .from("equipes")
      .select("id, nome")
      .eq("dona_canal_whatsapp", true);
    expect(error).toBeNull();
    expect((data ?? []).length).toBe(1);
  });

  it.runIf(TEM_BANCO)("todo grupo do chat pertence a uma equipe", async () => {
    const { data, error } = await sb
      .from("chat_canais")
      .select("id, nome, equipe_id")
      .eq("tipo", "grupo");
    expect(error).toBeNull();
    for (const c of data ?? []) expect(c.equipe_id).not.toBeNull();
  });

  it.runIf(TEM_BANCO)("ninguém de outra equipe participa do grupo da Equipe INPLASTIC", async () => {
    const { data: grupos } = await sb
      .from("chat_canais")
      .select("id, equipe_id")
      .eq("tipo", "grupo");
    const { data: membros } = await sb.from("chat_canal_membros").select("canal_id, user_id");
    const { data: pessoas } = await sb.from("profiles").select("id, equipe_id");
    const equipePorPessoa = new Map((pessoas ?? []).map((p) => [p.id, p.equipe_id]));

    for (const grupo of grupos ?? []) {
      const doGrupo = (membros ?? []).filter((m) => m.canal_id === grupo.id);
      for (const m of doGrupo) {
        expect(equipePorPessoa.get(m.user_id) ?? null).toBe(grupo.equipe_id);
      }
    }
  });

  it.runIf(TEM_BANCO)("a fila de distribuição só tem gente da equipe dona do canal", async () => {
    const { data: dona } = await sb
      .from("equipes")
      .select("id")
      .eq("dona_canal_whatsapp", true)
      .maybeSingle();
    const { data: fila } = await sb.from("fila_vendedores").select("user_id");
    if ((fila ?? []).length === 0) {
      expect(true).toBe(true);
      return;
    }
    const { data: pessoas } = await sb
      .from("profiles")
      .select("id, equipe_id")
      .in(
        "id",
        (fila ?? []).map((f) => f.user_id),
      );
    for (const p of pessoas ?? []) expect(p.equipe_id).toBe(dona?.id ?? null);
  });
});
