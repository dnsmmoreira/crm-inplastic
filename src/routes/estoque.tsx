import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Boxes, Pencil } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCrm } from "@/lib/crm-store";
import { useAuth } from "@/hooks/use-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/estoque")({
  head: () => ({
    meta: [
      { title: "Estoque — CRM" },
      { name: "description", content: "Consulta de saldo em estoque por produto, com alerta de saldo baixo." },
      { property: "og:title", content: "Estoque — CRM" },
      { property: "og:description", content: "Consulta de saldo em estoque por produto, com alerta de saldo baixo." },
    ],
  }),
  component: EstoquePage,
});

type EstoqueRow = {
  id: string;
  produto_id: string;
  deposito: string;
  saldo: number;
  saldo_minimo: number;
  atualizado_em: string;
};

function EstoquePage() {
  const products = useCrm((s) => s.products);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [q, setQ] = useState("");
  const [estoque, setEstoque] = useState<EstoqueRow[]>([]);
  const [editing, setEditing] = useState<{ produtoId: string; nome: string; saldo: string; minimo: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("produto_estoque")
      .select("id, produto_id, deposito, saldo, saldo_minimo, atualizado_em");
    if (error) {
      console.error(error);
      return;
    }
    setEstoque((data ?? []) as EstoqueRow[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byProduto = useMemo(() => {
    const map = new Map<string, { saldo: number; minimo: number }>();
    for (const e of estoque) {
      const cur = map.get(e.produto_id) ?? { saldo: 0, minimo: Number(e.saldo_minimo) || 10 };
      cur.saldo += Number(e.saldo) || 0;
      map.set(e.produto_id, cur);
    }
    return map;
  }, [estoque]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products
      .filter((p) => p.active && (!term || p.sku.toLowerCase().includes(term) || p.name.toLowerCase().includes(term)))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [products, q]);

  async function salvar() {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase.from("produto_estoque").upsert(
      {
        produto_id: editing.produtoId,
        deposito: "Principal",
        saldo: Number(editing.saldo) || 0,
        saldo_minimo: Number(editing.minimo) || 0,
        origem: "manual",
        atualizado_por: user?.id ?? null,
      },
      { onConflict: "produto_id,deposito" },
    );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Saldo atualizado.");
    setEditing(null);
    void load();
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Boxes className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold">Estoque</h1>
          <p className="text-sm text-muted-foreground">
            Saldo por produto. {isAdmin ? "Atualização manual pelo administrador." : "Consulta somente leitura."}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Produtos ativos</CardTitle>
            <CardDescription>{rows.length} item(ns)</CardDescription>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por SKU ou nome"
              className="pl-9 sm:w-64"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">SKU</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead className="w-28">Unidade</TableHead>
                <TableHead className="w-40 text-right">Saldo</TableHead>
                {isAdmin && <TableHead className="w-20" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 5 : 4} className="py-10 text-center text-sm text-muted-foreground">
                    Nenhum produto encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((p) => {
                  const info = byProduto.get(p.id);
                  const saldo = info?.saldo ?? 0;
                  const minimo = info?.minimo ?? 10;
                  const zerado = saldo <= 0;
                  const baixo = !zerado && saldo <= minimo;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">{p.unit}</TableCell>
                      <TableCell className="text-right">
                        {zerado ? (
                          <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
                            Zerado
                          </Badge>
                        ) : baixo ? (
                          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-600">
                            {saldo} · baixo
                          </Badge>
                        ) : (
                          <span className="font-medium">{saldo}</span>
                        )}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setEditing({
                                produtoId: p.id,
                                nome: p.name,
                                saldo: String(saldo),
                                minimo: String(minimo),
                              })
                            }
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atualizar saldo — {editing?.nome}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="saldo">Saldo atual</Label>
              <Input
                id="saldo"
                type="number"
                value={editing?.saldo ?? ""}
                onChange={(e) => setEditing((s) => (s ? { ...s, saldo: e.target.value } : s))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="minimo">Alerta de saldo baixo (mínimo)</Label>
              <Input
                id="minimo"
                type="number"
                value={editing?.minimo ?? ""}
                onChange={(e) => setEditing((s) => (s ? { ...s, minimo: e.target.value } : s))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void salvar()} disabled={saving}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
