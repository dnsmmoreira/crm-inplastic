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

const SALDO_BAIXO = 100;

function EstoquePage() {
  const products = useCrm((s) => s.products);
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [q, setQ] = useState("");
  const [saldos, setSaldos] = useState<Record<string, number>>({});
  const [editing, setEditing] = useState<{ produtoId: string; nome: string; saldo: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("produtos").select("id, estoque_atual");
    if (error) {
      console.error(error);
      return;
    }
    const map: Record<string, number> = {};
    for (const row of data ?? []) map[row.id] = Number(row.estoque_atual) || 0;
    setSaldos(map);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products
      .filter((p) => p.active && (!term || p.sku.toLowerCase().includes(term) || p.name.toLowerCase().includes(term)))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [products, q]);

  async function salvar() {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase
      .from("produtos")
      .update({ estoque_atual: Number(editing.saldo) || 0 })
      .eq("id", editing.produtoId);
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
            Saldo único por produto. Baixa automática a cada pedido.{" "}
            {isAdmin ? "Entrada manual pelo administrador." : "Consulta somente leitura."}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Produtos ativos</CardTitle>
            <CardDescription>{rows.length} item(ns) · alerta abaixo de {SALDO_BAIXO}</CardDescription>
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
                  const saldo = saldos[p.id] ?? 0;
                  const zerado = saldo <= 0;
                  const baixo = !zerado && saldo < SALDO_BAIXO;
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
                            onClick={() => setEditing({ produtoId: p.id, nome: p.name, saldo: String(saldo) })}
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
          <div className="grid gap-2">
            <Label htmlFor="saldo">Saldo atual</Label>
            <Input
              id="saldo"
              type="number"
              value={editing?.saldo ?? ""}
              onChange={(e) => setEditing((s) => (s ? { ...s, saldo: e.target.value } : s))}
            />
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
