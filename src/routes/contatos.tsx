import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Contact, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LeadDrawer } from "@/components/crm/LeadDrawer";
import { listTodosContatos, papelLabel } from "@/lib/contatos.functions";

export const Route = createFileRoute("/contatos")({
  head: () => ({
    meta: [
      { title: "Contatos — CRM INPLASTIC" },
      {
        name: "description",
        content: "Todas as pessoas de contato cadastradas em leads e clientes.",
      },
      { property: "og:title", content: "Contatos — CRM INPLASTIC" },
      {
        property: "og:description",
        content: "Todas as pessoas de contato cadastradas em leads e clientes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ContatosPage,
});

const PAGE_SIZE = 25;

function ContatosPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [openLead, setOpenLead] = useState<string | null>(null);

  const listFn = useServerFn(listTodosContatos);
  const { data, isLoading } = useQuery({
    queryKey: ["contatos", "todos", q, page],
    queryFn: () => listFn({ data: { q, page, pageSize: PAGE_SIZE } }),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const rows = data?.rows ?? [];
  const total = data?.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  return (
    <div className="flex flex-col gap-4 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold md:text-3xl">
            <Contact className="h-6 w-6 text-muted-foreground" />
            Contatos
          </h1>
          <p className="text-sm text-muted-foreground">
            Todas as pessoas de contato cadastradas em leads e clientes.
          </p>
        </div>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, telefone, e-mail ou empresa..."
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Telefone</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Empresa vinculada</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer"
                  onClick={() => {
                    if (c.lead_id) setOpenLead(c.lead_id);
                    else if (c.cliente_id)
                      navigate({ to: "/clientes/$id", params: { id: c.cliente_id } });
                  }}
                >
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span>{c.nome}</span>
                      {!c.ativo && (
                        <Badge variant="outline" className="text-[10px]">
                          Inativo
                        </Badge>
                      )}
                    </div>
                    {c.cargo && (
                      <div className="text-xs text-muted-foreground">{c.cargo}</div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{papelLabel(c.papel)}</TableCell>
                  <TableCell className="text-sm">{c.telefone || c.telefone2 || "—"}</TableCell>
                  <TableCell className="max-w-[220px] truncate text-sm">
                    {c.email || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="max-w-[240px] truncate text-sm">{c.empresa || "—"}</span>
                      {c.vinculo && (
                        <Badge variant="secondary" className="text-[10px]">
                          {c.vinculo === "lead" ? "Lead" : "Cliente"}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                    {isLoading ? "Carregando contatos..." : "Nenhum contato encontrado."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} contato{total === 1 ? "" : "s"} · página {safePage} de {pageCount}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => setPage(safePage - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= pageCount}
            onClick={() => setPage(safePage + 1)}
          >
            Próxima
          </Button>
        </div>
      </div>

      <LeadDrawer
        leadId={openLead}
        open={!!openLead}
        onOpenChange={(o) => !o && setOpenLead(null)}
      />
    </div>
  );
}
