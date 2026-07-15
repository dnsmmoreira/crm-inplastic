import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const ProdutoSchema = z.object({
  codigo_produto: z.union([z.number(), z.string()]).transform((v) => Number(v)),
  codigo: z.string(),
  descricao: z.string(),
  descricao_familia: z.string().nullable().optional(),
  unidade: z.string().nullable().optional(),
  ncm: z.string().nullable().optional(),
  valor_unitario: z.union([z.number(), z.string()]).transform((v) => Number(v)),
  marca: z.string().nullable().optional(),
});

const BodySchema = z.object({
  produtos: z.array(ProdutoSchema),
});

/**
 * Sync do catálogo Omie disparado pelo n8n.
 * Autentica via header `x-n8n-token` comparado com o secret `N8N_SYNC_TOKEN`.
 * Substitui integralmente a tabela `produtos_omie` (delete + bulk insert).
 */
export const Route = createFileRoute("/api/public/hooks/omie-sync-produtos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.N8N_SYNC_TOKEN;
        const provided = request.headers.get("x-n8n-token");
        if (!expected || !provided || provided !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let json: unknown;
        try {
          json = await request.json();
        } catch {
          return new Response(JSON.stringify({ error: "invalid json" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Aceita tanto { produtos: [...] } quanto um array direto no body.
        const payload = Array.isArray(json) ? { produtos: json } : json;
        const parsed = BodySchema.safeParse(payload);
        if (!parsed.success) {
          return new Response(
            JSON.stringify({ error: "invalid payload", issues: parsed.error.issues }),
            { status: 400, headers: { "Content-Type": "application/json" } },
          );
        }

        const atualizadoEm = new Date().toISOString();
        const rows = parsed.data.produtos.map((p) => ({
          codigo_produto: p.codigo_produto,
          codigo: p.codigo,
          descricao: p.descricao,
          descricao_familia: p.descricao_familia ?? null,
          unidade: p.unidade ?? null,
          ncm: p.ncm ?? null,
          valor_unitario: p.valor_unitario,
          marca: p.marca ?? null,
          inativo: false,
          bloqueado: false,
          atualizado_em: atualizadoEm,
        }));

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // O PostgREST não expõe transações multi-statement — fazemos delete + insert
        // e, em caso de falha no insert, abortamos deixando log claro.
        const { error: delErr } = await supabaseAdmin
          .from("produtos_omie")
          .delete()
          .not("codigo_produto", "is", null);
        if (delErr) {
          return new Response(
            JSON.stringify({ error: "delete failed", detail: delErr.message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        let inseridos = 0;
        if (rows.length > 0) {
          // Insert em lotes para evitar payloads gigantes.
          const BATCH = 500;
          for (let i = 0; i < rows.length; i += BATCH) {
            const slice = rows.slice(i, i + BATCH);
            const { error: insErr, count } = await supabaseAdmin
              .from("produtos_omie")
              .insert(slice as never, { count: "exact" });
            if (insErr) {
              return new Response(
                JSON.stringify({
                  error: "insert failed",
                  detail: insErr.message,
                  inseridos_parcial: inseridos,
                }),
                { status: 500, headers: { "Content-Type": "application/json" } },
              );
            }
            inseridos += count ?? slice.length;
          }
        }

        return new Response(
          JSON.stringify({ ok: true, inseridos, atualizado_em: atualizadoEm }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
