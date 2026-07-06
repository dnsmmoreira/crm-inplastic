import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Radio,
  Phone,
  Send,
  Bot,
  User as UserIcon,
  MessageSquare,
  HandMetal,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { LeadDrawer } from "@/components/crm/LeadDrawer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { sendConversaMessage } from "@/lib/canais.functions";
import { assumirConversa, devolverParaIA } from "@/lib/atendimento.functions";
import type { Database } from "@/integrations/supabase/types";

type Conversa = Database["public"]["Tables"]["whatsapp_conversas"]["Row"];
type Mensagem = Database["public"]["Tables"]["whatsapp_mensagens"]["Row"];
type Status = Conversa["status"];

export const Route = createFileRoute("/atendimento-ia")({
  component: AtendimentoIAPage,
  head: () => ({
    meta: [{ title: "Atendimento IA — INPLASTIC - CRM" }],
  }),
});

const STATUS_META: Record<
  Status,
  { label: string; className: string; dot: string }
> = {
  ia_atendendo: {
    label: "IA atendendo",
    className: "bg-blue-500/10 text-blue-600 border-blue-500/30",
    dot: "bg-blue-500",
  },
  humano_atendendo: {
    label: "Humano no controle",
    className: "bg-amber-500/10 text-amber-600 border-amber-500/30",
    dot: "bg-amber-500",
  },
  qualificado: {
    label: "Qualificado",
    className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
    dot: "bg-emerald-500",
  },
  encerrado: {
    label: "Encerrado",
    className: "bg-muted text-muted-foreground border-border",
    dot: "bg-muted-foreground",
  },
};

function StatusChip({ status }: { status: Status }) {
  const meta = STATUS_META[status] ?? STATUS_META.ia_atendendo;
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", meta.className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </Badge>
  );
}

function AtendimentoIAPage() {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openLead, setOpenLead] = useState<string | null>(null);

  const load = useCallback(async () => {
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

  useEffect(() => {
    void load();
    const channel = supabase
      .channel("atendimento-conversas")
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
    const t = setInterval(load, 6000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(t);
    };
  }, [load]);

  const selected = useMemo(
    () => conversas.find((c) => c.id === selectedId) ?? null,
    [conversas, selectedId],
  );

  const stats = useMemo(() => {
    const ia = conversas.filter((c) => c.status === "ia_atendendo").length;
    const humano = conversas.filter((c) => c.status === "humano_atendendo").length;
    const qual = conversas.filter((c) => c.status === "qualificado").length;
    return { total: conversas.length, ia, humano, qual };
  }, [conversas]);

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold flex items-center gap-2">
          <Radio className="h-7 w-7 text-primary" /> Atendimento IA
        </h1>
        <p className="text-sm text-muted-foreground">
          Conversas em tempo real. Assuma quando quiser tirar a IA do volante.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="IA atendendo" value={stats.ia} tone="text-blue-600" />
        <StatCard label="Humano no controle" value={stats.humano} tone="text-amber-600" />
        <StatCard label="Qualificados" value={stats.qual} tone="text-emerald-600" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[380px,1fr]">
        <ConversationList
          conversas={conversas}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <ConversationPanel
          conversa={selected}
          onOpenLead={(id) => setOpenLead(id)}
          onChanged={load}
        />
      </div>

      <LeadDrawer leadId={openLead} open={openLead !== null} onOpenChange={(o) => !o && setOpenLead(null)} />
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-semibold", tone)}>{value}</div>
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
      <div className="border-b bg-muted/40 px-4 py-3 text-sm font-medium">
        Conversas ({conversas.length})
      </div>
      <ul className="divide-y max-h-[720px] overflow-auto">
        {conversas.map((c) => {
          const active = c.id === selectedId;
          const label = c.name?.trim() || c.phone;
          const since = c.last_message_at
            ? formatDistanceToNow(new Date(c.last_message_at), { locale: ptBR, addSuffix: true })
            : "sem mensagens";
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c.id)}
                className={cn(
                  "w-full text-left px-4 py-3 flex flex-col gap-1 transition-colors",
                  active ? "bg-primary/5" : "hover:bg-muted/40",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">{label}</span>
                  <StatusChip status={c.status} />
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {c.last_message_preview || "—"}
                </div>
                <div className="text-[11px] text-muted-foreground">{since}</div>
              </button>
            </li>
          );
        })}
        {conversas.length === 0 && (
          <li className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma conversa visível para você ainda.
          </li>
        )}
      </ul>
    </div>
  );
}

function ConversationPanel({
  conversa,
  onOpenLead,
  onChanged,
}: {
  conversa: Conversa | null;
  onOpenLead: (id: string) => void;
  onChanged: () => void;
}) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const send = useServerFn(sendConversaMessage);
  const assumir = useServerFn(assumirConversa);
  const devolver = useServerFn(devolverParaIA);

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
      .channel(`atendimento-msgs-${id}`)
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
    const t = setInterval(() => void loadMensagens(id), 5000);
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
          Selecione uma conversa para acompanhar em tempo real.
        </div>
      </div>
    );
  }

  const canSend = conversa.status === "humano_atendendo" || !conversa.ia_ativa;
  const label = conversa.name?.trim() || conversa.phone;

  async function handleAssumir() {
    if (!conversa) return;
    setBusy(true);
    try {
      await assumir({ data: { conversaId: conversa.id } });
      toast.success("Você assumiu a conversa", { description: "IA desligada." });
      onChanged();
    } catch (e) {
      toast.error("Falha ao assumir", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function handleDevolver() {
    if (!conversa) return;
    setBusy(true);
    try {
      await devolver({ data: { conversaId: conversa.id } });
      toast.success("Conversa devolvida à IA");
      onChanged();
    } catch (e) {
      toast.error("Falha", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function handleSend() {
    if (!conversa || !text.trim()) return;
    setSending(true);
    try {
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
    <div className="rounded-xl border bg-card flex flex-col min-h-[600px] max-h-[720px]">
      <div className="flex items-center justify-between gap-3 border-b bg-muted/40 px-4 py-3">
        <div className="min-w-0">
          <div className="font-medium text-sm truncate">{label}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {conversa.phone}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={conversa.status} />
          {conversa.lead_id && (
            <Button size="sm" variant="outline" onClick={() => onOpenLead(conversa.lead_id!)}>
              Abrir lead
            </Button>
          )}
          {canSend ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={handleDevolver} className="gap-1">
              <RotateCcw className="h-3.5 w-3.5" /> Devolver p/ IA
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={handleAssumir} className="gap-1">
              <HandMetal className="h-3.5 w-3.5" /> Assumir conversa
            </Button>
          )}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-2 bg-background">
        {mensagens.map((m) => (
          <MessageBubble key={m.id} m={m} />
        ))}
        {mensagens.length === 0 && (
          <div className="text-center text-xs text-muted-foreground py-10">
            Sem mensagens nesta conversa ainda.
          </div>
        )}
      </div>

      <div className="border-t p-3 space-y-2">
        {!canSend && (
          <div className="text-[11px] text-muted-foreground">
            A IA está no controle. Clique em <strong>Assumir conversa</strong> para digitar respostas.
          </div>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={canSend ? "Escreva uma resposta…" : "IA ativa — assuma para responder"}
            rows={2}
            disabled={!canSend || sending}
            className="resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
          />
          <Button onClick={handleSend} disabled={!canSend || sending || !text.trim()} className="gap-1">
            <Send className="h-4 w-4" /> Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ m }: { m: Mensagem }) {
  const isCliente = m.autor === "cliente";
  const isIA = m.autor === "ia";
  const align = isCliente ? "justify-start" : "justify-end";
  const tone = isCliente
    ? "bg-muted text-foreground"
    : isIA
      ? "bg-blue-500/10 text-blue-900 dark:text-blue-100 border border-blue-500/20"
      : "bg-primary text-primary-foreground";
  const Icon = isCliente ? UserIcon : isIA ? Bot : UserIcon;
  const authorLabel = isCliente ? "Cliente" : isIA ? "IA" : "Vendedor";
  return (
    <div className={cn("flex", align)}>
      <div className={cn("max-w-[75%] rounded-lg px-3 py-2 text-sm", tone)}>
        <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-75 mb-0.5">
          <Icon className="h-3 w-3" /> {authorLabel}
        </div>
        <div className="whitespace-pre-wrap break-words">{m.conteudo}</div>
        <div className="mt-1 text-[10px] opacity-60">
          {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}
