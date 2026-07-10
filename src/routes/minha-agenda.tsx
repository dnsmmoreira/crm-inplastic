import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format, isToday, isBefore, addBusinessDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, Clock, Flame, AlertTriangle } from "lucide-react";
import { listMinhaAgenda, concluirTarefa, adiarTarefa } from "@/lib/minha-agenda.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/minha-agenda")({
  component: MinhaAgendaPage,
  head: () => ({
    meta: [
      { title: "Minha Agenda — INPLASTIC - CRM" },
      { name: "description", content: "Sua agenda priorizada do dia pelo Xerife." },
    ],
  }),
});

type Tarefa = Awaited<ReturnType<typeof listMinhaAgenda>>[number];

const TIPO_LABEL: Record<string, string> = {
  primeiro_contato: "1º Contato",
  resposta_pendente: "Responder",
  follow_up: "Follow-up",
  cadencia_proposta: "Cadência",
  pos_venda_confirmacao: "Pós-venda: confirmar",
  pos_venda_satisfacao: "Pós-venda: satisfação",
  pos_venda_recompra: "Pós-venda: recompra",
  resgate_carteira: "Resgate carteira",
  reativacao_lead: "Reativação",
  prospeccao: "Prospecção",
};

const TIPO_COLOR: Record<string, string> = {
  resposta_pendente: "bg-red-500/10 text-red-700 border-red-500/30",
  primeiro_contato: "bg-orange-500/10 text-orange-700 border-orange-500/30",
  cadencia_proposta: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  follow_up: "bg-slate-500/10 text-slate-700 border-slate-500/30",
  resgate_carteira: "bg-amber-500/10 text-amber-700 border-amber-500/30",
  reativacao_lead: "bg-violet-500/10 text-violet-700 border-violet-500/30",
  pos_venda_confirmacao: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  pos_venda_satisfacao: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  pos_venda_recompra: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30",
  prospeccao: "bg-cyan-500/10 text-cyan-700 border-cyan-500/30",
};

function isPosVenda(tipo?: string | null) {
  return !!tipo && tipo.startsWith("pos_venda_");
}

function MinhaAgendaPage() {
  const list = useServerFn(listMinhaAgenda);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["minha-agenda"], queryFn: () => list() });

  const [concluir, setConcluir] = useState<Tarefa | null>(null);
  const [adiar, setAdiar] = useState<Tarefa | null>(null);
  const [nota, setNota] = useState("");
  const [motivo, setMotivo] = useState("");
  const [novaData, setNovaData] = useState("");

  const concluirFn = useServerFn(concluirTarefa);
  const adiarFn = useServerFn(adiarTarefa);

  const mConcluir = useMutation({
    mutationFn: (input: { id: string; nota?: string }) => concluirFn({ data: input }),
    onSuccess: () => { toast.success("Tarefa concluída"); setConcluir(null); setNota(""); qc.invalidateQueries({ queryKey: ["minha-agenda"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao concluir"),
  });
  const mAdiar = useMutation({
    mutationFn: (input: { id: string; motivo: string; novaData: string }) => adiarFn({ data: input }),
    onSuccess: () => { toast.success("Tarefa adiada"); setAdiar(null); setMotivo(""); setNovaData(""); qc.invalidateQueries({ queryKey: ["minha-agenda"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao adiar"),
  });

  const tarefas = data ?? [];
  const atrasadas = tarefas.filter((t) => t.due_date && isBefore(new Date(t.due_date), new Date()) && !isToday(new Date(t.due_date)));
  const hoje = tarefas.filter((t) => !atrasadas.includes(t));

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold flex items-center gap-2">
            🤠 Minha Agenda
          </h1>
          <p className="text-sm text-muted-foreground">
            {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })} · {tarefas.length} tarefa(s) do Xerife
          </p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />{hoje.length} hoje</Badge>
          {atrasadas.length > 0 && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />{atrasadas.length} atrasada(s)</Badge>}
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {!isLoading && tarefas.length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          🏆 Agenda limpa. Aproveita para prospectar!
        </CardContent></Card>
      )}

      <AgendaGroup title="Atrasadas" tone="destructive" items={atrasadas}
        onConcluir={setConcluir} onAdiar={setAdiar} />
      <AgendaGroup title="Hoje" tone="primary" items={hoje}
        onConcluir={setConcluir} onAdiar={setAdiar} />

      {/* Modal Concluir */}
      <Dialog open={!!concluir} onOpenChange={(o) => !o && (setConcluir(null), setNota(""))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Concluir tarefa</DialogTitle>
            <DialogDescription>{concluir?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nota de conclusão {isPosVenda(concluir?.tipo) && <span className="text-destructive">*</span>}</Label>
            <Textarea
              rows={4} value={nota} onChange={(e) => setNota(e.target.value.slice(0, 2000))}
              placeholder={isPosVenda(concluir?.tipo)
                ? "Obrigatório (mín. 10 caracteres): o que o cliente disse? recebeu? satisfeito? interesse em recompra?"
                : "Opcional: resumo do que foi feito"}
            />
            {isPosVenda(concluir?.tipo) && (
              <p className={cn(
                "text-xs",
                nota.trim().length < 10 ? "text-destructive" : "text-muted-foreground",
              )}>
                {nota.trim().length}/2000 · mínimo 10 caracteres para pós-venda
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => (setConcluir(null), setNota(""))}>Cancelar</Button>
            <Button
              disabled={mConcluir.isPending || (isPosVenda(concluir?.tipo) && nota.trim().length < 10)}
              onClick={() => concluir && mConcluir.mutate({ id: concluir.id, nota: nota.trim() || undefined })}
            >Concluir</Button>
          </DialogFooter>

        </DialogContent>
      </Dialog>

      {/* Modal Adiar */}
      <Dialog open={!!adiar} onOpenChange={(o) => !o && (setAdiar(null), setMotivo(""), setNovaData(""))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adiar tarefa</DialogTitle>
            <DialogDescription>{adiar?.title}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Motivo <span className="text-destructive">*</span></Label>
              <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex: cliente pediu para ligar amanhã à tarde" />
            </div>
            <div className="space-y-2">
              <Label>Nova data <span className="text-destructive">*</span></Label>
              <Input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)}
                min={format(addBusinessDays(new Date(), 1), "yyyy-MM-dd")} />
              <p className="text-xs text-muted-foreground">Adiar incrementa a contagem de escalonamentos.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => (setAdiar(null), setMotivo(""), setNovaData(""))}>Cancelar</Button>
            <Button
              disabled={mAdiar.isPending || !motivo.trim() || !novaData}
              onClick={() => adiar && mAdiar.mutate({ id: adiar.id, motivo: motivo.trim(), novaData })}
            >Adiar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AgendaGroup({
  title, tone, items, onConcluir, onAdiar,
}: {
  title: string;
  tone: "primary" | "destructive";
  items: Tarefa[];
  onConcluir: (t: Tarefa) => void;
  onAdiar: (t: Tarefa) => void;
}) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className={cn("text-base flex items-center gap-2",
          tone === "destructive" ? "text-destructive" : "text-primary")}>
          {title} <Badge variant="secondary">{items.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((t) => (
          <div key={t.id} className="rounded-md border p-3 hover:bg-accent/30 transition">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge variant="outline" className={cn("text-[10px]", TIPO_COLOR[t.tipo ?? ""] ?? "")}>
                    {TIPO_LABEL[t.tipo ?? ""] ?? t.tipo ?? "tarefa"}
                  </Badge>
                  {(t.escalonamentos ?? 0) > 0 && (
                    <Badge variant="destructive" className="text-[10px] gap-1">
                      <Flame className="h-3 w-3" />x{t.escalonamentos}
                    </Badge>
                  )}
                  {t.origem === "xerife" && <Badge variant="outline" className="text-[10px]">Xerife</Badge>}
                  <span className="text-[10px] text-muted-foreground">Pri. {t.prioridade ?? 3}</span>
                </div>
                <div className="text-sm font-medium truncate">{t.title}</div>
                {t.descricao && t.descricao !== t.title && (
                  <div className="text-xs text-muted-foreground mt-0.5">{t.descricao}</div>
                )}
                {t.lead && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Cliente: <span className="font-medium">{t.lead.company}</span>
                    {" · "}etapa: {t.lead.stage}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-1 shrink-0">
                <Button size="sm" onClick={() => onConcluir(t)} className="gap-1">
                  <CheckCircle2 className="h-3.5 w-3.5" />Concluir
                </Button>
                <Button size="sm" variant="outline" onClick={() => onAdiar(t)}>Adiar</Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
