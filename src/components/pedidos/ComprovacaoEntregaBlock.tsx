import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Camera,
  CheckCircle2,
  FileText,
  Loader2,
  PackageCheck,
  Upload,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  CATEGORIAS_COMPROVACAO,
  CATEGORIA_COMPROVACAO_LABEL,
  comprovacaoCompleta,
  dataEntregaValida,
  recebidoPorValido,
  temCategoria,
  type CategoriaComprovacao,
} from "@/lib/entrega-comprovacao";
import { listarDocumentos, obterUrlDownload } from "@/lib/documentos.functions";
import {
  chaveDocumentos,
  useUploadDocumento,
} from "@/components/documentos/useUploadDocumento";
import { confirmarEntregaComprovada, type PedidoDetalhes } from "@/lib/pedidos.functions";

const ACEITE: Record<CategoriaComprovacao, string> = {
  foto_entrega: "image/*",
  canhoto_nf: "image/*,application/pdf",
  comprovante_entrega: "image/*,application/pdf",
};

/** ISO curto (yyyy-MM-dd) para o input date. */
function hojeInput(): string {
  return format(new Date(), "yyyy-MM-dd");
}

export function ComprovacaoEntregaBlock({
  pedido,
  onChanged,
}: {
  pedido: PedidoDetalhes;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listarDocumentos);
  const confirmarFn = useServerFn(confirmarEntregaComprovada);

  const docsQ = useQuery({
    queryKey: chaveDocumentos("pedido", pedido.id),
    queryFn: () => listFn({ data: { entidadeTipo: "pedido", entidadeId: pedido.id } }),
    enabled: !!pedido.id,
  });

  const docs = useMemo(() => docsQ.data ?? [], [docsQ.data]);
  const comprovacao = useMemo(() => comprovacaoCompleta(docs), [docs]);

  const anexosComprovacao = useMemo(
    () =>
      docs.filter((d) =>
        (CATEGORIAS_COMPROVACAO as readonly string[]).includes(d.categoria),
      ),
    [docs],
  );

  const [entregueEm, setEntregueEm] = useState(hojeInput);
  const [recebidoPor, setRecebidoPor] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const camposOk =
    recebidoPorValido(recebidoPor) && dataEntregaValida(new Date(entregueEm).toISOString());
  const podeConfirmar = comprovacao.ok && camposOk && pedido.pode_comprovar_entrega;

  async function confirmar() {
    setSalvando(true);
    try {
      const res = await confirmarFn({
        data: {
          pedido_id: pedido.id,
          entregue_em: new Date(`${entregueEm}T12:00:00`).toISOString(),
          entrega_recebida_por: recebidoPor.trim(),
          observacao: observacao.trim() || null,
        },
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      toast.success("Entrega comprovada");
      onChanged();
      void qc.invalidateQueries({ queryKey: chaveDocumentos("pedido", pedido.id) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao confirmar a entrega");
    } finally {
      setSalvando(false);
    }
  }

  /* ------------------------------- comprovado ------------------------------ */
  if (pedido.entrega_comprovada_em) {
    return (
      <section id="comprovacao-entrega" className="space-y-3 scroll-mt-4">
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <div className="text-sm">
              <div className="font-medium text-emerald-700 dark:text-emerald-300">
                Entrega comprovada
                {pedido.entregue_em
                  ? ` em ${format(new Date(pedido.entregue_em), "dd/MM/yyyy", { locale: ptBR })}`
                  : ""}
              </div>
              <div className="text-xs text-muted-foreground">
                Recebida por {pedido.entrega_recebida_por ?? "—"}
                {pedido.entrega_confirmada_por_nome
                  ? ` · confirmada por ${pedido.entrega_confirmada_por_nome}`
                  : ""}
              </div>
              {pedido.entrega_observacao && (
                <div className="mt-1 whitespace-pre-wrap text-xs">{pedido.entrega_observacao}</div>
              )}
            </div>
          </div>
          {anexosComprovacao.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {anexosComprovacao.map((d) => (
                <AnexoPreview
                  key={d.id}
                  id={d.id}
                  nome={d.nome_arquivo}
                  contentType={d.content_type}
                  categoria={d.categoria}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  /* ------------------------------ a comprovar ------------------------------ */
  return (
    <section id="comprovacao-entrega" className="space-y-3 scroll-mt-4">
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 space-y-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm font-medium text-amber-700 dark:text-amber-300">
            Anexe a foto e o documento que comprovam a entrega para encerrar este pedido.
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {CATEGORIAS_COMPROVACAO.map((cat) => (
            <UploadArea
              key={cat}
              pedidoId={pedido.id}
              categoria={cat}
              anexado={temCategoria(docs, cat)}
              readOnly={!pedido.pode_comprovar_entrega}
            />
          ))}
        </div>

        <ul className="space-y-1 text-xs">
          <ItemChecklist ok={temCategoria(docs, "foto_entrega")} label="Foto da entrega" />
          <ItemChecklist
            ok={temCategoria(docs, "canhoto_nf", "comprovante_entrega")}
            label="Canhoto da NF assinado ou comprovante / recibo"
          />
        </ul>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">Data da entrega</Label>
            <Input
              type="date"
              value={entregueEm}
              max={hojeInput()}
              onChange={(e) => setEntregueEm(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Recebido por</Label>
            <Input
              value={recebidoPor}
              onChange={(e) => setRecebidoPor(e.target.value)}
              placeholder="Nome de quem recebeu"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Observação (opcional)</Label>
          <Textarea
            rows={2}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: entrega feita na portaria, 2 volumes."
          />
        </div>

        <Button
          className="w-full sm:w-auto gap-2"
          disabled={!podeConfirmar || salvando}
          onClick={() => void confirmar()}
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
          Confirmar entrega
        </Button>
        {!pedido.pode_comprovar_entrega && (
          <p className="text-xs text-muted-foreground">
            Somente a operação (ou quem movimenta pedidos) pode confirmar a entrega.
          </p>
        )}
      </div>
    </section>
  );
}

function ItemChecklist({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li
      className={cn(
        "flex items-center gap-1.5",
        ok ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground",
      )}
    >
      <CheckCircle2 className={cn("h-3.5 w-3.5", !ok && "opacity-40")} />
      {label}
    </li>
  );
}

function UploadArea({
  pedidoId,
  categoria,
  anexado,
  readOnly,
}: {
  pedidoId: string;
  categoria: CategoriaComprovacao;
  anexado: boolean;
  readOnly?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { enviando, enviar } = useUploadDocumento("pedido", pedidoId);

  async function onFile(file: File) {
    try {
      await enviar(file, categoria);
      toast.success(`${CATEGORIA_COMPROVACAO_LABEL[categoria]} anexado`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar o anexo");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div
      className={cn(
        "rounded-md border border-dashed p-3 text-center space-y-2 bg-background/60",
        anexado && "border-emerald-500/50",
      )}
    >
      <div className="flex items-center justify-center gap-1.5 text-xs font-medium">
        {categoria === "foto_entrega" ? (
          <Camera className="h-3.5 w-3.5" />
        ) : (
          <FileText className="h-3.5 w-3.5" />
        )}
        {CATEGORIA_COMPROVACAO_LABEL[categoria]}
      </div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={ACEITE[categoria]}
        {...(categoria === "foto_entrega" ? { capture: "environment" as const } : {})}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />
      <Button
        variant={anexado ? "outline" : "secondary"}
        size="sm"
        className="w-full gap-1.5"
        disabled={enviando || readOnly}
        onClick={() => inputRef.current?.click()}
      >
        {enviando ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : anexado ? (
          <CheckCircle2 className="h-3.5 w-3.5" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        {anexado ? "Anexado — enviar outro" : "Anexar"}
      </Button>
    </div>
  );
}

/** Miniatura (imagens) ou link (PDF) de um anexo já comprovado. */
function AnexoPreview({
  id,
  nome,
  contentType,
  categoria,
}: {
  id: string;
  nome: string;
  contentType: string | null;
  categoria: string;
}) {
  const downloadFn = useServerFn(obterUrlDownload);
  const [url, setUrl] = useState<string | null>(null);
  const ehImagem = (contentType ?? "").startsWith("image/");

  useEffect(() => {
    let vivo = true;
    if (!ehImagem) return;
    void downloadFn({ data: { documentoId: id } })
      .then((r) => {
        if (vivo) setUrl(r.url);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [id, ehImagem, downloadFn]);

  const abrir = async () => {
    try {
      const { url: u } = await downloadFn({ data: { documentoId: id } });
      window.open(u, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao abrir o anexo");
    }
  };

  const rotulo =
    CATEGORIA_COMPROVACAO_LABEL[categoria as CategoriaComprovacao] ?? categoria;

  return (
    <button
      type="button"
      onClick={() => void abrir()}
      title={`${rotulo} — ${nome}`}
      className="rounded-md border bg-background overflow-hidden hover:border-primary transition-colors"
    >
      {ehImagem && url ? (
        <img src={url} alt={`${rotulo}: ${nome}`} className="h-20 w-24 object-cover" />
      ) : (
        <span className="flex h-20 w-24 flex-col items-center justify-center gap-1 p-1 text-[10px] text-muted-foreground">
          <FileText className="h-4 w-4" />
          <span className="line-clamp-2 leading-tight">{rotulo}</span>
        </span>
      )}
    </button>
  );
}
