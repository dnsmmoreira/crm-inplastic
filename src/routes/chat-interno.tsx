import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FileText, Loader2, MessagesSquare, Paperclip, Send, Users, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useAutoScrollMensagens } from "@/hooks/use-auto-scroll-mensagens";
import { resumoChatInterno } from "@/lib/chat-interno.functions";
import {
  CHAT_LIMITE_CARACTERES,
  caminhoAnexoChat,
  ehImagemAnexo,
  formatarTamanhoAnexo,
  prepararTexto,
  primeiroNome,
  validarAnexoChat,
  type ChatItemLista,
  type ChatTipoCanal,
} from "@/lib/chat-interno";
import { CHAT_QUERY_KEY } from "@/lib/chat-interno.query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const BUCKET_CHAT_ANEXOS = "chat-anexos";

export const Route = createFileRoute("/chat-interno")({
  head: () => ({
    meta: [
      { title: "Chat Interno — time INPLASTIC | CRM" },
      {
        name: "description",
        content:
          "Converse com o time dentro do CRM: canal Geral para todos e mensagens diretas entre usuários.",
      },
      { property: "og:title", content: "Chat Interno — time INPLASTIC" },
      {
        property: "og:description",
        content: "Canal Geral e mensagens diretas entre os usuários do CRM.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatInternoPage,
});

type Mensagem = {
  id: string;
  canal_id: string;
  autor_user_id: string;
  conteudo: string;
  criado_em: string;
  anexo_path: string | null;
  anexo_nome: string | null;
  anexo_tipo: string | null;
  anexo_tamanho_bytes: number | null;
};

const COLUNAS_MENSAGEM =
  "id, canal_id, autor_user_id, conteudo, criado_em, anexo_path, anexo_nome, anexo_tipo, anexo_tamanho_bytes";

function horario(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Assinatura do arquivo gerada SÓ quando a bolha entra na tela (IntersectionObserver),
 * nunca para o histórico inteiro de uma vez. Vale ~1h e fica em cache por path.
 */
function AnexoMensagem({ m }: { m: Mensagem }) {
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const path = m.anexo_path;

  useEffect(() => {
    if (!path) return;
    const el = ref.current;
    if (!el) return;
    let vivo = true;
    const gerar = async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET_CHAT_ANEXOS)
        .createSignedUrl(path, 3600);
      if (!vivo) return;
      if (error || !data?.signedUrl) {
        setErro(true);
        return;
      }
      setUrl(data.signedUrl);
    };
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) {
          obs.disconnect();
          void gerar();
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(el);
    return () => {
      vivo = false;
      obs.disconnect();
    };
  }, [path]);

  if (!path) {
    return <div className="text-xs italic opacity-70">Anexo removido (15 dias)</div>;
  }

  const nome = m.anexo_nome ?? "arquivo";
  const imagem = ehImagemAnexo(m.anexo_tipo);

  return (
    <div ref={ref} className="mt-1">
      {imagem ? (
        url ? (
          <a href={url} target="_blank" rel="noreferrer">
            <img
              src={url}
              alt={nome}
              loading="lazy"
              className="max-h-60 w-auto rounded-md border object-contain"
            />
          </a>
        ) : (
          <div className="flex h-24 w-40 items-center justify-center rounded-md border text-xs opacity-70">
            {erro ? "Não consegui abrir" : "Carregando imagem…"}
          </div>
        )
      ) : (
        <a
          href={url ?? undefined}
          target="_blank"
          rel="noreferrer"
          className={cn(
            "flex items-center gap-2 rounded-md border bg-background/60 px-2 py-1.5 text-xs text-foreground",
            !url && "pointer-events-none opacity-70",
          )}
        >
          <FileText className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{nome}</span>
          <span className="shrink-0 opacity-70">
            {formatarTamanhoAnexo(m.anexo_tamanho_bytes)}
          </span>
        </a>
      )}
    </div>
  );
}


function ChatInternoPage() {
  const { user } = useAuth();
  const euId = user?.id ?? null;
  const queryClient = useQueryClient();
  const fetchResumo = useServerFn(resumoChatInterno);

  const { data, isLoading } = useQuery({
    queryKey: CHAT_QUERY_KEY,
    queryFn: () => fetchResumo(),
    staleTime: 15_000,
    retry: false,
  });
  const itens = useMemo<ChatItemLista[]>(() => data?.itens ?? [], [data]);

  const [selecionado, setSelecionado] = useState<{
    canalId: string | null;
    outroUserId: string | null;
    titulo: string;
    tipo: "geral" | "direto";
  } | null>(null);

  // Abre por padrão a primeira conversa que já existe (Geral, quando a pessoa
  // é membro; senão a DM mais recente). Quem nunca conversou começa sem nada.
  useEffect(() => {
    if (selecionado || itens.length === 0) return;
    const primeiro = itens.find((i) => i.canalId);
    if (!primeiro) return;
    setSelecionado({
      canalId: primeiro.canalId,
      outroUserId: primeiro.outroUserId,
      titulo: primeiro.titulo,
      tipo: primeiro.tipo,
    });
  }, [itens, selecionado]);

  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [carregandoThread, setCarregandoThread] = useState(false);
  const canalId = selecionado?.canalId ?? null;
  const listaRef = useRef<HTMLDivElement>(null);
  const { onScroll } = useAutoScrollMensagens(listaRef, canalId, mensagens);

  const nomePorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of itens) if (i.outroUserId) m.set(i.outroUserId, i.titulo);
    if (euId) m.set(euId, user?.name ?? "Você");
    return m;
  }, [itens, euId, user?.name]);

  const marcarLido = useCallback(
    async (id: string) => {
      if (!euId) return;
      const { error } = await supabase
        .from("chat_canal_membros")
        .update({ last_read_at: new Date().toISOString() })
        .eq("canal_id", id)
        .eq("user_id", euId);
      if (error) {
        console.error("chat: marcar lido falhou", error);
        return;
      }
      void queryClient.invalidateQueries({ queryKey: CHAT_QUERY_KEY });
    },
    [euId, queryClient],
  );

  const carregarThread = useCallback(async (id: string) => {
    setCarregandoThread(true);
    const { data: rows, error } = await supabase
      .from("chat_mensagens")
      .select("id, canal_id, autor_user_id, conteudo, criado_em")
      .eq("canal_id", id)
      .order("criado_em", { ascending: true })
      .limit(500);
    setCarregandoThread(false);
    if (error) {
      console.error(error);
      toast.error("Não consegui carregar as mensagens desta conversa.");
      return;
    }
    setMensagens((rows ?? []) as Mensagem[]);
  }, []);

  useEffect(() => {
    if (!canalId) {
      setMensagens([]);
      return;
    }
    void carregarThread(canalId);
    void marcarLido(canalId);
    const channel = supabase
      .channel(`chat-interno-${canalId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_mensagens",
          filter: `canal_id=eq.${canalId}`,
        },
        (payload) => {
          const nova = payload.new as Mensagem;
          setMensagens((prev) => (prev.some((m) => m.id === nova.id) ? prev : [...prev, nova]));
          void marcarLido(canalId);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [canalId, carregarThread, marcarLido]);

  const abrir = useCallback(
    async (item: ChatItemLista) => {
      if (item.canalId) {
        setSelecionado({
          canalId: item.canalId,
          outroUserId: item.outroUserId,
          titulo: item.titulo,
          tipo: item.tipo,
        });
        return;
      }
      if (!item.outroUserId) return;
      const { data: novo, error } = await supabase.rpc("chat_obter_ou_criar_canal_direto", {
        _outro_user_id: item.outroUserId,
      });
      if (error || !novo) {
        console.error(error);
        toast.error("Não consegui abrir a conversa com essa pessoa.");
        return;
      }
      setSelecionado({
        canalId: novo as string,
        outroUserId: item.outroUserId,
        titulo: item.titulo,
        tipo: "direto",
      });
      void queryClient.invalidateQueries({ queryKey: CHAT_QUERY_KEY });
    },
    [queryClient],
  );

  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);

  const enviar = useCallback(async () => {
    if (!euId || !canalId || enviando) return;
    const pronto = prepararTexto(texto);
    if (!pronto) {
      if (texto.trim().length > CHAT_LIMITE_CARACTERES) {
        toast.error(`Mensagem muito longa (máximo ${CHAT_LIMITE_CARACTERES} caracteres).`);
      }
      return;
    }
    setEnviando(true);
    const { data: inserida, error } = await supabase
      .from("chat_mensagens")
      .insert({ canal_id: canalId, autor_user_id: euId, conteudo: pronto })
      .select("id, canal_id, autor_user_id, conteudo, criado_em")
      .single();
    setEnviando(false);
    if (error) {
      console.error(error);
      toast.error("Não consegui enviar a mensagem. Tente de novo.");
      return;
    }
    setTexto("");
    const nova = inserida as Mensagem;
    setMensagens((prev) => (prev.some((m) => m.id === nova.id) ? prev : [...prev, nova]));
    void marcarLido(canalId);
  }, [euId, canalId, enviando, texto, marcarLido]);

  return (
    <div className="flex h-[calc(100dvh-8rem)] min-h-[520px] flex-col gap-3 p-4 md:p-6">
      <div className="flex items-center gap-2">
        <MessagesSquare className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold">Chat Interno</h1>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-[280px_1fr]">
        {/* Lista */}
        <aside className="min-h-0 overflow-y-auto rounded-lg border bg-card">
          {isLoading && (
            <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando conversas…
            </div>
          )}
          {itens.map((item) => {
            const ativo =
              (item.canalId && item.canalId === canalId) ||
              (!!item.outroUserId && item.outroUserId === selecionado?.outroUserId);
            return (
              <button
                key={item.canalId ?? item.outroUserId ?? item.titulo}
                type="button"
                onClick={() => void abrir(item)}
                className={cn(
                  "flex w-full items-center gap-2 border-b px-3 py-2 text-left transition-colors hover:bg-muted/60",
                  ativo && "bg-muted",
                )}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: item.avatarColor ?? "hsl(var(--primary))" }}
                >
                  {item.tipo === "geral" ? (
                    <Users className="h-4 w-4" />
                  ) : (
                    primeiroNome(item.titulo).slice(0, 2).toUpperCase()
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.titulo}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.ultimaMensagemTexto ?? "Sem mensagens ainda"}
                  </span>
                </span>
                {item.naoLidas > 0 && (
                  <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    {item.naoLidas > 99 ? "99+" : item.naoLidas}
                  </span>
                )}
              </button>
            );
          })}
        </aside>

        {/* Thread */}
        <section className="flex min-h-0 flex-col rounded-lg border bg-card">
          <header className="border-b px-4 py-2 text-sm font-medium">
            {selecionado?.titulo ?? "Selecione uma conversa"}
          </header>
          <div
            ref={listaRef}
            onScroll={onScroll}
            className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4"
          >
            {carregandoThread && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            )}
            {!carregandoThread && mensagens.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma mensagem aqui ainda. Comece a conversa.
              </p>
            )}
            {mensagens.map((m) => {
              const minha = m.autor_user_id === euId;
              return (
                <div key={m.id} className={cn("flex", minha ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                      minha
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm bg-muted text-foreground",
                    )}
                  >
                    {!minha && selecionado?.tipo === "geral" && (
                      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                        {primeiroNome(nomePorId.get(m.autor_user_id) ?? null)}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap break-words">{m.conteudo}</div>
                    <div className="mt-1 text-right text-[10px] opacity-60">
                      {horario(m.criado_em)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-end gap-2 border-t p-3">
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value.slice(0, CHAT_LIMITE_CARACTERES))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void enviar();
                }
              }}
              placeholder="Escreva uma mensagem… (Enter envia, Shift+Enter quebra linha)"
              rows={2}
              maxLength={CHAT_LIMITE_CARACTERES}
              disabled={!canalId}
              className="min-h-[44px] resize-none"
            />
            <Button onClick={() => void enviar()} disabled={!canalId || enviando || !texto.trim()}>
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="ml-1 hidden sm:inline">Enviar</span>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
