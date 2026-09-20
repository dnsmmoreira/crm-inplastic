/**
 * Vínculo usuário ↔ perfil de acesso (server-only).
 *
 * Fonte única da regra: grava `user_perfis` e DERIVA `user_roles` do
 * `base_role` do perfil escolhido. Usado tanto pela edição de usuário
 * (`setPerfilDoUsuario`) quanto pela criação por convite (`createUser`),
 * para que uma conta nunca nasça sem perfil.
 */

type Audit = Array<{ campo: string; anterior: unknown; novo: unknown }>;

export type ResultadoVinculoPerfil = {
  mudou: boolean;
  audit: Audit;
};

export async function aplicarPerfilNoUsuario(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  userId: string,
  perfilId: string | null,
): Promise<ResultadoVinculoPerfil> {
  const { data: atuais } = await sb.from("user_perfis").select("perfil_id").eq("user_id", userId);
  const anteriorId = (atuais ?? [])[0]?.perfil_id ?? null;
  if (anteriorId === perfilId) return { mudou: false, audit: [] };

  const nomes = new Map<string, string>();
  const baseRoles = new Map<string, "admin" | "vendedor">();
  const ids = [anteriorId, perfilId].filter((v): v is string => !!v);
  if (ids.length) {
    const { data: ps } = await sb.from("perfis").select("id, nome, base_role").in("id", ids);
    (ps ?? []).forEach((p: { id: string; nome: string; base_role: string }) => {
      nomes.set(p.id, p.nome);
      baseRoles.set(p.id, p.base_role as "admin" | "vendedor");
    });
  }
  if (perfilId && !nomes.has(perfilId)) throw new Error("Perfil não encontrado.");

  const { error: delErr } = await sb.from("user_perfis").delete().eq("user_id", userId);
  if (delErr) throw new Error(delErr.message);
  if (perfilId) {
    const { error } = await sb.from("user_perfis").insert({ user_id: userId, perfil_id: perfilId });
    if (error) throw new Error(error.message);
  }

  // Papel (user_roles) é DERIVADO do base_role do perfil escolhido.
  const { data: rolesAtuais } = await sb.from("user_roles").select("role").eq("user_id", userId);
  const papelAtual: "admin" | "vendedor" = (rolesAtuais ?? []).some(
    (r: { role: string }) => r.role === "admin",
  )
    ? "admin"
    : "vendedor";
  const papelNovo: "admin" | "vendedor" = perfilId
    ? (baseRoles.get(perfilId) ?? "vendedor")
    : "vendedor";
  if (papelNovo !== papelAtual) {
    const { error: delRoleErr } = await sb.from("user_roles").delete().eq("user_id", userId);
    if (delRoleErr) throw new Error(delRoleErr.message);
    const { error: insRoleErr } = await sb
      .from("user_roles")
      .insert({ user_id: userId, role: papelNovo });
    if (insRoleErr) throw new Error(insRoleErr.message);
  }

  return {
    mudou: true,
    audit: [
      { campo: "papel", anterior: papelAtual, novo: papelNovo },
      {
        campo: "perfil",
        anterior: anteriorId ? nomes.get(anteriorId) : "nenhum",
        novo: perfilId ? nomes.get(perfilId) : "nenhum",
      },
    ],
  };
}
