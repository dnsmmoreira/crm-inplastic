import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Package, Search } from "lucide-react";
import { toast } from "sonner";
import {
  useCrm,
  useIsAdmin,
  PRODUCT_UNITS,
  formatBRL,
  type Product,
  type ProductUnit,
} from "@/lib/crm-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/produtos")({
  component: ProdutosPage,
});

const empty = {
  sku: "",
  name: "",
  description: "",
  unit: "Un" as ProductUnit,
  weightKg: 0,
  heightCm: 0,
  widthCm: 0,
  lengthCm: 0,
  ncm: "",
  defaultPrice: 0,
  active: true,
  pecasPorColuna: 1,
  family: "",
};

function ProdutosPage() {
  const products = useCrm((s) => s.products);
  const addProduct = useCrm((s) => s.addProduct);
  const updateProduct = useCrm((s) => s.updateProduct);
  const removeProduct = useCrm((s) => s.removeProduct);
  const isAdmin = useIsAdmin();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const t = q.toLowerCase().trim();
    if (!t) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(t) ||
        p.sku.toLowerCase().includes(t) ||
        p.ncm.includes(t),
    );
  }, [products, q]);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Catálogo de Produtos</h1>
          <p className="text-sm text-muted-foreground">
            Base compartilhada — usada nas propostas comerciais.
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar SKU, nome, NCM..."
              className="pl-8 w-64"
            />
          </div>
          <Button
            onClick={() => { setEditing(null); setOpen(true); }}
            className="gap-2"
          >
            <Plus className="h-4 w-4" /> Novo produto
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            {filtered.length} produto(s)
          </CardTitle>
          <CardDescription>
            {isAdmin ? "Administradores podem editar e remover." : "Apenas admins editam o catálogo."}
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Produto</TableHead>
                <TableHead>Un.</TableHead>
                <TableHead className="text-right">Peso (kg)</TableHead>
                <TableHead className="text-right">A×L×C (cm)</TableHead>
                <TableHead>NCM</TableHead>
                <TableHead className="text-right">Preço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground line-clamp-1">{p.description}</div>
                  </TableCell>
                  <TableCell>{p.unit}</TableCell>
                  <TableCell className="text-right">{p.weightKg}</TableCell>
                  <TableCell className="text-right text-xs">
                    {p.heightCm}×{p.widthCm}×{p.lengthCm}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.ncm}</TableCell>
                  <TableCell className="text-right">{formatBRL(p.defaultPrice)}</TableCell>
                  <TableCell>
                    {p.active ? (
                      <Badge variant="secondary">Ativo</Badge>
                    ) : (
                      <Badge variant="outline">Inativo</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => { setEditing(p); setOpen(true); }}
                        disabled={!isAdmin}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={!isAdmin}
                        onClick={() => {
                          if (confirm(`Remover ${p.name}?`)) {
                            removeProduct(p.id);
                            toast.success("Produto removido");
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-8">
                    Nenhum produto encontrado.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ProductDialog
        open={open}
        onOpenChange={setOpen}
        editing={editing}
        onSave={(data) => {
          if (editing) {
            updateProduct(editing.id, data);
            toast.success("Produto atualizado");
          } else {
            addProduct(data);
            toast.success("Produto criado");
          }
          setOpen(false);
        }}
      />
    </div>
  );
}

function ProductDialog({
  open, onOpenChange, editing, onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: Product | null;
  onSave: (data: Omit<Product, "id">) => void;
}) {
  const [form, setForm] = useState<Omit<Product, "id">>(empty);

  // reset when opening
  useMemoReset(open, () => setForm(editing ? { ...editing } : empty));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>Nome</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>SKU</Label>
            <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })} />
          </div>
          <div>
            <Label>NCM</Label>
            <Input value={form.ncm} onChange={(e) => setForm({ ...form, ncm: e.target.value })} placeholder="0000.00.00" />
          </div>
          <div className="col-span-2">
            <Label>Descrição</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <Label>Unidade</Label>
            <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v as ProductUnit })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRODUCT_UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Peso unitário (kg)</Label>
            <Input type="number" step="0.01" value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Altura (cm)</Label>
            <Input type="number" step="0.1" value={form.heightCm} onChange={(e) => setForm({ ...form, heightCm: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Largura (cm)</Label>
            <Input type="number" step="0.1" value={form.widthCm} onChange={(e) => setForm({ ...form, widthCm: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Comprimento (cm)</Label>
            <Input type="number" step="0.1" value={form.lengthCm} onChange={(e) => setForm({ ...form, lengthCm: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Preço unitário sugerido (R$)</Label>
            <Input type="number" step="0.01" value={form.defaultPrice} onChange={(e) => setForm({ ...form, defaultPrice: Number(e.target.value) })} />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
            <Label>Produto ativo</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => {
              if (!form.name || !form.sku) { toast.error("Nome e SKU são obrigatórios"); return; }
              onSave(form);
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// small helper hook to reset form when dialog opens
import { useEffect } from "react";
function useMemoReset(trigger: boolean, fn: () => void) {
  useEffect(() => { if (trigger) fn(); }, [trigger]);
}
