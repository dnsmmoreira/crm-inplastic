import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { assertNoError, assertRpcPermissao, registrarFalhaSegura } from "@/lib/guard-erros";
import {
  documentoValido,
  emailValido,
  normalizarPeso,
  soDigitos,
} from "@/lib/pendencias-correcao";
import { isValidCnpj, isValidCpf } from "@/lib/cnpj";

/**
 * Correção INLINE da tela /pendencias: uma escrita pequena por linha.
 * Todo gate é fail-closed e toda escrita confere `error`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

type Resultado = { ok: true; mensagem?: string } | { ok: false; mensagem: string };

async function ehAdmin(sb: LooseClient, userId: string, origem: string): Promise<boolean> {
  return Boolean(
    await assertRpcPermissao(
      await sb.rpc("has_role", { _user_id: userId, _role: "admin" }),
      origem,
      { userId },
    ),
  );
}

async function temPermissao(
  sb: LooseClient,
  userId: string,
  chave: string,
  origem: string,
): Promise<boolean> {
  return Boolean(
    await assertRpcPermissao(
      await sb.rpc("tem_permissao", { _user_id: userId, _chave: chave }),
      origem,
      { userId, chave },
    ),
  );
}

async function auditar(
  sb: LooseClient,
  userId: string,
  campo: string,
  anterior: string | null,
  novo: string | null,
) {
  const res = await sb.from("user_audit_log").insert({
    ator_user_id: userId,
    alvo_user_id: userId,
    campo,
    valor_anterior: anterior,
    valor_novo: novo,
  });
  if (res.error) await registrarFalhaSegura(`pendencias.auditoria/${campo}`, res.error);
}

/* ------------------------------- produtos -------------------------------- */

export const atualizarPesoProduto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { produto_id: string; peso_kg: number }) =>
    z.object({ produto_id: z.string().uuid(), peso_kg: z.number() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<Resultado> => {
    const sb: LooseClient = context.supabase;
    const userId = context.userId as string;
    if (!(await ehAdmin(sb, userId, "pendencias.peso/has_role"))) {
      return { ok: false, mensagem: "Somente administradores podem editar produtos." };
    }
    const peso = normalizarPeso(data.peso_kg);
    if (peso === null) return { ok: false, mensagem: "Informe um peso maior que zero." };

    const up = await sb.from("produtos").update({ weight_kg: peso }).eq("id", data.produto_id);
    await assertNoError(
      up,
      "pendencias.peso/update",
      { produto_id: data.produto_id },
      "Não foi possível salvar o peso. Tente novamente.",
    );
    await auditar(sb, userId, "produto_peso", data.produto_id, String(peso));
    return { ok: true, mensagem: `Peso salvo: ${peso} kg` };
  });

/* -------------------------------- clientes -------------------------------- */

export const definirEmailNfCliente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cliente_id: string; email_nf: string }) =>
    z.object({ cliente_id: z.string().uuid(), email_nf: z.string() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<Resultado> => {
    const sb: LooseClient = context.supabase;
    const userId = context.userId as string;
    const email = data.email_nf.trim().toLowerCase();
    if (!emailValido(email)) return { ok: false, mensagem: "E-mail inválido." };

    // A RLS de `clientes` já define quem pode escrever: sem acesso, 0 linhas.
    const up = await sb
      .from("clientes")
      .update({ email_nf: email })
      .eq("id", data.cliente_id)
      .select("id");
    await assertNoError(
      up,
      "pendencias.emailNf/update",
      { cliente_id: data.cliente_id },
      "Não foi possível salvar o e-mail. Tente novamente.",
    );
    if (((up.data ?? []) as unknown[]).length === 0) {
      return { ok: false, mensagem: "Você não tem permissão para editar este cliente." };
    }
    await auditar(sb, userId, "cliente_email_nf", data.cliente_id, email);
    return { ok: true, mensagem: "E-mail de NF salvo" };
  });

/* ---------------------------------- leads --------------------------------- */

export const definirDocumentoLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { lead_id: string; documento: string }) =>
    z.object({ lead_id: z.string().uuid(), documento: z.string() }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<Resultado & { cliente_nome?: string | null }> => {
      const sb: LooseClient = context.supabase;
      const userId = context.userId as string;
      const tipo = documentoValido(data.documento);
      if (!tipo) return { ok: false, mensagem: "CNPJ/CPF inválido." };
      const digitos = soDigitos(data.documento);

      // Dígitos verificadores: mesma validação do cadastro de clientes.
      if (tipo === "cnpj" && !isValidCnpj(digitos)) {
        return { ok: false, mensagem: "CNPJ inválido (dígitos verificadores)." };
      }
      if (tipo === "cpf" && !isValidCpf(digitos)) {
        return { ok: false, mensagem: "CPF inválido (dígitos verificadores)." };
      }

      const up = await sb
        .from("leads")
        // `leads` não tem coluna `cpf`: CNPJ (14) ou CPF (11) moram em `cnpj`.
        .update({ cnpj: digitos })
        .eq("id", data.lead_id)
        .select("id");
      await assertNoError(
        up,
        "pendencias.docLead/update",
        { lead_id: data.lead_id },
        "Não foi possível salvar o documento. Tente novamente.",
      );
      if (((up.data ?? []) as unknown[]).length === 0) {
        return { ok: false, mensagem: "Você não tem permissão para editar este lead." };
      }
      await auditar(sb, userId, "lead_documento", data.lead_id, digitos);

      const { garantirClienteDoLead } = await import("@/lib/clientes.functions");
      const r = await garantirClienteDoLead(sb, userId, data.lead_id);
      if (!r.ok) {
        return {
          ok: true,
          mensagem: `Documento salvo, mas o cliente não pôde ser vinculado: ${r.erros.join(" ")}`,
        };
      }
      const { data: cli } = await sb
        .from("clientes")
        .select("razao_social, nome_fantasia")
        .eq("id", r.clienteId)
        .maybeSingle();
      const nome =
        (cli as { razao_social?: string | null; nome_fantasia?: string | null } | null)
          ?.razao_social ??
        (cli as { nome_fantasia?: string | null } | null)?.nome_fantasia ??
        null;
      return {
        ok: true,
        cliente_nome: nome,
        mensagem: r.criado
          ? `Cliente criado e vinculado: ${nome ?? "cliente"}`
          : `Cliente vinculado: ${nome ?? "cliente"}`,
      };
    },
  );

export const definirProdutoLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { lead_id: string; product_id: string; product: string }) =>
    z
      .object({
        lead_id: z.string().uuid(),
        product_id: z.string().uuid(),
        product: z.string().min(1),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<Resultado> => {
    const sb: LooseClient = context.supabase;
    const userId = context.userId as string;
    const up = await sb
      .from("leads")
      .update({ product_id: data.product_id, product: data.product.trim() })
      .eq("id", data.lead_id)
      .select("id");
    await assertNoError(
      up,
      "pendencias.produtoLead/update",
      { lead_id: data.lead_id },
      "Não foi possível vincular o produto. Tente novamente.",
    );
    if (((up.data ?? []) as unknown[]).length === 0) {
      return { ok: false, mensagem: "Você não tem permissão para editar este lead." };
    }
    await auditar(sb, userId, "lead_produto", data.lead_id, data.product_id);
    return { ok: true, mensagem: "Produto vinculado ao catálogo" };
  });

/* ------------------------------- propostas -------------------------------- */

export const excluirRascunhoProposta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { proposta_id: string }) =>
    z.object({ proposta_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<Resultado> => {
    const sb: LooseClient = context.supabase;
    const userId = context.userId as string;

    const { data: p, error } = await sb
      .from("propostas")
      .select("id, number, status, owner_id")
      .eq("id", data.proposta_id)
      .maybeSingle();
    if (error) throw new Error(`Falha ao carregar a proposta: ${error.message}`);
    if (!p) return { ok: false, mensagem: "Proposta não encontrada ou sem acesso." };
    if (p.status !== "rascunho") {
      return { ok: false, mensagem: "Só é possível excluir propostas em rascunho." };
    }

    const dono = p.owner_id === userId;
    const autorizado =
      dono ||
      (await temPermissao(sb, userId, "propostas.excluir", "pendencias.excluirProposta/perm")) ||
      (await ehAdmin(sb, userId, "pendencias.excluirProposta/has_role"));
    if (!autorizado) {
      return { ok: false, mensagem: "Você não tem permissão para excluir esta proposta." };
    }

    const del = await sb.from("propostas").delete().eq("id", data.proposta_id);
    await assertNoError(
      del,
      "pendencias.excluirProposta/delete",
      { proposta_id: data.proposta_id },
      "Não foi possível excluir o rascunho. Tente novamente.",
    );
    await auditar(sb, userId, "proposta_rascunho_excluida", data.proposta_id, p.number ?? null);
    return { ok: true, mensagem: `Rascunho ${p.number ?? ""} excluído` };
  });
