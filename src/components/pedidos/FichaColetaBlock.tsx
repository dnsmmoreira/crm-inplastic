import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ClipboardList } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { criarFichaColeta, listarFichasColeta } from "@/lib/ficha-coleta.functions";
import { FICHA_STATUS_LABEL, formatarCubagem, formatarPeso } from "@/lib/ficha-coleta";

/**
 * Ficha de Coleta do pedido. Acesso: vendedor dono, operacional e admin — a
 * RLS (`pode_acessar_ficha_pedido`) é quem decide; aqui só mostramos.
 */
export function FichaColetaBlock({ pedidoId }: { pedidoId: string }) {
  const qc = useQueryClient();
  const listar = useServerFn(listarFichasColeta);
  const criar = useServerFn(criarFichaColeta);

  const q = useQuery({
    queryKey: ["fichas-coleta", pedidoId],
    queryFn: () => listar({ data: { pedido_id: pedidoId } }),
  });

  const mCriar = useMutation({
    mutationFn: () => criar({ data: { pedido_id: pedidoId } }),
    onSuccess: (f) => {
      toast.success(`Ficha ${f.numero} criada em rascunho`);
      qc.invalidateQueries({ queryKey: ["fichas-coleta", pedidoId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fichas = q.data ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-primary" /> Ficha de Coleta
        </CardTitle>
        <Button size="sm" onClick={() => mCriar.mutate()} disabled={mCriar.isPending}>
          Gerar Ficha de Coleta
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {q.isLoading ? (
          <p className="text-muted-foreground">Carregando…</p>
        ) : fichas.length === 0 ? (
          <p className="text-muted-foreground">
            Nenhuma ficha gerada para este pedido ainda.
          </p>
        ) : (
          fichas.map((f) => (
            <div key={f.id} className="flex items-center justify-between gap-2 border-b pb-2 last:border-0">
              <div>
                <div className="font-medium">{f.numero}</div>
                <div className="text-xs text-muted-foreground">
                  {formatarPeso(f.peso_total_kg)} · {formatarCubagem(f.cubagem_m3)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={f.status === "cancelada" ? "outline" : "default"}>
                  {FICHA_STATUS_LABEL[f.status]}
                </Badge>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/ficha-coleta/$id" params={{ id: f.id }}>
                    Abrir
                  </Link>
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
