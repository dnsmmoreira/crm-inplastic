import * as React from "react";
import { cn } from "@/lib/utils";

export function PaginaCabecalho({
  titulo,
  descricao,
  resumoMobile,
  icone,
  acoes,
}: {
  titulo: string;
  /** Texto explicativo — só no computador. */
  descricao?: React.ReactNode;
  /** Linha curta que vale a pena no celular (ex.: "98 itens · alerta abaixo de 100"). */
  resumoMobile?: string;
  icone?: React.ReactNode;
  acoes?: React.ReactNode;
}) {
  const qtdAcoes = React.Children.toArray(acoes).length;
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        {icone && <div className="shrink-0">{icone}</div>}
        <div className="min-w-0">
          <h1 className="text-xl font-semibold md:text-3xl">{titulo}</h1>
          {descricao && <p className="hidden text-sm text-muted-foreground md:block">{descricao}</p>}
          {resumoMobile && <p className="text-sm text-muted-foreground md:hidden">{resumoMobile}</p>}
        </div>
      </div>
      {qtdAcoes > 0 && (
        <div
          className={cn(
            "flex w-full gap-2 [&>*]:flex-1 md:w-auto md:[&>*]:flex-none",
            qtdAcoes > 3 && "flex-wrap",
          )}
        >
          {acoes}
        </div>
      )}
    </div>
  );
}
