import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageSquare, Phone, Zap, UserPlus, X, CheckCircle2, Radio } from "lucide-react";
import { useCrm, type WhatsappMessage, useVisibleLeads } from "@/lib/crm-store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LeadDrawer } from "@/components/crm/LeadDrawer";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/canais")({
  component: CanaisPage,
  head: () => ({
    meta: [{ title: "Canais de Entrada — CRM Pallet de Plástico" }],
  }),
});

const RANDOM_MSGS: Omit<WhatsappMessage, "id" | "receivedAt" | "status">[] = [
  { phone: "(48) 99123-8877", name: "Cervejaria Litoral", message: "Preciso de 300 pallets standard para a nova linha. Prazo 30 dias." },
  { phone: "(11) 97744-9911", message: "Vocês entregam em SP capital? Volume ~150 un/mês." },
  { phone: "(85) 98876-5544", name: "AgroCE Distribuidora", message: "Boa tarde! Quero cotação de pallet exportação para conteinerização." },
  { phone: "(31) 3211-4477", message: "Pallet reforçado suporta 2 toneladas dinâmicas?" },
  { phone: "(51) 99900-2233", name: "Frigo Serrano", message: "Olá, queremos amostra do pallet higiênico antes de fechar." },
];

function CanaisPage() {
  const messages = useCrm((s) => s.whatsapp);
  const receive = useCrm((s) => s.receiveWhatsapp);
  const convert = useCrm((s) => s.convertWhatsappToLead);
  const ignore = useCrm((s) => s.ignoreWhatsapp);
  const leads = useVisibleLeads();
  const [autoCapture, setAutoCapture] = useState(true);
  const [simulate, setSimulate] = useState(false);
  const [openLead, setOpenLead] = useState<string | null>(null);

  // Simulated incoming message stream
  useEffect(() => {
    if (!simulate) return;
    const t = setInterval(() => {
      const m = RANDOM_MSGS[Math.floor(Math.random() * RANDOM_MSGS.length)];
      receive(m);
      toast.message("Nova mensagem no WhatsApp", { description: m.name ?? m.phone });
    }, 6000);
    return () => clearInterval(t);
  }, [simulate, receive]);

  // Auto-capture unknown numbers into pipeline
  useEffect(() => {
    if (!autoCapture) return;
    const known = new Set(leads.map((l) => l.phone.replace(/\D/g, "")));
    messages
      .filter((m) => m.status === "novo" && !known.has(m.phone.replace(/\D/g, "")))
      .slice(0, 1)
      .forEach((m) => {
        const id = convert(m.id);
        if (id) toast.success("IA capturou lead automaticamente", { description: m.name ?? m.phone });
      });
  }, [messages, autoCapture, convert, leads]);

  const stats = {
    total: messages.length,
    novos: messages.filter((m) => m.status === "novo").length,
    convertidos: messages.filter((m) => m.status === "convertido").length,
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold flex items-center gap-2">
            <MessageSquare className="h-7 w-7 text-primary" /> Canais de Entrada
          </h1>
          <p className="text-sm text-muted-foreground">
            Feed em tempo real do WhatsApp comercial · captura automática de leads
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              const m = RANDOM_MSGS[Math.floor(Math.random() * RANDOM_MSGS.length)];
              receive(m);
              toast.message("Mensagem recebida", { description: m.name ?? m.phone });
            }}
          >
            <MessageSquare className="h-4 w-4 mr-2" /> Simular msg
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Mensagens totais" value={stats.total} />
        <StatCard label="Aguardando triagem" value={stats.novos} tone="warn" />
        <StatCard label="Leads capturados" value={stats.convertidos} tone="ok" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="flex items-center justify-between border-b bg-muted/50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
              </span>
              WhatsApp Business · Ao vivo
            </div>
            <span className="text-xs text-muted-foreground">{messages.length} mensagens</span>
          </div>
          <ul className="divide-y max-h-[560px] overflow-y-auto">
            {messages.map((m) => (
              <MessageRow
                key={m.id}
                m={m}
                onConvert={() => {
                  const id = convert(m.id);
                  if (id) {
                    toast.success("Lead criado no Kanban (Em Atendimento)");
                    setOpenLead(id);
                  }
                }}
                onIgnore={() => {
                  ignore(m.id);
                  toast.info("Mensagem ignorada");
                }}
                onOpen={() => m.leadId && setOpenLead(m.leadId)}
              />
            ))}
            {messages.length === 0 && (
              <li className="p-10 text-center text-sm text-muted-foreground">
                Nenhuma mensagem ainda.
              </li>
            )}
          </ul>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border bg-card p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Zap className="h-4 w-4 text-primary" /> Automações
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label className="text-sm">Captura automática</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Cria card em "Em Atendimento" quando chega msg de número desconhecido.
                </p>
              </div>
              <Switch checked={autoCapture} onCheckedChange={setAutoCapture} />
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label className="text-sm">Simular fluxo real</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Recebe uma msg mockada a cada 6s.
                </p>
              </div>
              <Switch checked={simulate} onCheckedChange={setSimulate} />
            </div>
          </div>

          <div className="rounded-xl border bg-gradient-to-br from-primary/10 to-transparent p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Radio className="h-4 w-4 text-primary" /> Integrações
            </div>
            <IntegrationRow name="WhatsApp Business API" status="conectado" />
            <IntegrationRow name="Formulário do site" status="conectado" />
            <IntegrationRow name="Instagram DM" status="pendente" />
            <IntegrationRow name="E-mail comercial" status="conectado" />
          </div>
        </aside>
      </div>

      <LeadDrawer leadId={openLead} open={!!openLead} onOpenChange={(o) => !o && setOpenLead(null)} />
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
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

function MessageRow({
  m,
  onConvert,
  onIgnore,
  onOpen,
}: {
  m: WhatsappMessage;
  onConvert: () => void;
  onIgnore: () => void;
  onOpen: () => void;
}) {
  const initial = (m.name ?? m.phone).slice(0, 1).toUpperCase();
  return (
    <li className="flex items-start gap-3 p-4 hover:bg-muted/30 transition-colors">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-semibold shrink-0">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{m.name ?? "Número desconhecido"}</span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Phone className="h-3 w-3" />
            {m.phone}
          </span>
          {m.status === "convertido" && (
            <Badge variant="secondary" className="text-[10px] gap-1">
              <CheckCircle2 className="h-3 w-3" /> Lead criado
            </Badge>
          )}
          {m.status === "ignorado" && (
            <Badge variant="outline" className="text-[10px]">Ignorado</Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-foreground/90">{m.message}</p>
        <div className="mt-1 text-[11px] text-muted-foreground">
          {formatDistanceToNow(new Date(m.receivedAt), { locale: ptBR, addSuffix: true })} ·{" "}
          {format(new Date(m.receivedAt), "HH:mm")}
        </div>
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        {m.status === "novo" ? (
          <>
            <Button size="sm" onClick={onConvert} className="gap-1">
              <UserPlus className="h-3.5 w-3.5" /> Criar lead
            </Button>
            <Button size="sm" variant="ghost" onClick={onIgnore}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          m.leadId && (
            <Button size="sm" variant="outline" onClick={onOpen}>
              Ver lead
            </Button>
          )
        )}
      </div>
    </li>
  );
}

function IntegrationRow({ name, status }: { name: string; status: "conectado" | "pendente" }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{name}</span>
      <Badge
        variant="outline"
        className={cn(
          "text-[10px]",
          status === "conectado" ? "border-emerald-500/50 text-emerald-700" : "border-amber-500/50 text-amber-700",
        )}
      >
        {status}
      </Badge>
    </div>
  );
}
