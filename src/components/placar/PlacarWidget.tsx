import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trophy, ArrowUpRight } from "lucide-react";
import { getPlacar } from "@/lib/placar.functions";

const MEDALS = ["🥇", "🥈", "🥉"];

export function PlacarWidget() {
  const fetchPlacar = useServerFn(getPlacar);
  const { data, isLoading } = useQuery({
    queryKey: ["placar", "mes"],
    queryFn: () => fetchPlacar({ data: { periodo: "mes" } }),
    staleTime: 60_000,
  });

  const top = (data?.vendedores ?? []).filter((v) => v.score > 0).slice(0, 3);

  return (
    <Link
      to="/placar"
      className="block group focus:outline-none focus:ring-2 focus:ring-primary/40 rounded-xl"
    >
      <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-r from-primary/5 via-transparent to-transparent transition-shadow group-hover:shadow-md">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4 text-amber-500" />
                Placar de Vendedores
              </CardTitle>
              <CardDescription>Ranking do mês · atualizado em tempo real</CardDescription>
            </div>
            <span className="text-xs text-primary flex items-center gap-1 group-hover:underline">
              Ver placar <ArrowUpRight className="h-3 w-3" />
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando…</div>
          ) : top.length === 0 ? (
            <div className="text-sm text-muted-foreground italic">
              O ranking aparecerá aqui conforme as vendas acontecerem.
            </div>
          ) : (
            <ul className="space-y-2">
              {top.map((v, i) => (
                <li
                  key={v.vendedor_id}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-accent/40"
                >
                  <span className="text-xl w-6 text-center">{MEDALS[i]}</span>
                  <div
                    className="flex h-7 w-7 items-center justify-center rounded-full text-white text-xs font-semibold shrink-0"
                    style={{ background: v.avatar_color }}
                  >
                    {v.nome
                      .split(" ")
                      .map((p) => p[0])
                      .slice(0, 2)
                      .join("")}
                  </div>
                  <div className="flex-1 min-w-0 font-medium truncate">{v.nome}</div>
                  <div className="font-display font-semibold text-primary">
                    {v.score.toFixed(0)} pts
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
