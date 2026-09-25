import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardList } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaginaCabecalho } from "@/components/layout/PaginaCabecalho";
import { TabelaResponsiva, LinhaLista, juntarCampos } from "@/components/layout/ListaResponsiva";
import { listarFichasColeta } from "@/lib/ficha-coleta.functions";
import { FICHA_STATUS_LABEL, formatarCubagem, formatarPeso } from "@/lib/ficha-coleta";

export const Route = createFileRoute("/fichas-coleta")({
  head: () => ({
    meta: [
      { title: "Fichas de Coleta — CRM" },
      {
        name: "description",
        content:
          "Autorizações de coleta emitidas a partir dos pedidos, com peso, cubagem e transportadora.",
      },
      { property: "og:title", content: "Fichas de Coleta — CRM" },
      {
        property: "og:description",
        content:
          "Autorizações de coleta emitidas a partir dos pedidos, com peso, cubagem e transportadora.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FichasColetaPage,
});

function FichasColetaPage() {
  const listar = useServerFn(listarFichasColeta);
  const q = useQuery({
    queryKey: ["fichas-coleta"],
    queryFn: () => listar({ data: {} }),
  });

  const rows = q.data ?? [];
  const navigate = useNavigate();

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      <PaginaCabecalho
        titulo="Fichas de Coleta"
        icone={<ClipboardList className="h-5 w-5 text-primary" />}
        descricao="Autorização de retirada da mercadoria. A ficha nasce sempre a partir de um pedido."
        resumoMobile={rows.length ? `${rows.length} ficha(s)` : undefined}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Últimas fichas</CardTitle>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma ficha ainda. Abra um pedido e use “Gerar Ficha de Coleta”.
            </p>
          ) : (
            <TabelaResponsiva
              mobile={rows.map((f) => (
                <LinhaLista
                  key={f.id}
                  titulo={f.numero}
                  subtitulo={juntarCampos(
                    f.pedidos?.number,
                    f.transportadora_nome,
                    f.peso_total_kg ? formatarPeso(f.peso_total_kg) : null,
                  )}
                  selo={
                    <Badge variant={f.status === "cancelada" ? "outline" : "default"}>
                      {FICHA_STATUS_LABEL[f.status]}
                    </Badge>
                  }
                  onClick={() => navigate({ to: "/ficha-coleta/$id", params: { id: f.id } })}
                />
              ))}
            >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Pedido</TableHead>
                  <TableHead>Transportadora</TableHead>
                  <TableHead>Peso</TableHead>
                  <TableHead>Cubagem</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Abrir</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">{f.numero}</TableCell>
                    <TableCell>{f.pedidos?.number ?? "—"}</TableCell>
                    <TableCell>{f.transportadora_nome ?? "—"}</TableCell>
                    <TableCell>{formatarPeso(f.peso_total_kg)}</TableCell>
                    <TableCell>{formatarCubagem(f.cubagem_m3)}</TableCell>
                    <TableCell>
                      <Badge variant={f.status === "cancelada" ? "outline" : "default"}>
                        {FICHA_STATUS_LABEL[f.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to="/ficha-coleta/$id" params={{ id: f.id }}>
                          Abrir
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </TabelaResponsiva>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
