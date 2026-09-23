/**
 * Checagem de contato duplicado no CADASTRO MANUAL.
 *
 * A tela só enxerga os leads que o vendedor pode ver; a carteira e os leads
 * de outros vendedores só aparecem aqui, no servidor, pela mesma porta de
 * entrada usada pelo WhatsApp e pelo OPA (`resolverContatoEntrada`).
 *
 * Regra do Denis (set/2026): o DONO do cadastro e a equipe dele aparecem
 * sempre, inclusive entre equipes. Os dados do registro (empresa, ids)
 * continuam saindo só para quem já enxerga o registro.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { normalizarDocumento, type DonoCadastro } from "@/lib/consulta-dono";

export type ChecagemContato =
  | { situacao: "livre" }
  | {
      situacao: "duplicado";
      leadId: string | null;
      clienteId: string | null;
      vendedorId: string | null;
      origem: string;
      dono: DonoCadastro;
    }
  | { situacao: "suspeita"; leadId: string | null; dono: DonoCadastro };

export const MSG_LIMITE_CONTATO =
  "Muitas verificações seguidas. Espere um minuto e tente de novo.";

/** Limite por pessoa: balde próprio, separado da consulta de dono. */
export async function assertLimiteContatoEntrada(userId: string): Promise<void> {
  const { consumirTentativa } = await import("@/lib/rate-limit.server");
  const { CONSULTA_JANELA_SEGUNDOS, CONSULTA_LIMITE } = await import(
    "@/lib/consulta-dono.server"
  );
  const limite = await consumirTentativa(
    `contato_entrada:${userId}`,
    CONSULTA_JANELA_SEGUNDOS,
    CONSULTA_LIMITE,
  );
  if (!limite.permitido) throw new Error(MSG_LIMITE_CONTATO);
}

export const verificarContatoEntrada = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        telefone: z.string().trim().optional().nullable(),
        cnpj: z.string().trim().optional().nullable(),
        email: z.string().trim().optional().nullable(),
        empresa: z.string().trim().optional().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }): Promise<ChecagemContato> => {
    await assertLimiteContatoEntrada(context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolverContatoEntrada, avisoDuplicidadePorNome } = await import(
      "@/lib/contato-entrada.server"
    );
    const { montarDonoCadastro, podeVerDono } = await import("@/lib/consulta-dono.server");

    // Documento normalizado dos DOIS lados da comparação.
    const documento = normalizarDocumento(data.cnpj);

    const entrada = await resolverContatoEntrada(supabaseAdmin, {
      telefone: data.telefone ?? null,
      cnpj: documento || null,
      email: data.email ?? null,
    });

    if (entrada.acao === "carteira" || entrada.acao === "lead_existente") {
      const vendedorId =
        entrada.acao === "carteira" ? entrada.vendedorId : (entrada.vendedorId ?? null);

      let empresa: string | null = entrada.leadAtivo?.company ?? null;
      if (!empresa && entrada.leadId) {
        const { data: lead } = await supabaseAdmin
          .from("leads")
          .select("company")
          .eq("id", entrada.leadId)
          .maybeSingle();
        empresa = (lead?.company as string | null) ?? null;
      }

      const dono = await montarDonoCadastro(supabaseAdmin, context.userId, {
        vendedorId,
        empresa,
        documento,
      });

      // Ids e dono só saem para quem realmente enxerga o registro.
      return {
        situacao: "duplicado",
        leadId: dono.podeVerRegistro ? (entrada.leadId ?? null) : null,
        clienteId:
          dono.podeVerRegistro && entrada.acao === "carteira" ? entrada.clienteId : null,
        vendedorId: dono.podeVerRegistro ? vendedorId : null,
        origem: entrada.origem,
        dono,
      };
    }

    // Nome/empresa nunca vinculam sozinhos — no máximo levantam suspeita.
    if (data.empresa) {
      const parecido = await avisoDuplicidadePorNome(supabaseAdmin, data.empresa);
      if (parecido) {
        const { data: leadDono } = await supabaseAdmin
          .from("leads")
          .select("owner_id")
          .eq("id", parecido.leadId)
          .maybeSingle();
        const ownerId = (leadDono?.owner_id as string | null) ?? null;
        const dono = await montarDonoCadastro(supabaseAdmin, context.userId, {
          vendedorId: ownerId,
          empresa: parecido.company,
          documento,
        });
        const visivel = await podeVerDono(supabaseAdmin, context.userId, ownerId);
        return {
          situacao: "suspeita",
          leadId: visivel ? parecido.leadId : null,
          dono,
        };
      }
    }

    return { situacao: "livre" };
  });
