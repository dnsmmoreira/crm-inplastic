import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, FileText, Search, Trash2, UserPlus, Loader2, Building2, Check } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { lookupCnpj } from "@/lib/cnpj.functions";
import { vincularClienteAoLead } from "@/lib/clientes.functions";
import { NovoClienteDialog } from "@/components/clientes/NovoClienteDialog";
import type { ClienteRow } from "@/lib/clientes.functions";
import { isValidCnpj, formatCnpj } from "@/lib/cnpj";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  useCrm,
  useVisibleLeads,
  useVisibleProposals,
  formatBRL,
  proposalTotals,
  type ProposalStatus,
} from "@/lib/crm-store";
import { useAuth } from "@/hooks/use-auth";
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
  const addLead = useCrm((s) => s.addLead);
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProposalStatus>("all");
  const [openNew, setOpenNew] = useState(false);
  const [selectedLead, setSelectedLead] = useState<string>("");
  const [leadSearch, setLeadSearch] = useState("");
  const [openNewLead, setOpenNewLead] = useState(false);
  const [leadForm, setLeadForm] = useState({
    company: "", cnpj: "", contactName: "", phone: "", email: "",
  });
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const lookupCnpjFn = useServerFn(lookupCnpj);

  const resetLeadForm = () => setLeadForm({ company: "", cnpj: "", contactName: "", phone: "", email: "" });

  const handleCnpjLookup = async () => {
    const digits = leadForm.cnpj.replace(/\D/g, "");
    if (digits.length !== 14) { toast.error("Informe um CNPJ com 14 dígitos"); return; }
    if (!isValidCnpj(digits)) { toast.error("CNPJ inválido — confira os dígitos"); return; }
    // check duplicate before calling API
    const dup = leads.find((l) => (l.cnpj ?? "").replace(/\D/g, "") === digits);
    if (dup) { toast.error(`CNPJ já cadastrado para "${dup.company}"`); return; }
    setCnpjLoading(true);
    try {
      const r = await lookupCnpjFn({ data: { cnpj: digits } });
      setLeadForm((f) => ({
        ...f,
        company: r.nomeFantasia || r.razaoSocial || f.company,
        phone: f.phone || r.telefone,
        email: f.email || r.email,
      }));
      toast.success("Dados do CNPJ carregados");
    } catch (e) {
      const { friendlyCnpjError } = await import("@/lib/cnpj");
      toast.error(friendlyCnpjError(e));
    } finally {
      setCnpjLoading(false);
    }
  };

  const handleCreateLead = () => {
    if (!leadForm.company.trim()) { toast.error("Informe a empresa"); return; }
    try {
      const id = addLead({
        company: leadForm.company.trim(),
        contactName: leadForm.contactName.trim(),
        email: leadForm.email.trim(),
        phone: leadForm.phone,
        product: "",
        quantity: 0,
        estimatedValue: 0,
        stage: "novo",
        tags: [],
        source: "Manual",
        notes: "",
        cnpj: leadForm.cnpj || undefined,
      });
      toast.success("Lead cadastrado");
      setOpenNewLead(false);
      resetLeadForm();
      setSelectedLead(id);
      setOpenNew(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao cadastrar lead");
    }
  };



  const leadResults = useMemo(() => {
    const t = leadSearch.toLowerCase().trim();
    const digits = leadSearch.replace(/\D/g, "");
    if (!t) return leads.slice(0, 50);
    return leads.filter((l) => {
      const cnpjDigits = (l.cnpj ?? "").replace(/\D/g, "");
      return (
        l.company.toLowerCase().includes(t) ||
        l.contactName.toLowerCase().includes(t) ||
        (digits.length >= 2 && cnpjDigits.includes(digits))
      );
    }).slice(0, 50);
  }, [leads, leadSearch]);

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
              <SelectItem value="aguardando_aprovacao">Aguardando aprovação</SelectItem>
              <SelectItem value="aprovada">Aprovada</SelectItem>
              <SelectItem value="pedido">Pedido</SelectItem>
              <SelectItem value="recusada">Recusada</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={() => setOpenNewLead(true)} className="gap-2">
            <UserPlus className="h-4 w-4" /> Cadastrar lead
          </Button>
          <Button onClick={() => setOpenNew(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Nova proposta
          </Button>
        </div>
      </div>

      {(() => {
        const pending = proposals.filter((p) => p.status === "pedido" && p.editRequestedAt && !p.editUnlockedAt);
        if (pending.length === 0) return null;
        return (
          <Card className="border-amber-400 bg-amber-500/5">
            <CardContent className="py-3 flex flex-wrap items-center gap-3 text-sm">
              <Badge variant="outline" className="border-amber-500 text-amber-700 bg-amber-500/10">
                {isAdmin ? "ADM" : "Você"}
              </Badge>
              <span className="text-amber-800">
                {isAdmin
                  ? `${pending.length} solicitação(ões) de alteração de pedido aguardando sua liberação.`
                  : `${pending.length} pedido(s) seu(s) aguardando liberação de alteração pelo ADM.`}
              </span>
              <div className="flex flex-wrap gap-1">
                {pending.slice(0, 5).map((p) => (
                  <Link
                    key={p.id}
                    to="/propostas/$id"
                    params={{ id: p.id }}
                    className="rounded border border-amber-500/40 bg-white px-2 py-0.5 font-mono text-xs text-amber-800 hover:bg-amber-500/10"
                  >
                    {p.number}
                  </Link>
                ))}
                {pending.length > 5 && <span className="text-xs text-amber-700">+{pending.length - 5}</span>}
              </div>
            </CardContent>
          </Card>
        );
      })()}

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
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant={s.variant}>{s.label}</Badge>
                        {p.status === "pedido" && p.editRequestedAt && !p.editUnlockedAt && (
                          <Badge variant="outline" className="border-amber-500 text-amber-700 bg-amber-500/10 text-[10px]">alteração solicitada</Badge>
                        )}
                        {p.status === "pedido" && p.editUnlockedAt && (
                          <Badge variant="outline" className="border-emerald-500 text-emerald-700 bg-emerald-500/10 text-[10px]">edição liberada</Badge>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-right">
                      {(() => {
                        const isLocked = (p.status === "aprovada" || p.status === "pedido") && !isAdmin;
                        return (
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={isLocked}
                            title={isLocked ? "Apenas administradores podem excluir pedidos aprovados" : "Excluir proposta"}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isLocked) return;
                              if (confirm(`Remover proposta ${p.number}?`)) {
                                removeProposal(p.id);
                                toast.success("Proposta removida");
                              }
                            }}
                          >
                            <Trash2 className={`h-3.5 w-3.5 ${isLocked ? "text-muted-foreground" : "text-destructive"}`} />
                          </Button>
                        );
                      })()}
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

      <NovaPropostaDialog
        open={openNew}
        onOpenChange={setOpenNew}
      />


      <Dialog open={openNewLead} onOpenChange={(o) => { setOpenNewLead(o); if (!o) resetLeadForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Cadastrar novo lead</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>CNPJ</Label>
              <div className="flex gap-2">
                <Input
                  value={leadForm.cnpj}
                  onChange={(e) => setLeadForm((f) => ({ ...f, cnpj: e.target.value }))}
                  placeholder="00.000.000/0000-00"
                />
                <Button type="button" variant="outline" onClick={handleCnpjLookup} disabled={cnpjLoading}>
                  {cnpjLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">CNPJ é único no CRM — evita conflito entre vendedores.</p>
            </div>
            <div>
              <Label>Empresa *</Label>
              <Input
                value={leadForm.company}
                onChange={(e) => setLeadForm((f) => ({ ...f, company: e.target.value }))}
                placeholder="Nome da empresa"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Contato</Label>
                <Input
                  value={leadForm.contactName}
                  onChange={(e) => setLeadForm((f) => ({ ...f, contactName: e.target.value }))}
                />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  value={leadForm.phone}
                  onChange={(e) => setLeadForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={leadForm.email}
                onChange={(e) => setLeadForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenNewLead(false)}>Cancelar</Button>
            <Button onClick={handleCreateLead}>Cadastrar e criar proposta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// Dialog "Nova proposta comercial" — seletor de lead/cliente
// ============================================================
function NovaPropostaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const leads = useVisibleLeads();
  const addLead = useCrm((s) => s.addLead);
  const createProposal = useCrm((s) => s.createProposal);
  const vincularFn = useServerFn(vincularClienteAoLead);

  const [query, setQuery] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [openNovo, setOpenNovo] = useState(false);
  const [criando, setCriando] = useState(false);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSelectedLeadId(null);
      setCriando(false);
    }
  }, [open]);

  const results = useMemo(() => {
    const t = query.toLowerCase().trim();
    const digits = query.replace(/\D/g, "");
    const sorted = [...leads].sort((a, b) => a.company.localeCompare(b.company, "pt-BR"));
    if (!t) return sorted.slice(0, 100);
    return sorted.filter((l) => {
      const hay = [l.company, l.razaoSocial, l.nomeFantasia, l.contactName]
        .filter(Boolean).join(" ").toLowerCase();
      const cnpjDigits = (l.cnpj ?? "").replace(/\D/g, "");
      return hay.includes(t) || (digits.length >= 2 && cnpjDigits.includes(digits));
    }).slice(0, 100);
  }, [leads, query]);

  const selectedLead = useMemo(
    () => (selectedLeadId ? leads.find((l) => l.id === selectedLeadId) ?? null : null),
    [leads, selectedLeadId],
  );

  const criarProposta = async (leadId: string) => {
    setCriando(true);
    try {
      const propId = await createProposal(leadId);
      toast.success("Proposta criada — adicione os itens");
      onOpenChange(false);
      navigate({ to: "/propostas/$id", params: { id: propId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar proposta");
    } finally {
      setCriando(false);
    }
  };

  const criarPropostaComClienteNovo = async (c: ClienteRow) => {
    try {
      const existente = leads.find((l) => l.clienteId === c.id);
      let leadId: string;
      if (existente) {
        leadId = existente.id;
      } else {
        leadId = addLead({
          company: c.razao_social,
          contactName: c.contato ?? "",
          email: c.email ?? "",
          phone: c.telefone ?? "",
          product: "",
          quantity: 0,
          estimatedValue: 0,
          stage: "novo",
          tags: [],
          source: "Cliente",
          notes: "",
          cnpj: c.cnpj,
          razaoSocial: c.razao_social,
          nomeFantasia: c.nome_fantasia ?? undefined,
          clienteId: c.id,
        });
        vincularFn({ data: { leadId, clienteId: c.id } }).catch((err) => {
          toast.error(err instanceof Error ? err.message : "Erro ao vincular cliente ao lead");
        });
      }
      await criarProposta(leadId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao cadastrar cliente");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nova proposta comercial</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Selecione o lead / cliente</Label>
            <Command shouldFilter={false} className="border rounded-md">
              <CommandInput
                placeholder="Buscar por nome, razão social ou CNPJ..."
                value={query}
                onValueChange={setQuery}
              />
              <CommandList className="max-h-72">
                <CommandEmpty>
                  <div className="py-4 text-sm text-muted-foreground">
                    Nenhum lead encontrado.
                  </div>
                </CommandEmpty>
                <CommandGroup>
                  {results.map((l) => {
                    const isSel = l.id === selectedLeadId;
                    const subtitle = [
                      l.razaoSocial && l.razaoSocial !== l.company ? l.razaoSocial : null,
                      l.cnpj ? formatCnpj(l.cnpj.replace(/\D/g, "")) : null,
                      l.contactName || null,
                    ].filter(Boolean).join(" • ");
                    return (
                      <CommandItem
                        key={l.id}
                        value={l.id}
                        onSelect={() => setSelectedLeadId(l.id)}
                        className="flex items-start gap-2"
                      >
                        <Check className={cn("h-4 w-4 mt-1", isSel ? "opacity-100" : "opacity-0")} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{l.company}</div>
                          {subtitle && (
                            <div className="text-xs text-muted-foreground truncate">{subtitle}</div>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>

            {selectedLead && (
              <div className="border rounded-md p-3 bg-accent/30 text-sm">
                <div className="font-semibold">{selectedLead.company}</div>
                <div className="text-xs text-muted-foreground">
                  {selectedLead.cnpj
                    ? formatCnpj(selectedLead.cnpj.replace(/\D/g, ""))
                    : "Sem CNPJ cadastrado"}
                  {selectedLead.contactName ? ` • ${selectedLead.contactName}` : ""}
                </div>
              </div>
            )}

            <div className="pt-1">
              <Button variant="outline" className="gap-2 w-full" onClick={() => setOpenNovo(true)}>
                <Plus className="h-4 w-4" /> Cadastrar novo cliente
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              disabled={!selectedLeadId || criando}
              onClick={() => selectedLeadId && criarProposta(selectedLeadId)}
            >
              {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar proposta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NovoClienteDialog
        open={openNovo}
        onOpenChange={setOpenNovo}
        onClienteCriado={(c) => {
          setOpenNovo(false);
          void criarPropostaComClienteNovo(c);
        }}
      />
    </>
  );
}


