import { useEffect, useMemo, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { AlertTriangle, BellRing, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import { tocarBeep } from "@/hooks/useNovaConversaAlerta";
import { useAlertasPendentes, type AlertaPendenteRow } from "@/hooks/useAlertasPendentes";
import { ConversasComAlertaCtx } from "@/hooks/useConversasComAlertaPendente";

const KICKERS: Record<string, string> = {
  pedido_aprovacao: "Pedido aguardando liberação",
  pedido_aguardando_pagamento: "Pagamento antecipado a confirmar",
  pedido_programacao: "Pedido liberado para programação",
  pedido_pronto: "Pedido pronto",
  pedido_reprovado: "Pedido reprovado",
  conversa_atribuida: "Nova conversa para você",
};

function kickerDe(tipo: string): string {
  return KICKERS[tipo] ?? "Aviso pendente";
}

/**
 * Alerta global com ACEITE OBRIGATÓRIO e PERSISTENTE.
 * Não há caminho de saída sem decisão: sem botão X, sem Esc, sem overlay.
 */
export function AlertasPendentesProvider({ children }: { children?: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const { atual, pendentes, aceitar, adiar, processando, jaBipou } = useAlertasPendentes(
    user?.id ?? null,
  );

  const conversasPendentes = useMemo(
    () =>
      new Set(
        pendentes
          .filter((p) => p.tipo === "conversa_atribuida" && p.conversa_id)
          .map((p) => p.conversa_id as string),
      ),
    [pendentes],
  );

  useEffect(() => {
    if (!atual) return;
    if (jaBipou.current.has(atual.id)) return;
    jaBipou.current.add(atual.id);
    tocarBeep();
  }, [atual, jaBipou]);

  const irPara = (a: AlertaPendenteRow) => {
    if (a.tipo === "conversa_atribuida" && a.conversa_id) {
      void router.navigate({ to: "/conversas", search: { c: a.conversa_id } });
      return;
    }
    void router.navigate({ to: "/pedidos" });
  };

  return (
    <ConversasComAlertaCtx.Provider value={conversasPendentes}>
      {children}
      {atual && (
        <Dialog open>
          <DialogContent
            className="sm:max-w-md border-primary/40 shadow-2xl [&>button]:hidden"
            onEscapeKeyDown={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
          >
            <div className="flex flex-col items-center text-center gap-3 py-2">
              <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/20" />
                {atual.tipo === "conversa_atribuida" ? (
                  <MessageSquare className="h-7 w-7 text-primary" />
                ) : atual.tipo === "pedido_reprovado" ? (
                  <AlertTriangle className="h-7 w-7 text-primary" />
                ) : (
                  <BellRing className="h-7 w-7 text-primary" />
                )}
              </span>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-widest text-primary">
                  {kickerDe(atual.tipo)}
                </div>
                <h2 className="mt-1 text-base font-semibold leading-snug break-words">
                  {atual.titulo ?? "Você tem um aviso pendente."}
                </h2>
                {pendentes.length > 1 && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    +{pendentes.length - 1} aviso(s) na fila
                  </div>
                )}
              </div>
              <div className="mt-2 flex w-full flex-col gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  className="w-full min-h-11 sm:flex-1"
                  disabled={processando}
                  onClick={() => void adiar(atual.id)}
                >
                  Lembrar em 10 min
                </Button>
                <Button
                  className="w-full min-h-11 sm:flex-1"
                  disabled={processando}
                  onClick={async () => {
                    await aceitar(atual.id);
                    irPara(atual);
                  }}
                >
                  Aceitar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </ConversasComAlertaCtx.Provider>
  );
}
