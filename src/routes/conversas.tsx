import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquare, Phone, Send, Bot, User as UserIcon, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { sendConversaMessage } from "@/lib/canais.functions";
import { assumirConversa } from "@/lib/atendimento.functions";
import { useAuth } from "@/hooks/use-auth";
import type { Database } from "@/integrations/supabase/types";

type Conversa = Database["public"]["Tables"]["whatsapp_conversas"]["Row"];
type Mensagem = Database["public"]["Tables"]["whatsapp_mensagens"]["Row"];

type ConversasSearch = { c?: string };

export const Route = createFileRoute("/conversas")({
  validateSearch: (search: Record<string, unknown>): ConversasSearch => ({
    c: typeof search.c === "string" ? search.c : undefined,
  }),
  component: MinhasConversasPage,
  head: () => ({
    meta: [
      { title: "Minhas Conversas — INPLASTIC - CRM" },
      { name: "description", content: "Chat em tempo real com os leads atribuídos a você." },
      { property: "og:title", content: "Minhas Conversas — INPLASTIC - CRM" },
      {
        property: "og:description",
        content: "Chat em tempo real com os leads atribuídos a você.",
      },
    ],
  }),
});

function iniciais(nome: string) {
  return nome
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function horaCurta(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const hoje = new Date();
  const mesmoDia =
    d.getDate() === hoje.getDate() &&
    d.getMonth() === hoje.getMonth() &&
    d.getFullYear() === hoje.getFullYear();
  return mesmoDia
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

type Aba = "aguardando" | "atendendo";
type Fila =
  | "todas"
  | "requer_humano"
  | "ia_atendendo"
  | "humano_atendendo"
  | "qualificado"
  | "encerrado"
  | "sem_responsavel";

const FILAS: { value: Fila; label: string; adminOnly?: boolean }[] = [
  { value: "todas", label: "Todas as filas" },
  { value: "requer_humano", label: "Requer humano" },
  { value: "ia_atendendo", label: "IA atendendo" },
  { value: "humano_atendendo", label: "Em atendimento humano" },
  { value: "qualificado", label: "Qualificado" },
  { value: "encerrado", label: "Encerrado" },
  { value: "sem_responsavel", label: "Sem responsável", adminOnly: true },
];

function naFila(c: Conversa, fila: Fila) {
  switch (fila) {
    case "todas":
      return true;
    case "requer_humano":
      return c.requer_humano;
    case "sem_responsavel":
      return !c.atribuido_para;
    default:
      return c.status === fila;
  }
}

function MinhasConversasPage() {
  const { user } = useAuth();
  const navigate = useNavigate({ from: "/conversas" });
  const { c: selectedId } = Route.useSearch();
  const userId = user?.id ?? null;
  const isAdmin = user?.role === "admin";

  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [naoLidas, setNaoLidas] = useState<Record<string, number>>({});
  const [ultimoAutor, setUltimoAutor] = useState<Record<string, Mensagem["autor"]>>({});
  const [busca, setBusca] = useState("");
  const [todas, setTodas] = useState(false);
  const [aba, setAba] = useState<Aba>("aguardando");
  const [fila, setFila] = useState<Fila>("todas");
  const [novoAberto, setNovoAberto] = useState(false);


  const load = useCallback(async () => {
    if (!userId) return;
    let query = supabase
      .from("whatsapp_conversas")
      .select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (!(isAdmin && todas)) query = query.eq("atribuido_para", userId);
    const { data, error } = await query;
    if (error) {
      console.error(error);
      return;
    }
    const lista = data ?? [];
    setConversas(lista);

    const { data: notifs } = await supabase
      .from("notificacoes")
      .select("conversa_id")
      .eq("user_id", userId)
      .is("lida_em", null)
      .not("conversa_id", "is", null)
      .limit(500);
    const map: Record<string, number> = {};
    for (const n of notifs ?? []) {
      if (n.conversa_id) map[n.conversa_id] = (map[n.conversa_id] ?? 0) + 1;
    }

    // Deriva último autor e não lidas reais a partir das mensagens.
    const ids = lista.map((c) => c.id);
    const autores: Record<string, Mensagem["autor"]> = {};
    if (ids.length > 0) {
      const { data: msgs } = await supabase
        .from("whatsapp_mensagens")
        .select("conversa_id, autor, created_at")
        .in("conversa_id", ids)
        .order("created_at", { ascending: false })
        .limit(2000);
      const pendentes: Record<string, number> = {};
      const fechado = new Set<string>();
      for (const m of msgs ?? []) {
        if (!autores[m.conversa_id]) autores[m.conversa_id] = m.autor;
        if (fechado.has(m.conversa_id)) continue;
        if (m.autor === "cliente") pendentes[m.conversa_id] = (pendentes[m.conversa_id] ?? 0) + 1;
        else fechado.add(m.conversa_id);
      }
      for (const id of ids) {
        if (autores[id]) map[id] = pendentes[id] ?? 0;
      }
    }
    setUltimoAutor(autores);
    setNaoLidas(map);
  }, [userId, isAdmin, todas]);

  useEffect(() => {
    void load();
    const channel = supabase
      .channel(`minhas-conversas-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_conversas" }, () =>
        void load(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_mensagens" },
        () => void load(),
      )
      .subscribe();
    const t = setInterval(() => void load(), 8000);
    return () => {
      void supabase.removeChannel(channel);
      clearInterval(t);
    };
  }, [load]);

  const aguardandoIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of conversas) if (ultimoAutor[c.id] === "cliente") s.add(c.id);
    return s;
  }, [conversas, ultimoAutor]);

  const daFila = useMemo(() => conversas.filter((c) => naFila(c, fila)), [conversas, fila]);

  const contagem = useMemo(
    () => ({
      aguardando: daFila.filter((c) => aguardandoIds.has(c.id)).length,
      atendendo: daFila.filter((c) => !aguardandoIds.has(c.id)).length,
    }),
    [daFila, aguardandoIds],
  );

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return daFila.filter((c) => {
      const naAba = aba === "aguardando" ? aguardandoIds.has(c.id) : !aguardandoIds.has(c.id);
      if (!naAba) return false;
      if (!q) return true;
      return (c.name ?? "").toLowerCase().includes(q) || c.phone.includes(q);
    });
  }, [daFila, busca, aba, aguardandoIds]);


  const selected = useMemo(
    () => conversas.find((c) => c.id === selectedId) ?? null,
    [conversas, selectedId],
  );

  const selecionar = (id: string) => {
    void navigate({ search: { c: id } });
  };

  const filasVisiveis = FILAS.filter((f) => !f.adminOnly || isAdmin);

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-primary" /> Minhas Conversas
          </h1>
          <p className="text-sm text-muted-foreground">
            Seus atendimentos por WhatsApp, em tempo real.
          </p>
        </div>
        <Button onClick={() => setNovoAberto(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> NOVO
        </Button>
      </div>

      <NovaConversaDialog
        open={novoAberto}
        onOpenChange={setNovoAberto}
        conversas={conversas.map((c) => ({ id: c.id, phone: c.phone, name: c.name }))}
        onSelectConversa={selecionar}
      />

      <div className="grid gap-0 overflow-hidden rounded-xl border bg-card lg:grid-cols-[340px,1fr] h-[calc(100vh-13rem)] min-h-[540px]">
        {/* Coluna esquerda */}
        <div className="flex min-h-0 flex-col border-b lg:border-b-0 lg:border-r">
          <div className="space-y-2 border-b bg-muted/40 p-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar contato ou telefone"
                  className="pl-8"
                />
              </div>
              <Select value={fila} onValueChange={(v) => setFila(v as Fila)}>
                <SelectTrigger className="w-[132px] shrink-0" aria-label="Filtrar por fila">
                  <ListFilter className="mr-1 h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue placeholder="Filas" />
                </SelectTrigger>
                <SelectContent>
                  {filasVisiveis.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-lg bg-background p-1">
              {(["aguardando", "atendendo"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setAba(k)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                    aba === k
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {k === "aguardando" ? "Aguardando" : "Atendendo"}
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] font-semibold",
                      aba === k ? "bg-primary-foreground/20" : "bg-muted-foreground/15",
                    )}
                  >
                    {k === "aguardando" ? contagem.aguardando : contagem.atendendo}
                  </span>
                </button>
              ))}
            </div>
            {isAdmin && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={todas}
                  onChange={(e) => setTodas(e.target.checked)}
                />
                Ver todas as conversas (admin)
              </label>
            )}
          </div>
          <ul className="min-h-0 flex-1 divide-y overflow-auto">
            {filtradas.map((c) => {
              const nome = c.name?.trim() || c.phone;
              const active = c.id === selectedId;
              const badge = naoLidas[c.id] ?? 0;
              const aguardando = aguardandoIds.has(c.id);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => selecionar(c.id)}
                    className={cn(
                      "flex w-full items-center gap-3 border-l-2 px-3 py-3 text-left transition-colors",
                      aguardando ? "border-l-destructive bg-destructive/5" : "border-l-transparent",
                      active ? "bg-primary/5" : "hover:bg-muted/50",
                    )}
                  >
                    <span className="relative shrink-0">
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {iniciais(nome) || "?"}
                      </span>
                      {badge > 0 && (
                        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "truncate text-sm",
                            aguardando ? "font-semibold" : "font-medium",
                          )}
                        >
                          {nome}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-[10px]",
                            aguardando ? "font-semibold text-destructive" : "text-muted-foreground",
                          )}
                        >
                          {horaCurta(c.last_message_at)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-muted-foreground">
                          {c.last_message_preview || "Sem mensagens"}
                        </span>
                        {aguardando && (
                          <span className="shrink-0 text-[10px] font-medium text-destructive">
                            aguardando
                          </span>
                        )}
                      </span>
                    </span>

                  </button>
                </li>
              );
            })}
            {filtradas.length === 0 && (
              <li className="p-10 text-center text-sm text-muted-foreground">
                Nenhuma conversa atribuída a você por enquanto. Assim que um lead cair no seu nome,
                ele aparece aqui na hora.
              </li>
            )}
          </ul>
        </div>

        {/* Coluna direita */}
        <ChatPanel conversa={selected} onChanged={load} />
      </div>
    </div>
  );
}

function ChatPanel({ conversa, onChanged }: { conversa: Conversa | null; onChanged: () => void }) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const send = useServerFn(sendConversaMessage);
  const assumir = useServerFn(assumirConversa);

  const loadMensagens = useCallback(async (conversaId: string) => {
    const { data, error } = await supabase
      .from("whatsapp_mensagens")
      .select("*")
      .eq("conversa_id", conversaId)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) {
      console.error(error);
      return;
    }
    setMensagens(data ?? []);
  }, []);

  useEffect(() => {
    if (!conversa) {
      setMensagens([]);
      return;
    }
    const id = conversa.id;
    void loadMensagens(id);
    const channel = supabase
      .channel(`conversas-msgs-${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_mensagens",
          filter: `conversa_id=eq.${id}`,
        },
        () => void loadMensagens(id),
      )
      .subscribe();
    const t = setInterval(() => void loadMensagens(id), 6000);
    return () => {
      void supabase.removeChannel(channel);
      clearInterval(t);
    };
  }, [conversa, loadMensagens]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [mensagens]);

  if (!conversa) {
    return (
      <div className="flex min-h-[320px] items-center justify-center bg-background p-8">
        <div className="text-center text-sm text-muted-foreground">
          <MessageSquare className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          Escolha uma conversa à esquerda para começar a responder.
        </div>
      </div>
    );
  }

  const nome = conversa.name?.trim() || conversa.phone;
  const iaNoControle = conversa.ia_ativa && conversa.status === "ia_atendendo";

  async function handleSend() {
    if (!conversa || !text.trim()) return;
    setSending(true);
    try {
      if (iaNoControle) await assumir({ data: { conversaId: conversa.id } });
      await send({ data: { conversaId: conversa.id, message: text.trim() } });
      setText("");
      void loadMensagens(conversa.id);
      onChanged();
    } catch (e) {
      toast.error("Falha ao enviar", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-col bg-background">
      <div className="flex items-center gap-3 border-b bg-muted/40 px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {iniciais(nome) || "?"}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{nome}</div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Phone className="h-3 w-3" />
            {conversa.phone}
          </div>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-auto p-4">
        {mensagens.map((m) => (
          <Bolha key={m.id} m={m} />
        ))}
        {mensagens.length === 0 && (
          <div className="py-10 text-center text-xs text-muted-foreground">
            Sem mensagens nesta conversa ainda.
          </div>
        )}
      </div>

      <div className="space-y-2 border-t p-3">
        {iaNoControle && (
          <div className="text-[11px] text-muted-foreground">
            A IA está atendendo. Ao enviar, você assume a conversa automaticamente.
          </div>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escreva uma mensagem…"
            rows={2}
            disabled={sending}
            className="resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <Button onClick={handleSend} disabled={sending || !text.trim()} className="gap-1">
            <Send className="h-4 w-4" /> Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}

function Bolha({ m }: { m: Mensagem }) {
  const isCliente = m.autor === "cliente";
  const isIA = m.autor === "ia";
  const Icon = isIA ? Bot : UserIcon;
  return (
    <div className={cn("flex", isCliente ? "justify-start" : "justify-end")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm",
          isCliente
            ? "rounded-bl-sm bg-muted text-foreground"
            : isIA
              ? "rounded-br-sm border border-blue-500/20 bg-blue-500/10 text-blue-900 dark:text-blue-100"
              : "rounded-br-sm bg-primary text-primary-foreground",
        )}
      >
        <div className="mb-0.5 flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-70">
          <Icon className="h-3 w-3" /> {isCliente ? "Cliente" : isIA ? "IA" : "Você"}
        </div>
        <div className="whitespace-pre-wrap break-words">{m.conteudo}</div>
        <div className="mt-1 text-right text-[10px] opacity-60">
          {new Date(m.created_at).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
    </div>
  );
}
