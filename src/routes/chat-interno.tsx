import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  FileText,
  Loader2,
  MessagesSquare,
  Paperclip,
  Search,
  Send,
  Users,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useAutoScrollMensagens } from "@/hooks/use-auto-scroll-mensagens";
import { resumoChatInterno } from "@/lib/chat-interno.functions";
import {
  CHAT_LIMITE_CARACTERES,
  PAGINA_BUSCA_CHAT,
  PAGINA_HISTORICO_CHAT,
  caminhoAnexoChat,
  dividirTextoComLinks,
  ehImagemAnexo,
  ehPdfAnexo,
  formatarTamanhoAnexo,
  mesclarHistorico,
  prepararBusca,
  prepararTexto,
  primeiroNome,
  validarAnexoChat,
  type ChatItemLista,
  type ChatTipoCanal,
} from "@/lib/chat-interno";
import { enviarAnexoComProgresso } from "@/lib/chat-anexo-upload";
import {
  listarConversasSupervisao,
  mensagensSupervisao,
} from "@/lib/chat-supervisao.functions";
import {
  PAGINA_SUPERVISAO,
  previaConversa,
  tituloConversaSupervisao,
  type ConversaSupervisao,
  type MensagemSupervisao,
} from "@/lib/chat-supervisao";
import { CHAT_QUERY_KEY } from "@/lib/chat-interno.query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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

function dataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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
  const pdf = !imagem && ehPdfAnexo(m.anexo_tipo, m.anexo_nome);

  const chip = (
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
      <span className="shrink-0 opacity-70">{formatarTamanhoAnexo(m.anexo_tamanho_bytes)}</span>
    </a>
  );

  return (
    <div ref={ref} className="mt-1 space-y-1">
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
      ) : pdf ? (
        <>
          {url ? (
            <object
              data={`${url}#page=1&toolbar=0&navpanes=0&view=FitH`}
              type="application/pdf"
              aria-label={`Primeira página de ${nome}`}
              className="h-56 w-64 rounded-md border bg-background"
            >
              <span className="p-2 text-xs">Pré-visualização indisponível.</span>
            </object>
          ) : (
            <div className="flex h-56 w-64 items-center justify-center rounded-md border text-xs opacity-70">
              {erro ? "Não consegui abrir" : "Carregando PDF…"}
            </div>
          )}
          {chip}
        </>
      ) : (
        chip
      )}
    </div>
  );
}

/** Miniatura local do arquivo escolhido (não sobe nada antes do envio). */
function PreviaComposer({ arquivo }: { arquivo: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(arquivo);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [arquivo]);

  if (!url) return null;
  if (ehImagemAnexo(arquivo.type)) {
    return (
      <img
        src={url}
        alt={arquivo.name}
        className="h-16 w-16 shrink-0 rounded border object-cover"
      />
    );
  }
  if (ehPdfAnexo(arquivo.type, arquivo.name)) {
    return (
      <object
        data={`${url}#page=1&toolbar=0&navpanes=0&view=FitH`}
        type="application/pdf"
        aria-label={`Primeira página de ${arquivo.name}`}
        className="h-16 w-16 shrink-0 rounded border bg-background"
      />
    );
  }
  return <Paperclip className="h-4 w-4 shrink-0" />;
}

type Resultado = Mensagem & { canalTitulo: string };

/**
 * Lente de leitura do "Geral": lista todas as conversas do time e abre cada
 * uma só para ler. Nada de escrever, responder ou marcar como lida — o banco
 * também recusa quem não é o usuário supervisor.
 */
function PainelSupervisao() {
  const listar = useServerFn(listarConversasSupervisao);
  const buscarMensagens = useServerFn(mensagensSupervisao);

  const { data, isLoading, error } = useQuery({
    queryKey: ["chat-supervisao", "conversas"],
    queryFn: () => listar(),
    staleTime: 15_000,
    retry: false,
  });
  const conversas = useMemo<ConversaSupervisao[]>(() => data?.conversas ?? [], [data]);

  const [aberta, setAberta] = useState<ConversaSupervisao | null>(null);
  const [mensagens, setMensagens] = useState<MensagemSupervisao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [temMais, setTemMais] = useState(false);
  const listaRef = useRef<HTMLDivElement>(null);

  const carregar = useCallback(
    async (canal: string, antes: string | null) => {
      setCarregando(true);
      try {
        const r = await buscarMensagens({ data: { canalId: canal, antes } });
        const lote = r.mensagens;
        setTemMais(lote.length === PAGINA_SUPERVISAO);
        setMensagens((prev) =>
          mesclarHistorico<MensagemSupervisao>(antes ? prev : [], lote),
        );
      } catch (e) {
        console.error(e);
        toast.error("Não consegui carregar essa conversa.");
      } finally {
        setCarregando(false);
      }
    },
    [buscarMensagens],
  );

  const abrirConversa = useCallback(
    (c: ConversaSupervisao) => {
      setAberta(c);
      setMensagens([]);
      setTemMais(false);
      void carregar(c.canal_id, null);
    },
    [carregar],
  );

  if (error) {
    return (
      <section className="flex min-h-0 flex-col items-center justify-center rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
        <AlertTriangle className="mb-2 h-5 w-5 text-destructive" />
        Este acompanhamento não está disponível para o seu usuário.
      </section>
    );
  }

  return (
    <section className="grid min-h-0 grid-cols-1 gap-3 rounded-lg md:grid-cols-[260px_1fr]">
      <div className="min-h-0 overflow-y-auto rounded-lg border bg-card">
        <header className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Conversas do time
        </header>
        {isLoading && (
          <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        )}
        {!isLoading && conversas.length === 0 && (
          <p className="p-3 text-sm text-muted-foreground">Nenhuma conversa por aqui ainda.</p>
        )}
        {conversas.map((c) => (
          <button
            key={c.canal_id}
            type="button"
            onClick={() => abrirConversa(c)}
            className={cn(
              "flex w-full items-start gap-2 border-b px-3 py-2 text-left transition-colors hover:bg-muted/60",
              aberta?.canal_id === c.canal_id && "bg-muted",
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {tituloConversaSupervisao(c)}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {previaConversa(c.ultima_previa)}
              </span>
            </span>
            {c.ultima_em && (
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {dataHora(c.ultima_em)}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-col rounded-lg border bg-card">
        <header className="flex items-center justify-between gap-2 border-b px-4 py-2 text-sm font-medium">
          <span className="truncate">
            {aberta ? tituloConversaSupervisao(aberta) : "Selecione uma conversa"}
          </span>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Somente leitura
          </span>
        </header>
        <div ref={listaRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
          {carregando && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          )}
          {!carregando && aberta && temMais && (
            <div className="flex justify-center pb-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const maisAntiga = mensagens[0];
                  if (maisAntiga) void carregar(aberta.canal_id, maisAntiga.criado_em);
                }}
              >
                Carregar mensagens anteriores
              </Button>
            </div>
          )}
          {!carregando && !aberta && (
            <p className="text-sm text-muted-foreground">
              Escolha uma conversa à esquerda para acompanhar o que foi conversado.
            </p>
          )}
          {!carregando && aberta && mensagens.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma mensagem nesta conversa.</p>
          )}
          {mensagens.map((m) => (
            <div key={m.id} className="flex justify-start">
              <div className="min-w-0 max-w-[78%] rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-foreground shadow-sm">
                <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                  {primeiroNome(m.autor_nome)}
                </div>
                {m.conteudo?.trim() && (
                  <div className="whitespace-pre-wrap break-words">
                    {dividirTextoComLinks(m.conteudo).map((p, i) =>
                      p.tipo === "link" ? (
                        <a
                          key={i}
                          href={p.valor}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2 break-all"
                        >
                          {p.valor}
                        </a>
                      ) : (
                        <span key={i}>{p.valor}</span>
                      ),
                    )}
                  </div>
                )}
                {(m.anexo_path || m.anexo_nome) && <AnexoMensagem m={m as Mensagem} />}
                <div className="mt-1 text-right text-[10px] opacity-60">
                  {dataHora(m.criado_em)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
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
    tipo: ChatTipoCanal;
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
  const [temMaisAntigas, setTemMaisAntigas] = useState(false);
  const [carregandoAntigas, setCarregandoAntigas] = useState(false);
  const canalId = selecionado?.canalId ?? null;
  const listaRef = useRef<HTMLDivElement>(null);
  const { onScroll } = useAutoScrollMensagens(listaRef, canalId, mensagens);

  const nomePorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of itens) if (i.outroUserId) m.set(i.outroUserId, i.titulo);
    if (euId) m.set(euId, user?.name ?? "Você");
    return m;
  }, [itens, euId, user?.name]);

  const tituloPorCanal = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of itens) if (i.canalId) m.set(i.canalId, i.titulo);
    return m;
  }, [itens]);

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

  /** Abre a conversa já com a última página — nunca com o histórico inteiro. */
  const carregarThread = useCallback(async (id: string) => {
    setCarregandoThread(true);
    const { data: rows, error } = await supabase
      .from("chat_mensagens")
      .select(COLUNAS_MENSAGEM)
      .eq("canal_id", id)
      .order("criado_em", { ascending: false })
      .limit(PAGINA_HISTORICO_CHAT);
    setCarregandoThread(false);
    if (error) {
      console.error(error);
      toast.error("Não consegui carregar as mensagens desta conversa.");
      return;
    }
    const lote = (rows ?? []) as Mensagem[];
    setTemMaisAntigas(lote.length === PAGINA_HISTORICO_CHAT);
    setMensagens(mesclarHistorico<Mensagem>([], lote));
  }, []);

  const carregarAntigas = useCallback(async () => {
    if (!canalId || carregandoAntigas || mensagens.length === 0) return;
    const maisAntiga = mensagens[0]!;
    const el = listaRef.current;
    const alturaAntes = el?.scrollHeight ?? 0;
    setCarregandoAntigas(true);
    const { data: rows, error } = await supabase
      .from("chat_mensagens")
      .select(COLUNAS_MENSAGEM)
      .eq("canal_id", canalId)
      .lt("criado_em", maisAntiga.criado_em)
      .order("criado_em", { ascending: false })
      .limit(PAGINA_HISTORICO_CHAT);
    setCarregandoAntigas(false);
    if (error) {
      console.error(error);
      toast.error("Não consegui carregar as mensagens anteriores.");
      return;
    }
    const lote = (rows ?? []) as Mensagem[];
    setTemMaisAntigas(lote.length === PAGINA_HISTORICO_CHAT);
    setMensagens((prev) => mesclarHistorico<Mensagem>(prev, lote));
    // Mantém o ponto de leitura onde estava depois de inserir acima.
    requestAnimationFrame(() => {
      const atual = listaRef.current;
      if (atual) atual.scrollTop += atual.scrollHeight - alturaAntes;
    });
  }, [canalId, carregandoAntigas, mensagens]);

  useEffect(() => {
    if (!canalId) {
      setMensagens([]);
      setTemMaisAntigas(false);
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

  /* ------------------------------------------------------------- busca */

  const [buscaAberta, setBuscaAberta] = useState(false);
  const [termo, setTermo] = useState("");
  const [soAnexos, setSoAnexos] = useState(false);
  const [escopoCanal, setEscopoCanal] = useState<"atual" | "todos">("atual");
  const [pagina, setPagina] = useState(0);
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [temMaisResultados, setTemMaisResultados] = useState(false);

  const canaisDisponiveis = useMemo(
    () => itens.map((i) => i.canalId).filter((c): c is string => !!c),
    [itens],
  );

  const buscar = useCallback(
    async (p: number) => {
      const pronto = prepararBusca(termo);
      if (!pronto && !soAnexos) {
        setResultados(null);
        return;
      }
      const alvo =
        escopoCanal === "atual" ? (canalId ? [canalId] : []) : canaisDisponiveis;
      if (alvo.length === 0) {
        setResultados([]);
        setTemMaisResultados(false);
        return;
      }
      setBuscando(true);
      let q = supabase
        .from("chat_mensagens")
        .select(COLUNAS_MENSAGEM)
        .in("canal_id", alvo)
        .order("criado_em", { ascending: false })
        .range(p * PAGINA_BUSCA_CHAT, p * PAGINA_BUSCA_CHAT + PAGINA_BUSCA_CHAT - 1);
      if (soAnexos) q = q.not("anexo_path", "is", null);
      if (pronto) q = q.or(`conteudo.ilike.%${pronto}%,anexo_nome.ilike.%${pronto}%`);
      const { data: rows, error } = await q;
      setBuscando(false);
      if (error) {
        console.error(error);
        toast.error("Não consegui buscar agora. Tente de novo.");
        return;
      }
      const lote = (rows ?? []) as Mensagem[];
      setTemMaisResultados(lote.length === PAGINA_BUSCA_CHAT);
      setPagina(p);
      setResultados(
        lote.map((m) => ({ ...m, canalTitulo: tituloPorCanal.get(m.canal_id) ?? "Conversa" })),
      );
    },
    [termo, soAnexos, escopoCanal, canalId, canaisDisponiveis, tituloPorCanal],
  );

  /* ------------------------------------------------------------- envio */

  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [progresso, setProgresso] = useState<number | null>(null);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  const escolherArquivo = useCallback((file: File | null) => {
    if (!file) return;
    const erro = validarAnexoChat({ size: file.size, type: file.type });
    if (erro) {
      toast.error(erro);
      return;
    }
    setErroEnvio(null);
    setArquivo(file);
  }, []);

  const enviar = useCallback(async () => {
    if (!euId || !canalId || enviando) return;
    const pronto = prepararTexto(texto);
    if (!pronto && !arquivo) {
      if (texto.trim().length > CHAT_LIMITE_CARACTERES) {
        toast.error(`Mensagem muito longa (máximo ${CHAT_LIMITE_CARACTERES} caracteres).`);
      }
      return;
    }
    setEnviando(true);
    setErroEnvio(null);
    let anexo: {
      anexo_path: string;
      anexo_nome: string;
      anexo_tipo: string;
      anexo_tamanho_bytes: number;
    } | null = null;

    if (arquivo) {
      const uid =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
      const path = caminhoAnexoChat(canalId, arquivo.name, uid);
      setProgresso(0);
      const envio = await enviarAnexoComProgresso({
        bucket: BUCKET_CHAT_ANEXOS,
        path,
        arquivo,
        onProgress: setProgresso,
      });
      if (!envio.ok) {
        setEnviando(false);
        setProgresso(null);
        setErroEnvio(envio.erro);
        toast.error(envio.erro);
        return; // sem mensagem órfã
      }
      anexo = {
        anexo_path: path,
        anexo_nome: arquivo.name,
        anexo_tipo: arquivo.type || "application/octet-stream",
        anexo_tamanho_bytes: arquivo.size,
      };
    }

    const { data: inserida, error } = await supabase
      .from("chat_mensagens")
      .insert({ canal_id: canalId, autor_user_id: euId, conteudo: pronto ?? "", ...(anexo ?? {}) })
      .select(COLUNAS_MENSAGEM)
      .single();
    setEnviando(false);
    setProgresso(null);
    if (error) {
      console.error(error);
      // Mensagem recusada: o arquivo recém-subido não fica sobrando no bucket.
      if (anexo) void supabase.storage.from(BUCKET_CHAT_ANEXOS).remove([anexo.anexo_path]);
      const msg = "Não consegui enviar a mensagem. Tente de novo.";
      setErroEnvio(msg);
      toast.error(msg);
      return;
    }
    setTexto("");
    setArquivo(null);
    if (inputArquivoRef.current) inputArquivoRef.current.value = "";
    const nova = inserida as Mensagem;
    setMensagens((prev) => (prev.some((m) => m.id === nova.id) ? prev : [...prev, nova]));
    void marcarLido(canalId);
  }, [euId, canalId, enviando, texto, arquivo, marcarLido]);

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
                  {item.tipo === "direto" ? (
                    primeiroNome(item.titulo).slice(0, 2).toUpperCase()
                  ) : (
                    <Users className="h-4 w-4" />
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
          <header className="flex items-center justify-between gap-2 border-b px-4 py-2 text-sm font-medium">
            <span className="truncate">{selecionado?.titulo ?? "Selecione uma conversa"}</span>
            <Button
              type="button"
              variant={buscaAberta ? "secondary" : "ghost"}
              size="sm"
              onClick={() => {
                setBuscaAberta((v) => !v);
                if (buscaAberta) setResultados(null);
              }}
            >
              <Search className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline">Buscar</span>
            </Button>
          </header>

          {buscaAberta && (
            <div className="space-y-2 border-b bg-muted/30 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={termo}
                  onChange={(e) => setTermo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void buscar(0);
                    }
                  }}
                  placeholder="Buscar por texto ou nome do arquivo…"
                  className="h-9 min-w-[180px] flex-1"
                />
                <select
                  value={escopoCanal}
                  onChange={(e) => setEscopoCanal(e.target.value as "atual" | "todos")}
                  aria-label="Onde buscar"
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="atual">Nesta conversa</option>
                  <option value="todos">Todas as conversas</option>
                </select>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={soAnexos}
                    onChange={(e) => setSoAnexos(e.target.checked)}
                  />
                  Só anexos
                </label>
                <Button size="sm" onClick={() => void buscar(0)} disabled={buscando}>
                  {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
                </Button>
              </div>

              {resultados && (
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {resultados.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum resultado.</p>
                  )}
                  {resultados.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        const item = itens.find((i) => i.canalId === r.canal_id);
                        if (item) void abrir(item);
                        setBuscaAberta(false);
                        setResultados(null);
                      }}
                      className="flex w-full items-start gap-2 rounded-md border bg-background px-2 py-1.5 text-left text-xs hover:bg-muted"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">
                          {r.canalTitulo} ·{" "}
                          <span className="font-normal text-muted-foreground">
                            {primeiroNome(nomePorId.get(r.autor_user_id) ?? null)}
                          </span>
                        </span>
                        <span className="block truncate text-muted-foreground">
                          {r.conteudo.trim() || (r.anexo_nome ? `📎 ${r.anexo_nome}` : "—")}
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {dataHora(r.criado_em)}
                      </span>
                    </button>
                  ))}
                  <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pagina === 0 || buscando}
                      onClick={() => void buscar(pagina - 1)}
                    >
                      Anterior
                    </Button>
                    <span>Página {pagina + 1}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!temMaisResultados || buscando}
                      onClick={() => void buscar(pagina + 1)}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

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
            {!carregandoThread && temMaisAntigas && (
              <div className="flex justify-center pb-1">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={carregandoAntigas}
                  onClick={() => void carregarAntigas()}
                >
                  {carregandoAntigas ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Carregar mensagens anteriores"
                  )}
                </Button>
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
                      "min-w-0 max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                      minha
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm bg-muted text-foreground",
                    )}
                  >
                    {!minha && selecionado?.tipo !== "direto" && (
                      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">
                        {primeiroNome(nomePorId.get(m.autor_user_id) ?? null)}
                      </div>
                    )}
                    {m.conteudo.trim() && (
                      <div className="whitespace-pre-wrap break-words">
                        {dividirTextoComLinks(m.conteudo).map((p, i) =>
                          p.tipo === "link" ? (
                            <a
                              key={i}
                              href={p.valor}
                              target="_blank"
                              rel="noreferrer"
                              className="underline underline-offset-2 break-all"
                            >
                              {p.valor}
                            </a>
                          ) : (
                            <span key={i}>{p.valor}</span>
                          ),
                        )}
                      </div>
                    )}
                    {(m.anexo_path || m.anexo_nome) && <AnexoMensagem m={m} />}
                    <div className="mt-1 text-right text-[10px] opacity-60">
                      {horario(m.criado_em)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t p-3">
            {arquivo && (
              <div className="mb-2 space-y-1.5 rounded-md border bg-muted/50 p-2">
                <div className="flex items-center gap-2 text-xs">
                  <PreviaComposer arquivo={arquivo} />
                  <span className="min-w-0 flex-1 truncate">{arquivo.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {formatarTamanhoAnexo(arquivo.size)}
                  </span>
                  <button
                    type="button"
                    aria-label="Remover anexo"
                    disabled={enviando}
                    onClick={() => {
                      setArquivo(null);
                      setErroEnvio(null);
                      if (inputArquivoRef.current) inputArquivoRef.current.value = "";
                    }}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {progresso !== null && (
                  <div className="flex items-center gap-2">
                    <Progress value={progresso} className="h-1.5 flex-1" />
                    <span className="w-9 text-right text-[10px] text-muted-foreground">
                      {progresso}%
                    </span>
                  </div>
                )}
              </div>
            )}
            {erroEnvio && (
              <div className="mb-2 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1">{erroEnvio}</span>
                <Button size="sm" variant="outline" onClick={() => void enviar()}>
                  Tentar de novo
                </Button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={inputArquivoRef}
                type="file"
                className="hidden"
                accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt"
                onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Anexar arquivo"
                disabled={!canalId || enviando}
                onClick={() => inputArquivoRef.current?.click()}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
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
              <Button
                onClick={() => void enviar()}
                disabled={!canalId || enviando || (!texto.trim() && !arquivo)}
              >
                {enviando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                <span className="ml-1 hidden sm:inline">Enviar</span>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
