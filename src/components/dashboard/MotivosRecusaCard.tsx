import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MotivosRecusaList } from "@/components/relatorios/PropostasReport";
import { getRelatorioPropostas } from "@/lib/relatorio-propostas.functions";

/** Painel inicial (admin): por que as propostas foram recusadas nos últimos 30 dias. */
export function MotivosRecusaCard() {
  const fetchRel = useServerFn(getRelatorioPropostas);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["relatorio-propostas", "30", "todos"],
    queryFn: () => fetchRel({ data: { periodo: "30", vendedorId: null } }),
    staleTime: 5 * 60_000,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Motivos de recusa (30 dias)</CardTitle>
        <CardDescription>
          Propostas marcadas como recusadas no período.{" "}
          <Link to="/relatorios" className="underline">
            ver relatório
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : isError ? (
          <div className="text-sm text-muted-foreground">
            Não foi possível carregar os motivos agora.
          </div>
        ) : (
          <MotivosRecusaList motivos={data?.motivos ?? []} />
        )}
      </CardContent>
    </Card>
  );
}
