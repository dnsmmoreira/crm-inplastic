import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ListChecks, Search, ExternalLink } from "lucide-react";
import { listarPendenciasCadastro } from "@/lib/pendencias-cadastro.functions";
import { PENDENCIAS_QUERY_KEY, PENDENCIAS_STALE_MS } from "@/lib/pendencias-cadastro.query";
import { formatBRL } from "@/lib/crm-store";
import { useAuth } from "@/hooks/use-auth";
import { displayValue } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
        content: "Lista o que falta no cadastro e leva direto à tela onde se corrige.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PendenciasPage,
});

type Escopo = "meus" | "todos";

function Secao({
  id,
  titulo,
  vazio,
  children,
  innerRef,
}: {
  id: string;
  titulo: string;
  vazio: boolean;
  children: React.ReactNode;
  innerRef: (el: HTMLDivElement | null) => void;
}) {
  return (
    <Card id={id} ref={innerRef} className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="text-base">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {vazio ? (
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

function PendenciasPage() {
  const fetchPendencias = useServerFn(listarPendenciasCadastro);
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: PENDENCIAS_QUERY_KEY,
    queryFn: () => fetchPendencias(),
    staleTime: PENDENCIAS_STALE_MS,
  });

  const [escopo, setEscopo] = useState<Escopo>("todos");
  const [qLeads, setQLeads] = useState("");
  const [qProdutos, setQProdutos] = useState("");
  const [qClientes, setQClientes] = useState("");
  const [qPropostas, setQPropostas] = useState("");

  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const rolar = (id: string) =>
    refs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });

  const meuNome = user?.name ?? "";
  const soMeus = data?.isAdmin === true && escopo === "meus";
  const filtroDono = (dono: string | null) => !soMeus || (dono ?? "") === meuNome;

  const busca = (texto: string, termo: string) =>
    !termo.trim() || texto.toLowerCase().includes(termo.toLowerCase().trim());

  const leads = useMemo(
    () =>
      (data?.leads.itens ?? []).filter(
        (l) =>
          filtroDono(l.owner) &&
          busca(`${l.company ?? ""} ${l.contact_name ?? ""} ${l.owner ?? ""}`, qLeads),
      ),
    [data, qLeads, soMeus, meuNome],
  );
  const produtos = useMemo(
    () => (data?.produtos.itens ?? []).filter((p) => busca(`${p.sku} ${p.name}`, qProdutos)),
    [data, qProdutos],
  );
  const clientes = useMemo(
    () =>
      (data?.clientes.itens ?? []).filter(
        (c) =>
          filtroDono(c.vendedor) &&
          busca(`${c.razao_social ?? ""} ${c.cnpj ?? ""} ${c.vendedor ?? ""}`, qClientes),
      ),
    [data, qClientes, soMeus, meuNome],
  );
  const propostas = useMemo(
    () =>
      (data?.propostas.itens ?? []).filter(
        (p) =>
          filtroDono(p.owner) &&
          busca(`${p.number} ${p.cliente ?? ""} ${p.owner ?? ""}`, qPropostas),
      ),
    [data, qPropostas, soMeus, meuNome],
  );

  const cards = [
    { id: "sec-leads", label: "Leads sem CNPJ/cliente", valor: data?.resumo.leads ?? 0 },
    { id: "sec-produtos", label: "Produtos sem peso/dimensões", valor: data?.resumo.produtos ?? 0 },
    { id: "sec-clientes", label: "Clientes sem e-mail de NF", valor: data?.resumo.clientes ?? 0 },
    { id: "sec-propostas", label: "Rascunhos parados", valor: data?.resumo.propostas ?? 0 },
  ];

  const setRef = (id: string) => (el: HTMLDivElement | null) => {
    refs.current[id] = el;
  };

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold md:text-3xl">
            <ListChecks className="h-6 w-6 text-primary" /> Pendências de cadastro
          </h1>
          <p className="text-sm text-muted-foreground">
            O que está faltando nos cadastros — a correção é feita na tela de origem.
          </p>
        </div>
        {data?.isAdmin && (
          <div className="flex gap-2">
            <Button
              variant={escopo === "meus" ? "default" : "outline"}
              size="sm"
              onClick={() => setEscopo("meus")}
            >
              Só os meus
            </Button>
            <Button
              variant={escopo === "todos" ? "default" : "outline"}
              size="sm"
              onClick={() => setEscopo("todos")}
            >
              Todos
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => rolar(c.id)}
            className="rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
          >
            <div className="text-2xl font-semibold">{isLoading ? "…" : c.valor}</div>
            <div className="text-xs text-muted-foreground">{c.label}</div>
          </button>
        ))}
      </div>

      <Secao
        id="sec-leads"
        innerRef={setRef("sec-leads")}
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
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{displayValue(l.company)}</TableCell>
                <TableCell>{displayValue(l.contact_name)}</TableCell>
                <TableCell>
                  <Badge variant="outline">{l.stage}</Badge>
                </TableCell>
                <TableCell>{displayValue(l.owner)}</TableCell>
                <TableCell className="text-right">{l.dias_parado}</TableCell>
                <TableCell className="text-right">
                  <Link to="/leads" search={{ lead: l.id }}>
                    <Button size="sm" variant="ghost" className="gap-1">
                      Corrigir <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Secao>

      {data?.isAdmin && (
        <Secao
          id="sec-produtos"
          innerRef={setRef("sec-produtos")}
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
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {produtos.map((p) => (
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
                  <TableCell className="text-right">
                    <Link to="/produtos" search={{ editar: p.id }}>
                      <Button size="sm" variant="ghost" className="gap-1">
                        Corrigir <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Secao>
      )}

      <Secao
        id="sec-clientes"
        innerRef={setRef("sec-clientes")}
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
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {clientes.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{displayValue(c.razao_social)}</TableCell>
                <TableCell className="font-mono text-xs">{displayValue(c.cnpj)}</TableCell>
                <TableCell>{displayValue(c.vendedor)}</TableCell>
                <TableCell className="text-right">
                  <Link to="/clientes/$id" params={{ id: c.id }}>
                    <Button size="sm" variant="ghost" className="gap-1">
                      Corrigir <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Secao>

      <Secao
        id="sec-propostas"
        innerRef={setRef("sec-propostas")}
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
                  <Link to="/propostas/$id" params={{ id: p.id }}>
                    <Button size="sm" variant="ghost" className="gap-1">
                      Corrigir <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Secao>
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
