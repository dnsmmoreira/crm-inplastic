import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  MessageSquare,
  Phone,
  Zap,
  UserPlus,
  Radio,
  Copy,
  Wifi,
  Send,
  Bot,
  User as UserIcon,
  CheckCircle2,
  Paperclip,
  AlertTriangle,
  RefreshCw,
  Activity,

} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LeadDrawer } from "@/components/crm/LeadDrawer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { zapiStatus } from "@/lib/zapi.functions";
import { sendConversaMessage, createLeadFromConversa } from "@/lib/canais.functions";
import { painelWhatsapp, removerOptout } from "@/lib/zapi-painel.functions";
import type { Database } from "@/integrations/supabase/types";

type Conversa = Database["public"]["Tables"]["whatsapp_conversas"]["Row"];
type Mensagem = Database["public"]["Tables"]["whatsapp_mensagens"]["Row"];

export const Route = createFileRoute("/canais")({
  component: CanaisPage,
  head: () => ({
    meta: [{ title: "Canais de Entrada — INPLASTIC - CRM" }],
  }),
});

function CanaisPage() {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openLead, setOpenLead] = useState<string | null>(null);

  const loadConversas = useCallback(async () => {
    const { data, error } = await supabase
      .from("whatsapp_conversas")
      .select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) {
      console.error(error);
      return;
    }
    setConversas(data ?? []);
  }, []);

  // Realtime + fallback polling
  useEffect(() => {
    void loadConversas();
    const channel = supabase
      .channel("canais-conversas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whatsapp_conversas" },
        () => void loadConversas(),
      )
      .subscribe();
    const t = setInterval(loadConversas, 5000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(t);
    };
  }, [loadConversas]);

  const selected = useMemo(
    () => conversas.find((c) => c.id === selectedId) ?? null,
    [conversas, selectedId],
  );

  const stats = useMemo(() => {
    const total = conversas.length;
    const semLead = conversas.filter((c) => !c.lead_id).length;
    const iaAtiva = conversas.filter((c) => c.ia_ativa).length;
    return { total, semLead, iaAtiva };
  }, [conversas]);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold flex items-center gap-2">
            <MessageSquare className="h-7 w-7 text-primary" /> Canais de Entrada
          </h1>
          <p className="text-sm text-muted-foreground">
            Conversas de WhatsApp em tempo real · integração Z-API
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Conversas" value={stats.total} />
        <StatCard label="Sem lead vinculado" value={stats.semLead} tone="warn" />
        <StatCard label="IA atendendo" value={stats.iaAtiva} tone="ok" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr_320px]">
        <ConversationList
          conversas={conversas}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        <ConversationPanel
          conversa={selected}
          onOpenLead={(id) => setOpenLead(id)}
          onLeadCreated={() => void loadConversas()}
        />

        <aside className="space-y-4">
          <div className="rounded-xl border bg-gradient-to-br from-primary/10 to-transparent p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Radio className="h-4 w-4 text-primary" /> Integrações
            </div>
            <ZapiStatusRow />
            <IntegrationRow name="Formulário do site" status="pendente" />
            <IntegrationRow name="Instagram DM" status="pendente" />
          </div>

          <ZapiCard />

          <PainelSaudeWhatsapp />

        </aside>
      </div>

      <LeadDrawer
        leadId={openLead}
        open={!!openLead}
        onOpenChange={(o) => !o && setOpenLead(null)}
      />
    </div>
  );
}

function ConversationList({
  conversas,
  selectedId,
  onSelect,
}: {
  conversas: Conversa[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          Conversas
        </div>
        <span className="text-xs text-muted-foreground">{conversas.length}</span>
      </div>
      <ul className="divide-y max-h-[600px] overflow-y-auto">
        {conversas.map((c) => {
          const label = c.name?.trim() || c.phone;
          const initial = label.slice(0, 1).toUpperCase();
          const preview = c.last_message_preview ?? "—";
          const when = c.last_message_at
            ? formatDistanceToNow(new Date(c.last_message_at), { locale: ptBR, addSuffix: true })
            : "sem mensagens";
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className={cn(
                  "w-full text-left flex items-start gap-3 p-3 hover:bg-muted/30 transition-colors",
                  selectedId === c.id && "bg-muted/50",
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-semibold shrink-0">
                  {initial}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{label}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{when}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground truncate">{preview}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    {c.lead_id ? (
                      <Badge variant="secondary" className="text-[10px] gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Lead
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Sem lead</Badge>
                    )}
                    <StatusChip status={c.status} />
                    {c.requer_humano && (
                      <Badge variant="destructive" className="text-[10px] gap-1">
                        <AlertTriangle className="h-3 w-3" /> Requer humano
                      </Badge>
                    )}

                  </div>
                </div>
              </button>
            </li>
          );
        })}
        {conversas.length === 0 && (
          <li className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma conversa ainda.
          </li>
        )}
      </ul>
    </div>
  );
}

function ConversationPanel({
  conversa,
  onOpenLead,
  onLeadCreated,
}: {
  conversa: Conversa | null;
  onOpenLead: (id: string) => void;
  onLeadCreated: () => void;
}) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const send = useServerFn(sendConversaMessage);
  const createLead = useServerFn(createLeadFromConversa);

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
    const conversaId = conversa.id;
    void loadMensagens(conversaId);
    const channel = supabase
      .channel(`canais-mensagens-${conversaId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "whatsapp_mensagens",
          filter: `conversa_id=eq.${conversaId}`,
        },
        () => void loadMensagens(conversaId),
      )
      .subscribe();
    const t = setInterval(() => void loadMensagens(conversaId), 5000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(t);
    };
  }, [conversa, loadMensagens]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [mensagens]);

  if (!conversa) {
    return (
      <div className="rounded-xl border bg-card flex items-center justify-center min-h-[600px]">
        <div className="text-center text-sm text-muted-foreground p-8">
          <MessageSquare className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
          Selecione uma conversa para visualizar o histórico.
        </div>
      </div>
    );
  }

  async function handleSend() {
    if (!conversa) return;
    if (!text.trim()) return;
    setSending(true);
    try {
      await send({ data: { conversaId: conversa.id, message: text.trim() } });
      setText("");
      void loadMensagens(conversa.id);
    } catch (e) {
      toast.error("Falha ao enviar", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSending(false);
    }
  }

  async function handleCreateLead() {
    if (!conversa) return;
    setCreating(true);
    try {
      const r = await createLead({ data: { conversaId: conversa.id } });
      toast.success("Lead criado", { description: "Vinculado à conversa." });
      onLeadCreated();
      onOpenLead(r.leadId);
    } catch (e) {
      toast.error("Falha ao criar lead", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setCreating(false);
    }
  }

  const label = conversa.name?.trim() || conversa.phone;

  return (
    <div className="rounded-xl border bg-card flex flex-col min-h-[600px] max-h-[720px]">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{label}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {conversa.phone}
            <StatusChip status={conversa.status} className="ml-2" />
          </div>
          {conversa.requer_humano && (
            <div className="mt-1 flex items-center gap-1 text-[11px] text-destructive">
              <AlertTriangle className="h-3 w-3" />
              Atendimento humano necessário
              {conversa.motivo_handoff ? ` (${conversa.motivo_handoff})` : ""}
            </div>
          )}
        </div>

        <div className="flex gap-2 shrink-0">
          {conversa.lead_id ? (
            <Button size="sm" variant="outline" onClick={() => onOpenLead(conversa.lead_id!)}>
              Ver lead
            </Button>
          ) : (
            <Button size="sm" onClick={handleCreateLead} disabled={creating} className="gap-1">
              <UserPlus className="h-3.5 w-3.5" />
              {creating ? "Criando..." : "Criar lead"}
            </Button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-muted/10">
        {mensagens.map((m) => (
          <MessageBubble key={m.id} m={m} />
        ))}
        {mensagens.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-10">
            Sem mensagens nesta conversa.
          </div>
        )}
      </div>

      <div className="border-t p-3 flex gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Digite uma mensagem..."
          rows={2}
          className="resize-none text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
        />
        <Button onClick={handleSend} disabled={sending || !text.trim()} className="self-end gap-1">
          <Send className="h-4 w-4" />
          {sending ? "..." : "Enviar"}
        </Button>
      </div>
    </div>
  );
}

function MidiaPreview({ m }: { m: Mensagem }) {
  const tipo = (m as { tipo?: string }).tipo ?? "texto";
  const midia = (m.midia ?? null) as Record<string, unknown> | null;
  const url = typeof midia?.url === "string" ? midia.url : null;
  if (tipo === "texto" || tipo === "resposta_opcao") return null;

  return (
    <div className="mt-1 space-y-1">
      <Badge variant="outline" className="text-[10px] gap-1">
        <Paperclip className="h-3 w-3" /> {tipo}
      </Badge>
      {url && tipo === "imagem" && (
        <a href={url} target="_blank" rel="noreferrer" className="block">
          <img src={url} alt="Imagem recebida" className="max-h-40 rounded-md border" />
        </a>
      )}
      {url && tipo !== "imagem" && (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs underline break-all"
        >
          <Paperclip className="h-3 w-3" />
          {typeof midia?.fileName === "string" && midia.fileName ? midia.fileName : "Abrir arquivo"}
        </a>
      )}
    </div>
  );
}

function MessageBubble({ m }: { m: Mensagem }) {
  const isOutgoing = m.direcao === "saida";
  const isBot = m.autor === "ia";
  return (
    <div className={cn("flex", isOutgoing ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-3 py-2 text-sm shadow-sm",
          isOutgoing
            ? isBot
              ? "bg-primary/10 text-foreground border border-primary/30"
              : "bg-emerald-500 text-white"
            : "bg-card border",
        )}
      >
        <div className="flex items-center gap-1 text-[10px] opacity-80 mb-0.5">
          {isBot ? <Bot className="h-3 w-3" /> : <UserIcon className="h-3 w-3" />}
          <span className="capitalize">{m.autor}</span>
          <span>·</span>
          <span>{format(new Date(m.created_at), "HH:mm")}</span>
        </div>
        <div className="whitespace-pre-wrap break-words">{m.conteudo}</div>
        <MidiaPreview m={m} />
      </div>
    </div>
  );
}


function StatusChip({
  status,
  className,
}: {
  status: Conversa["status"];
  className?: string;
}) {
  const map: Record<Conversa["status"], { label: string; cls: string }> = {
    ia_atendendo: { label: "IA", cls: "border-blue-500/50 text-blue-700" },
    humano_atendendo: { label: "Humano", cls: "border-emerald-500/50 text-emerald-700" },
    qualificado: { label: "Qualificado", cls: "border-violet-500/50 text-violet-700" },
    encerrado: { label: "Encerrado", cls: "border-muted-foreground/40 text-muted-foreground" },
  };
  const it = map[status];
  return (
    <Badge variant="outline" className={cn("text-[10px]", it.cls, className)}>
      {it.label}
    </Badge>
  );
}

function ZapiCard() {
  const check = useServerFn(zapiStatus);
  const [state, setState] = useState<"idle" | "loading" | "ok" | "err">("idle");
  const [info, setInfo] = useState<string>("");
  const [webhookUrl, setWebhookUrl] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setWebhookUrl(`${window.location.origin}/api/public/zapi/webhook`);
    }
  }, []);

  async function testar() {
    setState("loading");
    try {
      const r = await check();
      if (!r.configured) {
        setState("err");
        setInfo("Variáveis Z-API ausentes.");
        return;
      }
      setState(r.status && r.status >= 200 && r.status < 300 ? "ok" : "err");
      setInfo(r.raw.slice(0, 240));
    } catch (e) {
      setState("err");
      setInfo(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Wifi className="h-4 w-4 text-primary" /> Z-API (WhatsApp)
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">URL do Webhook (cole no painel Z-API → "Ao receber")</Label>
        <div className="flex gap-1.5">
          <input
            readOnly
            value={webhookUrl}
            className="flex-1 rounded-md border bg-muted/40 px-2 py-1.5 text-xs font-mono"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(webhookUrl);
              toast.success("URL copiada");
            }}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={testar}
        disabled={state === "loading"}
        className="w-full"
      >
        {state === "loading" ? "Testando..." : "Testar conexão"}
      </Button>
      {state !== "idle" && state !== "loading" && (
        <div
          className={cn(
            "rounded-md border p-2 text-[11px] font-mono break-all",
            state === "ok"
              ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700"
              : "border-red-500/40 bg-red-500/5 text-red-700",
          )}
        >
          {info || (state === "ok" ? "OK" : "Erro")}
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Configure também "Ao enviar" e "Status da mensagem" apontando para a mesma URL se desejar
        registro completo.
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn";
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 font-display text-3xl font-semibold",
          tone === "ok" && "text-emerald-600",
          tone === "warn" && "text-amber-600",
          !tone && "text-primary",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function IntegrationRow({
  name,
  status,
}: {
  name: string;
  status: "conectado" | "pendente";
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{name}</span>
      <Badge
        variant="outline"
        className={cn(
          "text-[10px]",
          status === "conectado"
            ? "border-emerald-500/50 text-emerald-700"
            : "border-amber-500/50 text-amber-700",
        )}
      >
        {status}
      </Badge>
    </div>
  );
}

/** (6) Status REAL da instância Z-API — substitui o badge fixo antigo. */
function ZapiStatusRow() {
  const check = useServerFn(zapiStatus);
  const [estado, setEstado] = useState<"carregando" | "conectado" | "desconectado" | "nao_configurado">(
    "carregando",
  );
  const [checadoEm, setChecadoEm] = useState<Date | null>(null);

  const verificar = useCallback(async () => {
    setEstado("carregando");
    try {
      const r = await check();
      if (!r.configured) {
        setEstado("nao_configurado");
      } else {
        let ok = false;
        try {
          const p = JSON.parse(r.raw) as { connected?: boolean; smartphoneConnected?: boolean };
          ok = p.connected === true && p.smartphoneConnected === true;
        } catch {
          ok = false;
        }
        setEstado(ok ? "conectado" : "desconectado");
      }
    } catch {
      setEstado("desconectado");
    } finally {
      setChecadoEm(new Date());
    }
  }, [check]);

  useEffect(() => {
    void verificar();
  }, [verificar]);

  const cfg = {
    carregando: { label: "Verificando...", cls: "border-muted-foreground/40 text-muted-foreground" },
    conectado: { label: "Conectado", cls: "border-emerald-500/50 text-emerald-700" },
    desconectado: { label: "Desconectado", cls: "border-red-500/50 text-red-700" },
    nao_configurado: { label: "Nao configurado", cls: "border-amber-500/50 text-amber-700" },
  }[estado];

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span>WhatsApp Business (Z-API)</span>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className={cn("text-[10px]", cfg.cls)}>
            {cfg.label}
          </Badge>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => void verificar()}
            disabled={estado === "carregando"}
            title="Recarregar status"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", estado === "carregando" && "animate-spin")} />
          </Button>
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground">
        {checadoEm
          ? `Última verificação: ${format(checadoEm, "dd/MM/yyyy HH:mm:ss")}`
          : "Nunca verificado"}
      </div>
    </div>
  );
}

type PainelData = Awaited<ReturnType<typeof painelWhatsapp>>;

/** (6/7) Resumo de envios, opt-outs e alertas — somente administrador. */
function PainelSaudeWhatsapp() {
  const carregar = useServerFn(painelWhatsapp);
  const remover = useServerFn(removerOptout);
  const [data, setData] = useState<PainelData | null>(null);
  const [negado, setNegado] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await carregar());
      setNegado(false);
    } catch {
      setNegado(true);
    }
  }, [carregar]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRemover(phone: string) {
    if (!window.confirm(`Remover o opt-out de ${phone}? O contato voltará a receber mensagens.`)) return;
    try {
      await remover({ data: { phone } });
      toast.success("Opt-out removido");
      void load();
    } catch (e) {
      toast.error("Falha ao remover", { description: e instanceof Error ? e.message : String(e) });
    }
  }

  if (negado || !data) return null;

  return (
    <div className="rounded-xl border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Activity className="h-4 w-4 text-primary" /> Saúde de envios (admin)
        </div>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => void load()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border p-2">
          <div className="text-muted-foreground">Últimas 24h</div>
          <div className="text-lg font-semibold">{data.envios.total24h}</div>
          <div className="text-[10px] text-muted-foreground">
            {Object.entries(data.envios.porCanal24h)
              .map(([c, n]) => `${c}: ${n}`)
              .join(" · ") || "sem envios"}
          </div>
        </div>
        <div className="rounded-md border p-2">
          <div className="text-muted-foreground">Última hora</div>
          <div className="text-lg font-semibold">{data.envios.ultimaHora}</div>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium">Últimos envios</div>
        <ul className="max-h-48 overflow-y-auto divide-y text-[11px]">
          {data.envios.recentes.map((e) => (
            <li key={e.id} className="py-1 flex items-center justify-between gap-2">
              <span className="font-mono">{e.phone}</span>
              <span className="text-muted-foreground truncate">
                {e.canal}
                {e.ctx ? ` · ${e.ctx}` : ""}
              </span>
              <span className="text-muted-foreground shrink-0">
                {format(new Date(e.created_at), "dd/MM HH:mm")}
              </span>
            </li>
          ))}
          {data.envios.recentes.length === 0 && (
            <li className="py-2 text-muted-foreground">Nenhum envio registrado.</li>
          )}
        </ul>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium">Opt-outs ({data.optouts.total})</div>
        <ul className="max-h-40 overflow-y-auto divide-y text-[11px]">
          {data.optouts.recentes.map((o) => (
            <li key={o.phone} className="py-1 flex items-center justify-between gap-2">
              <span className="font-mono">{o.phoneMascarado}</span>
              <span className="text-muted-foreground truncate">{o.motivo ?? "—"}</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[10px]"
                onClick={() => void handleRemover(o.phone)}
              >
                Remover
              </Button>
            </li>
          ))}
          {data.optouts.recentes.length === 0 && (
            <li className="py-2 text-muted-foreground">Nenhum opt-out.</li>
          )}
        </ul>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-medium">Alertas (48h)</div>
        <ul className="max-h-40 overflow-y-auto divide-y text-[11px]">
          {data.alertas48h.map((a) => (
            <li key={a.id} className="py-1 flex items-center justify-between gap-2">
              <span className="text-destructive">{a.tipo}</span>
              <span className="text-muted-foreground">{a.canal}</span>
              <span className="text-muted-foreground shrink-0">
                {format(new Date(a.created_at), "dd/MM HH:mm")}
              </span>
            </li>
          ))}
          {data.alertas48h.length === 0 && (
            <li className="py-2 text-muted-foreground">Nenhum alerta nas últimas 48h.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
