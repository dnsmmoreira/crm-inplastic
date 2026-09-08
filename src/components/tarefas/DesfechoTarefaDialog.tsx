/**
 * Desfecho obrigatório das tarefas comerciais do Xerife.
 * Nenhuma tarefa comercial fecha "no vazio": o vendedor escolhe o que
 * aconteceu e isso vira estado no lead.
 */
import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { MOTIVOS_PERDA, MOTIVOS_PERDA_DESCRICAO } from "@/lib/motivos-perda";
import {
  desfechosParaTipo,
  etapasAvancoPermitidas,
  proximoDiaUtil,
  somarDiasUteis,
  validarDesfecho,
  MSG_NEGOCIACAO_SEM_AVANCO,
  type DesfechoInput,
} from "@/lib/tarefa-desfecho";

const STAGE_LABEL: Record<string, string> = {
  atendimento: "Atendimento",
  novo: "Novo",
  qualificacao: "Qualificação",
  proposta: "Proposta",
  negociacao: "Negociação",
};

export function DesfechoTarefaDialog({
  open, onOpenChange, titulo, stageAtual, pendente, onConfirmar, tipoTarefa, temLead = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  titulo: string;
  stageAtual: string | null | undefined;
  pendente?: boolean;
  onConfirmar: (d: DesfechoInput) => void;
  /** Tipo da tarefa — define quais desfechos aparecem. */
  tipoTarefa?: string | null;
  /** Tarefa sem lead (conversa avulsa) não oferece "perdido". */
  temLead?: boolean;
}) {
  const [tipo, setTipo] = useState<string>("");
  const [data, setData] = useState("");
  const [stage, setStage] = useState("");
  const [motivo, setMotivo] = useState("");
  const [detalhe, setDetalhe] = useState("");
  const [nota, setNota] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const minData = useMemo(() => proximoDiaUtil(), []);
  const permitidas = etapasAvancoPermitidas(stageAtual);
  const opcoes = useMemo(
    () => desfechosParaTipo(tipoTarefa, { temLead }),
    [tipoTarefa, temLead],
  );

  const limpar = () => {
    setTipo(""); setData(""); setStage(""); setMotivo(""); setDetalhe(""); setNota(""); setErro(null);
  };

  const confirmar = () => {
    const input: DesfechoInput = { tipo, data, stage, motivo, detalhe, nota };
    const v = validarDesfecho(input, { stageAtual, tipoTarefa, temLead });
    if (!v.ok) { setErro(v.erro); return; }
    setErro(null);
    onConfirmar(input);
  };


  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) limpar(); onOpenChange(o); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Qual foi o desfecho?</DialogTitle>
          <DialogDescription>{titulo}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {DESFECHOS.map((d) => (
            <button
              key={d.tipo}
              type="button"
              onClick={() => { setTipo(d.tipo); setErro(null); }}
              className={cn(
                "w-full rounded-md border p-3 text-left transition",
                tipo === d.tipo ? "border-primary bg-primary/5" : "hover:bg-accent/40",
              )}
            >
              <div className="text-sm font-medium">{d.rotulo}</div>
              <div className="text-xs text-muted-foreground">{d.descricao}</div>
            </button>
          ))}
        </div>

        {tipo === "retorno_agendado" && (
          <div className="space-y-2">
            <Label>Data do retorno <span className="text-destructive">*</span></Label>
            <Input type="date" min={minData} value={data} onChange={(e) => setData(e.target.value)} />
            <div className="flex gap-2 flex-wrap">
              <Button type="button" size="sm" variant="outline" onClick={() => setData(proximoDiaUtil())}>Amanhã</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setData(somarDiasUteis(3))}>+3 dias úteis</Button>
              <Button type="button" size="sm" variant="outline"
                onClick={() => setData(format(new Date(Date.now() + 7 * 86400000), "yyyy-MM-dd"))}>+1 semana</Button>
            </div>
          </div>
        )}

        {tipo === "avancou_etapa" && (
          <div className="space-y-2">
            <Label>Nova etapa <span className="text-destructive">*</span></Label>
            {permitidas.length === 0 ? (
              <p className="text-xs text-destructive">{MSG_NEGOCIACAO_SEM_AVANCO}</p>
            ) : (
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger><SelectValue placeholder="Escolha a etapa…" /></SelectTrigger>
                <SelectContent>
                  {permitidas.map((s) => (
                    <SelectItem key={s} value={s}>{STAGE_LABEL[s] ?? s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {tipo === "perdido" && (
          <div className="space-y-2">
            <Label>Motivo da perda <span className="text-destructive">*</span></Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger><SelectValue placeholder="Escolha o motivo…" /></SelectTrigger>
              <SelectContent>
                {MOTIVOS_PERDA.map((m) => (
                  <SelectItem key={m} value={m}>{m} — {MOTIVOS_PERDA_DESCRICAO[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label>Detalhe (opcional)</Label>
            <Textarea rows={2} value={detalhe} onChange={(e) => setDetalhe(e.target.value)} />
          </div>
        )}

        {tipo === "sem_pendencia" && (
          <div className="space-y-2">
            <Label>Por quê? <span className="text-destructive">*</span></Label>
            <Textarea rows={2} value={detalhe} onChange={(e) => setDetalhe(e.target.value)}
              placeholder="Ex: cliente já respondeu por outro canal" />
          </div>
        )}

        {tipo && (
          <div className="space-y-2">
            <Label>Nota (opcional)</Label>
            <Textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value.slice(0, 2000))} />
          </div>
        )}

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => { limpar(); onOpenChange(false); }}>Cancelar</Button>
          <Button disabled={!tipo || pendente} onClick={confirmar}>Confirmar desfecho</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
