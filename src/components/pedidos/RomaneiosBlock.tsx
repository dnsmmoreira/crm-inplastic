import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ExternalLink, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  gerarRomaneio,
  getRomaneio,
  salvarConferenciaRomaneio,
  concluirRomaneio,
  ROMANEIO_LABELS,
  ROMANEIO_TIPOS,
  type RomaneioConferido,
  type RomaneioRow,
  type RomaneioTipo,
} from "@/lib/pedido-romaneios.functions";

/**
 * Seção "Romaneios" do pedido — independente do `checklist_conferencia`.
 * Disponível em qualquer etapa: gerar, reimprimir e conferir item a item.
 */
export function RomaneiosBlock({ pedidoId }: { pedidoId: string }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Romaneios</h3>
      </div>
      <div className="space-y-3">
        {ROMANEIO_TIPOS.map((tipo) => (
          <RomaneioCard key={tipo} pedidoId={pedidoId} tipo={tipo} />
        ))}
      </div>
    </section>
  );
}

function RomaneioCard({ pedidoId, tipo }: { pedidoId: string; tipo: RomaneioTipo }) {
  const qc = useQueryClient();
  const carregar = useServerFn(getRomaneio);
  const gerarFn = useServerFn(gerarRomaneio);
  const salvarFn = useServerFn(salvarConferenciaRomaneio);
  const concluirFn = useServerFn(concluirRomaneio);

  const queryKey = ["romaneio", pedidoId, tipo];
  const { data: romaneio, isLoading } = useQuery<RomaneioRow | null>({
    queryKey,
    queryFn: () => carregar({ data: { pedido_id: pedidoId, tipo } }),
  });

  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  // Marcações ainda não salvas não podem ser apagadas por um refetch
  // (voltar de outra aba refaz a query e traz um novo objeto).
  const [sujo, setSujo] = useState(false);

  useEffect(() => {
    if (sujo) return;
    const mapa: Record<string, boolean> = {};
    for (const c of (romaneio?.itens_conferidos ?? []) as RomaneioConferido[]) {
      mapa[c.item_key] = c.conferido;
    }
    setMarcados(mapa);
  }, [romaneio, sujo]);

  const itens = useMemo(() => romaneio?.itens ?? [], [romaneio]);
  const conferidos = itens.filter((i) => marcados[i.item_key]).length;
  const tudoConferido = itens.length > 0 && conferidos === itens.length;

  async function gerar() {
    setBusy(true);
    try {
      const r = await gerarFn({ data: { pedido_id: pedidoId, tipo } });
      if (r.estavaConcluido) {
        toast.warning(
          "Este romaneio já tinha sido concluído — gerar de novo reinicia a conferência",
        );
      } else {
        toast.success(`${ROMANEIO_LABELS[tipo]} gerado`);
      }
      setSujo(false);
      await qc.invalidateQueries({ queryKey });
      window.open(`/romaneio/${pedidoId}/${tipo}`, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar romaneio");
    } finally {
      setBusy(false);
    }
  }

  async function salvarConferencia() {
    setBusy(true);
    try {
      await salvarFn({
        data: {
          pedido_id: pedidoId,
          tipo,
          itens_conferidos: itens.map((i) => ({
            item_key: i.item_key,
            conferido: !!marcados[i.item_key],
          })),
        },
      });
      toast.success("Conferência salva");
      setSujo(false);
      await qc.invalidateQueries({ queryKey });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar conferência");
    } finally {
      setBusy(false);
    }
  }

  async function concluir() {
    setBusy(true);
    try {
      // Conclusão só depois de persistir o que está marcado na tela.
      await salvarFn({
        data: {
          pedido_id: pedidoId,
          tipo,
          itens_conferidos: itens.map((i) => ({
            item_key: i.item_key,
            conferido: !!marcados[i.item_key],
          })),
        },
      });
      await concluirFn({ data: { pedido_id: pedidoId, tipo } });
      toast.success("Romaneio concluído");
      setSujo(false);
      await qc.invalidateQueries({ queryKey });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao concluir romaneio");
    } finally {
      setBusy(false);
    }
  }

  const status = !romaneio
    ? "Não gerado"
    : romaneio.concluido_em
      ? `Concluído em ${format(new Date(romaneio.concluido_em), "dd/MM 'às' HH:mm", { locale: ptBR })}`
      : `Gerado em ${format(new Date(romaneio.gerado_em), "dd/MM 'às' HH:mm", { locale: ptBR })}`;

  return (
    <div className="rounded-lg border p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium">{ROMANEIO_LABELS[tipo]}</div>
          <div className="text-xs text-muted-foreground">
            {isLoading ? "Carregando…" : status}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void gerar()}>
            {romaneio ? "Gerar novamente" : "Gerar"}
          </Button>
          {romaneio && (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1"
              onClick={() => window.open(`/romaneio/${pedidoId}/${tipo}`, "_blank", "noopener")}
            >
              <ExternalLink className="h-3.5 w-3.5" /> Abrir/Imprimir
            </Button>
          )}
        </div>
      </div>

      {romaneio && itens.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {conferidos}/{itens.length} conferido(s)
            </span>
            {romaneio.concluido_em && <Badge variant="secondary">Concluído</Badge>}
          </div>
          {itens.map((i) => {
            const id = `rom-${tipo}-${i.item_key}`;
            const marcado = !!marcados[i.item_key];
            return (
              <div key={i.item_key} className="flex items-start gap-2">
                <Checkbox
                  id={id}
                  checked={marcado}
                  onCheckedChange={(v) =>
                    {
                      setSujo(true);
                      setMarcados((m) => ({ ...m, [i.item_key]: v === true }));
                    }
                  }
                />
                <label
                  htmlFor={id}
                  className={cn(
                    "text-sm cursor-pointer",
                    marcado && "line-through text-muted-foreground",
                  )}
                >
                  <span className="font-mono text-xs">{i.sku ?? "—"}</span> ·{" "}
                  {i.description ?? "Sem descrição"} · {i.quantity} {i.unit ?? ""}
                  {i.weight_kg == null && (
                    <span className="ml-2 text-[11px] font-medium text-amber-600">
                      dado de peso/dimensão não disponível
                    </span>
                  )}
                </label>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void salvarConferencia()}>
              Salvar conferência
            </Button>
            <Button size="sm" disabled={busy || !tudoConferido} onClick={() => void concluir()}>
              Concluir romaneio
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
