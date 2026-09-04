import { useEffect, useMemo, useState } from "react";
import { MessageSquareText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import {
  CATEGORIA_LABEL,
  aplicarVariaveisFrase,
  ordemCategoria,
} from "@/lib/frases-prontas";

type Frase = {
  id: string;
  titulo: string;
  categoria: string;
  corpo: string;
  ordem: number;
};

/**
 * Frases prontas internas: o texto é apenas COLADO no compositor para o
 * atendente revisar. Nada é enviado automaticamente e nada passa pela Meta.
 */
export function TemplatesButton({
  nome,
  empresa,
  atendente,
  onInserir,
  disabled,
  tituloBotao,
}: {
  nome?: string | null;
  empresa?: string | null;
  atendente?: string | null;
  onInserir: (texto: string) => void;
  disabled?: boolean;
  tituloBotao?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [frases, setFrases] = useState<Frase[]>([]);

  // Recarrega a cada abertura para refletir edições feitas em /frases-prontas.
  useEffect(() => {
    if (!open) return;
    void supabase
      .from("mensagem_templates")
      .select("id, titulo, categoria, corpo, ordem")
      .eq("ativo", true)
      .order("ordem", { ascending: true })
      .then(({ data }) => setFrases((data ?? []) as Frase[]));
  }, [open]);

  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtrados = frases.filter(
      (t) =>
        !q ||
        t.titulo.toLowerCase().includes(q) ||
        t.corpo.toLowerCase().includes(q) ||
        t.categoria.toLowerCase().includes(q),
    );
    const map = new Map<string, Frase[]>();
    for (const t of filtrados) {
      const arr = map.get(t.categoria) ?? [];
      arr.push(t);
      map.set(t.categoria, arr);
    }
    return [...map.entries()].sort((a, b) => ordemCategoria(a[0]) - ordemCategoria(b[0]));
  }, [frases, busca]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-9 gap-1"
          disabled={disabled}
          title={
            tituloBotao ?? "Frases prontas — o texto é colado aqui para você revisar antes de enviar"
          }
          aria-label="Frases prontas"
        >
          <MessageSquareText className="h-4 w-4" />
          Frases
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 p-0">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar frase…"
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>
        <div className="h-72 overflow-y-auto p-2">
          {grupos.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Nenhuma frase encontrada.
            </p>
          )}
          {grupos.map(([categoria, itens]) => (
            <div key={categoria} className="mb-3">
              <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {CATEGORIA_LABEL[categoria] ?? categoria}
              </p>
              <div className="space-y-1">
                {itens.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      onInserir(aplicarVariaveisFrase(t.corpo, { nome, empresa, atendente }));
                      setOpen(false);
                    }}
                    className="w-full rounded-md border p-2 text-left transition-colors hover:bg-muted"
                  >
                    <span className="block text-xs font-medium">{t.titulo}</span>
                    <span className="mt-0.5 block line-clamp-2 text-[11px] text-muted-foreground">
                      {aplicarVariaveisFrase(t.corpo, { nome, empresa, atendente })}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t px-2 py-1.5 text-[10px] text-muted-foreground">
          O texto é inserido no compositor para revisão — nada é enviado automaticamente.
        </div>
      </PopoverContent>
    </Popover>
  );
}
