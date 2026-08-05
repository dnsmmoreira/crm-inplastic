import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search, Tags } from "lucide-react";
import { useCrm, formatBRL } from "@/lib/crm-store";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/tabela-precos")({
  head: () => ({
    meta: [
      { title: "Tabela de Preços — CRM" },
      { name: "description", content: "Consulta rápida de preços dos produtos ativos do catálogo." },
      { property: "og:title", content: "Tabela de Preços — CRM" },
      { property: "og:description", content: "Consulta rápida de preços dos produtos ativos do catálogo." },
    ],
  }),
  component: TabelaPrecosPage,
});

type SortKey = "nome_asc" | "nome_desc" | "preco_asc" | "preco_desc";

function TabelaPrecosPage() {
  const products = useCrm((s) => s.products);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("nome_asc");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = products.filter(
      (p) =>
        p.active &&
        (!term || p.sku.toLowerCase().includes(term) || p.name.toLowerCase().includes(term)),
    );
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sort) {
        case "nome_desc":
          return b.name.localeCompare(a.name, "pt-BR");
        case "preco_asc":
          return (a.defaultPrice ?? 0) - (b.defaultPrice ?? 0);
        case "preco_desc":
          return (b.defaultPrice ?? 0) - (a.defaultPrice ?? 0);
        default:
          return a.name.localeCompare(b.name, "pt-BR");
      }
    });
    return sorted;
  }, [products, q, sort]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Tags className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold">Tabela de Preços</h1>
          <p className="text-sm text-muted-foreground">Consulta somente leitura dos produtos ativos.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Produtos ativos</CardTitle>
            <CardDescription>{rows.length} item(ns)</CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por SKU ou nome"
                className="pl-9 sm:w-64"
              />
            </div>
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nome_asc">Nome (A-Z)</SelectItem>
                <SelectItem value="nome_desc">Nome (Z-A)</SelectItem>
                <SelectItem value="preco_asc">Preço (menor primeiro)</SelectItem>
                <SelectItem value="preco_desc">Preço (maior primeiro)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">SKU</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="w-28">Unidade</TableHead>
                <TableHead className="w-40 text-right">Preço</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-sm text-muted-foreground">
                    Nenhum produto encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.unit}</TableCell>
                    <TableCell className="text-right font-medium">{formatBRL(p.defaultPrice ?? 0)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
