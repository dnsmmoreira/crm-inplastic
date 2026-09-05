import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Radio, Phone, Bot, User as UserIcon, MessageSquare, RotateCcw, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LeadDrawer } from "@/components/crm/LeadDrawer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { usePoll } from "@/hooks/use-poll";
import { BolhaMensagem } from "@/components/atendimento/BolhaMensagem";
import { carregarEmpresaPorConversa, type DadosLeadConversa } from "@/lib/empresa-conversas";
import { rotuloContato } from "@/lib/rotulo-contato";
import { useServerFn } from "@tanstack/react-start";
import {
  devolverParaIA,
  atribuirConversa,
  listarVendedoresAtendimento,
} from "@/lib/atendimento.functions";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth, hasPerm } from "@/hooks/use-auth";
import { useAutoScrollMensagens } from "@/hooks/use-auto-scroll-mensagens";
import { DistribuirConversasDialog } from "@/components/atendimento/DistribuirConversasDialog";
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

const STATUS_META: Record<Status, { label: string; className: string; dot: string }> = {
  ia_atendendo: {
    label: "IA atendendo",
    className: "bg-blue-500/10 text-blue-600 border-blue-500/30",
    dot: "bg-blue-500",
  },
  aguardando_humano: {
    label: "Aguardando humano",
    className: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    dot: "bg-amber-500",
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
  const { user } = useAuth();
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [dadosLead, setDadosLead] = useState<Record<string, DadosLeadConversa>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [openLead, setOpenLead] = useState<string | null>(null);

  const isVendedor = user?.role === "vendedor";
  const userId = user?.id ?? null;

  const load = useCallback(async () => {
    let query = supabase
      .from("whatsapp_conversas")
      .select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200);
    // Vendedor enxerga o que foi atribuído a ele + conversas dos leads que são dele.
    if (isVendedor && userId) {
      const { data: meusLeads } = await supabase
        .from("leads")
        .select("id")
        .eq("owner_id", userId)
        .limit(1000);
      const ids = (meusLeads ?? []).map((l) => l.id);
      query = ids.length
        ? query.or(`atribuido_para.eq.${userId},lead_id.in.(${ids.join(",")})`)
        : query.eq("atribuido_para", userId);
    }
    const { data, error } = await query;
    if (error) {
      console.error(error);
      return;
    }
    const lista = data ?? [];
    setConversas(lista);
    // Empresa do lead/cliente em lote — falha não pode quebrar a lista.
    try {
      setDadosLead(
        await carregarEmpresaPorConversa(lista.map((c) => ({ id: c.id, lead_id: c.lead_id }))),
      );
    } catch (e) {
      console.error("[atendimento-ia] rótulo de empresa indisponível", e);
    }
  }, [isVendedor, userId]);

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
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  // UM poll por rota: a lista só é pesquisada quando não há conversa aberta;
  // com conversa aberta quem faz o tick (12s) é o painel, que também recarrega
  // a lista. `usePoll` já pausa com a aba oculta.
  usePoll(() => void load(), 45000, selectedId === null);

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold flex items-center gap-2">
            <Radio className="h-7 w-7 text-primary" /> Atendimento IA
          </h1>
          <p className="text-sm text-muted-foreground">
            Conversas em tempo real. Assuma quando quiser tirar a IA do volante.
          </p>
        </div>
        {user?.role === "admin" && <DistribuirConversasDialog onSaved={load} />}
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
          dadosLead={dadosLead}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <ConversationPanel
          conversa={selected}
          onOpenLead={(id) => setOpenLead(id)}
          onChanged={load}
        />
      </div>

      <LeadDrawer
        leadId={openLead}
        open={openLead !== null}
        onOpenChange={(o) => !o && setOpenLead(null)}
      />
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
  dadosLead,
  selectedId,
  onSelect,
}: {
  conversas: Conversa[];
  dadosLead: Record<string, DadosLeadConversa>;
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
          const rotulo = rotuloContato({
            contato: c.name ?? dadosLead[c.id]?.contato ?? null,
            empresa: dadosLead[c.id]?.empresa ?? null,
            telefone: c.phone,
          });
          const label = rotulo.principal || c.phone;
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
                {rotulo.secundario && (
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Building2 className="h-3 w-3 shrink-0" />
                    <span className="truncate">{rotulo.secundario}</span>
                  </div>
                )}
                <div className="text-xs text-muted-foreground truncate">
                  {limparOrigemAnuncio(c.last_message_preview ?? "").trim() || "—"}
                </div>
                <div className="text-[11px] text-muted-foreground">{since}</div>
              </button>
            </li>
          );
        })}
        {conversas.length === 0 && (
          <li className="p-10 text-center text-sm text-muted-foreground">
            Nenhuma conversa atribuída a você ainda. Peça a um administrador para atribuir uma
            conversa ou aguarde a chegada de um lead seu.
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
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
    return () => {
      supabase.removeChannel(channel);
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

  const { temNovas, onScroll, scrollParaFim } = useAutoScrollMensagens(
    scrollRef,
    conversa?.id ?? null,
    mensagens,
  );

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

  const label = conversa.name?.trim() || conversa.phone;

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
          <AtribuirSelect conversa={conversa} onChanged={onChanged} />

          {conversa.lead_id && (
            <Button size="sm" variant="outline" onClick={() => onOpenLead(conversa.lead_id!)}>
              Abrir lead
            </Button>
          )}
          {!conversa.ia_ativa && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={handleDevolver}
              className="gap-1"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Devolver p/ IA
            </Button>
          )}
        </div>
      </div>

      <div className="relative flex flex-1 min-h-0 flex-col">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="flex-1 overflow-auto p-4 space-y-2 bg-background"
        >
          {mensagens.map((m) => (
            <BolhaMensagem key={m.id} m={m} />
          ))}
          {mensagens.length === 0 && (
            <div className="text-center text-xs text-muted-foreground py-10">
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

      <div className="border-t px-4 py-3 text-[11px] text-muted-foreground">
        Esta tela é somente para acompanhar e <strong>direcionar</strong> a conversa a um vendedor.
        Para responder o cliente, use a tela <strong>Conversas</strong>.
      </div>
    </div>
  );
}


function AtribuirSelect({ conversa, onChanged }: { conversa: Conversa; onChanged: () => void }) {
  const { user } = useAuth();
  const isAdmin = hasPerm(user, "agente_ia.editar_prompt");
  const [vendedores, setVendedores] = useState<Array<{ id: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);
  const listar = useServerFn(listarVendedoresAtendimento);
  const atribuir = useServerFn(atribuirConversa);

  useEffect(() => {
    if (!isAdmin) return;
    let alive = true;
    void (async () => {
      try {
        const rows = await listar();
        if (alive) setVendedores(rows);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [isAdmin, listar]);

  if (!isAdmin) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Você não tem permissão para acessar esta tela.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground hidden sm:inline">Enviar para</span>
      <Select
        value={conversa.atribuido_para ?? "none"}
        disabled={saving}
        onValueChange={(v) => {
          setSaving(true);
          void (async () => {
            try {
              await atribuir({
                data: { conversaId: conversa.id, vendedorId: v === "none" ? null : v },
              });
              toast.success(v === "none" ? "Atribuição removida" : "Conversa enviada ao vendedor");
              onChanged();
            } catch (e) {
              toast.error("Falha ao enviar", {
                description: e instanceof Error ? e.message : String(e),
              });
            } finally {
              setSaving(false);
            }
          })();
        }}
      >
        <SelectTrigger className="h-8 w-[190px] text-xs">
          <SelectValue placeholder="Enviar para…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Sem responsável</SelectItem>
          {vendedores.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
