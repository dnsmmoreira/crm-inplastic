/**
 * Desfecho obrigatório das tarefas comerciais do Xerife.
 * Nenhuma tarefa comercial fecha "no vazio": o vendedor escolhe o que
 * aconteceu e isso vira estado no lead.
 */
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { listVendedores } from "@/lib/clientes.functions";
import {
  desfechosParaTipo,
  etapasAvancoPermitidas,
  proximoDiaUtil,
  somarDiasUteis,
  validarDesfecho,
  atalhoSemPendencia,
  MOTIVOS_SEM_PENDENCIA,
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
  propostaId = null,
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
  /** Tarefa de proposta: mostra o atalho "Abrir proposta". */
  propostaId?: string | null;
}) {
  const [tipo, setTipo] = useState<string>("");
  const [data, setData] = useState("");
  const [stage, setStage] = useState("");
  const [motivo, setMotivo] = useState("");
  const [detalhe, setDetalhe] = useState("");
  const [nota, setNota] = useState("");
  const [motivoSem, setMotivoSem] = useState("");
  const [novoDono, setNovoDono] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const minData = useMemo(() => proximoDiaUtil(), []);
  const permitidas = etapasAvancoPermitidas(stageAtual);
  const opcoes = useMemo(
    () => desfechosParaTipo(tipoTarefa, { temLead }),
    [tipoTarefa, temLead],
  );

  const listar = useServerFn(listVendedores);
  const { data: vendedores } = useQuery({
    queryKey: ["vendedores-transferencia"],
    queryFn: () => listar(),
    enabled: open && tipo === "transferir",
    staleTime: 5 * 60_000,
  });

  const limpar = () => {
    setTipo(""); setData(""); setStage(""); setMotivo(""); setDetalhe(""); setNota("");
    setMotivoSem(""); setNovoDono(""); setErro(null);
  };

  /** "Produto fora do portfólio" vira perda; "não é meu cliente" vira transferência. */
  const escolherMotivoSem = (v: string) => {
    setMotivoSem(v);
    setErro(null);
    const atalho = atalhoSemPendencia(v);
    if (atalho?.tipo === "perdido") {
      setTipo("perdido");
      setMotivo(atalho.motivo);
    } else if (atalho?.tipo === "transferir") {
      setTipo("transferir");
    }
  };

  const confirmar = () => {
    const input: DesfechoInput = {
      tipo, data, stage, motivo, detalhe, nota,
      motivo_sem_pendencia: motivoSem || null,
      novo_dono: novoDono || null,
    };
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
          {propostaId && (
            <a
              href={`/propostas/${propostaId}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary underline underline-offset-2"
            >
              Abrir proposta
            </a>
          )}
        </DialogHeader>

        <div className="space-y-2">
          {opcoes.map((d) => (
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

        {(tipo === "retorno_agendado" ||
          tipo === "em_espera" ||
          tipo === "prorrogar_proposta" ||
          tipo === "data_combinada") && (
          <div className="space-y-2">
            <Label>
              {tipo === "em_espera"
                ? "Aguardar o cliente até"
                : tipo === "prorrogar_proposta"
                  ? "Nova validade da proposta"
                  : tipo === "data_combinada"
                    ? "Data combinada da coleta/entrega"
                    : "Data do retorno"}{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input type="date" min={minData} value={data} onChange={(e) => setData(e.target.value)} />
            <div className="flex gap-2 flex-wrap">
              <Button type="button" size="sm" variant="outline" onClick={() => setData(proximoDiaUtil())}>Amanhã</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setData(somarDiasUteis(3))}>+3 dias úteis</Button>
              <Button type="button" size="sm" variant="outline"
                onClick={() => setData(format(new Date(Date.now() + 7 * 86400000), "yyyy-MM-dd"))}>+1 semana</Button>
            </div>
          </div>
        )}

        {(tipo === "encerrar_conversa" ||
          tipo === "excluir_rascunho" ||
          tipo === "prorrogar_proposta") && (
          <div className="space-y-2">
            <Label>
              {tipo === "encerrar_conversa"
                ? "Motivo do encerramento"
                : tipo === "excluir_rascunho"
                  ? "Por que excluir o rascunho?"
                  : "Motivo da prorrogação"}{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Textarea rows={2} value={detalhe} onChange={(e) => setDetalhe(e.target.value)}
              placeholder={
                tipo === "prorrogar_proposta"
                  ? "Ex: cliente pediu mais prazo e o preço se mantém"
                  : tipo === "excluir_rascunho"
                    ? "Ex: rascunho de teste, orçamento refeito em outra proposta"
                    : "Ex: cliente comprou com outro fornecedor; assunto resolvido"
              } />
          </div>
        )}

        {tipo === "data_combinada" && (
          <div className="space-y-2">
            <Label>
              Observação da combinação <span className="text-destructive">*</span>
            </Label>
            <Textarea
              rows={2}
              value={detalhe}
              onChange={(e) => setDetalhe(e.target.value)}
              placeholder="Ex: transportadora retira pela manhã; falado com o comprador"
            />
          </div>
        )}

        {tipo === "contato_registrado" && (
          <div className="space-y-2">
            <Label>
              O que o cliente disse? <span className="text-destructive">*</span>
            </Label>
            <Textarea
              rows={2}
              value={detalhe}
              onChange={(e) => setDetalhe(e.target.value)}
              placeholder="Ex: recebeu tudo certo, sem avarias; pediu para avisar do próximo lote"
            />
          </div>
        )}

        {tipo === "reemitir_proposta" && (
          <p className="text-xs text-muted-foreground">
            Vamos criar um novo rascunho com os mesmos itens, para você revisar os preços antes de enviar.
          </p>
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

        {(tipo === "perdido" || tipo === "recusar_proposta") && (
          <div className="space-y-2">
            <Label>
              {tipo === "recusar_proposta" ? "Motivo da recusa" : "Motivo da perda"}{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger><SelectValue placeholder="Escolha o motivo…" /></SelectTrigger>
              <SelectContent>
                {MOTIVOS_PERDA.map((m) => (
                  <SelectItem key={m} value={m}>{m} — {MOTIVOS_PERDA_DESCRICAO[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label>
              Detalhe{" "}
              {tipo === "recusar_proposta"
                ? <span className="text-destructive">*</span>
                : "(opcional)"}
            </Label>
            <Textarea rows={2} value={detalhe} onChange={(e) => setDetalhe(e.target.value)} />
          </div>
        )}


        {tipo === "transferir" && (
          <div className="space-y-2">
            <Label>Quem passa a atender <span className="text-destructive">*</span></Label>
            <Select value={novoDono} onValueChange={setNovoDono}>
              <SelectTrigger><SelectValue placeholder="Escolha o vendedor…" /></SelectTrigger>
              <SelectContent>
                {(vendedores ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label>Motivo da transferência <span className="text-destructive">*</span></Label>
            <Textarea
              rows={2}
              value={detalhe}
              onChange={(e) => setDetalhe(e.target.value)}
              placeholder="Ex: cliente já é atendido pela Bianca"
            />
          </div>
        )}

        {tipo === "sem_pendencia" && (
          <div className="space-y-2">
            <Label>Por quê? <span className="text-destructive">*</span></Label>
            <Select value={motivoSem} onValueChange={escolherMotivoSem}>
              <SelectTrigger><SelectValue placeholder="Escolha o motivo…" /></SelectTrigger>
              <SelectContent>
                {MOTIVOS_SEM_PENDENCIA.map((m) => (
                  <SelectItem key={m.valor} value={m.valor}>{m.rotulo}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {motivoSem === "outro" && (
              <Textarea rows={2} value={detalhe} onChange={(e) => setDetalhe(e.target.value)}
                placeholder="Ex: cliente já respondeu por outro canal" />
            )}
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
