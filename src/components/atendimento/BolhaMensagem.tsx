import { Bot, Check, FileText, User as UserIcon, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { limparOrigemAnuncio } from "@/lib/mensagem-display";
import type { Database } from "@/integrations/supabase/types";

type Mensagem = Database["public"]["Tables"]["whatsapp_mensagens"]["Row"];

function midiaObj(midia: unknown): Record<string, unknown> | null {
  return midia && typeof midia === "object" && !Array.isArray(midia)
    ? (midia as Record<string, unknown>)
    : null;
}

export function urlDaMidia(midia: unknown): string | null {
  const obj = midiaObj(midia);
  if (!obj) return null;
  for (const k of ["url", "link", "fileUrl", "imageUrl", "audioUrl", "documentUrl", "mediaUrl"]) {
    const v = obj[k];
    if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
  }
  return null;
}

function tamanhoLegivel(bytes: unknown): string | null {
  const n = typeof bytes === "number" ? bytes : Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function BolhaMensagem({ m, nomeVendedor }: { m: Mensagem; nomeVendedor?: string }) {
  const isCliente = m.autor === "cliente";
  const tipo = (m.tipo ?? "texto").toLowerCase();
  const isResumoOpa = tipo === "resumo_opa";
  const isIA = m.autor === "ia" && !isResumoOpa;
  const isReacao = tipo === "reacao" || tipo === "reaction";
  const Icon = isResumoOpa ? FileText : isIA ? Bot : UserIcon;
  const rotulo = isResumoOpa
    ? "Atendimento externo (OPA)"
    : isCliente
      ? "Cliente"
      : isIA
        ? "IA — Lucas"
        : (nomeVendedor ?? "Você");

  const midia = midiaObj(m.midia);
  const url = urlDaMidia(m.midia);
  const falhouDownload = midia?.["erro"] === "download_falhou";
  const fileName = typeof midia?.["fileName"] === "string" ? (midia["fileName"] as string) : null;
  const tamanho = tamanhoLegivel(midia?.["tamanho"]);
  const texto = limparOrigemAnuncio(m.conteudo ?? "").trim();

  const horario = new Date(m.created_at).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isReacao) {
    return (
      <div className={cn("flex", isCliente ? "justify-start" : "justify-end")}>
        <div className="rounded-full bg-muted/60 px-3 py-1 text-xs text-muted-foreground">
          {texto || "Reagiu"} · {horario}
        </div>
      </div>
    );
  }

  const ehImagem = tipo.includes("imag") || tipo === "image" || tipo === "photo";
  const ehFigurinha = tipo === "figurinha" || tipo === "sticker";
  const ehVideo = tipo === "video";
  const ehAudio = tipo.includes("audio") || tipo.includes("ptt") || tipo.includes("voice");

  return (
    <div className={cn("flex", isCliente ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          isResumoOpa
            ? "rounded-br-sm border border-dashed border-muted-foreground/50 bg-muted/40 text-muted-foreground"
            : isCliente
              ? "rounded-bl-sm bg-muted text-foreground"
              : isIA
                ? "rounded-br-sm border border-blue-500/20 bg-blue-500/10 text-blue-900 dark:text-blue-100"
                : "rounded-br-sm bg-primary text-primary-foreground",
        )}
      >
        <div className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-70">
          <Icon className="h-3 w-3" /> {rotulo}
        </div>

        {falhouDownload ? (
          <div className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-amber-900 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="text-xs">
              {texto || "Arquivo recebido, mas não foi possível baixar."}
            </span>
          </div>
        ) : url && ehFigurinha ? (
          <img src={url} alt="Figurinha" className="max-h-28 w-auto" />
        ) : url && ehImagem ? (
          <a href={url} target="_blank" rel="noreferrer">
            <img src={url} alt={texto || "Imagem recebida"} className="max-h-64 rounded-lg" />
          </a>
        ) : url && ehVideo ? (
          <video controls src={url} className="max-h-64 rounded-lg" />
        ) : url && ehAudio ? (
          <audio controls src={url} className="w-56" />
        ) : url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 underline"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>{fileName || texto || "Abrir arquivo"}</span>
            {tamanho && <span className="opacity-70">({tamanho})</span>}
          </a>
        ) : (
          <div className="whitespace-pre-wrap break-words">
            {texto || (tipo !== "texto" ? `[${tipo}]` : "")}
          </div>
        )}

        {url && !falhouDownload && (ehImagem || ehVideo) && texto && !texto.startsWith("[") && (
          <div className="mt-1 whitespace-pre-wrap break-words">{texto}</div>
        )}

        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-60">
          {horario}
          {/* Check apenas decorativo: não existe status de entrega real no banco. */}
          {m.external_id && <Check className="h-3 w-3" />}
        </div>
      </div>
    </div>
  );
}
