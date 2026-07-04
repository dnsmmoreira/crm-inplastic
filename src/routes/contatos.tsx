import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Plus, Filter } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { useCrm, STAGES, formatBRL, type StageId, useVisibleLeads } from "@/lib/crm-store";
import { NewLeadDialog, LeadDrawer } from "@/components/crm/LeadDrawer";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/contatos")({
  component: ContactsPage,
  head: () => ({
    meta: [{ title: "Contatos — INPLASTIC - CRM" }],
  }),
});

function ContactsPage() {
  const leads = useVisibleLeads();
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<StageId | "all">("all");
  const [tag, setTag] = useState<string>("all");
  const [openLead, setOpenLead] = useState<string | null>(null);

  const allTags = useMemo(() => {
    const s = new Set<string>();
    leads.forEach((l) => l.tags.forEach((t) => s.add(t)));
    return Array.from(s).sort();
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return leads.filter((l) => {
      if (stage !== "all" && l.stage !== stage) return false;
      if (tag !== "all" && !l.tags.includes(tag)) return false;
      if (!q) return true;
      return (
        l.company.toLowerCase().includes(q) ||
        l.contactName.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        l.product.toLowerCase().includes(q)
      );
    });
  }, [leads, search, stage, tag]);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Contatos</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} de {leads.length} clientes</p>
        </div>
        <NewLeadDialog trigger={<Button className="gap-2"><Plus className="h-4 w-4" />Novo contato</Button>} />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por empresa, contato, e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={stage} onValueChange={(v) => setStage(v as StageId | "all")}>
            <SelectTrigger className="w-[180px]"><Filter className="h-3.5 w-3.5 mr-1" /><SelectValue placeholder="Etapa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as etapas</SelectItem>
              {STAGES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={tag} onValueChange={setTag}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Tag" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as tags</SelectItem>
              {allTags.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empresa</TableHead>
                <TableHead>Contato</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Último contato</TableHead>
                <TableHead>Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l) => {
                const s = STAGES.find((st) => st.id === l.stage)!;
                return (
                  <TableRow
                    key={l.id}
                    onClick={() => setOpenLead(l.id)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium">{l.company}</TableCell>
                    <TableCell>
                      <div className="text-sm">{l.contactName}</div>
                      <div className="text-xs text-muted-foreground">{l.email}</div>
                    </TableCell>
                    <TableCell className="text-sm">{l.product}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span className="stage-dot" style={{ background: s.color }} />
                        {s.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatBRL(l.estimatedValue)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(l.lastContact), "dd MMM yyyy", { locale: ptBR })}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {l.tags.map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground italic">
                    Nenhum contato encontrado com os filtros atuais.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <LeadDrawer leadId={openLead} open={!!openLead} onOpenChange={(o) => !o && setOpenLead(null)} />
    </div>
  );
}
