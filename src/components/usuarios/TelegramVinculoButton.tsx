import { useState } from "react";
import { Send, Loader2, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  getTelegramVinculo, gerarTelegramVinculo, type TelegramVinculo,
} from "@/lib/telegram-vinculo.functions";

export function TelegramVinculoButton({ userId, nome }: { userId: string; nome: string }) {
  const buscar = useServerFn(getTelegramVinculo);
  const gerar = useServerFn(gerarTelegramVinculo);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<TelegramVinculo | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function abrir() {
    setOpen(true);
    setLoading(true);
    try {
      setInfo(await buscar({ data: { userId } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar vínculo");
    } finally {
      setLoading(false);
    }
  }

  async function gerarCodigo() {
    setLoading(true);
    try {
      setInfo(await gerar({ data: { userId } }));
      toast.success("Código de vínculo gerado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar código");
    } finally {
      setLoading(false);
    }
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      toast.error("Não foi possível copiar");
    }
  }

  return (
    <>
      <Button size="icon" variant="ghost" title="Vincular Telegram" onClick={abrir}>
        <Send className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Telegram — {nome || "usuário"}</DialogTitle>
            <DialogDescription>
              Gere um código e envie o link para a pessoa abrir no Telegram. O canal interno
              continua desligado nesta fase.
            </DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div>
                Status:{" "}
                {info?.chatIdVinculado ? (
                  <span className="text-emerald-600 font-medium">chat vinculado</span>
                ) : (
                  <span className="text-muted-foreground">sem chat vinculado</span>
                )}
              </div>

              {info?.codigo ? (
                <div className="space-y-2">
                  <div className="font-mono text-xs break-all rounded bg-muted p-2">
                    {info.codigo}
                  </div>
                  {info.deepLink ? (
                    <div className="flex items-center gap-2">
                      <div className="font-mono text-xs break-all rounded bg-muted p-2 flex-1">
                        {info.deepLink}
                      </div>
                      <Button size="icon" variant="outline" onClick={() => copiar(info.deepLink!)}>
                        {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Defina a variável TELEGRAM_BOT_USERNAME para montar o link t.me.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground">Nenhum código de vínculo pendente.</p>
              )}

              <Button size="sm" onClick={gerarCodigo} disabled={loading}>
                {info?.codigo ? "Gerar novo código" : "Gerar código de vínculo"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
