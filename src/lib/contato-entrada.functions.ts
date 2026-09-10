/**
 * Checagem de contato duplicado no CADASTRO MANUAL.
 *
 * A tela só enxerga os leads que o vendedor pode ver; a carteira e os leads
 * de outros vendedores só aparecem aqui, no servidor, pela mesma porta de
 * entrada usada pelo WhatsApp e pelo OPA (`resolverContatoEntrada`).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";

export type ChecagemContato =
  | { situacao: "livre" }
  | {
      situacao: "duplicado";
      leadId: string | null;
      clienteId: string | null;
      vendedorId: string | null;
      vendedorNome: string | null;
      empresa: string | null;
      origem: string;
    }
  | { situacao: "suspeita"; leadId: string; empresa: string | null };

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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolverContatoEntrada, avisoDuplicidadePorNome } = await import(
      "@/lib/contato-entrada.server"
    );

    const entrada = await resolverContatoEntrada(supabaseAdmin, {
      telefone: data.telefone ?? null,
      cnpj: data.cnpj ?? null,
      email: data.email ?? null,
    });

    if (entrada.acao === "carteira" || entrada.acao === "lead_existente") {
      const vendedorId =
        entrada.acao === "carteira" ? entrada.vendedorId : (entrada.vendedorId ?? null);
      let vendedorNome: string | null = null;
      if (vendedorId) {
        const { data: perfil } = await supabaseAdmin
          .from("profiles")
          .select("name")
          .eq("id", vendedorId)
          .maybeSingle();
        vendedorNome = (perfil?.name as string | null) ?? null;
      }
      let empresa: string | null = entrada.leadAtivo?.company ?? null;
      if (!empresa && entrada.leadId) {
        const { data: lead } = await supabaseAdmin
          .from("leads")
          .select("company")
          .eq("id", entrada.leadId)
          .maybeSingle();
        empresa = (lead?.company as string | null) ?? null;
      }
      return {
        situacao: "duplicado",
        leadId: entrada.leadId ?? null,
        clienteId: entrada.acao === "carteira" ? entrada.clienteId : null,
        vendedorId,
        vendedorNome,
        empresa,
        origem: entrada.origem,
      };
    }

    // Nome/empresa nunca vinculam sozinhos — no máximo levantam suspeita.
    if (data.empresa) {
      const parecido = await avisoDuplicidadePorNome(supabaseAdmin, data.empresa);
      if (parecido) {
        return { situacao: "suspeita", leadId: parecido.leadId, empresa: parecido.company };
      }
    }

    // `context.userId` fica registrado apenas pelo middleware de auth.
    void context.userId;
    return { situacao: "livre" };
  });
