import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getFichaColetaPublica } from "@/lib/ficha-coleta.functions";
import { FICHA_STATUS_LABEL, formatarCubagem, formatarPeso } from "@/lib/ficha-coleta";

export const Route = createFileRoute("/ficha-coleta-publica/$id")({
  head: () => ({
    meta: [
      { title: "Conferência da Ficha de Coleta" },
      {
        name: "description",
        content: "Conferência pública da autorização de coleta: número, situação, carga e volume.",
      },
      { property: "og:title", content: "Conferência da Ficha de Coleta" },
      {
        property: "og:description",
        content: "Conferência pública da autorização de coleta: número, situação, carga e volume.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FichaColetaPublica,
});

function FichaColetaPublica() {
  const { id } = Route.useParams();
  const carregar = useServerFn(getFichaColetaPublica);
  const q = useQuery({
    queryKey: ["ficha-coleta-publica", id],
    queryFn: () => carregar({ data: { id } }),
  });

  if (q.isLoading) return <p className="p-8 text-sm text-muted-foreground">Carregando…</p>;
  const f = q.data;
  if (!f)
    return (
      <div className="p-8">
        <p className="text-sm text-muted-foreground">
          Documento não encontrado ou ainda não emitido.
        </p>
      </div>
    );

  return (
    <div className="p-4 md:p-8 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-primary" /> Ficha de Coleta {f.numero}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            Situação: <Badge>{FICHA_STATUS_LABEL[f.status]}</Badge>
          </div>
          <div>Pedido: {f.pedido_numero ?? "—"}</div>
          <div>Destinatário: {f.cliente ?? "—"}</div>
          <div>Transportadora: {f.transportadora ?? "—"}</div>
          <div>
            Carga: {formatarPeso(f.peso_total_kg)} · {formatarCubagem(f.cubagem_m3)}
          </div>
          <div>
            <div className="font-medium mb-1">Itens</div>
            <ul className="list-disc pl-5 space-y-0.5">
              {f.itens.map((i, idx) => (
                <li key={idx}>
                  {i.quantidade} {i.unidade ?? ""} — {i.descricao}
                  {i.sku ? ` (${i.sku})` : ""}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
