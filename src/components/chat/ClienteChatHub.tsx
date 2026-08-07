import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Mail, MessageSquare, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { getClienteChatContext, listPropostasCliente } from "@/lib/cliente-chat.functions";
import { ClienteChatPanel } from "./ClienteChatPanel";
import type { Database } from "@/integrations/supabase/types";

type Conversa = Database["public"]["Tables"]["whatsapp_conversas"]["Row"];

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

type CanalFiltro = "todos" | "whatsapp" | "email";

export function ClienteChatHub({ clienteId }: { clienteId: string }) {
  const carregarContexto = useServerFn(getClienteChatContext);
  const carregarPropostas = useServerFn(listPropostasCliente);

  const [cliente, setCliente] = useState<{ razao_social: string; email: string | null } | null>(
    null,
  );
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [propostas, setPropostas] = useState<
    Array<{ id: string; number: string; status: string; created_at: string }>
  >([]);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [canal, setCanal] = useState<CanalFiltro>("todos");
  const [erro, setErro] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const ctx = await carregarContexto({ data: { clienteId } });
      setCliente({ razao_social: ctx.cliente.razao_social, email: ctx.cliente.email });
      setConversas(ctx.conversas as Conversa[]);
      setSelecionada((prev) => prev ?? (ctx.conversas[0]?.id ?? null));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    }
  }, [carregarContexto, clienteId]);

  useEffect(() => {
    void load();
    void carregarPropostas({ data: { clienteId } })
      .then((p) => setPropostas(p))
      .catch(() => setPropostas([]));
  }, [load, carregarPropostas, clienteId]);

  // Realtime na lista de conversas do cliente
  useEffect(() => {
    const channel = supabase
      .channel(`cliente-chat-hub-${clienteId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_conversas" }, () =>
        void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [clienteId, load]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return conversas.filter((c) => {
      if (canal === "email") return false; // e-mails vivem dentro da conversa
      if (!q) return true;
      return (c.name ?? "").toLowerCase().includes(q) || c.phone.includes(q);
    });
  }, [conversas, busca, canal]);

  const selected = useMemo(
    () => conversas.find((c) => c.id === selecionada) ?? null,
    [conversas, selecionada],
  );

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            to="/clientes/$id"
            params={{ id: clienteId }}
            className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao cliente
          </Link>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <MessageSquare className="h-6 w-6 text-primary" />
            {cliente?.razao_social ?? "Chat do cliente"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Todas as conversas deste cliente, por canal, em tempo real.
          </p>
        </div>
      </div>

      {erro && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {erro}
        </div>
      )}

      <div className="grid gap-0 overflow-hidden rounded-xl border bg-card h-[calc(100dvh-13rem)] min-h-[420px] md:grid-cols-[320px_1fr] xl:grid-cols-[360px_1fr]">
        {/* Painel esquerdo */}
        <div className="flex min-h-0 flex-col border-b md:border-b-0 md:border-r">
          <div className="space-y-2 border-b bg-muted/40 p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar conversa"
                className="pl-8"
              />
            </div>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-background p-1">
              {(["todos", "whatsapp", "email"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCanal(k)}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors",
                    canal === k
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {k === "email" ? "E-mail" : k}
                </button>
              ))}
            </div>
          </div>

          <ul className="min-h-0 flex-1 divide-y overflow-auto">
            {filtradas.map((c) => {
              const nome = c.name?.trim() || c.phone;
              const active = c.id === selecionada;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelecionada(c.id)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors",
                      active ? "bg-primary/5" : "hover:bg-muted/50",
                    )}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {nome.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{nome}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {horaCurta(c.last_message_at)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MessageSquare className="h-3 w-3 shrink-0" />
                        <span className="truncate">{c.last_message_preview || "Sem mensagens"}</span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {canal === "email" && (
              <li className="p-8 text-center text-xs text-muted-foreground">
                <Mail className="mx-auto mb-2 h-6 w-6 opacity-40" />
                Os e-mails enviados aparecem dentro da conversa do cliente, marcados como “e-mail”.
              </li>
            )}
            {canal !== "email" && filtradas.length === 0 && (
              <li className="p-8 text-center text-xs text-muted-foreground">
                Nenhuma conversa encontrada para este cliente.
              </li>
            )}
          </ul>
        </div>

        {/* Painel direito */}
        <div className="flex min-h-0 flex-col">
          <ClienteChatPanel conversa={selected} propostas={propostas} onChanged={load} />
        </div>
      </div>
    </div>
  );
}
