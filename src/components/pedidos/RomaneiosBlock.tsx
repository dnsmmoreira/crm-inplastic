import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ExternalLink, ClipboardList, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

type Marcacoes = Record<string, boolean>;

/** Handlers que cada cartão publica para o aviso de saída da seção. */
type CardHandle = {
  label: string;
  salvar: () => Promise<boolean>;
  descartar: () => void;
};

function mesmasMarcacoes(a: Marcacoes, b: Marcacoes): boolean {
  const chaves = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of chaves) if (!!a[k] !== !!b[k]) return false;
  return true;
}

/**
 * Seção "Romaneios" do pedido — independente do `checklist_conferencia`.
 * Disponível em qualquer etapa: gerar, reimprimir e conferir item a item.
 *
 * O aviso de "alterações não salvas" vive aqui (um único diálogo para a
 * seção inteira), para nunca empilhar três confirmações na mesma saída.
 */
export function RomaneiosBlock({ pedidoId }: { pedidoId: string }) {
  const cards = useRef(new Map<RomaneioTipo, CardHandle>());
  const [sujos, setSujos] = useState<RomaneioTipo[]>([]);
  const [salvando, setSalvando] = useState(false);

  const registrar = useCallback(
    (tipo: RomaneioTipo, handle: CardHandle | null, sujo: boolean) => {
      if (handle) cards.current.set(tipo, handle);
      else cards.current.delete(tipo);
      setSujos((atual) => {
        const tem = atual.includes(tipo);
        if (sujo && handle) return tem ? atual : [...atual, tipo];
        if (!tem) return atual;
        return atual.filter((t) => t !== tipo);
      });
    },
    [],
  );

  const temPendencia = sujos.length > 0;

  // Fechar/recarregar a aba com conferência pendente pede confirmação.
  useEffect(() => {
    if (!temPendencia) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [temPendencia]);

  // Navegação dentro do CRM abre o diálogo com Salvar / Descartar.
  const blocker = useBlocker({
    shouldBlockFn: () => cards.current.size > 0 && temPendencia,
    withResolver: true,
    enableBeforeUnload: false,
  });

  async function salvarTudoESair() {
    setSalvando(true);
    try {
      for (const tipo of [...sujos]) {
        const ok = await cards.current.get(tipo)?.salvar();
        if (!ok) return; // erro já avisado pelo cartão; segura a navegação
      }
      blocker.proceed?.();
    } finally {
      setSalvando(false);
    }
  }

  function descartarTudoESair() {
    for (const tipo of [...sujos]) cards.current.get(tipo)?.descartar();
    blocker.proceed?.();
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Romaneios</h3>
      </div>
      <div className="space-y-3">
        {ROMANEIO_TIPOS.map((tipo) => (
          <RomaneioCard key={tipo} pedidoId={pedidoId} tipo={tipo} onRegistrar={registrar} />
        ))}
      </div>

      <AlertDialog open={blocker.status === "blocked"}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterações não salvas</AlertDialogTitle>
            <AlertDialogDescription>
              {sujos.length === 1
                ? `A conferência do ${ROMANEIO_LABELS[sujos[0]!]} tem marcações que ainda não foram salvas.`
                : `${sujos.length} conferências têm marcações que ainda não foram salvas (${sujos
                    .map((t) => ROMANEIO_LABELS[t])
                    .join(", ")}).`}{" "}
              O que você quer fazer antes de sair?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" disabled={salvando} onClick={() => blocker.reset?.()}>
              Continuar editando
            </Button>
            <Button variant="outline" disabled={salvando} onClick={descartarTudoESair}>
              Descartar
            </Button>
            <Button disabled={salvando} onClick={() => void salvarTudoESair()}>
              {salvando ? "Salvando…" : "Salvar e sair"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function RomaneioCard({
  pedidoId,
  tipo,
  onRegistrar,
}: {
  pedidoId: string;
  tipo: RomaneioTipo;
  onRegistrar: (tipo: RomaneioTipo, handle: CardHandle | null, sujo: boolean) => void;
}) {
  const qc = useQueryClient();
  const carregar = useServerFn(getRomaneio);
  const gerarFn = useServerFn(gerarRomaneio);
  const salvarFn = useServerFn(salvarConferenciaRomaneio);
  const concluirFn = useServerFn(concluirRomaneio);

  const queryKey = ["romaneio", pedidoId, tipo];
  const { data: romaneio, isLoading } = useQuery<RomaneioRow | null>({
    queryKey,
    queryFn: () => carregar({ data: { pedido_id: pedidoId, tipo } }),
    // Conferência é preenchida à mão: nada de refetch ao voltar o foco da
    // janela/aba, para não sobrescrever marcações ainda não salvas.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: 5 * 60_000,
  });

  const [busy, setBusy] = useState(false);
  // `rascunho` só existe enquanto o usuário mexe; sem rascunho, a tela mostra
  // exatamente o que está gravado — assim nenhum refetch apaga trabalho.
  const [rascunho, setRascunho] = useState<Marcacoes | null>(null);

  const salvos = useMemo<Marcacoes>(() => {
    const mapa: Marcacoes = {};
    for (const c of (romaneio?.itens_conferidos ?? []) as RomaneioConferido[]) {
      mapa[c.item_key] = c.conferido;
    }
    return mapa;
  }, [romaneio]);

  const marcados = rascunho ?? salvos;
  const sujo = rascunho !== null && !mesmasMarcacoes(rascunho, salvos);

  const itens = useMemo(() => romaneio?.itens ?? [], [romaneio]);
  const conferidos = itens.filter((i) => marcados[i.item_key]).length;
  const tudoConferido = itens.length > 0 && conferidos === itens.length;

  const itensConferidos = () =>
    itens.map((i) => ({ item_key: i.item_key, conferido: !!marcados[i.item_key] }));

  async function salvarConferencia(): Promise<boolean> {
    setBusy(true);
    try {
      await salvarFn({
        data: { pedido_id: pedidoId, tipo, itens_conferidos: itensConferidos() },
      });
      toast.success(`Conferência do ${ROMANEIO_LABELS[tipo]} salva`);
      setRascunho(null);
      await qc.invalidateQueries({ queryKey });
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar conferência");
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Descarta o rascunho: a tela volta ao que está gravado. */
  const descartar = useCallback(() => setRascunho(null), []);

  // Publica os handlers e o estado "sujo" para o aviso de saída da seção.
  const salvarRef = useRef(salvarConferencia);
  salvarRef.current = salvarConferencia;
  useEffect(() => {
    onRegistrar(
      tipo,
      { label: ROMANEIO_LABELS[tipo], salvar: () => salvarRef.current(), descartar },
      sujo,
    );
    return () => onRegistrar(tipo, null, false);
  }, [tipo, sujo, descartar, onRegistrar]);

  async function gerar() {
    if (sujo && !window.confirm("Há marcações não salvas — gerar de novo descarta a conferência atual. Continuar?")) {
      return;
    }
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
      setRascunho(null);
      await qc.invalidateQueries({ queryKey });
      window.open(`/romaneio/${pedidoId}/${tipo}`, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar romaneio");
    } finally {
      setBusy(false);
    }
  }

  async function concluir() {
    setBusy(true);
    try {
      // Conclusão só depois de persistir o que está marcado na tela.
      await salvarFn({
        data: { pedido_id: pedidoId, tipo, itens_conferidos: itensConferidos() },
      });
      await concluirFn({ data: { pedido_id: pedidoId, tipo } });
      toast.success("Romaneio concluído");
      setRascunho(null);
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
          {sujo && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Alterações não salvas nesta conferência — clique em "Salvar conferência".
            </div>
          )}
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
                    setRascunho((m) => ({ ...(m ?? salvos), [i.item_key]: v === true }))
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
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !sujo}
              onClick={() => void salvarConferencia()}
            >
              Salvar conferência
            </Button>
            {sujo && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={descartar}>
                Descartar
              </Button>
            )}
            <Button size="sm" disabled={busy || !tudoConferido} onClick={() => void concluir()}>
              Concluir romaneio
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
