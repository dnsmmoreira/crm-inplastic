import * as React from "react";
import { cn } from "@/lib/utils";

export function TabelaResponsiva({
  mobile,
  vazio,
  children,
}: {
  /** Linhas do celular (use <LinhaLista/>). */
  mobile: React.ReactNode;
  /** Mostrado nos dois lados quando não há nada. */
  vazio?: React.ReactNode;
  /** A tabela de hoje, intacta. */
  children: React.ReactNode;
}) {
  const semLinhas = React.Children.toArray(mobile).length === 0;
  if (vazio && semLinhas) return <>{vazio}</>;
  return (
    <>
      <div className="divide-y md:hidden">{mobile}</div>
      <div className="hidden overflow-x-auto md:block">{children}</div>
    </>
  );
}

export function LinhaLista({
  titulo,
  subtitulo,
  valor,
  legenda,
  selo,
  abaixo,
  acoes,
  onClick,
  acento,
}: {
  titulo: React.ReactNode;
  /** Campos secundários, já juntados com " · ". */
  subtitulo?: React.ReactNode;
  /** Número/valor à direita. */
  valor?: React.ReactNode;
  /** Texto miúdo sob o valor. */
  legenda?: React.ReactNode;
  /** Distintivo à direita, no lugar do valor. */
  selo?: React.ReactNode;
  /** Selos ou avisos numa terceira linha. */
  abaixo?: React.ReactNode;
  /** Menu de três pontos. */
  acoes?: React.ReactNode;
  onClick?: () => void;
  /** Classe de fundo da tarja lateral, ex.: "bg-destructive". */
  acento?: string;
}) {
  const clicavel = !!onClick;
  const temDireita = valor !== undefined || legenda !== undefined || selo !== undefined;
  return (
    <div
      className={cn("flex gap-3 py-3", clicavel && "cursor-pointer active:bg-accent/40")}
      {...(clicavel
        ? {
            role: "button",
            tabIndex: 0,
            onClick,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            },
          }
        : {})}
    >
      {acento && <div className={cn("w-1 shrink-0 self-stretch rounded-full", acento)} />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium leading-tight">{titulo}</div>
        {subtitulo && <div className="mt-0.5 truncate text-xs text-muted-foreground">{subtitulo}</div>}
        {abaixo && <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">{abaixo}</div>}
      </div>
      {temDireita && (
        <div className="shrink-0 text-right">
          {selo !== undefined ? (
            selo
          ) : (
            <>
              {valor !== undefined && <div className="text-[15px] font-semibold tabular-nums">{valor}</div>}
              {legenda !== undefined && <div className="text-[11px] text-muted-foreground">{legenda}</div>}
            </>
          )}
        </div>
      )}
      {acoes && (
        <div className="shrink-0 self-start" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {acoes}
        </div>
      )}
    </div>
  );
}

export function VazioLista({
  icone,
  titulo,
  dica,
}: {
  icone?: React.ReactNode;
  titulo: string;
  dica?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-10 text-center">
      {icone && <div className="mb-2 text-muted-foreground/40 [&>svg]:h-10 [&>svg]:w-10">{icone}</div>}
      <p className="text-sm font-medium">{titulo}</p>
      {dica && <p className="text-xs text-muted-foreground">{dica}</p>}
    </div>
  );
}

/** Junta campos com " · " descartando vazios — nunca imprime "—" solto. */
export function juntarCampos(...campos: Array<string | number | null | undefined | false>): string {
  return campos
    .filter((c) => c !== null && c !== undefined && c !== false && String(c).trim() !== "")
    .map(String)
    .join(" · ");
}
