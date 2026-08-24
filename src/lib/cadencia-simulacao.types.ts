/**
 * Tipos do simulador de cadência (client-safe: sem imports de servidor).
 */

export type SimPessoa = { id: string; nome: string };

export type SimCandidata = {
  escopo: "cliente" | "familia";
  alvo: string;
  dias: number[] | null;
  escalar_diretoria: boolean;
  ativo: boolean;
  aplicada: boolean;
  motivo: string;
};

export type SimPasso = {
  nivel: number;
  dia: number;
  dataPrevista: string;
  ultimo: boolean;
  escalarGestao: boolean;
  escalarDiretoria: boolean;
  jaVencido: boolean;
  grupo: string;
  tipo: string;
  acao: string;
  titulo: string;
  descricao: string;
  prioridade: number;
  tarefaPara: SimPessoa[];
  notificaNaTela: SimPessoa[];
  avisaDiretoria: boolean;
};

export type SimResultado = {
  pedido: {
    id: string;
    number: string;
    stage: string;
    stageLabel: string;
    temCadencia: boolean;
    desde: string;
    dias: number;
    clienteId: string | null;
    clienteNome: string | null;
    familias: string[];
    vendedorNome: string | null;
  };
  precedencia: {
    fonte: "cliente" | "familia" | "padrao";
    explicacao: string;
    candidatas: SimCandidata[];
  };
  reguaPadrao: number[];
  reguaEfetiva: number[];
  passos: SimPasso[];
};

export type PedidoOpcao = {
  id: string;
  number: string;
  stage: string;
  stageLabel: string;
};
