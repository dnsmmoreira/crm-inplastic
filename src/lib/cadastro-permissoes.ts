/**
 * Chaves granulares que liberam o CADASTRO manual de leads e clientes.
 *
 * São aditivas: todo perfil que já alcançava o cadastro hoje recebeu a chave
 * na mesma migração de dados, então ninguém perde o que já fazia.
 * A UI usa `hasPerm`; o servidor usa a função SQL `tem_permissao`.
 */
export const PERM_LEADS_CRIAR = "leads.criar";
export const PERM_CLIENTES_CRIAR = "clientes.criar";
