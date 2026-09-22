/**
 * Quem é o dono do cadastro duplicado (server-only).
 *
 * Resolve o dono com service role — a RLS de `profiles` só deixa cada um ler o
 * próprio perfil — e devolve SOMENTE nome do dono, equipe e sinalizadores.
 * Nunca devolve o registro, nem ids, nem contatos de quem não enxerga.
 */
import { registrarFalhaSegura } from "@/lib/guard-erros";
import {
  DONO_NAO_ENCONTRADO,
  normalizarDocumento,
  textoAuditoriaConsulta,
  type DonoCadastro,
} from "@/lib/consulta-dono";
import { consumirTentativa } from "@/lib/rate-limit.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SB = any;

export const CONSULTA_JANELA_SEGUNDOS = 60;
export const CONSULTA_LIMITE = 30;

/**
 * Espelho da visibilidade do resto do sistema: admin, supervisor global e
 * `leads.ver_todos` enxergam o registro; os demais só na MESMA equipe.
 */
export async function podeVerDono(sb: SB, userId: string, donoId: string | null): Promise<boolean> {
  const { data: admin } = await sb.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (admin === true) return true;
  const { data: global } = await sb.rpc("supervisor_ve_tudo", { _user_id: userId });
  if (global === true) return true;
  const { data: verTodos } = await sb.rpc("tem_permissao", {
    _user_id: userId,
    _chave: "leads.ver_todos",
  });
  if (verTodos === true) return true;
  if (!donoId) return false;
  if (donoId === userId) return true;
  const { data: mesma } = await sb.rpc("mesma_equipe", { _a: userId, _b: donoId });
  return mesma === true;
}

type PerfilDono = {
  name: string | null;
  equipe_id: string | null;
  ativo: boolean | null;
  deleted_at: string | null;
};

async function perfil(sb: SB, id: string | null): Promise<PerfilDono | null> {
  if (!id) return null;
  const { data } = await sb
    .from("profiles")
    .select("name, equipe_id, ativo, deleted_at")
    .eq("id", id)
    .maybeSingle();
  return (data as PerfilDono | null) ?? null;
}

async function nomeEquipe(sb: SB, equipeId: string | null): Promise<string | null> {
  if (!equipeId) return null;
  const { data } = await sb.from("equipes").select("nome").eq("id", equipeId).maybeSingle();
  return ((data as { nome?: string } | null)?.nome as string | null) ?? null;
}

/**
 * Monta a resposta de dono a partir de um vendedor já identificado.
 * `empresa` só sai quando a pessoa enxerga o registro.
 */
export async function montarDonoCadastro(
  sb: SB,
  atorId: string,
  entrada: { vendedorId: string | null; empresa?: string | null; documento?: string | null },
): Promise<DonoCadastro> {
  const dono = await perfil(sb, entrada.vendedorId);
  const donoAtivo = !!dono && dono.ativo !== false && !dono.deleted_at;
  const podeVer = await podeVerDono(sb, atorId, entrada.vendedorId);

  if (!entrada.vendedorId || !donoAtivo) {
    return {
      ...DONO_NAO_ENCONTRADO,
      existe: true,
      semDono: true,
      podeVerRegistro: podeVer,
      empresa: podeVer ? (entrada.empresa ?? null) : null,
    };
  }

  const ator = await perfil(sb, atorId);
  const outraEquipe = !ator?.equipe_id || !dono.equipe_id || ator.equipe_id !== dono.equipe_id;

  const info: DonoCadastro = {
    existe: true,
    semDono: false,
    donoNome: dono.name ?? null,
    donoEquipe: await nomeEquipe(sb, dono.equipe_id),
    podeVerRegistro: podeVer,
    empresa: podeVer ? (entrada.empresa ?? null) : null,
    outraEquipe,
  };

  // Trilha SÓ quando revelamos dono de outra equipe — consulta da própria
  // equipe e documento inexistente não poluem a auditoria.
  if (outraEquipe && info.donoNome) {
    await auditarRevelacao(sb, atorId, entrada.vendedorId, entrada.documento ?? null, info.donoEquipe);
  }

  return info;
}

async function auditarRevelacao(
  sb: SB,
  atorId: string,
  donoId: string,
  documento: string | null,
  equipe: string | null,
): Promise<void> {
  const { error } = await sb.from("user_audit_log").insert({
    alvo_user_id: donoId,
    ator_user_id: atorId,
    campo: "consulta_dono",
    valor_anterior: null,
    valor_novo: textoAuditoriaConsulta(documento, equipe),
  });
  if (error) {
    await registrarFalhaSegura("consulta-dono.auditoria", error, { ator: atorId });
  }
}

export type ConsultaDonoResultado = DonoCadastro & { limiteExcedido?: boolean };

/**
 * Consulta completa por documento/telefone/e-mail, com limite por pessoa.
 * O documento é normalizado (só dígitos) antes de qualquer comparação.
 */
export async function consultarDonoPorContato(
  sb: SB,
  atorId: string,
  entrada: { cnpj?: string | null; cpf?: string | null; telefone?: string | null; email?: string | null },
): Promise<ConsultaDonoResultado> {
  const documento = normalizarDocumento(entrada.cnpj ?? entrada.cpf ?? "");
  const limite = await consumirTentativa(
    `consulta_dono:${atorId}`,
    CONSULTA_JANELA_SEGUNDOS,
    CONSULTA_LIMITE,
  );
  if (!limite.permitido) return { ...DONO_NAO_ENCONTRADO, limiteExcedido: true };

  const { resolverContatoEntrada } = await import("@/lib/contato-entrada.server");
  const resolvido = await resolverContatoEntrada(sb, {
    telefone: entrada.telefone ?? null,
    cnpj: documento || null,
    email: entrada.email ?? null,
  });

  if (resolvido.acao === "criar_lead") return { ...DONO_NAO_ENCONTRADO };

  const vendedorId =
    resolvido.acao === "carteira" ? resolvido.vendedorId : (resolvido.vendedorId ?? null);

  let empresa: string | null = resolvido.leadAtivo?.company ?? null;
  if (!empresa && resolvido.leadId) {
    const { data: lead } = await sb.from("leads").select("company").eq("id", resolvido.leadId).maybeSingle();
    empresa = ((lead as { company?: string } | null)?.company as string | null) ?? null;
  }

  return await montarDonoCadastro(sb, atorId, { vendedorId, empresa, documento });
}
