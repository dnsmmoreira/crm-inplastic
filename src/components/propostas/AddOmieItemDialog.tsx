import { useEffect, useMemo, useState } from "react";
import { Search, Plus, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatBRL } from "@/lib/crm-store";

type OmieProduto = {
  codigo_produto: number;
  codigo: string;
  descricao: string;
  descricao_familia: string | null;
  unidade: string | null;
  valor_unitario: number;
};

export type AddOmieItemPayload = {
  omieCodigoProduto: number;
  description: string;
  sku: string;
  unit: string;
  unitPrice: number;
  quantity: number;
};

export function AddOmieItemDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAdd: (payload: AddOmieItemPayload) => void;
}) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [rows, setRows] = useState<OmieProduto[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<OmieProduto | null>(null);
  const [qty, setQty] = useState<number | "">(1);
  const [price, setPrice] = useState<number | "">("");
  const [catalogEmpty, setCatalogEmpty] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      let query = supabase
        .from("produtos_omie")
        .select("codigo_produto, codigo, descricao, descricao_familia, unidade, valor_unitario")
        .eq("inativo", false)
        .eq("bloqueado", false)
        .order("descricao")
        .limit(20);
      if (debounced) {
        query = query.or(`descricao.ilike.%${debounced}%,codigo.ilike.%${debounced}%`);
      }
      const { data, error } = await query;
      if (cancelled) return;
      if (error) {
        toast.error("Falha ao buscar catálogo Omie", { description: error.message });
        setRows([]);
      } else {
        setRows((data ?? []) as OmieProduto[]);
        if (!debounced && (data ?? []).length === 0) setCatalogEmpty(true);
        else setCatalogEmpty(false);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, debounced]);

  useEffect(() => {
    if (!open) {
      setQ("");
      setDebounced("");
      setSelected(null);
      setQty(1);
      setPrice("");
    }
  }, [open]);

  const canAdd = useMemo(
    () => selected && Number(qty) > 0 && Number(price) >= 0,
    [selected, qty, price],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" /> Adicionar produto do catálogo Omie
          </DialogTitle>
          <DialogDescription>
            Só produtos ativos do Omie podem virar pedido. Se algo não aparece, é porque não está no Omie ainda.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            autoFocus
            placeholder="Buscar por descrição ou código Omie..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          {catalogEmpty && (
            <div className="flex items-start gap-2 rounded border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <div>
                Catálogo Omie ainda não sincronizado. Aguarde a próxima sincronização ou peça ao admin
                para rodar manualmente.
              </div>
            </div>
          )}

          <div className="max-h-72 overflow-y-auto rounded border divide-y">
            {loading && <div className="p-4 text-sm text-muted-foreground">Buscando...</div>}
            {!loading && rows.length === 0 && !catalogEmpty && (
              <div className="p-4 text-sm text-muted-foreground">Nenhum produto encontrado.</div>
            )}
            {rows.map((r) => (
              <button
                key={r.codigo_produto}
                type="button"
                onClick={() => {
                  setSelected(r);
                  setPrice(Number(r.valor_unitario ?? 0));
                }}
                className={`w-full text-left px-3 py-2 hover:bg-muted/50 ${
                  selected?.codigo_produto === r.codigo_produto ? "bg-primary/5" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{r.codigo}</span>
                  <span className="font-medium truncate">{r.descricao}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.unidade ?? "Un"} · {r.descricao_familia ?? "sem família"} ·{" "}
                  {formatBRL(Number(r.valor_unitario ?? 0))}
                </div>
              </button>
            ))}
          </div>

          {selected && (
            <div className="grid grid-cols-2 gap-3 rounded border p-3 bg-muted/30">
              <div className="col-span-2 text-sm">
                <span className="font-mono text-xs text-muted-foreground mr-2">{selected.codigo}</span>
                <span className="font-medium">{selected.descricao}</span>
              </div>
              <div>
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min={1}
                  step="1"
                  value={qty}
                  onChange={(e) => setQty(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
              <div>
                <Label>Valor unitário (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!canAdd}
            className="gap-2"
            onClick={() => {
              if (!selected) return;
              onAdd({
                omieCodigoProduto: selected.codigo_produto,
                description: selected.descricao,
                sku: selected.codigo,
                unit: selected.unidade ?? "Un",
                unitPrice: Number(price === "" ? selected.valor_unitario : price),
                quantity: Number(qty === "" ? 1 : qty),
              });
              onOpenChange(false);
            }}
          >
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
