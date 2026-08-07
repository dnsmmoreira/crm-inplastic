import { Bot, Check, FileText, Mail, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

export type Mensagem = Database["public"]["Tables"]["whatsapp_mensagens"]["Row"];

/** Extrai a primeira URL utilizável do jsonb `midia`, se houver. */
export function urlDaMidia(midia: unknown): string | null {
  if (!midia || typeof midia !== "object") return null;
  const obj = midia as Record<string, unknown>;
  for (const k of ["url", "link", "fileUrl", "imageUrl", "audioUrl", "documentUrl", "mediaUrl"]) {
    const v = obj[k];
    if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
  }
  return null;
}

export function diaLabel(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  const mesmo = (a: Date, b: Date) =>
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear();
  if (mesmo(d, hoje)) return "Hoje";
  if (mesmo(d, ontem)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function MessageBubble({
  m,
  nomeVendedor,
}: {
  m: Mensagem;
  nomeVendedor?: string;
}) {
  const isCliente = m.autor === "cliente";
  const isIA = m.autor === "ia";
  const tipo = (m.tipo ?? "texto").toLowerCase();
  const isEmail = tipo === "email";
  const Icon = isIA ? Bot : isEmail ? Mail : UserIcon;
  const rotulo = isCliente ? "Cliente" : isIA ? "IA — Lucas" : (nomeVendedor ?? "Você");
  const url = urlDaMidia(m.midia);
  const entregue = Boolean(m.external_id);

  return (
    <div className={cn("flex", isCliente ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          isCliente
            ? "rounded-bl-sm bg-muted text-foreground"
            : isIA
              ? "rounded-br-sm border border-blue-500/20 bg-blue-500/10 text-blue-900 dark:text-blue-100"
              : isEmail
                ? "rounded-br-sm border border-amber-500/30 bg-amber-500/10 text-foreground"
                : "rounded-br-sm bg-primary text-primary-foreground",
        )}
      >
        <div className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-70">
          <Icon className="h-3 w-3" /> {rotulo}
          {isEmail && <span className="ml-1">· e-mail</span>}
        </div>

        {url && (tipo.includes("imag") || tipo === "image" || tipo === "photo") ? (
          <a href={url} target="_blank" rel="noreferrer">
            <img src={url} alt={m.conteudo || "Imagem recebida"} className="max-h-64 rounded-lg" />
          </a>
        ) : url && (tipo.includes("audio") || tipo.includes("ptt") || tipo.includes("voice")) ? (
          <audio controls src={url} className="w-56" />
        ) : url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 underline"
          >
            <FileText className="h-3.5 w-3.5" /> {m.conteudo?.trim() || "Abrir arquivo"}
          </a>
        ) : (
          <div className="whitespace-pre-wrap break-words">
            {m.conteudo?.trim() || (tipo !== "texto" ? `[${tipo}]` : "")}
          </div>
        )}

        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-60">
          {new Date(m.created_at).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
          {!isCliente &&
            (entregue ? (
              <span className="flex items-center" title="Entregue">
                <Check className="h-3 w-3" />
                <Check className="-ml-1.5 h-3 w-3" />
              </span>
            ) : (
              <Check className="h-3 w-3" aria-label="Enviado" />
            ))}
        </div>
      </div>
    </div>
  );
}
