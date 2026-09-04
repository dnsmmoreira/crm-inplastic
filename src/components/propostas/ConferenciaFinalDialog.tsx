import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, ExternalLink, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { displayValue } from "@/lib/format";
import {
  DETALHE_APROVACAO_MIN_CHARS,
  MEIOS_APROVACAO_CLIENTE,
  MEIO_APROVACAO_LABEL,
  aprovacaoClienteValida,
  type MeioAprovacaoCliente,
  type Pendencia,
} from "@/lib/pedido-pendencias";
import {
  acionarEntrada,
  buildConferenciaEntries,
  contarConfirmados,
  estadoDaEntrada,
  estadoInicialConferencia,
  todosConfirmados,
  type ConferenciaEntry,
  type ConferenciaInput,
  type EstadoEntrada,
} from "@/lib/conferencia-final";

export type AprovacaoClienteForm = { meio: MeioAprovacaoCliente; detalhe: string };


const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(v) ? v : 0,
  );

/**
 * Conferência final antes de gerar/solicitar o pedido.
 * Fluxo guiado e sequencial sobre a "folha do pedido": só a linha atual pode ser
 * confirmada; as seguintes ficam bloqueadas. O estado nasce zerado a cada abertura
 * (nunca persistido).
 */
export function ConferenciaFinalDialog({
  open,
  onOpenChange,
  input,
  confirmLabel,
  busy,
  pendencias,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  input: ConferenciaInput;
  confirmLabel: string;
  busy?: boolean;
  /** Pendências bloqueantes (trava 1) — quando houver, nada pode ser conferido. */
  pendencias?: Pendencia[];
  onConfirm: (aprovacao: AprovacaoClienteForm) => void;
}) {
  // O conteúdo só monta quando aberto, garantindo checklist zerado a cada abertura.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 gap-0">
        {open && (
          <ConferenciaConteudo
            input={input}
            confirmLabel={confirmLabel}
            busy={busy}
            pendencias={pendencias ?? []}
            onConfirm={onConfirm}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

const estiloLinha: Record<EstadoEntrada, string> = {
  confirmado: "border-emerald-500/60 bg-emerald-500/5",
  atual: "border-amber-500 ring-2 ring-amber-500/40 bg-amber-500/10",
  bloqueado: "border-border bg-muted/30 opacity-50",
};

function ConferenciaConteudo({
  input,
  confirmLabel,
  busy,
  pendencias,
  onConfirm,
  onCancel,
}: {
  input: ConferenciaInput;
  confirmLabel: string;
  busy?: boolean;
  pendencias: Pendencia[];
  onConfirm: (aprovacao: AprovacaoClienteForm) => void;
  onCancel: () => void;
}) {
  const entries = useMemo(() => buildConferenciaEntries(input), [input]);
  const [marcados, setMarcados] = useState<Record<string, boolean>>(estadoInicialConferencia);
  const [declaracao, setDeclaracao] = useState(false);
  const [meio, setMeio] = useState<MeioAprovacaoCliente | "">("");
  const [detalhe, setDetalhe] = useState("");

  const bloqueadoPorPendencias = pendencias.length > 0;
  const itens = entries.filter((e) => e.grupo === "item");
  const gerais = entries.filter((e) => e.grupo === "geral");
  const feitos = contarConfirmados(entries, marcados);
  const tudoOk =
    !bloqueadoPorPendencias && todosConfirmados(entries, marcados) && itens.length > 0;
  const aprovacaoOk = aprovacaoClienteValida({ meio, detalhe });
  const liberado = tudoOk && declaracao && aprovacaoOk;
  const posicao = Math.min(feitos + 1, entries.length);

  const estadoDe = (e: ConferenciaEntry): EstadoEntrada =>
    bloqueadoPorPendencias
      ? "bloqueado"
      : estadoDaEntrada(entries, marcados, entries.indexOf(e));

  const acionar = (id: string) => {
    if (bloqueadoPorPendencias) return;
    setDeclaracao(false);
    setMarcados((m) => acionarEntrada(entries, m, id));
  };



  const subtotal = input.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const desconto = subtotal * (input.descontoPercent / 100);

  const CheckLinha = ({ estado }: { estado: EstadoEntrada }) =>
    estado === "bloqueado" ? (
      <Lock className="h-4 w-4 text-muted-foreground" />
    ) : (
      <Checkbox checked={estado === "confirmado"} className="pointer-events-none" />
    );

  return (
    <>
      <DialogHeader className="border-b px-6 py-4">
        <DialogTitle className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4" /> Conferência final do pedido
        </DialogTitle>
        <DialogDescription>
          Revise a folha do pedido linha a linha, na ordem. Confirme a linha destacada para liberar
          a próxima; clique numa linha já confirmada para corrigi-la.
        </DialogDescription>
        <div className="pt-2 space-y-1">
          <Progress value={entries.length ? (feitos / entries.length) * 100 : 0} />
          <p className="text-xs text-muted-foreground">
            {bloqueadoPorPendencias
              ? "Corrija as pendências abaixo para liberar a conferência."
              : tudoOk
                ? "Todas as linhas conferidas — confirme a declaração final abaixo."
                : `Linha ${posicao} de ${entries.length} · ${feitos} confirmada(s)`}
          </p>
        </div>
      </DialogHeader>

      <ScrollArea className="max-h-[62vh]">
        <div className="space-y-6 px-6 py-5">
          {bloqueadoPorPendencias && (
            <section className="rounded-md border-2 border-destructive bg-destructive/10 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <AlertTriangle className="h-4 w-4" /> Pendências que impedem gerar o pedido
              </h3>
              <ul className="mt-3 space-y-2">
                {pendencias.map((p, i) => (
                  <li
                    key={`${p.codigo}-${i}`}
                    className="flex items-start justify-between gap-3 rounded-md border bg-background/70 p-2.5"
                  >
                    <span className="text-sm">{p.mensagem}</span>
                    {p.link ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 gap-1"
                        onClick={() => window.open(p.link, "_blank", "noopener")}
                      >
                        Corrigir <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Cabeçalho da folha */}

          <header className="rounded-md border bg-card p-4">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Pedido a ser gerado
            </p>
            <h2 className="mt-1 text-lg font-semibold leading-tight">
              {displayValue(input.cliente.razaoSocial, "Razão social não informada")}
            </h2>
            <p className="text-sm text-muted-foreground">
              CNPJ/CPF: {displayValue(input.cliente.documento, "não informado")}
            </p>
          </header>

          {/* Tabela de itens */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Itens ({itens.length})
            </h3>
            {itens.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-xs italic text-muted-foreground">
                Nenhum item na proposta — adicione ao menos um item antes de gerar o pedido.
              </p>
            ) : (
              <div className="overflow-hidden rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="w-10 px-3 py-2" />
                      <th className="px-3 py-2 text-left font-medium">Item</th>
                      <th className="px-3 py-2 text-right font-medium">Qtd.</th>
                      <th className="px-3 py-2 text-left font-medium">Un.</th>
                      <th className="px-3 py-2 text-right font-medium">Preço un.</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {input.items.map((it) => {
                      const entry = entries.find((e) => e.id === `item:${it.id}`);
                      if (!entry) return null;
                      const estado = estadoDe(entry);
                      return (
                        <tr
                          key={it.id}
                          onClick={() => estado !== "bloqueado" && acionar(entry.id)}
                          className={cn(
                            "border-t transition-colors",
                            estado === "bloqueado"
                              ? "opacity-50"
                              : "cursor-pointer hover:brightness-105",
                            estado === "confirmado" && "bg-emerald-500/5",
                            estado === "atual" &&
                              "bg-amber-500/10 outline outline-2 -outline-offset-2 outline-amber-500",
                          )}
                        >
                          <td className="px-3 py-2 align-top">
                            <CheckLinha estado={estado} />
                          </td>
                          <td className="px-3 py-2">
                            <span className="block font-medium">
                              {displayValue(it.description, "Item sem descrição")}
                            </span>
                            {it.sku ? (
                              <span className="block text-xs text-muted-foreground">
                                SKU {it.sku}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{it.quantity}</td>
                          <td className="px-3 py-2">{displayValue(it.unit, "un")}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {brl(it.unitPrice)}
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">
                            {brl(it.quantity * it.unitPrice)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/40 text-sm">
                    <tr className="border-t">
                      <td colSpan={5} className="px-3 py-1.5 text-right text-muted-foreground">
                        Subtotal
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{brl(subtotal)}</td>
                    </tr>
                    {input.descontoPercent > 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-1.5 text-right text-muted-foreground">
                          Desconto ({String(input.descontoPercent).replace(".", ",")}%)
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">- {brl(desconto)}</td>
                      </tr>
                    )}
                    <tr className="border-t">
                      <td colSpan={5} className="px-3 py-2 text-right font-semibold">
                        Total
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">
                        {brl(subtotal - desconto)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

          {/* Dados gerais como resumo formatado */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Dados gerais
            </h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {gerais.map((e) => {
                const estado = estadoDe(e);
                return (
                  <div
                    key={e.id}
                    onClick={() => estado !== "bloqueado" && acionar(e.id)}
                    className={cn(
                      "flex items-start gap-3 rounded-md border p-3 transition-colors",
                      estado === "bloqueado" ? "" : "cursor-pointer",
                      estiloLinha[estado],
                    )}
                  >
                    <span className="mt-0.5">
                      <CheckLinha estado={estado} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs uppercase tracking-wide text-muted-foreground">
                        {e.label}
                      </span>
                      <span className="block text-sm font-medium leading-snug">{e.detail}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Declaração final */}
          {tudoOk && (
            <section
              className={cn(
                "rounded-md border-2 border-dashed p-4 transition-colors",
                declaracao
                  ? "border-emerald-500/70 bg-emerald-500/10"
                  : "border-amber-500 bg-amber-500/10",
              )}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  checked={declaracao}
                  onCheckedChange={(v) => setDeclaracao(v === true)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm font-semibold">Declaração de conferência</span>
                  <span className="block text-sm text-muted-foreground">
                    Confiro que revisei todos os itens e dados acima e estou de acordo.
                  </span>
                </span>
              </label>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Como o cliente aprovou esta proposta?
                  </label>
                  <Select value={meio} onValueChange={(v) => setMeio(v as MeioAprovacaoCliente)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o meio" />
                    </SelectTrigger>
                    <SelectContent>
                      {MEIOS_APROVACAO_CLIENTE.map((m) => (
                        <SelectItem key={m} value={m}>
                          {MEIO_APROVACAO_LABEL[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Detalhe da aprovação
                  </label>
                  <Input
                    value={detalhe}
                    onChange={(e) => setDetalhe(e.target.value)}
                    placeholder="Ex.: e-mail do comprador João em 04/09 aprovando 50 un. do HV6"
                  />
                  <p className="text-xs text-muted-foreground">
                    Mínimo {DETALHE_APROVACAO_MIN_CHARS} caracteres.
                  </p>
                </div>
              </div>
            </section>
          )}
        </div>
      </ScrollArea>

      <DialogFooter className="border-t px-6 py-4 sm:justify-between">
        <span className="self-center text-xs text-muted-foreground">
          {bloqueadoPorPendencias
            ? `${pendencias.length} pendência(s) bloqueando a geração do pedido`
            : `${feitos}/${entries.length} linhas conferidas`}
          {tudoOk && !declaracao ? " · falta a declaração final" : ""}
          {tudoOk && declaracao && !aprovacaoOk ? " · informe como o cliente aprovou" : ""}
        </span>
        <span className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
          <Button
            className="gap-2"
            disabled={!liberado || busy}
            onClick={() =>
              liberado && onConfirm({ meio: meio as MeioAprovacaoCliente, detalhe: detalhe.trim() })
            }
          >
            <CheckCircle2 className="h-4 w-4" /> {confirmLabel}
          </Button>
        </span>
      </DialogFooter>

    </>
  );
}
