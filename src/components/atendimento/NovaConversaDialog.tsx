import { useEffect, useMemo, useState } from "react";
import { MessageSquare, Phone, Search, User as UserIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export type ConversaOpcao = {
  id: string;
  phone: string;
  name: string | null;
};

type LeadOpcao = {
  id: string;
  company: string;
  contact_name: string;
  phone: string | null;
  telefone_whatsapp: string | null;
};

function digits(s: string) {
  return s.replace(/\D/g, "");
}

/**
 * Abre uma conversa JÁ EXISTENTE. Nunca dispara mensagem de WhatsApp:
 * apenas navega para o chat (ou mostra o contato do lead para contato manual).
 */
export function NovaConversaDialog({
  open,
  onOpenChange,
  conversas,
  onSelectConversa,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  conversas: ConversaOpcao[];
  onSelectConversa: (id: string) => void;
}) {
  const [busca, setBusca] = useState("");
  const [leads, setLeads] = useState<LeadOpcao[]>([]);

  useEffect(() => {
    if (!open) return;
    setBusca("");
    let cancelado = false;
    void (async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, company, contact_name, phone, telefone_whatsapp")
        .order("updated_at", { ascending: false })
        .limit(300);
      if (!cancelado) setLeads((data ?? []) as LeadOpcao[]);
    })();
    return () => {
      cancelado = true;
    };
  }, [open]);

  const q = busca.trim().toLowerCase();
  const qDigits = digits(busca);

  const conversasFiltradas = useMemo(() => {
    return conversas
      .filter((c) => {
        if (!q) return true;
        return (
          (c.name ?? "").toLowerCase().includes(q) ||
          (qDigits.length > 0 && digits(c.phone).includes(qDigits))
        );
      })
      .slice(0, 30);
  }, [conversas, q, qDigits]);

  const telefonesComConversa = useMemo(
    () => new Set(conversas.map((c) => digits(c.phone))),
    [conversas],
  );

  const leadsFiltrados = useMemo(() => {
    return leads
      .filter((l) => {
        const tel = digits(l.telefone_whatsapp ?? l.phone ?? "");
        if (!tel) return false;
        if (telefonesComConversa.has(tel)) return false;
        if (!q) return true;
        return (
          l.company.toLowerCase().includes(q) ||
          l.contact_name.toLowerCase().includes(q) ||
          (qDigits.length > 0 && tel.includes(qDigits))
        );
      })
      .slice(0, 20);
  }, [leads, q, qDigits, telefonesComConversa]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo atendimento</DialogTitle>
          <DialogDescription>
            Busque um contato para abrir a conversa. Nenhuma mensagem é enviada agora — você escreve
            no chat depois.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Nome, empresa ou telefone"
            className="pl-8"
          />
        </div>

        <div className="max-h-[52vh] space-y-4 overflow-auto">
          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Conversas existentes
            </h3>
            <ul className="divide-y rounded-lg border">
              {conversasFiltradas.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectConversa(c.id);
                      onOpenChange(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                    )}
                  >
                    <MessageSquare className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {c.name?.trim() || c.phone}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.phone}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {conversasFiltradas.length === 0 && (
                <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                  Nenhuma conversa encontrada.
                </li>
              )}
            </ul>
          </section>

          <section>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Leads sem conversa aberta
            </h3>
            <ul className="divide-y rounded-lg border">
              {leadsFiltrados.map((l) => {
                const tel = l.telefone_whatsapp ?? l.phone ?? "";
                return (
                  <li
                    key={l.id}
                    className="flex items-center gap-3 px-3 py-2.5 text-left"
                    title="A conversa aparece aqui assim que o cliente enviar a primeira mensagem."
                  >
                    <UserIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{l.company}</span>
                      <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" /> {tel} · {l.contact_name}
                      </span>
                    </span>
                  </li>
                );
              })}
              {leadsFiltrados.length === 0 && (
                <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                  Nenhum lead com telefone sem conversa.
                </li>
              )}
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
