import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ListChecks,
  Search,
  ExternalLink,
  AlertTriangle,
  RefreshCw,
  Check,
  Loader2,
  Trash2,
  ShieldOff,
} from "lucide-react";
import { listarPendenciasCadastro } from "@/lib/pendencias-cadastro.functions";
import { PENDENCIAS_QUERY_KEY, PENDENCIAS_STALE_MS } from "@/lib/pendencias-cadastro.query";
import {
  atualizarPesoProduto,
  definirDocumentoLead,
  definirEmailNfCliente,
  definirProdutoLead,
  excluirRascunhoProposta,
} from "@/lib/pendencias-correcao.functions";
import {
  dispensarComprovacaoEntrega,
  dispensarComprovacaoLegado,
} from "@/lib/pedidos.functions";
import {
  documentoValido,
  emailValido,
  mascararDocumento,
  pesoValido,
} from "@/lib/pendencias-correcao";
import { formatBRL } from "@/lib/crm-store";
import { useAuth } from "@/hooks/use-auth";
import { useFamiliasProduto } from "@/hooks/use-familias-produto";
import { displayValue } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

export const Route = createFileRoute("/pendencias")({
  head: () => ({
    meta: [
      { title: "Pendências de cadastro — CRM INPLASTIC" },
      {
        name: "description",
        content:
          "Faxina de dados: leads sem CNPJ, produtos sem peso, clientes sem e-mail de NF e propostas paradas em rascunho.",
      },
      { property: "og:title", content: "Pendências de cadastro — CRM INPLASTIC" },
      {
        property: "og:description",
        content: "Corrija o cadastro na própria linha, sem sair da tela.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PendenciasPage,
});

const TODOS = "__todos__";

function Secao({
  id,
  titulo,
  vazio,
  erro,
  acoes,
  children,
  innerRef,
}: {
  id: string;
  titulo: string;
  vazio: boolean;
  erro?: string | null;
  acoes?: React.ReactNode;
  children: React.ReactNode;
  innerRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <Card id={id} ref={innerRef} className="scroll-mt-24">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">{titulo}</CardTitle>
        {acoes}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {erro ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 text-amber-600" /> Esta seção não pôde ser
              carregada
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{erro}</p>
          </div>
        ) : vazio ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma pendência — tudo certo por aqui.
          </p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}

/** Campo de correção inline: Enter ou ✓ salvam. */
function CampoInline({
  value,
  onChange,
  onSave,
  placeholder,
  valido,
  type = "text",
  salvando,
  extra,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  placeholder?: string;
  valido: boolean;
  type?: string;
  salvando: boolean;
  extra?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        disabled={salvando}
        className={className ?? "h-8 w-40"}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && valido && !salvando) onSave();
        }}
      />
      {extra}
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8"
        title="Salvar"
        disabled={!valido || salvando}
        onClick={onSave}
      >
        {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function PendenciasPage() {
  const qc = useQueryClient();
  const fetchPendencias = useServerFn(listarPendenciasCadastro);
  const salvarPeso = useServerFn(atualizarPesoProduto);
  const salvarEmailNf = useServerFn(definirEmailNfCliente);
  const salvarDocumento = useServerFn(definirDocumentoLead);
  const salvarProdutoLead = useServerFn(definirProdutoLead);
  const excluirRascunho = useServerFn(excluirRascunhoProposta);
  const dispensarUm = useServerFn(dispensarComprovacaoEntrega);
  const dispensarLegado = useServerFn(dispensarComprovacaoLegado);

  const { user } = useAuth();
  const familias = useFamiliasProduto();

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: PENDENCIAS_QUERY_KEY,
    queryFn: () => fetchPendencias(),
    staleTime: PENDENCIAS_STALE_MS,
  });

  const [vendedor, setVendedor] = useState<string>(TODOS);
  const [qLeads, setQLeads] = useState("");
  const [qLeadsProduto, setQLeadsProduto] = useState("");
  const [qProdutos, setQProdutos] = useState("");
  const [qClientes, setQClientes] = useState("");
  const [qPropostas, setQPropostas] = useState("");
  const [qEntregas, setQEntregas] = useState("");

  /** Linhas já corrigidas nesta sessão — somem na hora. */
  const [resolvidos, setResolvidos] = useState<Set<string>>(new Set());
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [dispensaAlvo, setDispensaAlvo] = useState<{ id: string; number: string } | null>(null);
  const [dispensaMotivo, setDispensaMotivo] = useState("");

  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const rolar = (id: string) =>
    refs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });

  const recarregar = () => void qc.invalidateQueries({ queryKey: PENDENCIAS_QUERY_KEY });
  const marcarResolvido = (id: string) =>
    setResolvidos((s) => {
      const novo = new Set(s);
      novo.add(id);
      return novo;
    });
  const rascunho = (id: string) => rascunhos[id] ?? "";
  const setRascunho = (id: string, v: string) => setRascunhos((r) => ({ ...r, [id]: v }));

  /** Executa uma correção com feedback padrão e some com a linha ao dar certo. */
  async function corrigir(
    id: string,
    fn: () => Promise<{ ok: boolean; mensagem?: string } | { ok: boolean; message?: string }>,
  ) {
    setSalvandoId(id);
    try {
      const r = (await fn()) as { ok: boolean; mensagem?: string; message?: string };
      const msg = r.mensagem ?? r.message;
      if (!r.ok) {
        toast.error(msg ?? "Não foi possível salvar.");
        return;
      }
      toast.success(msg ?? "Salvo");
      marcarResolvido(id);
      recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvandoId(null);
    }
  }

  const meuNome = user?.name ?? "";
  const isAdmin = data?.isAdmin === true;
  const filtroDono = (dono: string | null) =>
    !isAdmin || vendedor === TODOS || (dono ?? "") === vendedor;

  const busca = (texto: string, termo: string) =>
    !termo.trim() || texto.toLowerCase().includes(termo.toLowerCase().trim());
  const visivel = (id: string) => !resolvidos.has(id);

  const vendedores = useMemo(() => {
    const nomes = new Set<string>();
    for (const l of data?.leads.itens ?? []) if (l.owner) nomes.add(l.owner);
    for (const l of data?.leadsProduto.itens ?? []) if (l.owner) nomes.add(l.owner);
    for (const c of data?.clientes.itens ?? []) if (c.vendedor) nomes.add(c.vendedor);
    for (const p of data?.propostas.itens ?? []) if (p.owner) nomes.add(p.owner);
    return [...nomes].sort((a, b) => a.localeCompare(b));
  }, [data]);

  const leads = useMemo(
    () =>
      (data?.leads.itens ?? []).filter(
        (l) =>
          visivel(l.id) &&
          filtroDono(l.owner) &&
          busca(`${l.company ?? ""} ${l.contact_name ?? ""} ${l.owner ?? ""}`, qLeads),
      ),
    [data, qLeads, vendedor, isAdmin, resolvidos],
  );
  const leadsProduto = useMemo(
    () =>
      (data?.leadsProduto.itens ?? []).filter(
        (l) =>
          visivel(l.id) &&
          filtroDono(l.owner) &&
          busca(`${l.company ?? ""} ${l.product ?? ""} ${l.owner ?? ""}`, qLeadsProduto),
      ),
    [data, qLeadsProduto, vendedor, isAdmin, resolvidos],
  );
  const produtos = useMemo(
    () =>
      (data?.produtos.itens ?? []).filter(
        (p) => visivel(p.id) && busca(`${p.sku} ${p.name}`, qProdutos),
      ),
    [data, qProdutos, resolvidos],
  );
  const clientes = useMemo(
    () =>
      (data?.clientes.itens ?? []).filter(
        (c) =>
          visivel(c.id) &&
          filtroDono(c.vendedor) &&
          busca(`${c.razao_social ?? ""} ${c.cnpj ?? ""} ${c.vendedor ?? ""}`, qClientes),
      ),
    [data, qClientes, vendedor, isAdmin, resolvidos],
  );
  const propostas = useMemo(
    () =>
      (data?.propostas.itens ?? []).filter(
        (p) =>
          visivel(p.id) &&
          filtroDono(p.owner) &&
          busca(`${p.number} ${p.cliente ?? ""} ${p.owner ?? ""}`, qPropostas),
      ),
    [data, qPropostas, vendedor, isAdmin, resolvidos],
  );
  const entregas = useMemo(
    () =>
      (data?.entregas.itens ?? []).filter(
        (p) =>
          visivel(p.id) &&
          busca(`${p.number} ${p.cliente ?? ""} ${p.responsavel ?? ""}`, qEntregas),
      ),
    [data, qEntregas, resolvidos],
  );

  const legadosVisiveis = entregas.filter((e) => e.legado).length;

  const cards = [
    { id: "sec-leads", label: "Leads sem CNPJ/cliente", valor: leads.length, erro: data?.leads.erro ?? null },
    {
      id: "sec-leads-produto",
      label: "Leads com produto fora do catálogo",
      valor: leadsProduto.length,
      erro: data?.leadsProduto.erro ?? null,
    },
    { id: "sec-produtos", label: "Produtos sem peso/dimensões", valor: produtos.length, erro: data?.produtos.erro ?? null },
    { id: "sec-clientes", label: "Clientes sem e-mail de NF", valor: clientes.length, erro: data?.clientes.erro ?? null },
    { id: "sec-propostas", label: "Rascunhos parados", valor: propostas.length, erro: data?.propostas.erro ?? null },
    { id: "sec-entregas", label: "Entregas sem comprovação", valor: entregas.length, erro: data?.entregas.erro ?? null },
  ];

  const setRef = (id: string) => (el: HTMLDivElement | null) => {
    refs.current[id] = el;
  };

  async function confirmarDispensa() {
    if (!dispensaAlvo) return;
    const alvo = dispensaAlvo;
    await corrigir(alvo.id, () =>
      dispensarUm({ data: { pedido_id: alvo.id, motivo: dispensaMotivo.trim() } }),
    );
    setDispensaAlvo(null);
    setDispensaMotivo("");
  }

  async function dispensarTodosLegados() {
    if (
      !confirm(
        `Dispensar a comprovação de entrega de ${legadosVisiveis} pedido(s) anteriores a 05/09/2026?`,
      )
    )
      return;
    setSalvandoId("legado");
    try {
      const r = await dispensarLegado();
      if (!r.ok) {
        toast.error(r.message ?? "Não foi possível dispensar.");
        return;
      }
      toast.success(`${r.total} pedido(s) dispensado(s)`);
      recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível dispensar.");
    } finally {
      setSalvandoId(null);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold md:text-3xl">
            <ListChecks className="h-6 w-6 text-primary" /> Pendências de cadastro
          </h1>
          <p className="text-sm text-muted-foreground">
            Corrija o que falta na própria linha — a lista se atualiza sozinha.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Select value={vendedor} onValueChange={setVendedor}>
              <SelectTrigger className="h-9 w-56">
                <SelectValue placeholder="Filtrar por vendedor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os vendedores</SelectItem>
                {meuNome && <SelectItem value={meuNome}>Só os meus ({meuNome})</SelectItem>}
                {vendedores
                  .filter((v) => v !== meuNome)
                  .map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" className="gap-1" disabled={isFetching} onClick={() => void refetch()}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      {isError && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 text-amber-600" /> Não foi possível carregar as
            pendências agora.
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 gap-1"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Tentar
            novamente
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => rolar(c.id)}
            className="rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
          >
            <div className="text-2xl font-semibold">
              {isLoading ? "…" : c.erro ? "—" : c.valor}
            </div>
            <div className="text-xs text-muted-foreground">{c.label}</div>
          </button>
        ))}
      </div>

      {/* ------------------------- leads sem CNPJ/cliente ------------------------ */}
      <Secao
        id="sec-leads"
        innerRef={setRef("sec-leads")}
        erro={data?.leads.erro}
        titulo={`Leads sem CNPJ/cliente (${leads.length})`}
        vazio={leads.length === 0}
      >
        <BuscaInput value={qLeads} onChange={setQLeads} placeholder="Buscar empresa, contato..." />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Etapa</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead className="text-right">Dias parado</TableHead>
              <TableHead>CNPJ / CPF</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((l) => {
              const valor = rascunho(`lead-doc-${l.id}`);
              return (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{displayValue(l.company)}</TableCell>
                  <TableCell>{displayValue(l.contact_name)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{l.stage}</Badge>
                  </TableCell>
                  <TableCell>{displayValue(l.owner)}</TableCell>
                  <TableCell className="text-right">{l.dias_parado}</TableCell>
                  <TableCell>
                    <CampoInline
                      value={valor}
                      onChange={(v) => setRascunho(`lead-doc-${l.id}`, mascararDocumento(v))}
                      placeholder="00.000.000/0000-00"
                      valido={!!documentoValido(valor)}
                      salvando={salvandoId === l.id}
                      className="h-8 w-44"
                      onSave={() =>
                        void corrigir(l.id, () =>
                          salvarDocumento({ data: { lead_id: l.id, documento: valor } }),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Link to="/leads" search={{ lead: l.id }}>
                      <Button size="sm" variant="ghost" className="gap-1">
                        Abrir <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Secao>

      {/* --------------------- leads com produto fora do catálogo -------------- */}
      <Secao
        id="sec-leads-produto"
        innerRef={setRef("sec-leads-produto")}
        erro={data?.leadsProduto.erro}
        titulo={`Leads com produto fora do catálogo (${leadsProduto.length})`}
        vazio={leadsProduto.length === 0}
      >
        <BuscaInput
          value={qLeadsProduto}
          onChange={setQLeadsProduto}
          placeholder="Buscar empresa, produto..."
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Produto informado</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Modelo do catálogo</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {leadsProduto.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{displayValue(l.company)}</TableCell>
                <TableCell>{displayValue(l.product)}</TableCell>
                <TableCell>{displayValue(l.owner)}</TableCell>
                <TableCell>
                  <Select
                    disabled={salvandoId === l.id}
                    value={rascunho(`lead-prod-${l.id}`)}
                    onValueChange={(v) => {
                      setRascunho(`lead-prod-${l.id}`, v);
                      const f = familias.find((x) => x.representanteId === v);
                      if (!f) return;
                      void corrigir(l.id, () =>
                        salvarProdutoLead({
                          data: { lead_id: l.id, product_id: f.representanteId, product: f.rotulo },
                        }),
                      );
                    }}
                  >
                    <SelectTrigger className="h-8 w-56">
                      <SelectValue placeholder="Selecione o modelo" />
                    </SelectTrigger>
                    <SelectContent>
                      {familias.map((f) => (
                        <SelectItem key={f.representanteId} value={f.representanteId}>
                          {f.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <Link to="/leads" search={{ lead: l.id }}>
                    <Button size="sm" variant="ghost" className="gap-1">
                      Abrir <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Secao>

      {/* ------------------------- produtos sem peso --------------------------- */}
      {isAdmin && (
        <Secao
          id="sec-produtos"
          innerRef={setRef("sec-produtos")}
          erro={data?.produtos.erro}
          titulo={`Produtos sem peso/dimensões (${produtos.length})`}
          vazio={produtos.length === 0}
        >
          <BuscaInput
            value={qProdutos}
            onChange={setQProdutos}
            placeholder="Buscar SKU ou nome..."
          />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Faltando</TableHead>
                <TableHead>Peso (kg)</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {produtos.map((p) => {
                const valor = rascunho(`peso-${p.id}`);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="space-x-1">
                      {p.faltando.map((f) => (
                        <Badge key={f} variant="outline">
                          {f}
                        </Badge>
                      ))}
                    </TableCell>
                    <TableCell>
                      <CampoInline
                        value={valor}
                        type="number"
                        placeholder="0,000"
                        className="h-8 w-28"
                        valido={pesoValido(valor)}
                        salvando={salvandoId === p.id}
                        onChange={(v) => setRascunho(`peso-${p.id}`, v)}
                        onSave={() =>
                          void corrigir(p.id, () =>
                            salvarPeso({
                              data: {
                                produto_id: p.id,
                                peso_kg: Number(valor.replace(",", ".")),
                              },
                            }),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Link to="/produtos" search={{ editar: p.id }}>
                        <Button size="sm" variant="ghost" className="gap-1">
                          Abrir <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Secao>
      )}

      {/* --------------------- clientes sem e-mail de NF ----------------------- */}
      <Secao
        id="sec-clientes"
        innerRef={setRef("sec-clientes")}
        erro={data?.clientes.erro}
        titulo={`Clientes sem e-mail de NF (${clientes.length})`}
        vazio={clientes.length === 0}
      >
        <BuscaInput
          value={qClientes}
          onChange={setQClientes}
          placeholder="Buscar razão social ou CNPJ..."
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Razão social</TableHead>
              <TableHead>CNPJ</TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead>E-mail de NF</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {clientes.map((c) => {
              const valor = rascunho(`email-${c.id}`);
              return (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{displayValue(c.razao_social)}</TableCell>
                  <TableCell className="font-mono text-xs">{displayValue(c.cnpj)}</TableCell>
                  <TableCell>{displayValue(c.vendedor)}</TableCell>
                  <TableCell>
                    <CampoInline
                      value={valor}
                      type="email"
                      className="h-8 w-56"
                      placeholder={c.email_sugerido ?? "nf@empresa.com.br"}
                      valido={emailValido(valor)}
                      salvando={salvandoId === c.id}
                      onChange={(v) => setRascunho(`email-${c.id}`, v)}
                      extra={
                        c.email_sugerido ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 whitespace-nowrap"
                            onClick={() => setRascunho(`email-${c.id}`, c.email_sugerido ?? "")}
                          >
                            Usar este
                          </Button>
                        ) : null
                      }
                      onSave={() =>
                        void corrigir(c.id, () =>
                          salvarEmailNf({ data: { cliente_id: c.id, email_nf: valor } }),
                        )
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Link to="/clientes/$id" params={{ id: c.id }}>
                      <Button size="sm" variant="ghost" className="gap-1">
                        Abrir <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Secao>

      {/* --------------------------- rascunhos parados ------------------------- */}
      <Secao
        id="sec-propostas"
        innerRef={setRef("sec-propostas")}
        erro={data?.propostas.erro}
        titulo={`Rascunhos parados há mais de 7 dias (${propostas.length})`}
        vazio={propostas.length === 0}
      >
        <BuscaInput
          value={qPropostas}
          onChange={setQPropostas}
          placeholder="Buscar número ou cliente..."
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead className="text-right">Dias parada</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {propostas.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.number}</TableCell>
                <TableCell className="font-medium">{displayValue(p.cliente)}</TableCell>
                <TableCell>{displayValue(p.owner)}</TableCell>
                <TableCell className="text-right">{p.dias_parada}</TableCell>
                <TableCell className="text-right">{formatBRL(p.total)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Link to="/propostas/$id" params={{ id: p.id }}>
                      <Button size="sm" variant="ghost" className="gap-1">
                        Abrir <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1 text-destructive"
                      disabled={salvandoId === p.id}
                      onClick={() => {
                        if (!confirm(`Excluir o rascunho ${p.number}?`)) return;
                        void corrigir(p.id, () =>
                          excluirRascunho({ data: { proposta_id: p.id } }),
                        );
                      }}
                    >
                      {salvandoId === p.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      Excluir rascunho
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Secao>

      {/* --------------------- pós-venda sem comprovação ----------------------- */}
      <Secao
        id="sec-entregas"
        innerRef={setRef("sec-entregas")}
        erro={data?.entregas.erro}
        titulo={`Pedidos em pós-venda sem comprovação de entrega (${entregas.length})`}
        vazio={entregas.length === 0}
        acoes={
          isAdmin && legadosVisiveis > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1"
              disabled={salvandoId === "legado"}
              onClick={() => void dispensarTodosLegados()}
            >
              {salvandoId === "legado" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldOff className="h-3.5 w-3.5" />
              )}
              Dispensar todos os legados ({legadosVisiveis})
            </Button>
          ) : null
        }
      >
        <BuscaInput
          value={qEntregas}
          onChange={setQEntregas}
          placeholder="Buscar pedido, cliente ou responsável..."
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pedido</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead className="text-right">Dias em pós-venda</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entregas.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">
                  {p.number}
                  {p.legado && (
                    <Badge variant="outline" className="ml-2 text-[10px]">
                      legado
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="font-medium">{displayValue(p.cliente)}</TableCell>
                <TableCell>{displayValue(p.responsavel)}</TableCell>
                <TableCell className="text-right">{p.dias_em_pos_venda}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Link to="/pedidos" search={{ pedido: p.id }}>
                      <Button size="sm" variant="ghost" className="gap-1">
                        Abrir pedido <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1"
                      disabled={salvandoId === p.id}
                      onClick={() => {
                        setDispensaAlvo({ id: p.id, number: p.number });
                        setDispensaMotivo(
                          p.legado ? "Pedido anterior à comprovação de entrega (legado)" : "",
                        );
                      }}
                    >
                      <ShieldOff className="h-3.5 w-3.5" /> Dispensar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Secao>

      <Dialog
        open={!!dispensaAlvo}
        onOpenChange={(o) => {
          if (!o) {
            setDispensaAlvo(null);
            setDispensaMotivo("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispensar comprovação — {dispensaAlvo?.number}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O pedido deixa de cobrar foto e documento da entrega. O motivo fica registrado.
          </p>
          <Textarea
            rows={3}
            value={dispensaMotivo}
            placeholder="Motivo da dispensa (mínimo de 5 caracteres)"
            onChange={(e) => setDispensaMotivo(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDispensaAlvo(null)}>
              Cancelar
            </Button>
            <Button
              disabled={dispensaMotivo.trim().length < 5 || salvandoId === dispensaAlvo?.id}
              onClick={() => void confirmarDispensa()}
            >
              Dispensar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BuscaInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative mb-3 max-w-sm">
      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-8"
      />
    </div>
  );
}
