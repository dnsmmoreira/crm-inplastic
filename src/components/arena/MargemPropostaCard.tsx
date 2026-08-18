import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";

import { avaliarMargemProposta, solicitarAprovacaoExtraordinaria } from "@/lib/arena.functions";
import { formatBRLCompact, pct } from "@/lib/arena";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Avaliacao = Awaited<ReturnType<typeof avaliarMargemProposta>>;

export function MargemPropostaCard({ propostaId }: { propostaId: string }) {
  const avaliar = useServerFn(avaliarMargemProposta);
  const solicitar = useServerFn(solicitarAprovacaoExtraordinaria);
  const [a, setA] = useState<Avaliacao | null>(null);
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      setA(await avaliar({ data: { propostaId } }));
    } catch {
      setA(null);
    }
  }, [avaliar, propostaId]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  if (!a) return null;

  const status = a.aprovacao?.status ?? null;

  const base = a.abaixoDoMinimo
    ? a.bloqueado
      ? "border-destructive/50 bg-destructive/10 text-destructive"
      : "border-emerald-500/50 bg-emerald-500/10 text-emerald-700"
    : "border-border bg-muted/40 text-foreground";

  const Icone = a.abaixoDoMinimo ? (a.bloqueado ? AlertTriangle : CheckCircle2) : Info;

  return (
    <div className={`rounded-lg border p-3 text-sm ${base}`}>
      <div className="flex flex-wrap items-start gap-2">
        <Icone className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1 space-y-1">
          <p className="font-medium">
            Margem estimada {pct(a.margemPct)} · mínima {pct(a.minimaPct)}
            {a.pisoComercial && " (piso comercial)"}
          </p>
          <p className="text-xs opacity-90">
            Receita {formatBRLCompact(a.receita)} · desconto {pct(a.descontoPct)} · comissões {pct(a.comissoesPct)}
            {a.acrescimoPct > 0 && ` · acréscimo da condição ${pct(a.acrescimoPct)}`}
          </p>
          {!a.custoProdutoParametrizado && (
            <p className="text-xs opacity-80">
              Custo de produto ainda não parametrizado — a avaliação usa o piso comercial de margem, não um custo real.
            </p>
          )}
          {status === "pendente" && <p className="text-xs font-medium">Aprovação extraordinária pendente de decisão da diretoria.</p>}
          {status === "aprovada" && <p className="text-xs font-medium">Aprovação extraordinária concedida pela diretoria.</p>}
          {status === "recusada" && <p className="text-xs font-medium">Aprovação extraordinária recusada.</p>}
        </div>
        {a.bloqueado && status !== "pendente" && (
          <Button size="sm" variant="outline" className="gap-2" onClick={() => { setMotivo(""); setOpen(true); }}>
            <ShieldAlert className="h-4 w-4" /> Solicitar aprovação extraordinária
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Aprovação Extraordinária da Diretoria</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            A margem desta proposta ({pct(a.margemPct)}) está abaixo do mínimo ({pct(a.minimaPct)}). Descreva a
            justificativa comercial — ela fica registrada na auditoria da ARENA.
          </p>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={4} maxLength={500} />
          <DialogFooter>
            <Button
              disabled={enviando}
              onClick={async () => {
                if (motivo.trim().length < 5) {
                  toast.error("Descreva a justificativa");
                  return;
                }
                setEnviando(true);
                try {
                  await solicitar({
                    data: {
                      propostaId,
                      motivo: motivo.trim(),
                      margemOriginalPct: a.margemPct,
                      margemPropostaPct: a.margemPct,
                      margemMinimaPct: a.minimaPct,
                      descontoPercent: a.descontoPct,
                    },
                  });
                  toast.success("Solicitação enviada à diretoria");
                  setOpen(false);
                  void recarregar();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Falha ao solicitar");
                } finally {
                  setEnviando(false);
                }
              }}
            >
              Enviar solicitação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
