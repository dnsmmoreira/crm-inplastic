/**
 * Núcleo ÚNICO de recusa/devolução de pedido — vale para qualquer etapa.
 *
 * Foi a existência de dois caminhos parecidos (recusa financeira e devolução
 * operacional) e a falta do caminho em algumas etapas que levou a corrigir
 * pedido por fora do sistema: o vendedor editou uma proposta já convertida e a
 * alteração não chegou a lugar nenhum.
 *
 * Sempre, em toda etapa:
 *  a) motivo obrigatório (validado nas server functions, mín. 3 caracteres);
 *  b) pedido vai para a etapa terminal com o motivo no histórico;
 *  c) proposta desvinculada (o `proposta_snapshot` do pedido é preservado)
 *     e reaberta como `rascunho`, editável, com `sent_at` zerado (senão ela
 *     nasce "vencida") e `reaberta_em` marcando a devolução;
 *  d) lead volta para `proposta`;
 *  e) tarefas abertas do pedido são encerradas (via `aoEntrarNaEtapa`);
 *  f) vendedor recebe aviso com ACEITE OBRIGATÓRIO apontando para a proposta.
 */

import { assertNoError, registrarFalhaSegura } from "@/lib/guard-erros";
import { PEDIDO_STAGE_REPROVADO, PEDIDO_STAGE_CANCELADO } from "@/lib/pedidos-stages";

type SB = {
  from: (t: string) => any;
};

export type DestinoDevolucao =
  | typeof PEDIDO_STAGE_REPROVADO
  | typeof PEDIDO_STAGE_CANCELADO;

export type DevolucaoResultado = {
  ok: true;
  destino: DestinoDevolucao;
  proposta_id: string | null;
  proposta_numero: string | null;
};

/** Texto único do aviso, usado no sino e no pop-up de aceite obrigatório. */
export function textoAvisoDevolucao(args: {
  pedidoNumero: string;
  motivo: string;
  propostaNumero: string | null;
}): string {
  const base = `Pedido ${args.pedidoNumero} foi devolvido. Motivo: ${args.motivo}.`;
  return args.propostaNumero
    ? `${base} A proposta ${args.propostaNumero} está editável novamente em Propostas — corrija e reenvie.`
    : `${base} Corrija a proposta e reenvie.`;
}

/**
 * Executa a devolução. Assume que permissão e etapa já foram validadas por quem
 * chama (as server functions em `pedidos.functions.ts`).
 */
export async function devolverPedidoCore(
  sb: SB,
  args: {
    pedidoId: string;
    motivo: string;
    userId: string;
    fromStage: string;
    destino: DestinoDevolucao;
    propostaId: string | null;
    leadId: string | null;
    /** Campos extras do update (ex.: decisão de aprovação do financeiro). */
    patchExtra?: Record<string, unknown>;
  },
): Promise<DevolucaoResultado> {
  const { pedidoId, motivo, userId, fromStage, destino, propostaId, leadId } = args;

  // Número da proposta e do pedido para o aviso — lidos ANTES do desvínculo.
  const { data: pedidoRow } = await sb
    .from("pedidos")
    .select("number, vendedor_proprietario_id")
    .eq("id", pedidoId)
    .maybeSingle();
  const pedidoNumero = (pedidoRow?.number as string | undefined) ?? "";
  const vendedorId = (pedidoRow?.vendedor_proprietario_id as string | null) ?? null;

  let propostaNumero: string | null = null;
  if (propostaId) {
    const { data: propRow } = await sb
      .from("propostas")
      .select("number")
      .eq("id", propostaId)
      .maybeSingle();
    propostaNumero = (propRow?.number as string | undefined) ?? null;
  }

  const { error: updErr } = await sb
    .from("pedidos")
    .update({
      ...(args.patchExtra ?? {}),
      stage: destino,
      reprovacao_motivo: motivo,
      proposta_id: null,
    })
    .eq("id", pedidoId);
  if (updErr) throw new Error(`Falha ao devolver pedido: ${updErr.message}`);

  // REGISTRAR E SEGUIR: o pedido já mudou de etapa; histórico é auxiliar.
  const hist = await sb.from("pedido_stage_history").insert({
    pedido_id: pedidoId,
    from_stage: fromStage,
    to_stage: destino,
    is_backward: false,
    motivo,
    moved_by: userId,
  });
  if (hist?.error) {
    await registrarFalhaSegura("pedidos.stage-history", hist.error, {
      pedido_id: pedidoId,
      to_stage: destino,
    });
  }

  // ABORTAR: rollback pela metade é pior que nada — proposta e lead têm que
  // voltar juntos ao funil. A falha do 2º update é marcada como parcial.
  if (propostaId) {
    // `rascunho` (e não `enviada`): a devolução é interna, o cliente não
    // recebeu nada novo. `sent_at = null` impede que ela apareça vencida pelo
    // envio antigo; o vendedor marca como enviada de novo ao reenviar.
    const rbProp = await sb
      .from("propostas")
      .update({
        status: "rascunho",
        sent_at: null,
        reaberta_em: new Date().toISOString(),
      })
      .eq("id", propostaId)
      .eq("status", "pedido");
    await assertNoError(
      rbProp,
      "pedidos.devolverPedido/rollback-proposta",
      { pedido_id: pedidoId, proposta_id: propostaId },
      "Não foi possível reabrir a proposta no funil. Tente novamente.",
    );
  }
  if (leadId) {
    const rbLead = await sb
      .from("leads")
      .update({ stage: "proposta" })
      .eq("id", leadId)
      .eq("stage", "ganho");
    await assertNoError(
      rbLead,
      "pedidos.devolverPedido/rollback-lead",
      {
        pedido_id: pedidoId,
        lead_id: leadId,
        proposta_id: propostaId,
        rollback_parcial: true,
        detalhe: "rollback parcial: proposta reaberta, lead permaneceu em ganho",
      },
      "Rollback parcial: a proposta foi reaberta, mas o lead não voltou ao funil. Verifique em Falhas do sistema.",
    );
  }

  // Aviso com aceite obrigatório ANTES de `aoEntrarNaEtapa`: o notificador é
  // idempotente por (pedido, tipo, usuário), então este texto — que sabe da
  // proposta reaberta — é o que o vendedor vê.
  const { notificarUsuarios } = await import("@/lib/pedidos-fluxo.server");
  const tipo = destino === PEDIDO_STAGE_REPROVADO ? "pedido_reprovado" : "pedido_cancelado";
  await notificarUsuarios(sb as never, vendedorId ? [vendedorId] : [], {
    tipo,
    titulo: textoAvisoDevolucao({ pedidoNumero, motivo, propostaNumero }),
    pedidoId,
    propostaId,
    exigeAceite: true,
  });

  const { aoEntrarNaEtapa } = await import("@/lib/pedidos-fluxo.server");
  await aoEntrarNaEtapa(sb as never, pedidoId, destino, {
    motivoReprovacao: motivo,
    de: fromStage,
  });

  return { ok: true, destino, proposta_id: propostaId, proposta_numero: propostaNumero };
}
