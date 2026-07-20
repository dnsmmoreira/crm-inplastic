import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCnpj } from "@/lib/cnpj";
import { friendlyClienteError } from "@/lib/clientes";
import {
  getCliente,
  updateCliente,
  listLeadsByCliente,
  listVendedores,
} from "@/lib/clientes.functions";
import { useAuth } from "@/hooks/use-auth";
import {
  ClienteFormFields,
  fromRow,
  type ClienteFormState,
} from "@/components/clientes/ClienteFormFields";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/clientes/$id")({
  component: ClienteDetailPage,
});

const EMPRESA_BADGE: Record<string, string> = {
  INPLASTIC: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  TAOPLAST: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  LICITAPLAS: "bg-gray-500/10 text-gray-700 border-gray-500/30",
};

function ClienteDetailPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const getFn = useServerFn(getCliente);
  const updateFn = useServerFn(updateCliente);
  const leadsFn = useServerFn(listLeadsByCliente);
  const listVendedoresFn = useServerFn(listVendedores);

  const clienteQ = useQuery({
    queryKey: ["cliente", id],
    queryFn: () => getFn({ data: { id } }),
  });

  const leadsQ = useQuery({
    queryKey: ["cliente-leads", id],
    queryFn: () => leadsFn({ data: { clienteId: id } }),
  });

  const vendedoresQ = useQuery({
    queryKey: ["vendedores"],
    queryFn: () => listVendedoresFn(),
    enabled: !!isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  const [form, setForm] = useState<ClienteFormState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (clienteQ.data) setForm(fromRow(clienteQ.data));
  }, [clienteQ.data]);

  const isOwner = clienteQ.data && user && clienteQ.data.vendedor_id === user.id;
  const canEdit = !!(isAdmin || isOwner);

  const isDirty = useMemo(() => {
    if (!form || !clienteQ.data) return false;
    return JSON.stringify(form) !== JSON.stringify(fromRow(clienteQ.data));
  }, [form, clienteQ.data]);

  if (clienteQ.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin mr-2" />Carregando...</div>;
  }

  if (!clienteQ.data) {
    return (
      <div className="p-8 space-y-4">
        <Link to="/clientes" className="text-sm text-primary underline">← Voltar</Link>
        <div className="max-w-md">
          <h1 className="text-xl font-semibold">Cliente não encontrado</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Este cliente não existe ou você não tem acesso.
          </p>
        </div>
      </div>
    );
  }

  const c = clienteQ.data;

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await updateFn({ data: {
        id,
        patch: {
          razao_social: form.razao_social,
          nome_fantasia: form.nome_fantasia,
          inscricao_estadual: form.inscricao_estadual,
          ie_isento: form.ie_isento,
          endereco: form.endereco,
          numero: form.numero,
          complemento: form.complemento,
          bairro: form.bairro,
          cep: form.cep,
          cidade: form.cidade,
          estado: form.estado,
          contato: form.contato,
          email: form.email,
          telefone: form.telefone,
          telefone2: form.telefone2,
          website: form.website,
          observacao: form.observacao,
          empresa_padrao: form.empresa_padrao,
          ativo: form.ativo,
          ...(isAdmin ? { vendedor_id: form.vendedor_id } : {}),
        },
      } });
      toast.success("Cliente atualizado");
      await qc.invalidateQueries({ queryKey: ["cliente", id] });
      await qc.invalidateQueries({ queryKey: ["clientes"] });
    } catch (e) {
      toast.error(friendlyClienteError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-4">
      <div className="flex items-center justify-between gap-3 sticky top-0 bg-background/95 backdrop-blur z-10 py-2">
        <div>
          <Link to="/clientes" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Clientes
          </Link>
          <h1 className="text-2xl md:text-3xl font-semibold">{c.razao_social}</h1>
          <div className="text-sm text-muted-foreground">
            {formatCnpj(c.cnpj)}{c.nome_fantasia ? ` • ${c.nome_fantasia}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {c.empresa_padrao && (
            <Badge variant="outline" className={EMPRESA_BADGE[c.empresa_padrao] ?? ""}>
              {c.empresa_padrao}
            </Badge>
          )}
          {!c.ativo && <Badge variant="outline">Inativo</Badge>}
          <Button variant="outline" onClick={() => navigate({ to: "/propostas" })}>
            Nova proposta
          </Button>
        </div>
      </div>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados fiscais</TabsTrigger>
          <TabsTrigger value="propostas">Propostas</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="space-y-4">
          {form && (
            <>
              <ClienteFormFields
                value={form}
                onChange={(p) => setForm((f) => (f ? { ...f, ...p } : f))}
                cnpjDisabled
                readOnly={!canEdit}
                isAdmin={isAdmin}
                vendedores={vendedoresQ.data ?? []}
              />
              {canEdit && (
                <div className="flex justify-end gap-2 pb-6">
                  <Button
                    variant="ghost"
                    onClick={() => setForm(fromRow(c))}
                    disabled={!isDirty || saving}
                  >
                    Descartar
                  </Button>
                  <Button onClick={handleSave} disabled={!isDirty || saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Salvar alterações
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="propostas">
          <Card>
            <CardContent className="pt-4 overflow-x-auto">
              {leadsQ.isLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  <Loader2 className="inline h-4 w-4 animate-spin mr-2" /> Carregando...
                </div>
              ) : (leadsQ.data ?? []).length === 0 ? (
                <div className="py-10 text-center space-y-3">
                  <div className="text-sm text-muted-foreground">Nenhuma proposta ainda</div>
                  <Button onClick={() => navigate({ to: "/propostas" })}>Criar primeira proposta</Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Título</TableHead>
                      <TableHead>Etapa</TableHead>
                      <TableHead className="text-right">Valor estimado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(leadsQ.data ?? []).map((l) => {
                      const row = l as unknown as {
                        id: string;
                        company: string | null;
                        contact_name: string | null;
                        stage: string;
                        estimated_value: number | null;
                        created_at: string;
                      };
                      return (
                        <TableRow key={row.id}>
                          <TableCell className="text-sm">
                            {format(new Date(row.created_at), "dd/MM/yyyy", { locale: ptBR })}
                          </TableCell>
                          <TableCell>{row.company ?? row.contact_name ?? "—"}</TableCell>
                          <TableCell><Badge variant="outline">{row.stage}</Badge></TableCell>
                          <TableCell className="text-right">
                            {row.estimated_value != null
                              ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(row.estimated_value)
                              : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico">
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              Em breve — histórico de alterações do cliente.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
