import { useState } from "react";
import { Sparkles, Loader2, Wand2, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ModoIA = "corrigir" | "sugerir";

export function IAButton({
  disabled,
  loading,
  onAcao,
}: {
  disabled?: boolean;
  loading?: boolean;
  onAcao: (modo: ModoIA) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          disabled={disabled || loading}
          title="Apoio de IA"
          aria-label="Apoio de IA para escrever"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-64 p-1">
        <button
          type="button"
          className="flex w-full items-start gap-2 rounded-md p-2 text-left hover:bg-muted"
          onClick={() => {
            setOpen(false);
            onAcao("corrigir");
          }}
        >
          <Wand2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <span>
            <span className="block text-xs font-medium">Corrigir meu texto</span>
            <span className="block text-[11px] text-muted-foreground">
              Ortografia e clareza, sem mudar o sentido.
            </span>
          </span>
        </button>
        <button
          type="button"
          className="flex w-full items-start gap-2 rounded-md p-2 text-left hover:bg-muted"
          onClick={() => {
            setOpen(false);
            onAcao("sugerir");
          }}
        >
          <MessageSquarePlus className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <span>
            <span className="block text-xs font-medium">Sugerir resposta</span>
            <span className="block text-[11px] text-muted-foreground">
              Lê a conversa e propõe um próximo passo.
            </span>
          </span>
        </button>
        <p className="border-t px-2 py-1.5 text-[10px] text-muted-foreground">
          Nada é enviado automaticamente — você revisa antes.
        </p>
      </PopoverContent>
    </Popover>
  );
}

export function IAPreview({
  texto,
  onUsar,
  onDescartar,
}: {
  texto: string;
  onUsar: () => void;
  onDescartar: () => void;
}) {
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-2">
      <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
        <Sparkles className="h-3 w-3" /> Sugestão da IA
      </div>
      <p className="whitespace-pre-wrap text-xs">{texto}</p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" className="h-7 text-xs" onClick={onUsar}>
          Usar
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onDescartar}>
          Descartar
        </Button>
      </div>
    </div>
  );
}
