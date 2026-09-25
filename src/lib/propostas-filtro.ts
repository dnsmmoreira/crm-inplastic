import { MOTIVOS_RECUSA_PROPOSTA, type MotivoRecusaProposta } from "./motivos-perda";

export const FILTRO_MOTIVO_TODOS = "todos" as const;
export const FILTRO_MOTIVO_NAO_INFORMADO = "nao_informado" as const;
export const FILTRO_MOTIVO_ADMINISTRATIVO = "administrativo" as const;

export type FiltroMotivo =
  | typeof FILTRO_MOTIVO_TODOS
  | typeof FILTRO_MOTIVO_NAO_INFORMADO
  | typeof FILTRO_MOTIVO_ADMINISTRATIVO
  | MotivoRecusaProposta;

export const OPCOES_FILTRO_MOTIVO: { value: FiltroMotivo; label: string }[] = [
  { value: FILTRO_MOTIVO_TODOS, label: "Todos os motivos" },
  ...MOTIVOS_RECUSA_PROPOSTA.map((m) => ({ value: m as FiltroMotivo, label: m })),
  { value: FILTRO_MOTIVO_NAO_INFORMADO, label: "Não informado" },
  { value: FILTRO_MOTIVO_ADMINISTRATIVO, label: "Encerramento administrativo" },
];

export function rotuloFiltroMotivo(f: FiltroMotivo): string {
  return OPCOES_FILTRO_MOTIVO.find((o) => o.value === f)?.label ?? String(f);
}

type PropostaFiltravel = {
  status: string;
  motivoRecusa?: string | null;
  encerramentoAdministrativo?: boolean | null;
};

/**
 * Casa a proposta com o filtro de motivo. Fora de "Todos", só recusadas passam.
 * Administrativas só casam com "Encerramento administrativo".
 */
export function casaFiltroMotivo(p: PropostaFiltravel, filtro: FiltroMotivo): boolean {
  if (filtro === FILTRO_MOTIVO_TODOS) return true;
  if (p.status !== "recusada") return false;
  const adm = !!p.encerramentoAdministrativo;
  if (filtro === FILTRO_MOTIVO_ADMINISTRATIVO) return adm;
  if (adm) return false;
  const motivo = (p.motivoRecusa ?? "").trim();
  if (filtro === FILTRO_MOTIVO_NAO_INFORMADO) return motivo === "";
  return motivo === filtro;
}
