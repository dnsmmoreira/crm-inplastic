/**
 * Server functions da tela administrativa "Frases prontas".
 *
 * Duas camadas convivem aqui:
 *  - CRUD do catálogo interno (`mensagem_templates`), usado pelo compositor;
 *  - envio dessas frases para aprovação da Meta (templates), que é o único
 *    caminho permitido para falar com o cliente fora da janela de 24h.
 *
 * Todas as funções são admin-only com gate fail-closed (`assertAdmin`), e toda
 * escrita Supabase confere `error` via `assertNoError` / `registrarFalhaSegura`.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { assertNoError, assertRpcPermissao, registrarFalhaSegura } from "@/lib/guard-erros";
import {
  CATEGORIAS_ORDEM,
  MSG_EMPRESA_PROIBIDA,
  citaNomeDeEmpresa,
  converterParaMeta,
  slugMeta,
  variaveisInvalidas,
} from "@/lib/frases-prontas";

type Ctx = { supabase: any; userId: string };

async function assertAdmin(context: Ctx) {
  const data = await assertRpcPermissao(
    await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    "frases-prontas.assertAdmin/has_role",
    { userId: context.userId },
  );
  if (!data) throw new Error("Somente administradores.");
}

const CAMPOS =
  "id, titulo, categoria, corpo, ativo, ordem, meta_nome, meta_id, meta_status, meta_categoria, meta_mapa, meta_enviado_em, meta_erro, meta_sugerido, updated_at";

/** Nome do template usado pelos envios automáticos (nunca expõe o token). */
export const nomeTemplateAutomatico = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as Ctx);
    return { nome: (process.env["META_TEMPLATE_NAME"] ?? "").trim() || null };
  });

/** Lista TODAS as frases (inclusive inativas) para a tela de administração. */

export const listarFrasesAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as Ctx);
    const { data, error } = await (context as Ctx).supabase
      .from("mensagem_templates")
      .select(CAMPOS)
      .order("ordem", { ascending: true });
    if (error) throw new Error(error.message);
    return { itens: data ?? [] };
  });

const fraseSchema = z.object({
  id: z.string().uuid().optional(),
  titulo: z.string().trim().min(3).max(80),
  categoria: z.enum(CATEGORIAS_ORDEM),
  corpo: z.string().trim().min(5).max(1024),
  ativo: z.boolean().optional(),
  meta_sugerido: z.boolean().optional(),
  meta_categoria: z.enum(["MARKETING", "UTILITY"]).nullable().optional(),
});

/** Cria ou atualiza uma frase, validando texto e variáveis. */
export const salvarFrase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => fraseSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await assertAdmin(context as Ctx);

    if (citaNomeDeEmpresa(data.corpo) || citaNomeDeEmpresa(data.titulo)) {
      throw new Error(MSG_EMPRESA_PROIBIDA);
    }
    const invalidas = variaveisInvalidas(data.corpo);
    if (invalidas.length > 0) {
      throw new Error(
        `Variáveis não permitidas: ${invalidas.map((v) => `{{${v}}}`).join(", ")}. Use apenas {{nome}}, {{empresa}} e {{atendente}}.`,
      );
    }

    const registro = {
      titulo: data.titulo,
      categoria: data.categoria,
      corpo: data.corpo,
      ativo: data.ativo ?? true,
      meta_sugerido: data.meta_sugerido ?? false,
      meta_categoria: data.meta_categoria ?? null,
      updated_at: new Date().toISOString(),
    };

    if (data.id) {
      const res = await supabase.from("mensagem_templates").update(registro).eq("id", data.id);
      await assertNoError(res, "frases-prontas.salvarFrase/update", { id: data.id });
      return { ok: true, id: data.id };
    }

    const { data: maior } = await supabase
      .from("mensagem_templates")
      .select("ordem")
      .order("ordem", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: criada, error } = await supabase
      .from("mensagem_templates")
      .insert({ ...registro, ordem: (maior?.ordem ?? 0) + 1, criado_por: userId })
      .select("id")
      .single();
    await assertNoError({ error }, "frases-prontas.salvarFrase/insert", { titulo: data.titulo });
    return { ok: true, id: criada?.id as string };
  });

/** Remove a frase do catálogo interno (não mexe no template da Meta). */
export const excluirFrase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    await assertAdmin(context as Ctx);
    const res = await supabase.from("mensagem_templates").delete().eq("id", data.id);
    await assertNoError(res, "frases-prontas.excluirFrase", { id: data.id });
    return { ok: true };
  });

/** Grava a nova ordem de exibição conforme a sequência de ids recebida. */
export const reordenarFrases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ ids: z.array(z.string().uuid()).max(300) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    await assertAdmin(context as Ctx);
    let i = 0;
    for (const id of data.ids) {
      i += 1;
      const res = await supabase
        .from("mensagem_templates")
        .update({ ordem: i, updated_at: new Date().toISOString() })
        .eq("id", id);
      await assertNoError(res, "frases-prontas.reordenarFrases", { id });
    }
    return { ok: true, total: i };
  });

/* ------------------------------------------------------------------ *
 * Integração com a Meta
 * ------------------------------------------------------------------ */

async function enviarUma(
  supabase: any,
  frase: {
    id: string;
    titulo: string;
    corpo: string;
    meta_nome: string | null;
    meta_status: string | null;
    meta_categoria: string | null;
  },
): Promise<{ ok: boolean; erro?: string; status?: string }> {
  if (frase.meta_nome && (frase.meta_status === "APPROVED" || frase.meta_status === "PENDING")) {
    return {
      ok: false,
      erro: "Este modelo já existe na Meta (aprovado ou em análise). Exclua-o na Meta antes de reenviar.",
    };
  }

  const { texto, mapa, exemplos } = converterParaMeta(frase.corpo);
  const nome = frase.meta_nome ?? slugMeta(frase.titulo);
  const categoria = frase.meta_categoria ?? "MARKETING";

  const { cloudCriarTemplate, cloudInvalidarCacheTemplates } = await import(
    "./whatsapp-cloud.server"
  );
  const r = await cloudCriarTemplate({ name: nome, category: categoria, bodyText: texto, exemplos });
  cloudInvalidarCacheTemplates();

  const patch = r.ok
    ? {
        meta_nome: nome,
        meta_id: r.id ?? null,
        meta_status: r.status ?? "PENDING",
        meta_categoria: r.category ?? categoria,
        meta_mapa: mapa,
        meta_enviado_em: new Date().toISOString(),
        meta_erro: null,
        updated_at: new Date().toISOString(),
      }
    : {
        meta_status: "ERRO",
        meta_erro: (r.erro ?? "Falha desconhecida na Meta.").slice(0, 500),
        meta_mapa: mapa,
        meta_enviado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

  const res = await supabase.from("mensagem_templates").update(patch).eq("id", frase.id);
  if (res?.error) {
    await registrarFalhaSegura("frases-prontas.enviarParaMeta/update", res.error, {
      id: frase.id,
    });
  }

  return r.ok
    ? { ok: true, status: (r.status ?? "PENDING") as string }
    : { ok: false, erro: r.erro ?? "Falha desconhecida na Meta." };
}

/** Envia uma frase para aprovação da Meta. */
export const enviarFraseParaMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context as Ctx;
    await assertAdmin(context as Ctx);

    const { data: frase, error } = await supabase
      .from("mensagem_templates")
      .select("id, titulo, corpo, meta_nome, meta_status, meta_categoria")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !frase) throw new Error("Frase não encontrada.");
    if (citaNomeDeEmpresa(frase.corpo)) throw new Error(MSG_EMPRESA_PROIBIDA);

    return enviarUma(supabase, frase);
  });

/** Envia, uma a uma, todas as frases marcadas como sugeridas e ainda não aprovadas. */
export const enviarSugeridasParaMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    await assertAdmin(context as Ctx);

    const { data: frases, error } = await supabase
      .from("mensagem_templates")
      .select("id, titulo, corpo, meta_nome, meta_status, meta_categoria")
      .eq("meta_sugerido", true)
      .eq("ativo", true)
      .or("meta_status.is.null,meta_status.eq.REJECTED,meta_status.eq.ERRO")
      .order("ordem", { ascending: true });
    if (error) throw new Error(error.message);

    let enviadas = 0;
    const erros: Array<{ titulo: string; erro: string }> = [];
    for (const f of frases ?? []) {
      if (citaNomeDeEmpresa(f.corpo)) {
        erros.push({ titulo: f.titulo, erro: MSG_EMPRESA_PROIBIDA });
        continue;
      }
      const r = await enviarUma(supabase, f);
      if (r.ok) enviadas += 1;
      else erros.push({ titulo: f.titulo, erro: r.erro ?? "Falha desconhecida." });
      // A Meta limita a taxa de criação de templates; 700 ms evita o 80007.
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    return { enviadas, erros };
  });

/** Relê os status na Meta e atualiza as frases correspondentes. */
export const sincronizarStatusMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    await assertAdmin(context as Ctx);

    const { cloudListarTemplatesTodos, cloudInvalidarCacheTemplates } = await import(
      "./whatsapp-cloud.server"
    );
    const lista = await cloudListarTemplatesTodos();
    if (!lista.ok) throw new Error(lista.erro ?? "Não foi possível consultar a Meta.");
    cloudInvalidarCacheTemplates();

    const { data: frases, error } = await supabase
      .from("mensagem_templates")
      .select("id, meta_nome")
      .not("meta_nome", "is", null);
    if (error) throw new Error(error.message);

    const porNome = new Map(
      lista.itens.filter((t) => t.language === "pt_BR" || !t.language).map((t) => [t.name, t]),
    );

    let atualizadas = 0;
    for (const f of frases ?? []) {
      const t = porNome.get(f.meta_nome as string);
      if (!t) continue;
      // REGISTRAR E SEGUIR: sincronizar é informativo, não bloqueia a tela.
      const res = await supabase
        .from("mensagem_templates")
        .update({
          meta_status: t.status,
          meta_id: t.id,
          meta_categoria: t.category || null,
          meta_erro: t.rejected_reason ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", f.id);
      if (res?.error) {
        await registrarFalhaSegura("frases-prontas.sincronizarStatusMeta", res.error, { id: f.id });
        continue;
      }
      atualizadas += 1;
    }

    const nomesCrm = new Set((frases ?? []).map((f: { meta_nome: string }) => f.meta_nome));
    return {
      atualizadas,
      metaTodos: lista.itens,
      foraDoCrm: lista.itens.filter((t) => !nomesCrm.has(t.name)),
      templateAutomatico: (process.env["META_TEMPLATE_NAME"] ?? "").trim() || null,
    };
  });

/** Exclui um template diretamente na conta da Meta (ação destrutiva). */
export const excluirTemplateNaMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ name: z.string().trim().min(1).max(80) }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as Ctx;
    await assertAdmin(context as Ctx);

    const automatico = (process.env["META_TEMPLATE_NAME"] ?? "").trim();
    if (automatico && automatico === data.name) {
      throw new Error(
        "Este modelo é usado pelos envios automáticos do sistema e não pode ser excluído.",
      );
    }

    const { cloudExcluirTemplate, cloudInvalidarCacheTemplates } = await import(
      "./whatsapp-cloud.server"
    );
    const r = await cloudExcluirTemplate(data.name);
    if (!r.ok) throw new Error(r.erro ?? "Não foi possível excluir o modelo na Meta.");
    cloudInvalidarCacheTemplates();

    // REGISTRAR E SEGUIR: o template já saiu da Meta; limpar o CRM é consequência.
    const limpeza = await supabase
      .from("mensagem_templates")
      .update({
        meta_nome: null,
        meta_id: null,
        meta_status: null,
        meta_mapa: null,
        meta_enviado_em: null,
        meta_erro: null,
        updated_at: new Date().toISOString(),
      })
      .eq("meta_nome", data.name);
    if (limpeza?.error) {
      await registrarFalhaSegura("frases-prontas.excluirTemplateNaMeta/limpeza", limpeza.error, {
        name: data.name,
      });
    }

    const auditoria = await supabase.from("user_audit_log").insert({
      alvo_user_id: userId,
      ator_user_id: userId,
      campo: "template_meta_excluido",
      valor_anterior: data.name,
      valor_novo: null,
    });
    if (auditoria?.error) {
      await registrarFalhaSegura("frases-prontas.excluirTemplateNaMeta/auditoria", auditoria.error, {
        name: data.name,
      });
    }

    return { ok: true };
  });
