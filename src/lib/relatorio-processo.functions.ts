/**
 * "Placar de processo" — relatório SOMENTE LEITURA sobre a velocidade do
 * processo comercial (funil, 1ª resposta humana, propostas paradas, leads sem
 * contato). Nenhuma escrita, nenhuma regra de negócio nova.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/lib/auth.middleware";
import { assertNoError } from "@/lib/guard-erros";
import {
  assertPermissao,
  escopoProprio,
  type LooseClient,
} from "@/lib/relatorios.functions";
import {
  PERIODO_PADRAO,
  DIAS_PROPOSTA_PARADA,
  horasEntre,
  leadSemPrimeiroContato,
  propostaParada,
  resumoDuracao,
  type ResumoDuracao,
} from "@/lib/relatorio-processo";

export type FunilResumo = {
  lead_para_proposta: ResumoDuracao;
  proposta_para_pedido: ResumoDuracao;
  pedido_para_faturado: ResumoDuracao;
  total_ponta_a_ponta: ResumoDuracao;
};

export type PrimeiraRespostaResumo = ResumoDuracao & { so_ia: number };

export type LinhaVendedor = {
  vendedor_id: string;
  nome: string;
  funil: FunilResumo;
  primeira_resposta: PrimeiraRespostaResumo;
  propostas_paradas: number;
  leads_sem_contato: number;
};

export type PropostaParadaRow = {
  id: string;
  number: string;
  cliente: string | null;
  dono: string | null;
  dias: number;
  valor: number;
};

export type LeadSemContatoRow = {
  id: string;
  company: string;
  dono: string | null;
  horas: number;
};

export type RelatorioProcesso = {
  periodo_dias: number;
  escopo_proprio: boolean;
  geral: {
    funil: FunilResumo;
    primeira_resposta: PrimeiraRespostaResumo;
  };
  por_vendedor: LinhaVendedor[];
  propostas_paradas: PropostaParadaRow[];
  leads_sem_contato: LeadSemContatoRow[];
};

const vazio = (): FunilResumo => ({
  lead_para_proposta: resumoDuracao([]),
  proposta_para_pedido: resumoDuracao([]),
  pedido_para_faturado: resumoDuracao([]),
  total_ponta_a_ponta: resumoDuracao([]),
});

export const getRelatorioProcesso = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({ periodoDias: z.union([z.literal(30), z.literal(90), z.literal(180)]).optional() })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }): Promise<RelatorioProcesso> => {
    const sb: LooseClient = context.supabase;
    const userId = context.userId;
    await assertPermissao(
      sb,
      userId,
      "ver_relatorios",
      "Você não tem permissão para ver relatórios.",
    );
    const proprio = await escopoProprio(sb, userId);
    const periodoDias = data.periodoDias ?? PERIODO_PADRAO;
    const agora = new Date();
    const cutoff = new Date(agora.getTime() - periodoDias * 86_400_000).toISOString();

    // ── Leads do período ────────────────────────────────────────────────────
    let qLeads = sb
      .from("leads")
      .select("id, company, owner_id, created_at, stage, last_contact_at, last_interaction_at")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(3000);
    if (proprio) qLeads = qLeads.eq("owner_id", userId);
    const leadsRes = await qLeads;
    await assertNoError(leadsRes, "relatorio-processo/leads", { periodoDias });
    const leads = (leadsRes.data ?? []) as Array<{
      id: string;
      company: string;
      owner_id: string | null;
      created_at: string;
      stage: string;
      last_contact_at: string | null;
      last_interaction_at: string | null;
    }>;

    // ── Propostas do período ────────────────────────────────────────────────
    let qProp = sb
      .from("propostas")
      .select("id, number, lead_id, owner_id, status, sent_at, created_at, discount_percent, acrescimo_percent")
      .gte("created_at", cutoff)
      .limit(3000);
    if (proprio) qProp = qProp.eq("owner_id", userId);
    const propRes = await qProp;
    await assertNoError(propRes, "relatorio-processo/propostas", { periodoDias });
    const propostas = (propRes.data ?? []) as Array<{
      id: string;
      number: string;
      lead_id: string;
      owner_id: string;
      status: string;
      sent_at: string | null;
      created_at: string;
      discount_percent: number;
      acrescimo_percent: number | null;
    }>;

    // ── Pedidos do período ──────────────────────────────────────────────────
    let qPed = sb
      .from("pedidos")
      .select("id, lead_id, proposta_id, owner_id, created_at, nf_emitida_em")
      .gte("created_at", cutoff)
      .limit(3000);
    if (proprio) qPed = qPed.eq("owner_id", userId);
    const pedRes = await qPed;
    await assertNoError(pedRes, "relatorio-processo/pedidos", { periodoDias });
    const pedidos = (pedRes.data ?? []) as Array<{
      id: string;
      lead_id: string | null;
      proposta_id: string | null;
      owner_id: string;
      created_at: string;
      nf_emitida_em: string | null;
    }>;

    // ── Faturamento: primeiro `faturado_em_rota` de cada pedido ─────────────
    const faturadoEm = new Map<string, string>();
    if (pedidos.length > 0) {
      const histRes = await sb
        .from("pedido_stage_history")
        .select("pedido_id, to_stage, created_at")
        .in(
          "pedido_id",
          pedidos.map((p) => p.id),
        )
        .eq("to_stage", "faturado_em_rota")
        .order("created_at", { ascending: true })
        .limit(5000);
      await assertNoError(histRes, "relatorio-processo/pedido_stage_history", { periodoDias });
      for (const h of (histRes.data ?? []) as Array<{ pedido_id: string; created_at: string }>) {
        if (!faturadoEm.has(h.pedido_id)) faturadoEm.set(h.pedido_id, h.created_at);
      }
    }
    for (const p of pedidos) {
      if (!faturadoEm.has(p.id) && p.nf_emitida_em) faturadoEm.set(p.id, p.nf_emitida_em);
    }

    // ── Índices por lead ────────────────────────────────────────────────────
    const primeiroEnvioDoLead = new Map<string, string>();
    for (const p of propostas) {
      if (!p.sent_at) continue;
      const atual = primeiroEnvioDoLead.get(p.lead_id);
      if (!atual || p.sent_at < atual) primeiroEnvioDoLead.set(p.lead_id, p.sent_at);
    }
    const primeiroPedidoDoLead = new Map<string, { created_at: string; id: string }>();
    for (const p of pedidos) {
      if (!p.lead_id) continue;
      const atual = primeiroPedidoDoLead.get(p.lead_id);
      if (!atual || p.created_at < atual.created_at)
        primeiroPedidoDoLead.set(p.lead_id, { created_at: p.created_at, id: p.id });
    }
    const propostasComPedido = new Set(
      pedidos.map((p) => p.proposta_id).filter((x): x is string => !!x),
    );

    // ── Funil por lead ──────────────────────────────────────────────────────
    type Buckets = { a: number[]; b: number[]; c: number[]; total: number[] };
    const novoBucket = (): Buckets => ({ a: [], b: [], c: [], total: [] });
    const geralBuckets = novoBucket();
    const porVendedor = new Map<string, { funil: Buckets; resp: number[]; soIa: number }>();
    const bucketDe = (vid: string | null) => {
      if (!vid) return null;
      let e = porVendedor.get(vid);
      if (!e) {
        e = { funil: novoBucket(), resp: [], soIa: 0 };
        porVendedor.set(vid, e);
      }
      return e;
    };

    for (const l of leads) {
      const envio = primeiroEnvioDoLead.get(l.id) ?? null;
      const pedido = primeiroPedidoDoLead.get(l.id) ?? null;
      const fat = pedido ? (faturadoEm.get(pedido.id) ?? null) : null;
      const a = horasEntre(l.created_at, envio);
      const b = horasEntre(envio, pedido?.created_at ?? null);
      const c = horasEntre(pedido?.created_at ?? null, fat);
      const total = horasEntre(l.created_at, fat);
      const alvo = bucketDe(l.owner_id);
      const push = (arr: keyof Buckets, v: number | null) => {
        if (v === null) return;
        geralBuckets[arr].push(v);
        if (alvo) alvo.funil[arr].push(v);
      };
      push("a", a);
      push("b", b);
      push("c", c);
      push("total", total);
    }

    // ── 1ª resposta humana no WhatsApp ──────────────────────────────────────
    let qConv = sb
      .from("whatsapp_conversas")
      .select("id, atribuido_para, created_at, em_espera_desde")
      .gte("created_at", cutoff)
      .limit(1000);
    if (proprio) qConv = qConv.eq("atribuido_para", userId);
    const convRes = await qConv;
    await assertNoError(convRes, "relatorio-processo/conversas", { periodoDias });
    const conversas = (convRes.data ?? []) as Array<{
      id: string;
      atribuido_para: string | null;
      em_espera_desde: string | null;
    }>;

    let geralResp: number[] = [];
    let geralSoIa = 0;
    if (conversas.length > 0) {
      const msgRes = await sb
        .from("whatsapp_mensagens")
        .select("conversa_id, autor, direcao, usuario_id, created_at")
        .in(
          "conversa_id",
          conversas.map((c) => c.id),
        )
        .gte("created_at", cutoff)
        .order("created_at", { ascending: true })
        .limit(20000);
      await assertNoError(msgRes, "relatorio-processo/mensagens", { periodoDias });
      const porConversa = new Map<
        string,
        { cliente: string | null; humano: string | null; teveIa: boolean }
      >();
      for (const m of (msgRes.data ?? []) as Array<{
        conversa_id: string;
        autor: string;
        direcao: string;
        usuario_id: string | null;
        created_at: string;
      }>) {
        let e = porConversa.get(m.conversa_id);
        if (!e) {
          e = { cliente: null, humano: null, teveIa: false };
          porConversa.set(m.conversa_id, e);
        }
        if (m.autor === "cliente") {
          if (!e.cliente) e.cliente = m.created_at;
          continue;
        }
        if (m.direcao !== "saida") continue;
        const humano = m.autor === "vendedor" || !!m.usuario_id;
        if (!humano) {
          e.teveIa = true;
          continue;
        }
        if (e.cliente && !e.humano) e.humano = m.created_at;
      }
      for (const c of conversas) {
        const e = porConversa.get(c.id);
        if (!e || !e.cliente) continue;
        const alvo = bucketDe(c.atribuido_para);
        if (e.humano) {
          const h = horasEntre(e.cliente, e.humano);
          if (h !== null) {
            geralResp.push(h);
            if (alvo) alvo.resp.push(h);
          }
        } else if (e.teveIa && !c.em_espera_desde) {
          // Atendimento declarado "em espera" não conta como cliente
          // largado só com a IA — o humano está aguardando o cliente.
          geralSoIa++;
          if (alvo) alvo.soIa++;
        }
      }
    }

    // ── Propostas paradas ───────────────────────────────────────────────────
    const paradas = propostas.filter((p) =>
      propostaParada({ status: p.status, sent_at: p.sent_at, temPedido: propostasComPedido.has(p.id) }, agora),
    );
    const valorPorProposta = new Map<string, number>();
    if (paradas.length > 0) {
      const itensRes = await sb
        .from("proposta_itens")
        .select("proposta_id, quantity, unit_price")
        .in(
          "proposta_id",
          paradas.map((p) => p.id),
        )
        .limit(5000);
      await assertNoError(itensRes, "relatorio-processo/proposta_itens", { periodoDias });
      for (const i of (itensRes.data ?? []) as Array<{
        proposta_id: string;
        quantity: number;
        unit_price: number;
      }>) {
        const atual = valorPorProposta.get(i.proposta_id) ?? 0;
        valorPorProposta.set(
          i.proposta_id,
          atual + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0),
        );
      }
    }

    // ── Leads sem 1º contato ────────────────────────────────────────────────
    const semContato = leads.filter((l) => leadSemPrimeiroContato(l, agora));

    // ── Nomes (vendedores e donos das listas) ───────────────────────────────
    const idsNome = new Set<string>([
      ...porVendedor.keys(),
      ...paradas.map((p) => p.owner_id),
      ...semContato.map((l) => l.owner_id ?? "").filter(Boolean),
    ]);
    const nomes = new Map<string, string>();
    if (idsNome.size > 0) {
      const profRes = await sb.from("profiles").select("id, name").in("id", [...idsNome]);
      await assertNoError(profRes, "relatorio-processo/profiles", {});
      for (const p of (profRes.data ?? []) as Array<{ id: string; name: string | null }>) {
        nomes.set(p.id, p.name ?? "Sem nome");
      }
    }

    const nomeCliente = new Map(leads.map((l) => [l.id, l.company]));
    const paradasPorVendedor = new Map<string, number>();
    for (const p of paradas)
      paradasPorVendedor.set(p.owner_id, (paradasPorVendedor.get(p.owner_id) ?? 0) + 1);
    const semContatoPorVendedor = new Map<string, number>();
    for (const l of semContato)
      if (l.owner_id)
        semContatoPorVendedor.set(l.owner_id, (semContatoPorVendedor.get(l.owner_id) ?? 0) + 1);

    const linhas: LinhaVendedor[] = [...porVendedor.entries()]
      .map(([vid, e]) => ({
        vendedor_id: vid,
        nome: nomes.get(vid) ?? "Sem nome",
        funil: {
          lead_para_proposta: resumoDuracao(e.funil.a),
          proposta_para_pedido: resumoDuracao(e.funil.b),
          pedido_para_faturado: resumoDuracao(e.funil.c),
          total_ponta_a_ponta: resumoDuracao(e.funil.total),
        },
        primeira_resposta: { ...resumoDuracao(e.resp), so_ia: e.soIa },
        propostas_paradas: paradasPorVendedor.get(vid) ?? 0,
        leads_sem_contato: semContatoPorVendedor.get(vid) ?? 0,
      }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

    return {
      periodo_dias: periodoDias,
      escopo_proprio: proprio,
      geral: {
        funil:
          geralBuckets.a.length + geralBuckets.b.length + geralBuckets.c.length === 0
            ? vazio()
            : {
                lead_para_proposta: resumoDuracao(geralBuckets.a),
                proposta_para_pedido: resumoDuracao(geralBuckets.b),
                pedido_para_faturado: resumoDuracao(geralBuckets.c),
                total_ponta_a_ponta: resumoDuracao(geralBuckets.total),
              },
        primeira_resposta: { ...resumoDuracao(geralResp), so_ia: geralSoIa },
      },
      por_vendedor: linhas,
      propostas_paradas: paradas
        .map((p) => ({
          id: p.id,
          number: p.number,
          cliente: nomeCliente.get(p.lead_id) ?? null,
          dono: nomes.get(p.owner_id) ?? null,
          dias: Math.floor(
            (agora.getTime() - Date.parse(p.sent_at!)) / 86_400_000,
          ),
          valor: (() => {
            const bruto = valorPorProposta.get(p.id) ?? 0;
            const desc = Math.max(0, Math.min(100, Number(p.discount_percent) || 0));
            const acr = Math.max(0, Math.min(100, Number(p.acrescimo_percent) || 0));
            const liquido = bruto - bruto * (desc / 100);
            return +(liquido * (1 + acr / 100)).toFixed(2);
          })(),
        }))
        .sort((a, b) => b.dias - a.dias),
      leads_sem_contato: semContato
        .map((l) => ({
          id: l.id,
          company: l.company,
          dono: l.owner_id ? (nomes.get(l.owner_id) ?? null) : null,
          horas: Math.floor((agora.getTime() - Date.parse(l.created_at)) / 3_600_000),
        }))
        .sort((a, b) => b.horas - a.horas),
    };
  });

export { DIAS_PROPOSTA_PARADA };
