import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { enviarTemplateConversa, listarTemplatesAprovados } from "@/lib/canais.functions";
import { aplicarVariaveis } from "@/lib/whatsapp-template";
import { preencherParamsMeta } from "@/lib/frases-prontas";

type Template = {
  name: string;
  language: string;
  category: string;
  bodyText: string;
  variaveis: number;
  exemplos: string[];
  suportado: boolean;
  motivoNaoSuportado?: string;
  tituloCrm?: string | null;
  metaMapa?: string[] | null;
};

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversaId: string;
  nomeSugerido?: string;
  empresaSugerida?: string | null;
  atendenteSugerido?: string | null;
  onEnviado: () => void;
};

export function TemplateMetaDialog({
  open,
  onOpenChange,
  conversaId,
  nomeSugerido,
  empresaSugerida,
  atendenteSugerido,
  onEnviado,
}: Props) {
  const listar = useServerFn(listarTemplatesAprovados);
  const enviar = useServerFn(enviarTemplateConversa);

  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [itens, setItens] = useState<Template[]>([]);
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<Template | null>(null);
  const [params, setParams] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSel(null);
    setBusca("");
    setCarregando(true);
    setErro(null);
    listar({ data: {} })
      .then((r) => {
        setItens(r.itens as Template[]);
        if (!r.ok) setErro(r.erro ?? "Não foi possível carregar os modelos.");
      })
      .catch((e: unknown) => setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => setCarregando(false));
  }, [open, listar]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const base = q
      ? itens.filter(
          (t) =>
            t.name.toLowerCase().includes(q) || (t.tituloCrm ?? "").toLowerCase().includes(q),
        )
      : itens;
    return {
      doCrm: base.filter((t) => t.tituloCrm),
      outros: base.filter((t) => !t.tituloCrm),
      total: base.length,
    };
  }, [itens, busca]);

  function escolher(t: Template) {
    setSel(t);
    // Modelo que nasceu de uma frase do CRM: já sabemos o que vai em cada
    // variável, então o atendente só confere e envia.
    if (t.metaMapa && t.metaMapa.length === t.variaveis) {
      setParams(
        preencherParamsMeta(t.metaMapa, {
          nome: nomeSugerido ?? null,
          empresa: empresaSugerida ?? null,
          atendente: atendenteSugerido ?? null,
        }),
      );
      return;
    }
    setParams(
      Array.from({ length: t.variaveis }, (_, i) => (i === 0 ? (nomeSugerido ?? "") : "")),
    );
  }

  const preview = sel ? aplicarVariaveis(sel.bodyText, params) : "";
  const podeEnviar =
    !!sel && sel.suportado && params.length === sel.variaveis && params.every((p) => p.trim());

  async function handleEnviar() {
    if (!sel || !podeEnviar) return;
    setEnviando(true);
    try {
      await enviar({
        data: {
          conversaId,
          templateName: sel.name,
          lang: sel.language,
          params: params.map((p) => p.trim()),
        },
      });
      toast.success("Modelo enviado");
      onOpenChange(false);
      onEnviado();
    } catch (e) {
      toast.error("Falha ao enviar modelo", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setEnviando(false);
    }
  }

  function cartao(t: Template) {
    return (
      <button
        key={`${t.name}-${t.language}`}
        type="button"
        disabled={!t.suportado}
        onClick={() => escolher(t)}
        className={cn(
          "w-full rounded-lg border p-3 text-left transition",
          t.suportado ? "hover:bg-muted" : "cursor-not-allowed opacity-60",
        )}
      >
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <BadgeCheck className="h-4 w-4 text-emerald-600" />
          {t.tituloCrm ?? t.name}
          {t.tituloCrm && (
            <span className="font-normal text-[11px] text-muted-foreground">{t.name}</span>
          )}
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
            {t.category} · {t.language}
          </span>
        </div>
        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
          {t.bodyText}
        </p>
        {!t.suportado && (
          <p className="mt-1 text-[11px] text-amber-600">
            {t.motivoNaoSuportado ?? "Não suportado no momento."}
          </p>
        )}
      </button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Modelos aprovados pela Meta</DialogTitle>
          <DialogDescription>
            Únicos textos permitidos quando a janela de 24h está encerrada.
          </DialogDescription>
        </DialogHeader>

        {carregando && (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando modelos…
          </div>
        )}

        {!carregando && erro && <p className="py-4 text-sm text-destructive">{erro}</p>}

        {!carregando && !erro && !sel && (
          <div className="space-y-3">
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar modelo pelo nome…"
            />
            <ScrollArea className="h-[320px] pr-3">
              <div className="space-y-4">
                {filtrados.doCrm.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Do CRM
                    </p>
                    {filtrados.doCrm.map(cartao)}
                  </div>
                )}
                {filtrados.outros.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Outros
                    </p>
                    {filtrados.outros.map(cartao)}
                  </div>
                )}
                {filtrados.total === 0 && (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum modelo aprovado encontrado.
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {sel && (
          <div className="space-y-3">
            <div className="text-sm font-medium">
              {sel.tituloCrm ?? sel.name}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                ({sel.category} · {sel.language})
              </span>
            </div>

            {Array.from({ length: sel.variaveis }, (_, i) => (
              <div key={i} className="space-y-1">
                <Label htmlFor={`var-${i}`} className="text-xs">
                  {sel.metaMapa?.[i] ? `Variável: ${sel.metaMapa[i]}` : `Variável {{${i + 1}}}`}
                </Label>
                <Input
                  id={`var-${i}`}
                  value={params[i] ?? ""}
                  placeholder={sel.exemplos[i] ?? `Valor para {{${i + 1}}}`}
                  onChange={(e) =>
                    setParams((prev) => {
                      const next = [...prev];
                      next[i] = e.target.value;
                      return next;
                    })
                  }
                />
              </div>
            ))}

            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="mb-1 text-[11px] font-medium uppercase text-muted-foreground">
                Prévia
              </p>
              <p className="whitespace-pre-wrap text-sm">{preview}</p>
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setSel(null)} disabled={enviando}>
                Voltar
              </Button>
              <Button onClick={() => void handleEnviar()} disabled={!podeEnviar || enviando}>
                {enviando ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-1 h-4 w-4" />
                )}
                Enviar modelo
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
