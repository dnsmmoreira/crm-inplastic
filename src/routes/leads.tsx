import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, Users } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { STAGES, formatBRL, useVisibleLeads, type StageId, type Lead } from "@/lib/crm-store";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LeadDrawer } from "@/components/crm/LeadDrawer";
import { listVendedores } from "@/lib/clientes.functions";

export const Route = createFileRoute("/leads")({
  head: () => ({
    meta: [
      { title: "Leads — CRM INPLASTIC" },
      {
        name: "description",
        content: "Base completa de leads para recontato, com filtro por etapa e motivo da perda.",
      },
      { property: "og:title", content: "Leads — CRM INPLASTIC" },
      {
        property: "og:description",
        content: "Base completa de leads para recontato, com filtro por etapa e motivo da perda.",
      },
    ],
  }),
  component: LeadsPage,
});

const PAGE_SIZE = 25;

/**
 * O motivo da perda é gravado por `useMoveLeadStage` como primeira linha das
 * notas do lead, no formato `[data] Perda — Motivo: X · observação`.
 */
function motivoPerda(lead: Lead): { motivo: string; observacao: string | null } | null {
  if (lead.stage !== "perdido") return null;
  const line = (lead.notes ?? "").split("\n").find((l) => l.includes("Perda — Motivo:"));
  if (!line) return null;
  const texto = line.slice(line.indexOf("Perda — Motivo:") + "Perda — Motivo:".length).trim();
  if (!texto) return null;
  const sep = texto.indexOf("·");
  if (sep === -1) return { motivo: texto, observacao: null };
  return {
    motivo: texto.slice(0, sep).trim(),
    observacao: texto.slice(sep + 1).trim() || null,
  };
}

function LeadsPage() {
  const leads = useVisibleLeads();
  const [stage, setStage] = useState<StageId | "all">("perdido");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [openLead, setOpenLead] = useState<string | null>(null);
  const [sortMotivo, setSortMotivo] = useState<"asc" | "desc" | null>(null);

  const listVendedoresFn = useServerFn(listVendedores);
  const vendedoresQ = useQuery({
    queryKey: ["leads", "vendedores"],
    queryFn: () => listVendedoresFn(),
    staleTime: 300_000,
  });
  const nomePorId = useMemo(() => {
    const m = new Map<string, string>();
    (vendedoresQ.data ?? []).forEach((v) => m.set(v.id, v.name));
    return m;
  }, [vendedoresQ.data]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const base = leads
      .filter((l) => (stage === "all" ? true : l.stage === stage))
      .filter((l) =>
        !term
          ? true
          : l.company.toLowerCase().includes(term) ||
            l.contactName.toLowerCase().includes(term) ||
            l.product.toLowerCase().includes(term),
      );
    if (!sortMotivo) {
      return base.sort((a, b) => (a.lastContact < b.lastContact ? 1 : -1));
    }
    const dir = sortMotivo === "asc" ? 1 : -1;
    return base.sort((a, b) => {
      const ma = motivoPerda(a)?.motivo ?? "";
      const mb = motivoPerda(b)?.motivo ?? "";
      if (!ma && !mb) return a.lastContact < b.lastContact ? 1 : -1;
      if (!ma) return 1;
      if (!mb) return -1;
      return ma.localeCompare(mb, "pt-BR") * dir;
    });
  }, [leads, stage, q, sortMotivo]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const rows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const mostrandoPerdidos = stage === "perdido" || stage === "all";

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col gap-4 p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold md:text-3xl">
              <Users className="h-6 w-6 text-muted-foreground" />
              Leads
            </h1>
            <p className="text-sm text-muted-foreground">
              Base de recontato — todos os leads, com filtro por etapa.
            </p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar empresa, contato ou produto..."
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
                className="pl-9 sm:w-72"
              />
            </div>
            <Select
              value={stage}
              onValueChange={(v) => {
                setStage(v as StageId | "all");
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as etapas</SelectItem>
                {STAGES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Valor estimado</TableHead>
                  <TableHead>Etapa</TableHead>
                  {mostrandoPerdidos && (
                    <TableHead>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={() => {
                          setSortMotivo((s) =>
                            s === "asc" ? "desc" : s === "desc" ? null : "asc",
                          );
                          setPage(1);
                        }}
                      >
                        Motivo da perda
                        {sortMotivo === "asc" ? (
                          <ArrowUp className="h-3.5 w-3.5" />
                        ) : sortMotivo === "desc" ? (
                          <ArrowDown className="h-3.5 w-3.5" />
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
                        )}
                      </button>
                    </TableHead>
                  )}

                  <TableHead>Vendedor</TableHead>
                  <TableHead>Último contato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((l) => {
                  const st = STAGES.find((s) => s.id === l.stage);
                  const motivo = motivoPerda(l);
                  return (
                    <TableRow
                      key={l.id}
                      className="cursor-pointer"
                      onClick={() => setOpenLead(l.id)}
                    >
                      <TableCell className="font-medium">{l.company}</TableCell>
                      <TableCell>{l.contactName || "—"}</TableCell>
                      <TableCell className="max-w-[220px] truncate">{l.product || "—"}</TableCell>
                      <TableCell className="text-right">{formatBRL(l.estimatedValue)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1.5">
                          <span className="stage-dot" style={{ background: st?.color }} />
                          {st?.label ?? l.stage}
                        </Badge>
                      </TableCell>
                      {mostrandoPerdidos && (
                        <TableCell className="max-w-[260px] text-sm text-muted-foreground">
                          {motivo ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="block truncate">
                                  {motivo.motivo}
                                  {motivo.observacao ? ` · ${motivo.observacao}` : ""}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs space-y-1">
                                <p className="font-medium">{motivo.motivo}</p>
                                {motivo.observacao && (
                                  <p className="text-xs opacity-90">{motivo.observacao}</p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      )}

                      <TableCell className="text-sm">{nomePorId.get(l.ownerId) ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {l.lastContact
                          ? format(new Date(l.lastContact), "dd MMM yyyy", { locale: ptBR })
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={mostrandoPerdidos ? 8 : 7}
                      className="py-10 text-center text-sm text-muted-foreground"
                    >
                      Nenhum lead encontrado com estes filtros.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {filtered.length} lead{filtered.length === 1 ? "" : "s"} · página {safePage} de{" "}
            {pageCount}
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
    </TooltipProvider>
  );
}
