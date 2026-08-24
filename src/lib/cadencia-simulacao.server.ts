/**
 * Simulador de cadência — server-only.
 *
 * Reproduz, SEM gravar nada, exatamente a mesma decisão que o motor
 * `xerife-pedidos` toma para um pedido: qual exceção vence (cliente >
 * família > padrão), qual régua fica valendo, em que datas cada toque
 * dispara e quem recebe tarefa / notificação / alerta de diretoria.
 */
import {
  CADENCIA_PEDIDO,
  etapasComCadencia,
  passoCadencia,
  resolverExcecao,
  textoCadencia,
  normalizarRegua,
  type CadenciaExcecao,
} from "@/lib/pedidos-cadencia";
import { stageLabel } from "@/lib/pedidos-stages";
import type {
  PedidoOpcao,
  SimCandidata,
  SimPasso,
  SimPessoa,
  SimResultado,
} from "@/lib/cadencia-simulacao.types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

async function clienteDeLeitura(sb: SB): Promise<SB> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return supabaseAdmin as SB;
  } catch {
    return sb;
  }
}

function diasEntre(desde: string, ate: Date): number {
  const d = new Date(desde).getTime();
  if (!Number.isFinite(d)) return 0;
  return Math.max(0, Math.floor((ate.getTime() - d) / 86400000));
}

function somarDias(desde: string, dias: number): string {
  const d = new Date(desde);
  d.setDate(d.getDate() + dias);
  return d.toISOString();
}

export async function listarPedidosSimulaveis(sb: SB): Promise<PedidoOpcao[]> {
  const stages = etapasComCadencia();
  const { data } = await sb
    .from("pedidos")
    .select("id, number, stage, created_at")
    .in("stage", stages as unknown as string[])
    .order("created_at", { ascending: false })
    .limit(300);
  return ((data ?? []) as Array<{ id: string; number: string; stage: string }>).map((p) => ({
    id: p.id,
    number: p.number,
    stage: p.stage,
    stageLabel: stageLabel(p.stage),
  }));
}

async function nomes(sbView: SB, ids: string[]): Promise<SimPessoa[]> {
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  if (!unicos.length) return [];
  const { data } = await sbView.from("profiles").select("id, name").in("id", unicos);
  const map = new Map<string, string>(
    ((data ?? []) as Array<{ id: string; name: string | null }>).map((p) => [
      p.id,
      p.name ?? "—",
    ]),
  );
  return unicos.map((id) => ({ id, nome: map.get(id) ?? "—" }));
}

export async function simularCadencia(
  sb: SB,
  args: { pedidoId: string; diasSimulados?: number | null },
): Promise<SimResultado> {
  const sbView = await clienteDeLeitura(sb);

  const { data: pedido, error } = await sb
    .from("pedidos")
    .select("id, number, stage, updated_at, lead_id, vendedor_proprietario_id, responsavel_atual_id")
    .eq("id", args.pedidoId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!pedido) throw new Error("Pedido não encontrado ou sem acesso.");

  const stage = pedido.stage as string;
  const cfg = CADENCIA_PEDIDO[stage];

  // Há quanto tempo está na etapa (mesma leitura do motor).
  const { data: hist } = await sbView
    .from("pedido_stage_history")
    .select("created_at")
    .eq("pedido_id", pedido.id)
    .eq("to_stage", stage)
    .order("created_at", { ascending: false })
    .limit(1);
  const desde: string = hist?.[0]?.created_at ?? pedido.updated_at;
  const now = new Date();
  const diasReais = diasEntre(desde, now);
  const dias =
    typeof args.diasSimulados === "number" && args.diasSimulados >= 0
      ? Math.trunc(args.diasSimulados)
      : diasReais;

  // Contexto do pedido: cliente (via lead) e famílias dos itens.
  let clienteId: string | null = null;
  let clienteNome: string | null = null;
  if (pedido.lead_id) {
    const { data: lead } = await sbView
      .from("leads")
      .select("cliente_id")
      .eq("id", pedido.lead_id)
      .maybeSingle();
    clienteId = (lead?.cliente_id as string | null) ?? null;
  }
  if (clienteId) {
    const { data: c } = await sbView
      .from("clientes")
      .select("razao_social, nome_fantasia")
      .eq("id", clienteId)
      .maybeSingle();
    clienteNome = (c?.nome_fantasia || c?.razao_social) ?? null;
  }

  const { data: itens } = await sbView
    .from("pedido_itens")
    .select("product_id")
    .eq("pedido_id", pedido.id);
  const prodIds = Array.from(
    new Set(
      ((itens ?? []) as Array<{ product_id: string | null }>)
        .map((i) => i.product_id)
        .filter((x): x is string => !!x),
    ),
  );
  let familias: string[] = [];
  if (prodIds.length) {
    const { data: prods } = await sbView.from("produtos").select("family").in("id", prodIds);
    familias = Array.from(
      new Set(
        ((prods ?? []) as Array<{ family: string | null }>)
          .map((p) => (p.family ?? "").trim())
          .filter((f) => f !== ""),
      ),
    );
  }

  const vendedorId = pedido.vendedor_proprietario_id ?? pedido.responsavel_atual_id ?? null;
  const vendedor = vendedorId ? (await nomes(sbView, [vendedorId]))[0] ?? null : null;

  // Exceções da etapa e a que vence.
  const { data: excData } = await sbView
    .from("cadencia_excecoes")
    .select("escopo, cliente_id, familia, stage, dias, escalar_diretoria, ativo")
    .eq("stage", stage);
  const todas = (excData ?? []) as unknown as CadenciaExcecao[];
  const ativas = todas.filter((e) => e.ativo !== false);
  const override = resolverExcecao(ativas, { stage, clienteId, familias });

  const nomesFamilias = new Map<string, string>();
  const clientesIdsExc = Array.from(
    new Set(todas.map((e) => e.cliente_id).filter((x): x is string => !!x)),
  );
  if (clientesIdsExc.length) {
    const { data: cs } = await sbView
      .from("clientes")
      .select("id, razao_social, nome_fantasia")
      .in("id", clientesIdsExc);
    for (const c of (cs ?? []) as Array<{
      id: string;
      razao_social: string | null;
      nome_fantasia: string | null;
    }>)
      nomesFamilias.set(c.id, (c.nome_fantasia || c.razao_social) ?? "—");
  }

  const familiasLower = familias.map((f) => f.toLowerCase());
  const candidatas: SimCandidata[] = todas.map((e) => {
    const alvo =
      e.escopo === "cliente"
        ? (nomesFamilias.get(e.cliente_id ?? "") ?? "Cliente")
        : (e.familia ?? "—");
    const combina =
      e.escopo === "cliente"
        ? !!clienteId && e.cliente_id === clienteId
        : familiasLower.includes((e.familia ?? "").trim().toLowerCase());
    let motivo: string;
    if (e.ativo === false) motivo = "Inativa";
    else if (!combina) motivo = "Não corresponde a este pedido";
    else if (override?.fonte === e.escopo) motivo = "Aplicada";
    else motivo = "Corresponde, mas perdeu por precedência (cliente vence família)";
    return {
      escopo: e.escopo,
      alvo,
      dias: normalizarRegua(e.dias),
      escalar_diretoria: e.escalar_diretoria !== false,
      ativo: e.ativo !== false,
      aplicada: motivo === "Aplicada",
      motivo,
    };
  });

  const fonte: "cliente" | "familia" | "padrao" = override?.fonte ?? "padrao";
  const explicacao =
    fonte === "cliente"
      ? `Exceção por cliente (${clienteNome ?? "cliente do pedido"}) vence família e padrão.`
      : fonte === "familia"
        ? `Nenhuma exceção de cliente aplicável; vale a exceção por família (${familias.join(", ")}).`
        : "Nenhuma exceção aplicável — vale a régua padrão da etapa.";

  const reguaPadrao = cfg ? [...cfg.dias].sort((a, b) => a - b) : [];
  const reguaEfetiva = normalizarRegua(override?.dias) ?? reguaPadrao;

  // Destinatários por grupo (mesmos helpers do motor).
  const grupo = cfg?.grupo ?? "vendedor";
  let alvos: SimPessoa[] = [];
  if (cfg) {
    const { destinatariosFinanceiro, destinatariosOperacional } = await import(
      "@/lib/pedidos-fluxo.server"
    );
    if (grupo === "financeiro") alvos = await nomes(sbView, await destinatariosFinanceiro(sbView));
    else if (grupo === "operacional")
      alvos = await nomes(sbView, await destinatariosOperacional(sbView));
    else if (vendedor) alvos = [vendedor];
    if (!alvos.length && vendedor) alvos = [vendedor];
  }

  const passos: SimPasso[] = reguaEfetiva.map((dia) => {
    const p = passoCadencia(stage, dia, override)!;
    const texto = textoCadencia(p, {
      numero: pedido.number,
      label: stageLabel(stage),
      dias: dia,
    });
    const notifica = p.escalarGestao
      ? Array.from(
          new Map(
            [...alvos, ...(vendedor ? [vendedor] : [])].map((x) => [x.id, x] as const),
          ).values(),
        )
      : [];
    return {
      nivel: p.nivel,
      dia,
      dataPrevista: somarDias(desde, dia),
      ultimo: p.ultimo,
      escalarGestao: p.escalarGestao,
      escalarDiretoria: p.escalarDiretoria,
      jaVencido: dias >= dia,
      grupo: p.grupo,
      tipo: p.tipo,
      acao: p.acao,
      titulo: texto.titulo,
      descricao: texto.descricao,
      prioridade: texto.prioridade,
      tarefaPara: alvos,
      notificaNaTela: notifica,
      avisaDiretoria: p.escalarDiretoria,
    };
  });

  return {
    pedido: {
      id: pedido.id,
      number: pedido.number,
      stage,
      stageLabel: stageLabel(stage),
      temCadencia: !!cfg,
      desde,
      dias,
      clienteId,
      clienteNome,
      familias,
      vendedorNome: vendedor?.nome ?? null,
    },
    precedencia: { fonte, explicacao, candidatas },
    reguaPadrao,
    reguaEfetiva,
    passos,
  };
}
