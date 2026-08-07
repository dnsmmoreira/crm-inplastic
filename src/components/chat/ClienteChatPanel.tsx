import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Mail, MessageSquare, Phone, Send, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { sendConversaMessage } from "@/lib/canais.functions";
import {
  enviarPropostaPorCanal,
  listMensagensPaginado,
} from "@/lib/cliente-chat.functions";
import { MessageBubble, diaLabel, type Mensagem } from "./MessageBubble";
import type { Database } from "@/integrations/supabase/types";

type Conversa = Database["public"]["Tables"]["whatsapp_conversas"]["Row"];
type Canal = "whatsapp" | "email";
type Proposta = { id: string; number: string; status: string; created_at: string };

const STATUS_LABEL: Record<string, string> = {
  ia_atendendo: "IA atendendo",
  humano_atendendo: "Atendimento humano",
  qualificado: "Qualificado",
  encerrado: "Encerrado",
};

export function ClienteChatPanel({
  conversa,
  propostas,
  onChanged,
}: {
  conversa: Conversa | null;
  propostas: Proposta[];
  onChanged?: () => void;
}) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [nomesUsuarios, setNomesUsuarios] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [canal, setCanal] = useState<Canal>("whatsapp");
  const [sending, setSending] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [propostaId, setPropostaId] = useState<string>("");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const ultimaMsgRef = useRef<string | null>(null);
  const conversaRef = useRef<string | null>(null);

  const listar = useServerFn(listMensagensPaginado);
  const send = useServerFn(sendConversaMessage);
  const enviarProposta = useServerFn(enviarPropostaPorCanal);

  const carregarNomes = useCallback(async (lista: Mensagem[]) => {
    const ids = [...new Set(lista.map((m) => m.usuario_id).filter(Boolean))] as string[];
    if (ids.length === 0) return;
    const { data: perfis } = await supabase.from("profiles").select("id, name").in("id", ids);
    setNomesUsuarios((prev) => {
      const map = { ...prev };
      for (const p of perfis ?? []) map[p.id] = p.name;
      return map;
    });
  }, []);

  const loadRecentes = useCallback(
    async (conversaId: string) => {
      const res = await listar({ data: { conversaId, limit: 40 } });
      setMensagens(res.mensagens as Mensagem[]);
      setHasMore(res.hasMore);
      void carregarNomes(res.mensagens as Mensagem[]);
    },
    [listar, carregarNomes],
  );

  // Scroll-up carrega mais antigas
  const carregarMais = useCallback(async () => {
    if (!conversa || !hasMore || loadingMore || mensagens.length === 0) return;
    setLoadingMore(true);
    const el = scrollRef.current;
    const alturaAntes = el?.scrollHeight ?? 0;
    try {
      const res = await listar({
        data: { conversaId: conversa.id, before: mensagens[0]!.created_at, limit: 40 },
      });
      const antigas = res.mensagens as Mensagem[];
      if (antigas.length > 0) {
        setMensagens((prev) => [...antigas, ...prev]);
        void carregarNomes(antigas);
        requestAnimationFrame(() => {
          if (el) el.scrollTop = el.scrollHeight - alturaAntes;
        });
      }
      setHasMore(res.hasMore);
    } finally {
      setLoadingMore(false);
    }
  }, [conversa, hasMore, loadingMore, mensagens, listar, carregarNomes]);

  // Realtime + carga inicial
  useEffect(() => {
    if (!conversa) {
      setMensagens([]);
      return;
    }
    const id = conversa.id;
    void loadRecentes(id);
    const channel = supabase
      .channel(`cliente-chat-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_mensagens",
          filter: `conversa_id=eq.${id}`,
        },
        () => void loadRecentes(id),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversa, loadRecentes]);

  // Auto-scroll só ao trocar de conversa ou quando chega mensagem nova
  useEffect(() => {
    const conversaId = conversa?.id ?? null;
    const ultima = mensagens.length > 0 ? mensagens[mensagens.length - 1]!.id : null;
    const trocou = conversaRef.current !== conversaId;
    const nova = !trocou && ultima !== null && ultima !== ultimaMsgRef.current;
    conversaRef.current = conversaId;
    ultimaMsgRef.current = ultima;
    if (!trocou && !nova) return;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: trocou ? "auto" : "smooth",
    });
  }, [mensagens, conversa]);

  if (!conversa) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center bg-background p-8">
        <div className="text-center text-sm text-muted-foreground">
          <MessageSquare className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          Escolha uma conversa à esquerda para ver o histórico do cliente.
        </div>
      </div>
    );
  }

  const nome = conversa.name?.trim() || conversa.phone;

  async function handleSend(canalEnvio: Canal = canal) {
    if (!conversa || !text.trim()) return;
    setSending(true);
    try {
      await send({
        data: { conversaId: conversa.id, message: text.trim(), canal: canalEnvio },
      });
      setText("");
      void loadRecentes(conversa.id);
      onChanged?.();
    } catch (e) {
      toast.error("Falha ao enviar", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  }

  async function handleEnviarProposta() {
    if (!conversa || !propostaId) {
      toast.error("Escolha uma proposta para enviar.");
      return;
    }
    setSending(true);
    try {
      await enviarProposta({
        data: {
          conversaId: conversa.id,
          propostaId,
          canal,
          baseUrl: window.location.origin,
        },
      });
      toast.success(`Proposta enviada por ${canal === "email" ? "e-mail" : "WhatsApp"}.`);
      void loadRecentes(conversa.id);
      onChanged?.();
    } catch (e) {
      toast.error("Falha ao enviar proposta", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Cabeçalho */}
      <div className="border-b bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {nome.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-medium">{nome}</span>
              <span className="rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {STATUS_LABEL[conversa.status] ?? conversa.status}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" /> {conversa.phone}
            </div>
          </div>
        </div>

        {/* Botões rápidos */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select value={propostaId} onValueChange={setPropostaId}>
            <SelectTrigger className="h-8 w-[190px] text-xs" aria-label="Selecionar proposta">
              <FileText className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue placeholder="Proposta…" />
            </SelectTrigger>
            <SelectContent>
              {propostas.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.number} · {p.status}
                </SelectItem>
              ))}
              {propostas.length === 0 && (
                <div className="px-2 py-2 text-xs text-muted-foreground">
                  Nenhuma proposta para este cliente.
                </div>
              )}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            variant="secondary"
            disabled={sending || !propostaId}
            onClick={() => void handleEnviarProposta()}
          >
            <FileText className="mr-1 h-3.5 w-3.5" /> Enviar proposta
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={sending || !text.trim()}
            onClick={() => void handleSend("whatsapp")}
          >
            <MessageSquare className="mr-1 h-3.5 w-3.5" /> Enviar para WhatsApp
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={sending || !text.trim()}
            onClick={() => void handleSend("email")}
          >
            <Mail className="mr-1 h-3.5 w-3.5" /> Enviar por e-mail
          </Button>
        </div>
      </div>

      {/* Histórico */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          if (e.currentTarget.scrollTop < 40) void carregarMais();
        }}
        className="min-h-0 flex-1 space-y-2 overflow-auto p-4"
      >
        {hasMore && (
          <div className="flex justify-center pb-2">
            <Button size="sm" variant="ghost" disabled={loadingMore} onClick={() => void carregarMais()}>
              {loadingMore ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Carregar mensagens anteriores
            </Button>
          </div>
        )}
        {mensagens.map((m, i) => {
          const anterior = i > 0 ? mensagens[i - 1] : undefined;
          const novoDia =
            !anterior ||
            new Date(anterior.created_at).toDateString() !== new Date(m.created_at).toDateString();
          return (
            <div key={m.id} className="space-y-2">
              {novoDia && (
                <div className="flex justify-center">
                  <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-medium text-muted-foreground">
                    {diaLabel(m.created_at)}
                  </span>
                </div>
              )}
              <MessageBubble
                m={m}
                nomeVendedor={m.usuario_id ? nomesUsuarios[m.usuario_id] : undefined}
              />
            </div>
          );
        })}
        {mensagens.length === 0 && (
          <div className="py-10 text-center text-xs text-muted-foreground">
            Sem mensagens nesta conversa ainda.
          </div>
        )}
      </div>

      {/* Caixa de envio */}
      <div className="space-y-2 border-t p-3">
        <div className="flex items-end gap-2">
          <Select value={canal} onValueChange={(v) => setCanal(v as Canal)}>
            <SelectTrigger className="h-9 w-[130px] shrink-0 text-xs" aria-label="Canal de envio">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="email">E-mail</SelectItem>
            </SelectContent>
          </Select>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={canal === "email" ? "Escreva o e-mail…" : "Escreva uma mensagem…"}
            rows={2}
            disabled={sending}
            className={cn("resize-none")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <Button onClick={() => void handleSend()} disabled={sending || !text.trim()} className="gap-1">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}
