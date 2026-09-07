import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { assertNoError, assertRpcPermissao, registrarFalhaSegura } from "@/lib/guard-erros";
import { diasParado, faltasDoProduto, type CampoFaltandoProduto } from "@/lib/pendencias-cadastro";

/**
 * Faxina de cadastro: leitura pura com o client do usuário — o RLS decide o
 * escopo (vendedor vê o que é dele, admin vê tudo). Não escreve nada.
 *
 * Cada seção é independente e isolada: se uma consulta falhar, a falha é
 * registrada, a seção volta vazia com `erro` preenchido e as demais continuam
 * carregando normalmente (a tela mostra um aviso só naquela seção).
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

export type PendenciaEntrega = {
  id: string;
  number: string;
  cliente: string | null;
  responsavel: string | null;
  dias_em_pos_venda: number;
};

export type PendenciaLeadProduto = {
  id: string;
  company: string | null;
  product: string | null;
  owner: string | null;
};

export type Secao<T> = { total: number; itens: T[]; erro: string | null };

export type PendenciasCadastro = {
  isAdmin: boolean;
  leads: Secao<PendenciaLead>;
  leadsProduto: Secao<PendenciaLeadProduto>;
  produtos: Secao<PendenciaProduto>;
  clientes: Secao<PendenciaCliente>;
  propostas: Secao<PendenciaProposta>;
  entregas: Secao<PendenciaEntrega>;
  resumo: {
    leads: number;
    leadsProduto: number;
    produtos: number;
    clientes: number;
    propostas: number;
    entregas: number;
    total: number;
  };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = any;

/** Executa a seção isoladamente: erro vira seção vazia com aviso amigável. */
async function secaoSegura<T>(
  origem: string,
  fn: () => Promise<{ total: number; itens: T[] }>,
): Promise<Secao<T>> {
  try {
    const r = await fn();
    return { ...r, erro: null };
  } catch (e) {
    await registrarFalhaSegura(origem, e);
    console.error(`[pendencias] seção ${origem} falhou:`, e);
    return {
      total: 0,
      itens: [],
      erro: "Não foi possível carregar esta seção agora. Tente novamente mais tarde.",
    };
  }
}

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

/** Nome do cliente por lead (razão social, senão empresa). */
async function clientesPorLead(sb: LooseClient, ids: (string | null)[]) {
  const leadIds = [...new Set(ids.filter(Boolean))] as string[];
  const mapa = new Map<string, string>();
  if (leadIds.length === 0) return mapa;
  const res = await sb.from("leads").select("id, company, razao_social").in("id", leadIds);
  await assertNoError(res, "pendencias.leadsAuxiliares");
  for (const l of (res.data ?? []) as {
    id: string;
    company: string | null;
    razao_social: string | null;
  }[]) {
    mapa.set(l.id, l.razao_social || l.company || "");
  }
  return mapa;
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
    const leadsP = secaoSegura<PendenciaLead>("pendencias.leads", async () => {
      const res = await sb
        .from("leads")
        .select("id, company, contact_name, stage, owner_id, created_at, etapa_changed_at", {
          count: "exact",
        })
        .not("stage", "in", "(ganho,perdido)")
        .is("cliente_id", null)
        .or("cnpj.is.null,cnpj.eq.")
        .order("created_at", { ascending: true })
        .limit(LIMITE);
      await assertNoError(res, "pendencias.leads");
      const raw = (res.data ?? []) as {
        id: string;
        company: string | null;
        contact_name: string | null;
        stage: string;
        owner_id: string | null;
        created_at: string;
        etapa_changed_at: string | null;
      }[];
      const nomes = await nomesPorId(
        sb,
        raw.map((l) => l.owner_id ?? ""),
      );
      return {
        total: (res.count as number | null) ?? raw.length,
        itens: raw.map<PendenciaLead>((l) => ({
          id: l.id,
          company: l.company,
          contact_name: l.contact_name,
          stage: l.stage,
          owner: (l.owner_id && nomes.get(l.owner_id)) || null,
          created_at: l.created_at,
          dias_parado: diasParado(l.etapa_changed_at ?? l.created_at, agora),
        })),
      };
    });

    // 1b) Leads abertos cujo produto de interesse não está ligado ao catálogo.
    const leadsProdutoP = secaoSegura<PendenciaLeadProduto>("pendencias.leadsProduto", async () => {
      const res = await sb
        .from("leads")
        .select("id, company, product, owner_id, created_at", { count: "exact" })
        .not("stage", "in", "(ganho,perdido)")
        .is("product_id", null)
        .not("product", "is", null)
        .neq("product", "")
        .order("created_at", { ascending: true })
        .limit(LIMITE);
      await assertNoError(res, "pendencias.leadsProduto");
      const raw = (res.data ?? []) as {
        id: string;
        company: string | null;
        product: string | null;
        owner_id: string | null;
      }[];
      const nomes = await nomesPorId(
        sb,
        raw.map((l) => l.owner_id ?? ""),
      );
      return {
        total: (res.count as number | null) ?? raw.length,
        itens: raw.map<PendenciaLeadProduto>((l) => ({
          id: l.id,
          company: l.company,
          product: l.product,
          owner: (l.owner_id && nomes.get(l.owner_id)) || null,
        })),
      };
    });

    // 2) Produtos ativos sem peso/dimensões — só admin edita produto.
    const produtosP = secaoSegura<PendenciaProduto>("pendencias.produtos", async () => {
      if (!isAdmin) return { total: 0, itens: [] };
      const res = await sb
        .from("produtos")
        .select("id, sku, name, weight_kg, height_cm, width_cm, length_cm, created_at")
        .eq("active", true)
        .order("created_at", { ascending: true });
      await assertNoError(res, "pendencias.produtos");
      const todos = (res.data ?? []) as {
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
      return {
        total: comFalta.length,
        itens: comFalta
          .slice(0, LIMITE)
          .map(({ p, faltando }) => ({ id: p.id, sku: p.sku, name: p.name, faltando })),
      };
    });

    // 3) Clientes ativos sem e-mail de NF.
    const clientesP = secaoSegura<PendenciaCliente>("pendencias.clientes", async () => {
      const res = await sb
        .from("clientes")
        .select("id, razao_social, cnpj, vendedor_id, criado_em", { count: "exact" })
        .eq("ativo", true)
        .or("email_nf.is.null,email_nf.eq.")
        .order("criado_em", { ascending: true })
        .limit(LIMITE);
      await assertNoError(res, "pendencias.clientes");
      const raw = (res.data ?? []) as {
        id: string;
        razao_social: string | null;
        cnpj: string | null;
        vendedor_id: string | null;
      }[];
      const nomes = await nomesPorId(
        sb,
        raw.map((c) => c.vendedor_id ?? ""),
      );
      return {
        total: (res.count as number | null) ?? raw.length,
        itens: raw.map<PendenciaCliente>((c) => ({
          id: c.id,
          razao_social: c.razao_social,
          cnpj: c.cnpj,
          vendedor: (c.vendedor_id && nomes.get(c.vendedor_id)) || null,
        })),
      };
    });

    // 4) Propostas em rascunho paradas há mais de 7 dias.
    const propostasP = secaoSegura<PendenciaProposta>("pendencias.propostas", async () => {
      const corte = new Date(agora - 7 * 86_400_000).toISOString();
      const res = await sb
        .from("propostas")
        .select(
          "id, number, lead_id, owner_id, updated_at, discount_percent, acrescimo_percent",
          { count: "exact" },
        )
        .eq("status", "rascunho")
        .lt("updated_at", corte)
        .order("updated_at", { ascending: true })
        .limit(LIMITE);
      await assertNoError(res, "pendencias.propostas");
      const raw = (res.data ?? []) as {
        id: string;
        number: string;
        lead_id: string | null;
        owner_id: string | null;
        updated_at: string;
        discount_percent: number | null;
        acrescimo_percent: number | null;
      }[];

      const nomes = await nomesPorId(
        sb,
        raw.map((p) => p.owner_id ?? ""),
      );
      const clientePorLead = await clientesPorLead(
        sb,
        raw.map((p) => p.lead_id),
      );

      const totalPorProposta = new Map<string, number>();
      if (raw.length > 0) {
        const itensRes = await sb
          .from("proposta_itens")
          .select("proposta_id, quantity, unit_price")
          .in(
            "proposta_id",
            raw.map((p) => p.id),
          );
        await assertNoError(itensRes, "pendencias.propostas/itens");
        for (const it of (itensRes.data ?? []) as {
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

      return {
        total: (res.count as number | null) ?? raw.length,
        itens: raw.map<PendenciaProposta>((p) => {
          const bruto = totalPorProposta.get(p.id) ?? 0;
          const desconto = Number(p.discount_percent ?? 0);
          const acrescimo = Math.max(0, Number(p.acrescimo_percent ?? 0));
          return {
            id: p.id,
            number: p.number,
            cliente: (p.lead_id && clientePorLead.get(p.lead_id)) || null,
            owner: (p.owner_id && nomes.get(p.owner_id)) || null,
            dias_parada: diasParado(p.updated_at, agora),
            total:
              bruto *
              (1 - (Number.isFinite(desconto) ? desconto : 0) / 100) *
              (1 + acrescimo / 100),
          };
        }),
      };
    });

    // 5) Pedidos em pós-venda sem comprovação de entrega (foto + documento).
    // `pedidos` não tem coluna stage_changed_at: a entrada em pós-venda vem da
    // última linha de `pedido_stage_history` com to_stage = 'pos_venda'
    // (fallback: `pedidos.updated_at`).
    const entregasP = secaoSegura<PendenciaEntrega>("pendencias.entregas", async () => {
      const res = await sb
        .from("pedidos")
        .select(
          "id, number, lead_id, responsavel_atual_id, equipe_responsavel, created_at, updated_at",
          { count: "exact" },
        )
        .eq("stage", "pos_venda")
        .is("entrega_comprovada_em", null)
        .order("created_at", { ascending: true })
        .limit(LIMITE);
      await assertNoError(res, "pendencias.entregas");
      const base = (res.data ?? []) as {
        id: string;
        number: string;
        lead_id: string | null;
        responsavel_atual_id: string | null;
        equipe_responsavel: string | null;
        created_at: string;
        updated_at: string;
      }[];

      const ultimaTrocaPorPedido = new Map<string, string>();
      if (base.length > 0) {
        const histRes = await sb
          .from("pedido_stage_history")
          .select("pedido_id, created_at")
          .in(
            "pedido_id",
            base.map((p) => p.id),
          )
          .eq("to_stage", "pos_venda")
          .order("created_at", { ascending: false });
        await assertNoError(histRes, "pendencias.entregas/historico");
        for (const h of (histRes.data ?? []) as { pedido_id: string; created_at: string }[]) {
          if (!ultimaTrocaPorPedido.has(h.pedido_id)) {
            ultimaTrocaPorPedido.set(h.pedido_id, h.created_at);
          }
        }
      }


      const nomes = await nomesPorId(
        sb,
        base.map((p) => p.responsavel_atual_id ?? ""),
      );
      const clientePorLead = await clientesPorLead(
        sb,
        base.map((p) => p.lead_id),
      );

      return {
        total: (res.count as number | null) ?? base.length,
        itens: base.map<PendenciaEntrega>((p) => ({
          id: p.id,
          number: p.number,
          cliente: (p.lead_id && clientePorLead.get(p.lead_id)) || null,
          responsavel:
            (p.responsavel_atual_id && nomes.get(p.responsavel_atual_id)) ||
            p.equipe_responsavel ||
            null,
          dias_em_pos_venda: diasParado(
            ultimaTrocaPorPedido.get(p.id) ?? p.created_at,
            agora,
          ),
        })),
      };
    });

    const [leads, leadsProduto, produtos, clientes, propostas, entregas] = await Promise.all([
      leadsP,
      leadsProdutoP,
      produtosP,
      clientesP,
      propostasP,
      entregasP,
    ]);

    return {
      isAdmin,
      leads,
      leadsProduto,
      produtos,
      clientes,
      propostas,
      entregas,
      resumo: {
        leads: leads.total,
        leadsProduto: leadsProduto.total,
        produtos: produtos.total,
        clientes: clientes.total,
        propostas: propostas.total,
        entregas: entregas.total,
        total:
          leads.total + leadsProduto.total + produtos.total + clientes.total + propostas.total + entregas.total,
      },
    };
  });
