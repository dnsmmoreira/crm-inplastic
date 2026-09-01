import { useRouter } from "@tanstack/react-router";
import { MessageSquare, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { useNovaConversaAlerta } from "@/hooks/useNovaConversaAlerta";
import { useConversasComAlertaPendente } from "@/hooks/useConversasComAlertaPendente";

/**
 * Overlay global de "novo lead atribuído a você".
 * Renderizado no layout raiz — dispara em qualquer tela.
 */
export function NovaConversaAlerta() {
  const { user } = useAuth();
  const router = useRouter();
  const { conversa, dispensar } = useNovaConversaAlerta(user?.id ?? null);
  // Anti-duplicação: se o alerta com aceite obrigatório já está cuidando desta
  // conversa, este overlay (sem persistência) se cala.
  const comAlertaPendente = useConversasComAlertaPendente();

  if (!conversa) return null;
  if (comAlertaPendente.has(conversa.id)) return null;
  const nome = conversa.name?.trim() || "Novo contato";

  return (
    <Dialog open onOpenChange={(o) => !o && dispensar()}>
      <DialogContent className="sm:max-w-md border-primary/40 shadow-2xl">
        <div className="flex flex-col items-center text-center gap-3 py-2">
          <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/20" />
            <MessageSquare className="h-7 w-7 text-primary" />
          </span>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-widest text-primary">
              Nova conversa para você
            </div>
            <h2 className="mt-1 text-xl font-semibold">{nome}</h2>
            <div className="mt-1 flex items-center justify-center gap-1 text-sm text-muted-foreground">
              <Phone className="h-3.5 w-3.5" />
              {conversa.phone}
            </div>
          </div>
          {conversa.last_message_preview && (
            <p className="max-w-full rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground line-clamp-3">
              “{conversa.last_message_preview}”
            </p>
          )}
          <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row">
            <Button variant="outline" className="w-full min-h-11 sm:flex-1" onClick={dispensar}>
              Depois
            </Button>
            <Button
              className="w-full min-h-11 sm:flex-1"
              onClick={() => {
                const id = conversa.id;
                dispensar();
                void router.navigate({ to: "/conversas", search: { c: id } });
              }}
            >
              Abrir conversa
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
