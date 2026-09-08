/**
 * Ações de servidor do Bloco 4 ("proposta com prazo") reutilizadas pelos
 * desfechos de tarefa e pela tela da proposta.
 */
import { assertNoError, registrarFalhaSegura } from "@/lib/guard-erros";
import { auditarProposta, type SB } from "@/lib/propostas-perda.server";

/** Fail-closed: dono do rascunho, `propostas.excluir` ou admin. */
async function podeExcluir(sb: SB, userId: string, ownerId: string): Promise<boolean> {
  if (ownerId === userId) return true;
  const admin = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (admin.error) {
    await registrarFalhaSegura("propostas-prazo/has_role", admin.error, { userId });
    return false;
  }
  if (admin.data === true) return true;
  const perm = await sb.rpc("tem_permissao", { _user_id: userId, _chave: "propostas.excluir" });
  if (perm.error) {
    await registrarFalhaSegura("propostas-prazo/tem_permissao", perm.error, { userId });
    return false;
  }
  return perm.data === true;
}

export async function excluirRascunhoPropostaImpl(
  sb: SB,
  userId: string,
  propostaId: string,
): Promise<{ ok: boolean; mensagem: string }> {
  const { data: p, error } = await sb
    .from("propostas")
    .select("id, number, status, owner_id")
    .eq("id", propostaId)
    .maybeSingle();
  if (error) throw new Error(`Falha ao carregar a proposta: ${error.message}`);
  if (!p) return { ok: false, mensagem: "Proposta não encontrada ou sem acesso." };
  if (p.status !== "rascunho") {
    return { ok: false, mensagem: "Só é possível excluir propostas em rascunho." };
  }
  if (!(await podeExcluir(sb, userId, p.owner_id as string))) {
    return { ok: false, mensagem: "Você não tem permissão para excluir esta proposta." };
  }

  const del = await sb.from("propostas").delete().eq("id", propostaId);
  await assertNoError(del, "propostas-prazo.excluirRascunho", { proposta_id: propostaId });
  await auditarProposta(sb, userId, "proposta_rascunho_excluida", p.number ?? null, null);
  return { ok: true, mensagem: `Rascunho ${p.number ?? ""} excluído` };
}
