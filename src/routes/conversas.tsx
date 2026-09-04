import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MessageSquare,
  ArrowLeft,
  ArrowRightLeft,
  PauseCircle,
  PlayCircle,
  Phone,
  Send,
  Loader2,
  Bot,
  User as UserIcon,
  Search,
  Plus,
  ListFilter,
  AlertTriangle,
  CheckCircle2,
  Paperclip,
  Mic,
  FileText,
  Clock,
  BadgeCheck,
  Sparkles,
  Check,

} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { NovaConversaDialog } from "@/components/atendimento/NovaConversaDialog";

import { toast } from "sonner";
import { limparOrigemAnuncio } from "@/lib/mensagem-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import {
  sendConversaMessage,
  sendConversaAnexo,
  statusJanelaConversa,
  posseConversa,
} from "@/lib/canais.functions";
import {
  assumirConversa,
  devolverParaIA,
  encerrarConversa,
  listarAtendentesParaTransferencia,
  colocarConversaEmEspera,
  retomarConversa,
} from "@/lib/atendimento.functions";
import { TransferirConversaDialog } from "@/components/atendimento/TransferirConversaDialog";
import {
  estaEmEspera,
  horasSemResposta,
  rotuloTempo,
  textoBolhaEspera,
} from "@/lib/atendimento-espera";
import { useAuth } from "@/hooks/use-auth";
import { podeEscreverConversa } from "@/lib/permissoes";
import { usePoll } from "@/hooks/use-poll";
import { useAutoScrollMensagens } from "@/hooks/use-auto-scroll-mensagens";
import { TemplatesButton } from "@/components/atendimento/TemplatesButton";
import { TemplateMetaDialog } from "@/components/atendimento/TemplateMetaDialog";
import { IAButton, IAPreview, type ModoIA } from "@/components/atendimento/IAAssistButton";
import { assistenteRedacao } from "@/lib/assistente-redacao.functions";

import type { Database } from "@/integrations/supabase/types";

type Conversa = Database["public"]["Tables"]["whatsapp_conversas"]["Row"];
type Mensagem = Database["public"]["Tables"]["whatsapp_mensagens"]["Row"];

type ConversasSearch = { c?: string };

/** Tipos de documento aceitos pela API da Meta (limite de 100 MB). */
const DOCUMENTOS_ACEITOS = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
]);

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
  const [escopo, setEscopo] = useState<"minhas" | "todos">("minhas");
  const [responsavel, setResponsavel] = useState<string>("todos");
  const [incluirEncerradas, setIncluirEncerradas] = useState(false);
  const [atendentes, setAtendentes] = useState<Array<{ id: string; name: string }>>([]);
  const [aba, setAba] = useState<Aba>("aguardando");
  const [fila, setFila] = useState<Fila>("todas");
  const [novoAberto, setNovoAberto] = useState(false);
  const todas = isAdmin && escopo === "todos";

  const listarAtendentes = useServerFn(listarAtendentesParaTransferencia);
  useEffect(() => {
    if (!isAdmin) return;
    void listarAtendentes()
      .then((v) => setAtendentes(v as Array<{ id: string; name: string }>))
      .catch(() => setAtendentes([]));
  }, [isAdmin, listarAtendentes]);

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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conversas" },
        () => void load(),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_mensagens" },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load]);

  // fallback de polling: pausa com a aba oculta e afrouxa sem conversa aberta
  usePoll(() => void load(), 45000, selectedId === null);

  // "Aguardando" = última mensagem é do cliente E a conversa não está em espera
  // declarada (espera = já respondemos e estamos aguardando algo do cliente).
  const aguardandoIds = useMemo(() => {
    const s = new Set<string>();
    for (const c of conversas) {
      if (ultimoAutor[c.id] === "cliente" && !estaEmEspera(c)) s.add(c.id);
    }
    return s;
  }, [conversas, ultimoAutor]);

  const daFila = useMemo(
    () =>
      conversas.filter((c) => {
        if (!naFila(c, fila)) return false;
        if (!incluirEncerradas && fila !== "encerrado" && c.status === "encerrado") return false;
        if (todas && responsavel !== "todos") {
          if (responsavel === "sem_responsavel") return !c.atribuido_para;
          if (c.atribuido_para !== responsavel) return false;
        }
        return true;
      }),
    [conversas, fila, incluirEncerradas, todas, responsavel],
  );

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

      <div className="grid gap-0 overflow-hidden rounded-xl border bg-card h-[calc(100dvh-11rem)] min-h-[420px] md:h-[calc(100dvh-12rem)] md:min-h-[540px] md:grid-cols-[340px_1fr] xl:grid-cols-[380px_1fr]">
        {/* Coluna esquerda */}
        <div
          className={cn(
            "min-h-0 flex-col border-b md:flex md:border-b-0 md:border-r",
            selectedId ? "hidden" : "flex",
          )}
        >
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
              <div className="flex flex-wrap items-center gap-2">
                <Select value={escopo} onValueChange={(v) => setEscopo(v as "minhas" | "todos")}>
                  <SelectTrigger className="h-8 w-[132px] text-xs" aria-label="Escopo das conversas">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minhas">Minhas conversas</SelectItem>
                    <SelectItem value="todos">Todos os atendentes</SelectItem>
                  </SelectContent>
                </Select>
                {todas && (
                  <Select value={responsavel} onValueChange={setResponsavel}>
                    <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="Filtrar por responsável">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos os responsáveis</SelectItem>
                      <SelectItem value="sem_responsavel">Sem responsável</SelectItem>
                      {atendentes.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={incluirEncerradas}
                onChange={(e) => setIncluirEncerradas(e.target.checked)}
              />
              Incluir conversas encerradas
            </label>

          </div>
          <ul className="min-h-0 flex-1 divide-y overflow-auto">
            {filtradas.map((c) => {
              const nome = c.name?.trim() || c.phone;
              const active = c.id === selectedId;
              const badge = naoLidas[c.id] ?? 0;
              const aguardando = aguardandoIds.has(c.id);
              const emEspera = estaEmEspera(c);
              const semResposta = horasSemResposta(c);
              const responsavelNome = todas
                ? (atendentes.find((a) => a.id === c.atribuido_para)?.name ??
                  (c.atribuido_para ? null : "Sem responsável"))
                : null;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => selecionar(c.id)}
                    className={cn(
                      "flex w-full items-center gap-3 border-l-2 px-3 py-3 text-left transition-colors",
                      aguardando ? "border-l-destructive bg-destructive/5" : "border-l-transparent",
                      emEspera && "border-l-amber-500 bg-amber-500/5",
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
                          {limparOrigemAnuncio(c.last_message_preview ?? "").trim() ||
                            "Sem mensagens"}
                        </span>
                        {emEspera ? (
                          <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 text-[10px] font-medium text-amber-700">
                            Em espera
                          </span>
                        ) : semResposta !== null ? (
                          <span
                            className={cn(
                              "shrink-0 text-[10px] font-medium",
                              semResposta >= 2 ? "text-destructive" : "text-muted-foreground",
                            )}
                            title="Tempo sem resposta do atendente"
                          >
                            {rotuloTempo(semResposta)} sem resposta
                          </span>
                        ) : null}
                      </span>
                      {responsavelNome && (
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                          Responsável: {responsavelNome}
                        </span>
                      )}
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
        <div className={cn("min-h-0 flex-col md:flex", selectedId ? "flex" : "hidden")}>
          <ChatPanel
            conversa={selected}
            onChanged={load}
            onVoltar={() => void navigate({ search: {} })}
          />
        </div>
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = {
  ia_atendendo: "IA atendendo",
  humano_atendendo: "Atendimento humano",
  qualificado: "Qualificado",
  encerrado: "Encerrado",
};

function diaLabel(iso: string) {
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

function ChatPanel({
  conversa,
  onChanged,
  onVoltar,
}: {
  conversa: Conversa | null;
  onChanged: () => void;
  onVoltar?: () => void;
}) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [nomesUsuarios, setNomesUsuarios] = useState<Record<string, string>>({});
  const [atendentes, setAtendentes] = useState<Array<{ id: string; name: string }>>([]);
  const [transferirAberto, setTransferirAberto] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [empresaLead, setEmpresaLead] = useState<string | null>(null);
  const [iaLoading, setIaLoading] = useState(false);
  const [iaPreview, setIaPreview] = useState<string | null>(null);

  const [acaoEmCurso, setAcaoEmCurso] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);

  const send = useServerFn(sendConversaMessage);
  const enviarAnexo = useServerFn(sendConversaAnexo);
  const pedirIA = useServerFn(assistenteRedacao);
  const assumir = useServerFn(assumirConversa);
  const devolver = useServerFn(devolverParaIA);
  const encerrar = useServerFn(encerrarConversa);
  const porEmEspera = useServerFn(colocarConversaEmEspera);
  const retomar = useServerFn(retomarConversa);
  const listarAtendentes = useServerFn(listarAtendentesParaTransferencia);
  const buscarJanela = useServerFn(statusJanelaConversa);
  const verificarPosse = useServerFn(posseConversa);

  const [modelosAberto, setModelosAberto] = useState(false);
  const [janela24h, setJanela24h] = useState<{ aberta: boolean; nome: string } | null>(null);

  // Controle de auto-scroll: só rola ao trocar de conversa ou quando chega mensagem nova.
  const { temNovas, onScroll, scrollParaFim } = useAutoScrollMensagens(
    scrollRef,
    conversa?.id ?? null,
    mensagens,
  );

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
    const lista = data ?? [];
    setMensagens(lista);
    const ids = [...new Set(lista.map((m) => m.usuario_id).filter(Boolean))] as string[];
    if (ids.length > 0) {
      const { data: perfis } = await supabase.from("profiles").select("id, name").in("id", ids);
      const map: Record<string, string> = {};
      for (const p of perfis ?? []) map[p.id] = p.name;
      setNomesUsuarios(map);
    }
  }, []);

  useEffect(() => {
    void listarAtendentes()
      .then((v) => setAtendentes(v as Array<{ id: string; name: string }>))
      .catch(() => setAtendentes([]));
  }, [listarAtendentes]);

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
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversa, loadMensagens]);

  const conversaIdAtual = conversa?.id ?? null;
  usePoll(
    () => {
      if (!conversaIdAtual) return;
      void loadMensagens(conversaIdAtual);
      onChanged(); // único poll ativo enquanto há conversa aberta
    },
    12000,
    conversaIdAtual !== null,
  );

  useEffect(() => {
    const leadId = conversa?.lead_id ?? null;
    if (!leadId) {
      setEmpresaLead(null);
      return;
    }
    void supabase
      .from("leads")
      .select("company, contact_name")
      .eq("id", leadId)
      .maybeSingle()
      .then(({ data }) => setEmpresaLead(data?.company ?? null));
  }, [conversa?.lead_id]);

  useEffect(() => {
    const id = conversa?.id;
    if (!id) {
      setJanela24h(null);
      return;
    }
    let ativo = true;
    void buscarJanela({ data: { conversaId: id } })
      .then((r) => {
        if (ativo) setJanela24h({ aberta: r.janelaAberta, nome: r.primeiroNomeSugerido });
      })
      .catch(() => {
        if (ativo) setJanela24h(null);
      });
    return () => {
      ativo = false;
    };
  }, [conversa?.id, mensagens.length, buscarJanela]);

  if (!conversa) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center bg-background p-8">
        <div className="text-center text-sm text-muted-foreground">
          <MessageSquare className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          Escolha uma conversa à esquerda para começar a responder.
        </div>
      </div>
    );
  }

  const nome = conversa.name?.trim() || conversa.phone;
  const iaNoControle = conversa.ia_ativa && conversa.status === "ia_atendendo";
  const encerrada = conversa.status === "encerrado";
  // Escrita manual só em conversas aguardando humano ou em atendimento humano
  // (admin não é limitado). Mesmo guard existe no servidor.
  const bloqueadoPorStatus = user?.role !== "admin" && !podeEscreverConversa(conversa.status);
  const temInbound = mensagens.some((m) => m.direcao === "entrada");
  const agoraSP = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const dentroDaJanela =
    agoraSP.getDay() !== 0 && agoraSP.getHours() >= 7 && agoraSP.getHours() < 20;

  const emEspera = estaEmEspera(conversa);
  const donoAtual = conversa.atribuido_para ?? null;
  const souDono = !!donoAtual && donoAtual === user?.id;
  const podeMexerNaEspera = isAdmin || souDono;
  const nomeQuemColocou = conversa.em_espera_por
    ? (atendentes.find((a) => a.id === conversa.em_espera_por)?.name ?? null)
    : null;
  const horasSemResp = horasSemResposta(conversa);
  const janelaAberta = janela24h?.aberta === true;
  // Primeiro nome do atendente logado, usado nas frases com {{atendente}}.
  const primeiroNomeAtendente = (user?.name ?? "").trim().split(/\s+/)[0] ?? null;
  const empresaLead = conversa.name?.trim() || null;




  async function rodarAcao(fn: () => Promise<unknown>, ok: string) {
    setAcaoEmCurso(true);
    try {
      await fn();
      toast.success(ok);
      onChanged();
    } catch (e) {
      toast.error("Não foi possível concluir", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setAcaoEmCurso(false);
    }
  }

  async function handleSend() {
    if (!conversa || !text.trim()) return;
    setSending(true);
    try {
      let assumirPosse = false;
      const posse = await verificarPosse({ data: { conversaId: conversa.id } });
      if (!posse.souDono && !posse.semDono) {
        assumirPosse = window.confirm(
          `Esta conversa está com ${posse.nomeDono ?? "outro atendente"}. Assumir o atendimento?`,
        );
      }
      if (iaNoControle) await assumir({ data: { conversaId: conversa.id } });
      await send({ data: { conversaId: conversa.id, message: text.trim(), assumirPosse } });
      setText("");
      void loadMensagens(conversa.id);
      onChanged();
    } catch (e) {
      toast.error("Falha ao enviar", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  }

  async function handleAnexo(file: File) {
    if (!conversa) return;

    const mime = file.type || "application/octet-stream";
    const MB = 1024 * 1024;
    let tipoEnvio: "image" | "document" | "audio" | "video";
    let limite: number;

    if (mime === "image/jpeg" || mime === "image/png") {
      tipoEnvio = "image";
      limite = 5 * MB;
    } else if (mime.startsWith("audio/")) {
      tipoEnvio = "audio";
      limite = 16 * MB;
    } else if (mime.startsWith("video/")) {
      tipoEnvio = "video";
      limite = 16 * MB;
    } else if (DOCUMENTOS_ACEITOS.has(mime)) {
      tipoEnvio = "document";
      limite = 100 * MB;
    } else {
      toast.error("Tipo de arquivo não suportado", {
        description:
          "Aceitos: imagem JPEG/PNG, áudio, vídeo, PDF, Word, Excel, PowerPoint e texto.",
      });
      return;
    }

    if (file.size > limite) {
      toast.error("Arquivo muito grande", {
        description: `Limite para este tipo: ${Math.round(limite / MB)} MB.`,
      });
      return;
    }

    const legenda = window.prompt("Legenda (opcional):", "")?.trim() ?? "";

    setEnviandoAnexo(true);
    try {
      const nomeSeguro = file.name
        .normalize("NFD")
        .replace(/[^\w.\-]+/g, "_")
        .slice(-120);
      const caminho = `${conversa.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${nomeSeguro}`;

      const { error: upErr } = await supabase.storage
        .from("whatsapp-anexos")
        .upload(caminho, file, { contentType: mime, upsert: false });
      if (upErr) throw new Error(upErr.message);

      const dezAnosEmSegundos = 10 * 365 * 24 * 60 * 60;
      const { data: signed, error: signedErr } = await supabase.storage
        .from("whatsapp-anexos")
        .createSignedUrl(caminho, dezAnosEmSegundos);
      if (signedErr) throw new Error(signedErr.message);
      const fileUrl = signed.signedUrl;

      let assumirPosse = false;
      const posse = await verificarPosse({ data: { conversaId: conversa.id } });
      if (!posse.souDono && !posse.semDono) {
        assumirPosse = window.confirm(
          `Esta conversa está com ${posse.nomeDono ?? "outro atendente"}. Assumir o atendimento?`,
        );
      }
      if (iaNoControle) await assumir({ data: { conversaId: conversa.id } });

      await enviarAnexo({
        data: {
          conversaId: conversa.id,
          fileUrl,
          mimeType: mime,
          fileName: file.name.slice(-120),
          ...(legenda ? { caption: legenda } : {}),
          tipoEnvio,
          assumirPosse,
        },
      });

      void loadMensagens(conversa.id);
      onChanged();
      toast.success("Anexo enviado");
    } catch (e) {
      toast.error("Falha ao enviar anexo", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setEnviandoAnexo(false);
    }
  }

  async function handleIA(modo: ModoIA) {
    if (!conversa) return;
    setIaLoading(true);
    try {
      const r = await pedirIA({ data: { conversaId: conversa.id, rascunho: text, modo } });
      setIaPreview(r.texto);
    } catch (e) {
      toast.error("Assistente de IA indisponível", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setIaLoading(false);
    }
  }

  const conversaId = conversa.id;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b bg-muted/40 px-4 py-3">
        <div className="flex items-center gap-3">
          {onVoltar && (
            <button
              type="button"
              onClick={onVoltar}
              aria-label="Voltar para a lista"
              className="-ml-1 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted md:hidden"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {iniciais(nome) || "?"}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-medium">{nome}</span>
              <span className="rounded-full border bg-background px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {STATUS_LABEL[conversa.status] ?? conversa.status}
              </span>
              {emEspera && (
                <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  <PauseCircle className="h-3 w-3" /> Em espera
                </span>
              )}
              {!emEspera && horasSemResp !== null && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {rotuloTempo(horasSemResp)} sem resposta
                </span>
              )}
              {conversa.requer_humano && (
                <span className="flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-semibold text-destructive-foreground">
                  <AlertTriangle className="h-3 w-3" /> Requer humano
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              {conversa.phone}
            </div>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {iaNoControle && (
            <Button
              size="sm"
              variant="secondary"
              disabled={acaoEmCurso}
              onClick={() =>
                void rodarAcao(() => assumir({ data: { conversaId } }), "Conversa assumida")
              }
            >
              <UserIcon className="mr-1 h-3.5 w-3.5" /> Assumir
            </Button>
          )}
          {!iaNoControle && !encerrada && (
            <Button
              size="sm"
              variant="outline"
              disabled={acaoEmCurso}
              onClick={() =>
                void rodarAcao(() => devolver({ data: { conversaId } }), "Devolvida para a IA")
              }
            >
              <Bot className="mr-1 h-3.5 w-3.5" /> Devolver para IA
            </Button>
          )}
          {!encerrada && (
            <Button
              size="sm"
              variant="outline"
              disabled={acaoEmCurso}
              onClick={() => setTransferirAberto(true)}
            >
              <ArrowRightLeft className="mr-1 h-3.5 w-3.5" /> Transferir
            </Button>
          )}
          {!encerrada &&
            podeMexerNaEspera &&
            (emEspera ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={acaoEmCurso}
                onClick={() =>
                  void rodarAcao(() => retomar({ data: { conversaId } }), "Atendimento retomado")
                }
              >
                <PlayCircle className="mr-1 h-3.5 w-3.5" /> Retomar
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={acaoEmCurso}
                onClick={() =>
                  void rodarAcao(
                    () => porEmEspera({ data: { conversaId } }),
                    "Atendimento em espera — aguardando o cliente",
                  )
                }
              >
                <PauseCircle className="mr-1 h-3.5 w-3.5" /> Em espera
              </Button>
            ))}
          {!encerrada && (
            <Button
              size="sm"
              variant="destructive"
              disabled={acaoEmCurso}
              onClick={() => {
                if (!window.confirm("Encerrar esta conversa? Ela sairá da fila de atendimento.")) {
                  return;
                }
                void rodarAcao(() => encerrar({ data: { conversaId } }), "Conversa encerrada");
              }}
            >
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Finalizar
            </Button>
          )}
        </div>

        {emEspera && (
          <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700">
            Este atendimento está em espera — não entra nos indicadores de cliente sem resposta.
            Assim que o cliente responder, ele volta sozinho para a fila.
          </div>
        )}

        <TransferirConversaDialog
          open={transferirAberto}
          onOpenChange={setTransferirAberto}
          conversaId={conversaId}
          donoAtual={donoAtual}
          onTransferido={onChanged}
        />

      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="min-h-0 flex-1 space-y-2 overflow-auto p-4"
        >
          {mensagens.map((m, i) => {
            const anterior = i > 0 ? mensagens[i - 1] : undefined;
            const novoDia =
              !anterior ||
              new Date(anterior.created_at).toDateString() !==
                new Date(m.created_at).toDateString();
            return (
              <div key={m.id} className="space-y-2">
                {novoDia && (
                  <div className="flex justify-center">
                    <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-medium text-muted-foreground">
                      {diaLabel(m.created_at)}
                    </span>
                  </div>
                )}
                <Bolha
                  m={m}
                  nomeVendedor={m.usuario_id ? nomesUsuarios[m.usuario_id] : undefined}
                />
              </div>
            );
          })}
          {emEspera && conversa.em_espera_desde && (
            <div className="flex justify-center">
              <span className="max-w-[85%] rounded-full bg-muted px-3 py-1 text-center text-[11px] text-muted-foreground">
                {textoBolhaEspera({
                  em_espera_desde: conversa.em_espera_desde,
                  nomeQuemColocou,
                })}
              </span>
            </div>
          )}

          {mensagens.length === 0 && (
            <div className="py-10 text-center text-xs text-muted-foreground">
              Sem mensagens nesta conversa ainda.
            </div>
          )}
        </div>
        {temNovas && (
          <button
            type="button"
            onClick={scrollParaFim}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border bg-background/95 px-3 py-1 text-[11px] font-medium shadow-md backdrop-blur"
          >
            Novas mensagens
          </button>
        )}
      </div>

      <div className="space-y-2 border-t p-3">
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
              janelaAberta
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-amber-500/10 text-amber-600",
            )}
          >
            {janelaAberta
              ? "Pode responder livremente"
              : "Fora da janela de 24h — só modelo aprovado"}
          </span>
          {!temInbound && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-600">
              Sem mensagem do cliente
            </span>
          )}
          {!temInbound && !dentroDaJanela && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
              Sem mensagem do cliente: envio só de segunda a sábado, 07–20h
            </span>
          )}

        </div>
        {iaNoControle && (
          <div className="text-[11px] text-muted-foreground">
            A IA está atendendo. Ao enviar, você assume a conversa automaticamente.
          </div>
        )}
        {bloqueadoPorStatus && (
          <div className="rounded-md border border-border bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
            Esta conversa não está em atendimento humano. Assuma o atendimento para responder.
          </div>
        )}
        {iaPreview && (
          <IAPreview
            texto={iaPreview}
            onUsar={() => {
              setText(iaPreview);
              setIaPreview(null);
            }}
            onDescartar={() => setIaPreview(null)}
          />
        )}

        {!janelaAberta ? (
          <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-start gap-2 text-sm text-amber-800">
              <Clock className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Janela de 24h encerrada — o WhatsApp só permite enviar um modelo aprovado pela
                Meta. Quando o cliente responder, a conversa volta a aceitar texto livre.
              </p>
            </div>
            <Button
              size="lg"
              className="w-full gap-2"
              disabled={sending || bloqueadoPorStatus}
              onClick={() => setModelosAberto(true)}
            >
              <BadgeCheck className="h-4 w-4" /> Escolher modelo aprovado
            </Button>
            <div className="flex gap-1">
              <TemplatesButton
                nome={conversa.name}
                empresa={empresaLead ?? conversa.name}
                atendente={primeiroNomeAtendente}
                disabled
                tituloBotao="Frases prontas indisponíveis fora da janela de 24h"
                onInserir={() => undefined}
              />
              <Button
                size="icon"
                variant="ghost"
                disabled
                title="Janela de 24h encerrada — anexos indisponíveis"
                aria-label="Anexar arquivo"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                disabled
                title="Janela de 24h encerrada — sugestões da IA indisponíveis"
                aria-label="Assistente de redação"
              >
                <Sparkles className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <div className="flex gap-1 pb-1">
              <TemplatesButton
                nome={conversa.name}
                empresa={empresaLead ?? conversa.name}
                atendente={primeiroNomeAtendente}
                disabled={sending}
                onInserir={(t) => setText((prev) => (prev.trim() ? `${prev.trim()}\n${t}` : t))}
              />
              <Button
                size="sm"
                variant="ghost"
                className="h-9 gap-1"
                disabled={sending}
                title="Modelos aprovados pela Meta — obrigatórios fora da janela de 24h"
                onClick={() => setModelosAberto(true)}
              >
                <BadgeCheck className="h-4 w-4" />
                Modelo Meta
              </Button>
              <IAButton
                disabled={sending}
                loading={iaLoading}
                onAcao={(modo) => void handleIA(modo)}
              />
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void handleAnexo(f);
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                disabled={sending || enviandoAnexo || bloqueadoPorStatus}
                title="Anexar arquivo"
                aria-label="Anexar arquivo"
                onClick={() => fileInputRef.current?.click()}
              >
                {enviandoAnexo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Paperclip className="h-4 w-4" />
                )}
              </Button>

              <Button
                size="icon"
                variant="ghost"
                disabled
                title="Áudio — em breve"
                aria-label="Áudio (em breve)"
              >
                <Mic className="h-4 w-4" />
              </Button>
            </div>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                bloqueadoPorStatus
                  ? "Somente leitura — assuma o atendimento para responder"
                  : "Escreva uma mensagem…"
              }
              rows={2}
              disabled={sending || bloqueadoPorStatus}
              className="resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
            />
            <Button
              onClick={handleSend}
              disabled={sending || bloqueadoPorStatus || !text.trim()}
              className="gap-1"
            >
              <Send className="h-4 w-4" /> Enviar
            </Button>
          </div>
        )}
        <TemplateMetaDialog
          open={modelosAberto}
          onOpenChange={setModelosAberto}
          conversaId={conversa.id}
          nomeSugerido={janela24h?.nome}
          empresaSugerida={empresaLead ?? conversa.name}
          atendenteSugerido={primeiroNomeAtendente}
          onEnviado={() => {
            void loadMensagens(conversa.id);
            onChanged();
          }}
        />
      </div>

    </div>
  );
}

/** Extrai a primeira URL utilizável do jsonb `midia`, se houver. */
function urlDaMidia(midia: unknown): string | null {
  if (!midia || typeof midia !== "object") return null;
  const obj = midia as Record<string, unknown>;
  for (const k of ["url", "link", "fileUrl", "imageUrl", "audioUrl", "documentUrl", "mediaUrl"]) {
    const v = obj[k];
    if (typeof v === "string" && /^https?:\/\//.test(v)) return v;
  }
  return null;
}

function Bolha({ m, nomeVendedor }: { m: Mensagem; nomeVendedor?: string }) {
  const isCliente = m.autor === "cliente";
  const isResumoOpa = (m.tipo ?? "").toLowerCase() === "resumo_opa";
  const isIA = m.autor === "ia" && !isResumoOpa;
  const Icon = isResumoOpa ? FileText : isIA ? Bot : UserIcon;
  const rotulo = isResumoOpa
    ? "Atendimento externo (OPA)"
    : isCliente
      ? "Cliente"
      : isIA
        ? "IA — Lucas"
        : (nomeVendedor ?? "Você");
  const url = urlDaMidia(m.midia);
  const tipo = (m.tipo ?? "texto").toLowerCase();

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
            {limparOrigemAnuncio(m.conteudo ?? "").trim() || (tipo !== "texto" ? `[${tipo}]` : "")}
          </div>
        )}

        <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-60">
          {new Date(m.created_at).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
          {/* Check apenas decorativo: não existe status de entrega real no banco. */}
          {m.external_id && <Check className="h-3 w-3" />}
        </div>
      </div>
    </div>
  );
}
