import { describe, it, expect } from "vitest";
import {
  podeEscreverConversa,
  podeMovimentarPedido,
  podeExcluirPedido,
  podeEditarEmpresa,
  relatorioEscopoProprio,
  PERM_PEDIDOS_MOVIMENTAR,
  PERM_PEDIDOS_EXCLUIR,
  PERM_EMPRESAS_EDITAR,
  PERM_PEDIDOS_VER_TODOS,
  resolvePermissao,
} from "./permissoes";

const admin = { isAdmin: true, permKeys: [] as string[] };
const vendedor = { isAdmin: false, permKeys: [] as string[] };
const financeiro = { isAdmin: false, permKeys: [PERM_PEDIDOS_MOVIMENTAR, PERM_PEDIDOS_VER_TODOS] };
const operacional = { isAdmin: false, permKeys: [PERM_PEDIDOS_MOVIMENTAR, PERM_EMPRESAS_EDITAR] };

describe("permissões de pedidos", () => {
  it("vendedor não movimenta nem exclui pedido", () => {
    expect(podeMovimentarPedido(vendedor)).toBe(false);
    expect(podeExcluirPedido(vendedor)).toBe(false);
  });
  it("financeiro e operacional movimentam", () => {
    expect(podeMovimentarPedido(financeiro)).toBe(true);
    expect(podeMovimentarPedido(operacional)).toBe(true);
  });
  it("exclusão de pedido é só de quem tem a chave", () => {
    expect(podeExcluirPedido(financeiro)).toBe(false);
    expect(podeExcluirPedido({ isAdmin: false, permKeys: [PERM_PEDIDOS_EXCLUIR] })).toBe(true);
    expect(podeExcluirPedido(admin)).toBe(true);
  });
  it("admin pode tudo", () => {
    expect(podeMovimentarPedido(admin)).toBe(true);
    expect(podeEditarEmpresa(admin)).toBe(true);
  });
});

describe("empresas", () => {
  it("vendedor não edita empresa; operacional edita", () => {
    expect(podeEditarEmpresa(vendedor)).toBe(false);
    expect(podeEditarEmpresa(operacional)).toBe(true);
  });
});

describe("escopo de relatório", () => {
  it("vendedor só vê os próprios", () => {
    expect(relatorioEscopoProprio(vendedor)).toBe(true);
  });
  it("admin e financeiro veem tudo", () => {
    expect(relatorioEscopoProprio(admin)).toBe(false);
    expect(relatorioEscopoProprio(financeiro)).toBe(false);
  });
});

describe("escrita em conversas", () => {
  it("permite aguardando e atendendo humano", () => {
    expect(podeEscreverConversa("aguardando_humano")).toBe(true);
    expect(podeEscreverConversa("humano_atendendo")).toBe(true);
  });
  it("bloqueia IA, encerrada e nulo", () => {
    expect(podeEscreverConversa("ia_atendendo")).toBe(false);
    expect(podeEscreverConversa("encerrado")).toBe(false);
    expect(podeEscreverConversa(null)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Semântica de perfis (espelho da função SQL `tem_permissao`).
// Nota: estes testes cobrem a REGRA (resolvePermissao / hasPerm). A função SQL
// homônima não é testada aqui porque a suíte não tem conexão com o banco —
// a verificação dela foi feita por consulta direta ao banco.
// ---------------------------------------------------------------------------

const CHAVES_GESTOR = [
  "clientes.ver_todos",
  "pedidos.ver_todos",
  "pedidos.exportar",
  "pedidos.movimentar",
  "propostas.ver_todas",
  "relatorios.ver",
  "relatorios.exportar",
  "estoque.ver",
  "whatsapp.atender",
  "whatsapp.assumir_conversa",
  "whatsapp.devolver_ia",
  "licitacoes.gerenciar",
];

const TODAS_AS_CHAVES = [
  ...CHAVES_GESTOR,
  "usuarios.gerenciar",
  "xerife.configurar",
  "agente_ia.editar_prompt",
  "canais.configurar",
  "metas.definir",
  "leads.excluir",
  "leads.fila.gerenciar",
  "propostas.editar",
  "propostas.excluir",
  "propostas.alterar_status",
  "pedidos.excluir",
  "empresas.editar",
  "precos.limite_desconto",
];

const gestorComercial = { isAdmin: true, temPerfilAtivo: true, permKeys: CHAVES_GESTOR };
const administrador = { isAdmin: true, temPerfilAtivo: true, permKeys: TODAS_AS_CHAVES };
const adminSemPerfil = { isAdmin: true, temPerfilAtivo: false, permKeys: [] as string[] };
const perfilVendedor = {
  isAdmin: false,
  temPerfilAtivo: true,
  permKeys: ["propostas.editar", "relatorios.ver"],
};

describe("resolvePermissao — perfil ativo manda, mesmo com base_role admin", () => {
  it("Gestor Comercial NÃO recebe chaves fora do perfil", () => {
    for (const chave of [
      "usuarios.gerenciar",
      "xerife.configurar",
      "agente_ia.editar_prompt",
      "canais.configurar",
      "metas.definir",
      "leads.excluir",
      "propostas.editar",
    ]) {
      expect(resolvePermissao(gestorComercial, chave)).toBe(false);
    }
  });

  it("Gestor Comercial recebe as chaves do próprio perfil", () => {
    for (const chave of [
      "licitacoes.gerenciar",
      "pedidos.ver_todos",
      "relatorios.exportar",
      "clientes.ver_todos",
    ]) {
      expect(resolvePermissao(gestorComercial, chave)).toBe(true);
    }
  });

  it("perfil Administrador recebe todas as chaves", () => {
    for (const chave of TODAS_AS_CHAVES) {
      expect(resolvePermissao(administrador, chave)).toBe(true);
    }
  });

  it("admin SEM perfil vinculado recebe tudo (rede de bootstrap)", () => {
    for (const chave of TODAS_AS_CHAVES) {
      expect(resolvePermissao(adminSemPerfil, chave)).toBe(true);
    }
  });

  it("perfil Vendedor não recebe gestão de usuários nem licitações", () => {
    expect(resolvePermissao(perfilVendedor, "usuarios.gerenciar")).toBe(false);
    expect(resolvePermissao(perfilVendedor, "licitacoes.gerenciar")).toBe(false);
  });

  it("usuário não-admin sem perfil não recebe nada", () => {
    expect(
      resolvePermissao({ isAdmin: false, temPerfilAtivo: false, permKeys: [] }, "relatorios.ver"),
    ).toBe(false);
  });
});
