import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { assertNoError, assertRpcPermissao } from "@/lib/guard-erros";
import { diasParado, faltasDoProduto, type CampoFaltandoProduto } from "@/lib/pendencias-cadastro";

/**
 * Faxina de cadastro: leitura pura com o client do usuário — o RLS decide o
 * escopo (vendedor vê o que é dele, admin vê tudo). Não escreve nada.
 */

const LIMITE = 200;

export type PendenciaLead = {
  id: string;
  company: string | null;
  contact_name: string | null;
  stage: string;
  owner: string | null;
  created_at: string;
  dias_parado: number;
};

export type PendenciaProduto = {
  id: string;
  sku: string;
  name: string;
  faltando: CampoFaltandoProduto[];
};

export type PendenciaCliente = {
  id: string;
  razao_social: string | null;
  cnpj: string | null;
  vendedor: string | null;
};

export type PendenciaProposta = {
  id: string;
  number: string;
  cliente: string | null;
  owner: string | null;
  dias_parada: number;
  total: number;
};

export type PendenciasCadastro = {
  isAdmin: boolean;
  leads: { total: number; itens: PendenciaLead[] };
  produtos: { total: number; itens: PendenciaProduto[] };
  clientes: { total: number; itens: PendenciaCliente[] };
  propostas: { total: number; itens: PendenciaProposta[] };
  resumo: { leads: number; produtos: number; clientes: number; propostas: number; total: number };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

async function nomesPorId(sb: LooseClient, ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (unicos.length === 0) return new Map();
  const res = await sb.from("profiles").select("id, name").in("id", unicos);
  await assertNoError(res, "pendencias.nomesPorId", { qtd: unicos.length });
  const m = new Map<string, string>();
  for (const p of (res.data ?? []) as { id: string; name: string | null }[]) {
    if (p.name) m.set(p.id, p.name);
  }
  return m;
}

export const listarPendenciasCadastro = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendenciasCadastro> => {
    const sb = context.supabase as LooseClient;
    const userId = context.userId as string;

    const isAdmin = Boolean(
      await assertRpcPermissao(
        await sb.rpc("has_role", { _user_id: userId, _role: "admin" }),
        "pendencias.has_role",
        { userId },
      ),
    );

    const agora = Date.now();

    // 1) Leads abertos sem CNPJ e sem cliente vinculado.
    const leadsRes = await sb
      .from("leads")
      .select("id, company, contact_name, stage, owner_id, created_at, etapa_changed_at", {
        count: "exact",
      })
      .not("stage", "in", "(ganho,perdido)")
      .is("cliente_id", null)
      .or("cnpj.is.null,cnpj.eq.")
      .order("created_at", { ascending: true })
      .limit(LIMITE);
    await assertNoError(leadsRes, "pendencias.leads");
    const leadsRaw = (leadsRes.data ?? []) as {
      id: string;
      company: string | null;
      contact_name: string | null;
      stage: string;
      owner_id: string | null;
      created_at: string;
      etapa_changed_at: string | null;
    }[];

    // 3) Clientes ativos sem e-mail de NF.
    const clientesRes = await sb
      .from("clientes")
      .select("id, razao_social, cnpj, vendedor_id, criado_em", { count: "exact" })
      .eq("ativo", true)
      .or("email_nf.is.null,email_nf.eq.")
      .order("criado_em", { ascending: true })
      .limit(LIMITE);
    await assertNoError(clientesRes, "pendencias.clientes");
    const clientesRaw = (clientesRes.data ?? []) as {
      id: string;
      razao_social: string | null;
      cnpj: string | null;
      vendedor_id: string | null;
    }[];

    // 4) Propostas em rascunho paradas há mais de 7 dias.
    const corte = new Date(agora - 7 * 86_400_000).toISOString();
    const propostasRes = await sb
      .from("propostas")
      .select("id, number, lead_id, owner_id, updated_at, discount_percent", { count: "exact" })
      .eq("status", "rascunho")
      .lt("updated_at", corte)
      .order("updated_at", { ascending: true })
      .limit(LIMITE);
    await assertNoError(propostasRes, "pendencias.propostas");
    const propostasRaw = (propostasRes.data ?? []) as {
      id: string;
      number: string;
      lead_id: string | null;
      owner_id: string | null;
      updated_at: string;
      discount_percent: number | null;
    }[];

    // 2) Produtos ativos sem peso/dimensões — só admin edita produto.
    let produtosItens: PendenciaProduto[] = [];
    let produtosTotal = 0;
    if (isAdmin) {
      const produtosRes = await sb
        .from("produtos")
        .select("id, sku, name, weight_kg, height_cm, width_cm, length_cm, created_at")
        .eq("active", true)
        .order("created_at", { ascending: true });
      await assertNoError(produtosRes, "pendencias.produtos");
      const todos = (produtosRes.data ?? []) as {
        id: string;
        sku: string;
        name: string;
        weight_kg: number | null;
        height_cm: number | null;
        width_cm: number | null;
        length_cm: number | null;
      }[];
      const comFalta = todos
        .map((p) => ({ p, faltando: faltasDoProduto(p) }))
        .filter((x) => x.faltando.length > 0);
      produtosTotal = comFalta.length;
      produtosItens = comFalta
        .slice(0, LIMITE)
        .map(({ p, faltando }) => ({ id: p.id, sku: p.sku, name: p.name, faltando }));
    }

    // Nomes (owner/vendedor) e dados auxiliares das propostas.
    const nomes = await nomesPorId(sb, [
      ...leadsRaw.map((l) => l.owner_id ?? ""),
      ...clientesRaw.map((c) => c.vendedor_id ?? ""),
      ...propostasRaw.map((p) => p.owner_id ?? ""),
    ]);

    const leadIds = [...new Set(propostasRaw.map((p) => p.lead_id).filter(Boolean))] as string[];
    const clientePorLead = new Map<string, string>();
    if (leadIds.length > 0) {
      const res = await sb.from("leads").select("id, company, razao_social").in("id", leadIds);
      await assertNoError(res, "pendencias.propostas/leads");
      for (const l of (res.data ?? []) as {
        id: string;
        company: string | null;
        razao_social: string | null;
      }[]) {
        clientePorLead.set(l.id, l.razao_social || l.company || "");
      }
    }

    const propostaIds = propostasRaw.map((p) => p.id);
    const totalPorProposta = new Map<string, number>();
    if (propostaIds.length > 0) {
      const res = await sb
        .from("proposta_itens")
        .select("proposta_id, quantity, unit_price")
        .in("proposta_id", propostaIds);
      await assertNoError(res, "pendencias.propostas/itens");
      for (const it of (res.data ?? []) as {
        proposta_id: string;
        quantity: number | null;
        unit_price: number | null;
      }[]) {
        const atual = totalPorProposta.get(it.proposta_id) ?? 0;
        totalPorProposta.set(
          it.proposta_id,
          atual + Number(it.quantity ?? 0) * Number(it.unit_price ?? 0),
        );
      }
    }

    const leads = {
      total: (leadsRes.count as number | null) ?? leadsRaw.length,
      itens: leadsRaw.map<PendenciaLead>((l) => ({
        id: l.id,
        company: l.company,
        contact_name: l.contact_name,
        stage: l.stage,
        owner: (l.owner_id && nomes.get(l.owner_id)) || null,
        created_at: l.created_at,
        dias_parado: diasParado(l.etapa_changed_at ?? l.created_at, agora),
      })),
    };

    const clientes = {
      total: (clientesRes.count as number | null) ?? clientesRaw.length,
      itens: clientesRaw.map<PendenciaCliente>((c) => ({
        id: c.id,
        razao_social: c.razao_social,
        cnpj: c.cnpj,
        vendedor: (c.vendedor_id && nomes.get(c.vendedor_id)) || null,
      })),
    };

    const propostas = {
      total: (propostasRes.count as number | null) ?? propostasRaw.length,
      itens: propostasRaw.map<PendenciaProposta>((p) => {
        const bruto = totalPorProposta.get(p.id) ?? 0;
        const desconto = Number(p.discount_percent ?? 0);
        return {
          id: p.id,
          number: p.number,
          cliente: (p.lead_id && clientePorLead.get(p.lead_id)) || null,
          owner: (p.owner_id && nomes.get(p.owner_id)) || null,
          dias_parada: diasParado(p.updated_at, agora),
          total: bruto * (1 - (Number.isFinite(desconto) ? desconto : 0) / 100),
        };
      }),
    };

    const produtos = { total: produtosTotal, itens: produtosItens };

    return {
      isAdmin,
      leads,
      produtos,
      clientes,
      propostas,
      resumo: {
        leads: leads.total,
        produtos: produtos.total,
        clientes: clientes.total,
        propostas: propostas.total,
        total: leads.total + produtos.total + clientes.total + propostas.total,
      },
    };
  });
