import { useEffect, useMemo, useState } from "react";
import { FileText, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";

type Template = {
  id: string;
  titulo: string;
  categoria: string;
  corpo: string;
  ordem: number;
};

const CATEGORIA_LABEL: Record<string, string> = {
  abertura: "Abertura",
  qualificacao: "Qualificação",
  proposta: "Proposta",
  "follow-up": "Follow-up",
  fechamento: "Fechamento",
  "pos-venda": "Pós-venda",
};

/** Substitui {{nome}} e {{empresa}} com os dados do lead/conversa. */
export function aplicarVariaveis(corpo: string, vars: { nome?: string | null; empresa?: string | null }) {
  return corpo
    .replaceAll("{{nome}}", (vars.nome ?? "").trim() || "tudo bem")
    .replaceAll("{{empresa}}", (vars.empresa ?? "").trim() || "sua empresa");
}

export function TemplatesButton({
  nome,
  empresa,
  onInserir,
  disabled,
}: {
  nome?: string | null;
  empresa?: string | null;
  onInserir: (texto: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);

  useEffect(() => {
    if (!open || templates.length > 0) return;
    void supabase
      .from("mensagem_templates")
      .select("id, titulo, categoria, corpo, ordem")
      .eq("ativo", true)
      .order("categoria", { ascending: true })
      .order("ordem", { ascending: true })
      .then(({ data }) => setTemplates((data ?? []) as Template[]));
  }, [open, templates.length]);

  const grupos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const filtrados = templates.filter(
      (t) =>
        !q ||
        t.titulo.toLowerCase().includes(q) ||
        t.corpo.toLowerCase().includes(q) ||
        t.categoria.toLowerCase().includes(q),
    );
    const map = new Map<string, Template[]>();
    for (const t of filtrados) {
      const arr = map.get(t.categoria) ?? [];
      arr.push(t);
      map.set(t.categoria, arr);
    }
    return [...map.entries()];
  }, [templates, busca]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" disabled={disabled} title="Modelos" aria-label="Modelos de mensagem">
          <FileText className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-80 p-0">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar modelo…"
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>
        <div className="h-72 overflow-y-auto p-2">
          {grupos.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">Nenhum modelo encontrado.</p>
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
                      onInserir(aplicarVariaveis(t.corpo, { nome, empresa }));
                      setOpen(false);
                    }}
                    className="w-full rounded-md border p-2 text-left transition-colors hover:bg-muted"
                  >
                    <span className="block text-xs font-medium">{t.titulo}</span>
                    <span className="mt-0.5 block line-clamp-2 text-[11px] text-muted-foreground">
                      {aplicarVariaveis(t.corpo, { nome, empresa })}
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
