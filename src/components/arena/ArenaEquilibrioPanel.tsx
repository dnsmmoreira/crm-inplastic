import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Info } from "lucide-react";

import { getArenaEquilibrio } from "@/lib/arena.functions";
import { formatBRLCompact, pct } from "@/lib/arena";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Resultado = Awaited<ReturnType<typeof getArenaEquilibrio>>;

export function ArenaEquilibrioPanel() {
  const load = useServerFn(getArenaEquilibrio);
  const [r, setR] = useState<Resultado | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setR(await load());
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao carregar o estudo");
      }
    })();
  }, [load]);

  if (!r) return <p className="text-sm text-muted-foreground">Carregando estudo…</p>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Ponto de equilíbrio · representante x vendedor interno</CardTitle>
          <p className="text-xs text-muted-foreground">
            Estudo de apoio à decisão. O sistema não recomenda nem decide nada automaticamente — os parâmetros vêm da
            aba Configuração.
          </p>
        </CardHeader>
        <CardContent>
          {!r.parametrizado ? (
            <div className="flex items-start gap-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Parâmetros de custo ainda não preenchidos na Configuração (custo fixo do interno e custo incremental do
              canal). Sem eles, nenhum cenário é apresentado — não há estimativa inventada.
            </div>
          ) : (
            <div className="space-y-3">
              {r.cenarios.map((c) => (
                <div key={c.cenario} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{c.label}</span>
                    <span className="text-lg font-semibold">
                      {c.faturamentoEquilibrio === null
                        ? "Sem cruzamento"
                        : `${formatBRLCompact(c.faturamentoEquilibrio)} / mês`}
                    </span>
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                    <div>
                      <dt className="text-muted-foreground">Custo fixo incremental</dt>
                      <dd>{formatBRLCompact(c.custoFixoIncremental)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Variável do canal</dt>
                      <dd>{pct(c.custoVariavelCanalPct)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Variável do interno</dt>
                      <dd>{pct(c.custoVariavelInternoPct)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Delta</dt>
                      <dd>{pct(c.deltaVariavelPct)}</dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-xs text-muted-foreground">{c.observacao}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
