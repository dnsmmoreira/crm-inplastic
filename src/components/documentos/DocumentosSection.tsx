import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CATEGORIAS_DOCUMENTO,
  categoriaLabel,
  ehDocumentoVencido,
  formatarTamanho,
  validarCategoria,
  type EntidadeDocumento,
} from "@/lib/documentos";
import { CATEGORIAS_COMPROVACAO } from "@/lib/entrega-comprovacao";
import {
  listarDocumentos,
  obterUrlDownload,
  arquivarDocumento,
} from "@/lib/documentos.functions";
import { chaveDocumentos, useUploadDocumento } from "@/components/documentos/useUploadDocumento";

type Props = {
  entidadeTipo: EntidadeDocumento;
  entidadeId: string;
  readOnly?: boolean;
};

export function DocumentosSection({ entidadeTipo, entidadeId, readOnly }: Props) {
  const qc = useQueryClient();
  const listFn = useServerFn(listarDocumentos);
  const downloadFn = useServerFn(obterUrlDownload);
  const arquivarFn = useServerFn(arquivarDocumento);
  const { enviando, enviar } = useUploadDocumento(entidadeTipo, entidadeId);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [categoria, setCategoria] = useState<string>("contrato_social");
  const [categoriaOutro, setCategoriaOutro] = useState("");
  const [baixandoId, setBaixandoId] = useState<string | null>(null);

  // Categorias de comprovação de entrega só fazem sentido em pedido.
  const categorias = useMemo(
    () =>
      CATEGORIAS_DOCUMENTO.filter(
        (c) =>
          entidadeTipo === "pedido" ||
          !(CATEGORIAS_COMPROVACAO as readonly string[]).includes(c.value),
      ),
    [entidadeTipo],
  );

  const key = chaveDocumentos(entidadeTipo, entidadeId);
  const q = useQuery({
    queryKey: key,
    queryFn: () => listFn({ data: { entidadeTipo, entidadeId } }),
    enabled: !!entidadeId,
  });

  const refetch = () => qc.invalidateQueries({ queryKey: key });

  const handleFile = async (file: File) => {
    const erro = validarCategoria(categoria, categoriaOutro);
    if (erro) {
      toast.error(erro);
      return;
    }
    try {
      await enviar(file, categoria, categoriaOutro);
      toast.success("Documento anexado");
      setCategoriaOutro("");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar documento");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const baixar = async (id: string) => {
    setBaixandoId(id);
    try {
      const { url } = await downloadFn({ data: { documentoId: id } });
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar link de download");
    } finally {
      setBaixandoId(null);
    }
  };

  const remover = async (id: string) => {
    if (!window.confirm("Remover este documento?")) return;
    try {
      await arquivarFn({ data: { documentoId: id } });
      toast.success("Documento removido");
      await refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao remover documento");
    }
  };

  const docs = q.data ?? [];
  const agora = new Date();

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Categoria</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categorias.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {categoria === "outro" && (
            <div className="space-y-1">
              <Label className="text-xs">Nome do documento</Label>
              <Input
                className="w-56"
                value={categoriaOutro}
                onChange={(e) => setCategoriaOutro(e.target.value)}
                placeholder="Ex.: Procuração"
              />
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <Button
            variant="outline"
            disabled={enviando}
            onClick={() => inputRef.current?.click()}
          >
            {enviando ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Anexar documento
          </Button>
        </div>
      )}

      {q.isLoading ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          <Loader2 className="inline h-4 w-4 animate-spin mr-2" /> Carregando...
        </div>
      ) : docs.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Nenhum documento anexado.
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => {
            const vencido = ehDocumentoVencido(d.expira_em, agora);
            return (
              <div
                key={d.id}
                className="flex items-center gap-3 rounded-md border p-3 text-sm"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{d.nome_arquivo}</span>
                    <Badge variant="outline">
                      {categoriaLabel(d.categoria, d.categoria_outro)}
                    </Badge>
                    {vencido && <Badge variant="destructive">Vencido</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {d.enviado_por_nome ? `${d.enviado_por_nome} • ` : ""}
                    {format(new Date(d.enviado_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                    {d.expira_em
                      ? ` • expira em ${format(new Date(d.expira_em), "dd/MM/yyyy", { locale: ptBR })}`
                      : ""}
                    {d.tamanho_bytes ? ` • ${formatarTamanho(d.tamanho_bytes)}` : ""}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={baixandoId === d.id}
                  onClick={() => void baixar(d.id)}
                >
                  {baixandoId === d.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                </Button>
                {!readOnly && (
                  <Button variant="ghost" size="sm" onClick={() => void remover(d.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
