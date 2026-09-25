import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Plus, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { PaginaCabecalho } from "@/components/layout/PaginaCabecalho";
import { TabelaResponsiva, LinhaLista, VazioLista, juntarCampos } from "@/components/layout/ListaResponsiva";
import { formatDocumentoCliente } from "@/lib/clientes";
import { relativeTimeShort, displayValue } from "@/lib/format";
import { listClientes, listVendedores } from "@/lib/clientes.functions";
import { useAuth, hasPerm } from "@/hooks/use-auth";
import { NovoClienteDialog } from "@/components/clientes/NovoClienteDialog";
import { PERM_CLIENTES_CRIAR } from "@/lib/cadastro-permissoes";
import { consultarDonoDocumento } from "@/lib/consulta-dono.functions";
import {
  mensagemDonoDuplicado,
  normalizarDocumento,
  MSG_CONSULTA_INDISPONIVEL,
} from "@/lib/consulta-dono";

export const Route = createFileRoute("/clientes/")({
  head: () => ({
    meta: [
      { title: "Clientes — CRM INPLASTIC" },
      { name: "description", content: "Cadastro centralizado de clientes com dados fiscais." },
    ],
  }),
  component: ClientesListPage,
});

const EMPRESA_BADGE: Record<string, string> = {
  INPLASTIC: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  TAOPLAST: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  LICITAPLAS: "bg-gray-500/10 text-gray-700 border-gray-500/30",
};

function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useState(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  });
  return v;
}

function ClientesListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  // Só amplia: admin continua vendo tudo; vendedor comum permanece igual.
  const isAdmin = user?.role === "admin" || hasPerm(user, "clientes.ver_todos");


  const [q, setQ] = useState("");
  const [qDeb, setQDeb] = useState("");
  const [empresa, setEmpresa] = useState<string>("all");
  const [vendedorId, setVendedorId] = useState<string>("all");
  const [somenteAtivos, setSomenteAtivos] = useState(true);
  const [page, setPage] = useState(1);
  const [openNovo, setOpenNovo] = useState(false);

  // debounce manual
  useState(() => {
    // no-op placeholder to avoid lint issue
  });
  // Debounce simples via useEffect
  const listFn = useServerFn(listClientes);
  const listVendedoresFn = useServerFn(listVendedores);

  // debounce
  useDebounceEffect(() => setQDeb(q), 300, [q]);

  const pageSize = 25;

  const clientesQ = useQuery({
    queryKey: ["clientes", { qDeb, empresa, vendedorId, somenteAtivos, page }],
    queryFn: () => listFn({ data: {
      q: qDeb,
      empresa: empresa === "all" ? "" : empresa,
      vendedorId: vendedorId === "all" ? "" : vendedorId,
      somenteAtivos,
      page,
      pageSize,
    } }),
  });

  const vendedoresQ = useQuery({
    queryKey: ["vendedores"],
    queryFn: () => listVendedoresFn(),
    enabled: !!isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  // Busca por documento: se o cadastro existe fora do alcance da pessoa, ela
  // vê quem é o dono (e a equipe dele), nunca os dados do registro.
  const consultarDonoFn = useServerFn(consultarDonoDocumento);
  const docBuscado = normalizarDocumento(qDeb);
  const donoQ = useQuery({
    queryKey: ["dono-documento", docBuscado],
    queryFn: () => consultarDonoFn({ data: { cnpj: docBuscado } }),
    enabled: docBuscado.length === 14,
    staleTime: 60_000,
    retry: false,
  });
  const avisoDono =
    donoQ.data?.limiteExcedido
      ? MSG_CONSULTA_INDISPONIVEL
      : donoQ.data?.existe && !donoQ.data.podeVerRegistro
        ? mensagemDonoDuplicado(donoQ.data)
        : null;

  const rows = clientesQ.data?.rows ?? [];
  const total = clientesQ.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const vendedorById = new Map((vendedoresQ.data ?? []).map((v) => [v.id, v] as const));

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      <PaginaCabecalho
        titulo="Clientes"
        icone={<Building2 className="h-6 w-6 text-primary" />}
        descricao={`${total} cliente(s) cadastrado(s)${somenteAtivos ? " (ativos)" : ""}`}
        resumoMobile={`${total} cliente(s)${somenteAtivos ? " ativos" : ""}`}
        acoes={
          hasPerm(user, PERM_CLIENTES_CRIAR) ? (
            <Button onClick={() => setOpenNovo(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Novo cliente
            </Button>
          ) : undefined
        }
      />

      {avisoDono && (
        <Card className="border-amber-500/50 bg-amber-500/5">
          <CardContent className="py-3 text-sm">{avisoDono}</CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                placeholder="CNPJ, razão social ou nome fantasia..."
                className="pl-8"
              />
            </div>
            <Select value={empresa} onValueChange={(v) => { setEmpresa(v); setPage(1); }}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas empresas</SelectItem>
                <SelectItem value="INPLASTIC">INPLASTIC</SelectItem>
                <SelectItem value="TAOPLAST">TAOPLAST</SelectItem>
                <SelectItem value="LICITAPLAS">LICITAPLAS</SelectItem>
              </SelectContent>
            </Select>
            {isAdmin && (
              <Select value={vendedorId} onValueChange={(v) => { setVendedorId(v); setPage(1); }}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Vendedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos vendedores</SelectItem>
                  {(vendedoresQ.data ?? []).map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={somenteAtivos} onCheckedChange={(c) => { setSomenteAtivos(c); setPage(1); }} />
              Somente ativos
            </label>
          </div>

          <TabelaResponsiva
            mobile={
              clientesQ.isLoading ? (
                <VazioLista icone={<Loader2 className="animate-spin" />} titulo="Carregando..." />
              ) : rows.length === 0 ? (
                <VazioLista
                  icone={<Building2 />}
                  titulo="Nenhum cliente encontrado"
                  dica={qDeb || empresa !== "all" || (isAdmin && vendedorId !== "all") ? "Tente limpar os filtros" : undefined}
                />
              ) : (
                rows.map((c) => {
                  const vend = c.vendedor_id ? vendedorById.get(c.vendedor_id) : null;
                  const nomeFantasia = displayValue(c.nome_fantasia, "");
                  return (
                    <LinhaLista
                      key={c.id}
                      titulo={nomeFantasia || c.razao_social}
                      subtitulo={juntarCampos(
                        formatDocumentoCliente(c),
                        [c.cidade, c.estado].filter(Boolean).join("/"),
                      )}
                      selo={
                        c.empresa_padrao ? (
                          <Badge variant="outline" className={EMPRESA_BADGE[c.empresa_padrao] ?? ""}>
                            {c.empresa_padrao}
                          </Badge>
                        ) : undefined
                      }
                      abaixo={
                        (isAdmin && vend) || !c.ativo ? (
                          <>
                            {isAdmin && vend && <span className="text-muted-foreground">{vend.name}</span>}
                            {!c.ativo && <Badge variant="outline">Inativo</Badge>}
                          </>
                        ) : undefined
                      }
                      onClick={() => navigate({ to: "/clientes/$id", params: { id: c.id } })}
                    />
                  );
                })
              )
            }
          >
          <div className="overflow-x-auto border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Razão social</TableHead>
                  <TableHead>Nome fantasia</TableHead>
                  <TableHead>Cidade/UF</TableHead>
                  <TableHead>Empresa</TableHead>
                  {isAdmin && <TableHead>Vendedor</TableHead>}
                  <TableHead>Última atividade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientesQ.isLoading && (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-8">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Carregando...
                    </TableCell>
                  </TableRow>
                )}
                {!clientesQ.isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-10">
                      <div className="flex flex-col items-center gap-3">
                        <Building2 className="h-10 w-10 text-muted-foreground/50" />
                        <div className="text-sm text-muted-foreground">
                          {qDeb || empresa !== "all" || (isAdmin && vendedorId !== "all")
                            ? "Nenhum cliente encontrado com os filtros aplicados."
                            : "Você ainda não tem clientes cadastrados."}
                        </div>
                        {!qDeb && empresa === "all" && (!isAdmin || vendedorId === "all") && (
                          <Button onClick={() => setOpenNovo(true)} className="gap-2">
                            <Plus className="h-4 w-4" /> Cadastrar primeiro cliente
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((c) => {
                  const vend = c.vendedor_id ? vendedorById.get(c.vendedor_id) : null;
                  return (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer hover:bg-accent/40"
                      onClick={() => navigate({ to: "/clientes/$id", params: { id: c.id } })}
                    >
                      <TableCell className="font-mono text-xs">{formatDocumentoCliente(c)}</TableCell>
                      <TableCell className="font-medium">
                        {c.razao_social}
                        {!c.ativo && <Badge variant="outline" className="ml-2">Inativo</Badge>}
                      </TableCell>
                      <TableCell>{displayValue(c.nome_fantasia)}</TableCell>
                      <TableCell>{[c.cidade, c.estado].filter(Boolean).join("/") || "—"}</TableCell>
                      <TableCell>
                        {c.empresa_padrao ? (
                          <Badge variant="outline" className={EMPRESA_BADGE[c.empresa_padrao] ?? ""}>
                            {c.empresa_padrao}
                          </Badge>
                        ) : "—"}
                      </TableCell>
                      {isAdmin && (
                        <TableCell>
                          {vend ? (
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
                                style={{ background: vend.avatarColor }}>
                                {vend.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                              </div>
                              <span className="text-sm">{vend.name}</span>
                            </div>
                          ) : "—"}
                        </TableCell>
                      )}
                      <TableCell className="text-sm text-muted-foreground">
                        {relativeTimeShort(c.atualizado_em)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          </TabelaResponsiva>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Página {page} de {totalPages}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Próxima</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <NovoClienteDialog
        open={openNovo}
        onOpenChange={setOpenNovo}
        onClienteCriado={(c) => navigate({ to: "/clientes/$id", params: { id: c.id } })}
      />
    </div>
  );
}

// util
import { useEffect } from "react";
function useDebounceEffect(fn: () => void, delay: number, deps: unknown[]) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(fn, delay);
    return () => clearTimeout(t);
  }, deps);
}
