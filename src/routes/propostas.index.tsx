import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, FileText, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  useCrm,
  useVisibleLeads,
  useVisibleProposals,
  formatBRL,
  proposalTotals,
  type ProposalStatus,
} from "@/lib/crm-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/propostas/")({
  component: PropostasPage,
});

const STATUS_META: Record<ProposalStatus, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  rascunho: { label: "Rascunho", variant: "outline" },
  enviada: { label: "Enviada", variant: "secondary" },
  aguardando_aprovacao: { label: "Aguardando aprovação", variant: "outline" },
  aprovada: { label: "Aprovada", variant: "default" },
  recusada: { label: "Recusada", variant: "destructive" },
  pedido: { label: "Pedido", variant: "default" },
};

function PropostasPage() {
  const proposals = useVisibleProposals();
  const leads = useVisibleLeads();
  const removeProposal = useCrm((s) => s.removeProposal);
  const createProposal = useCrm((s) => s.createProposal);
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProposalStatus>("all");
  const [openNew, setOpenNew] = useState(false);
  const [selectedLead, setSelectedLead] = useState<string>("");

  const filtered = useMemo(() => {
    const t = q.toLowerCase().trim();
    return proposals.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (!t) return true;
      const lead = leads.find((l) => l.id === p.leadId);
      return (
        p.number.toLowerCase().includes(t) ||
        (lead?.company.toLowerCase().includes(t) ?? false)
      );
    });
  }, [proposals, leads, q, statusFilter]);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Propostas Comerciais</h1>
          <p className="text-sm text-muted-foreground">
            {proposals.length} proposta(s) — geradas a partir dos leads do funil.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Número ou cliente..." className="pl-8 w-64" />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="rascunho">Rascunho</SelectItem>
              <SelectItem value="enviada">Enviada</SelectItem>
              <SelectItem value="aprovada">Aprovada</SelectItem>
              <SelectItem value="recusada">Recusada</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={() => setOpenNew(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Nova proposta
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            {filtered.length} proposta(s)
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nº</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const lead = leads.find((l) => l.id === p.leadId);
                const t = proposalTotals(p);
                const s = STATUS_META[p.status];
                return (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-accent/40" onClick={() => navigate({ to: "/propostas/$id", params: { id: p.id } })}>
                    <TableCell className="font-mono text-xs">{p.number}</TableCell>
                    <TableCell className="font-medium">{lead?.company ?? "—"}</TableCell>
                    <TableCell>{format(new Date(p.createdAt), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                    <TableCell className="text-right">{t.count}</TableCell>
                    <TableCell className="text-right font-semibold">{formatBRL(t.total)}</TableCell>
                    <TableCell><Badge variant={s.variant}>{s.label}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Remover proposta ${p.number}?`)) {
                            removeProposal(p.id);
                            toast.success("Proposta removida");
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                    Nenhuma proposta encontrada. Crie a primeira!
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova proposta comercial</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Cliente (lead)</Label>
              <Select value={selectedLead} onValueChange={setSelectedLead}>
                <SelectTrigger><SelectValue placeholder="Selecione um lead" /></SelectTrigger>
                <SelectContent>
                  {leads.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.company} — {l.contactName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {leads.length === 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  Você não tem leads visíveis. Crie um lead primeiro em <Link to="/pipeline" className="text-primary underline">Funil de Vendas</Link>.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenNew(false)}>Cancelar</Button>
            <Button
              disabled={!selectedLead}
              onClick={() => {
                const id = createProposal(selectedLead);
                setOpenNew(false);
                setSelectedLead("");
                toast.success("Proposta criada — adicione os itens");
                navigate({ to: "/propostas/$id", params: { id } });
              }}
            >
              Criar proposta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
