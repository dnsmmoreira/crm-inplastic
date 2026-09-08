import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Megaphone, Users } from "lucide-react";

import { cobrarPessoa, resumoEquipe } from "@/lib/equipe.functions";
import type { LinhaEquipe } from "@/lib/equipe.server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/equipe")({
  head: () => ({
    meta: [
      { title: "Equipe — quem está sem próximo ato | CRM INPLASTIC" },
      {
        name: "description",
        content:
          "Visão consolidada por pessoa: tarefas vencidas, leads sem contato, propostas vencidas, conversas paradas e pedidos sem dono.",
      },
      { property: "og:title", content: "Equipe — quem está sem próximo ato" },
      {
        property: "og:description",
        content: "Painel do gestor com cobrança direta por pessoa.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EquipePage,
});

const CHIPS: { campo: keyof LinhaEquipe; label: string }[] = [
  { campo: "tarefasVencidas", label: "tarefas vencidas" },
  { campo: "leadsSemContato", label: "leads sem contato" },
  { campo: "propostasVencidas", label: "propostas vencidas" },
  { campo: "rascunhosParados", label: "rascunhos parados" },
  { campo: "conversasParadas", label: "conversas paradas" },
  { campo: "semResposta", label: "sem resposta" },
  { campo: "pedidosSemResponsavel", label: "pedidos sem dono" },
  { campo: "posVendaAtrasado", label: "pós-venda atrasado" },
  { campo: "retornosVencidos", label: "retornos vencidos" },
];

function resumoTexto(l: LinhaEquipe): string {
  const partes = CHIPS.filter((c) => Number(l[c.campo]) > 0).map(
    (c) => `${Number(l[c.campo])} ${c.label}`,
  );
  if (partes.length === 0) return `${l.nome}, tudo em dia. Obrigado!`;
  return `${l.nome}, precisamos fechar isto hoje: ${partes.join(", ")}.`;
}

function EquipePage() {
  const qc = useQueryClient();
  const carregar = useServerFn(resumoEquipe);
  const { data, isLoading, error } = useQuery({
    queryKey: ["equipe-resumo"],
    queryFn: () => carregar(),
    staleTime: 60_000,
  });
  const [aberta, setAberta] = useState<string | null>(null);
  const [cobranca, setCobranca] = useState<{ ids: string[]; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const cobrarFn = useServerFn(cobrarPessoa);

  const linhas = useMemo(() => data?.linhas ?? [], [data]);
  const totais = data?.totais;

  async function enviarCobranca() {
    if (!cobranca) return;
    if (cobranca.texto.trim().length < 10) {
      toast.error("Escreva pelo menos 10 caracteres.");
      return;
    }
    setEnviando(true);
    try {
      let ok = 0;
      for (const id of cobranca.ids) {
        const r = await cobrarFn({ data: { userId: id, texto: cobranca.texto.trim() } });
        if (r.ok) ok++;
        else toast.error(r.message);
      }
      if (ok > 0) toast.success(ok === 1 ? "Cobrança enviada." : `${ok} cobranças enviadas.`);
      setCobranca(null);
      qc.invalidateQueries({ queryKey: ["equipe-resumo"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setEnviando(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando a equipe…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        {error instanceof Error ? error.message : "Não foi possível abrir o painel."}
      </div>
    );
  }

  const comVencidos = linhas.filter((l) => l.tarefasVencidas > 0);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Users className="h-5 w-5" /> Equipe
        </h1>
        {data?.podeCobrarTodos && comVencidos.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCobranca({
                ids: comVencidos.map((l) => l.id),
                texto: "Time, hoje precisamos zerar as tarefas vencidas. Me avisem o que travou.",
              })
            }
          >
            <Megaphone className="h-4 w-4 mr-1.5" />
            Cobrar todos com vencidos ({comVencidos.length})
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Sem próximo ato hoje: {totais?.semProximoAto ?? 0}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 text-sm">
          <Contagem label="Conversas paradas" valor={totais?.conversasParadas ?? 0} />
          <Contagem label="Tarefas vencidas" valor={totais?.tarefasVencidas ?? 0} />
          <Contagem label="Propostas vencidas" valor={totais?.propostasVencidas ?? 0} />
          <Contagem label="Rascunhos parados" valor={totais?.rascunhosParados ?? 0} />
          <Contagem label="Pedidos sem dono" valor={totais?.pedidosSemResponsavel ?? 0} />
          <Contagem label="Pós-venda atrasado" valor={totais?.posVendaAtrasado ?? 0} />
          <Contagem label="Retornos vencidos" valor={totais?.retornosVencidos ?? 0} />
        </CardContent>
      </Card>

      <div className="rounded-lg border divide-y">
        {linhas.map((l) => {
          const expandida = aberta === l.id;
          return (
            <div key={l.id}>
              <button
                type="button"
                onClick={() => setAberta(expandida ? null : l.id)}
                className="w-full text-left p-3 flex items-start gap-3 hover:bg-muted/50"
              >
                {expandida ? (
                  <ChevronDown className="h-4 w-4 mt-1 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 mt-1 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{l.nome}</span>
                    <Badge variant={l.total > 0 ? "destructive" : "outline"} className="text-[10px]">
                      {l.total} sem próximo ato
                    </Badge>
                    {!l.telegram && (
                      <Badge variant="outline" className="text-[10px]">
                        <AlertTriangle className="h-3 w-3 mr-1" /> Sem Telegram
                      </Badge>
                    )}
                    {l.aceitesPendentes > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {l.aceitesPendentes} aguardando aceite
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {CHIPS.filter((c) => Number(l[c.campo]) > 0).map((c) => (
                      <span
                        key={String(c.campo)}
                        className={cn(
                          "text-[11px] rounded px-1.5 py-0.5 border",
                          c.campo === "tarefasVencidas" ||
                            c.campo === "propostasVencidas" ||
                            c.campo === "retornosVencidos"
                            ? "bg-rose-500/10 text-rose-700 border-rose-500/30"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {Number(l[c.campo])} {c.label}
                      </span>
                    ))}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Última tarefa concluída:{" "}
                    {l.ultimaConclusao
                      ? `há ${formatDistanceToNowStrict(new Date(l.ultimaConclusao), { locale: ptBR })}`
                      : "nunca"}
                  </div>
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  className="shrink-0 text-xs border rounded px-2 py-1 hover:bg-background"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCobranca({ ids: [l.id], texto: resumoTexto(l) });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      setCobranca({ ids: [l.id], texto: resumoTexto(l) });
                    }
                  }}
                >
                  Cobrar
                </span>
              </button>

              {expandida && (
                <div className="px-10 pb-3 space-y-1">
                  {l.itens.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nada em aberto. 🎉</p>
                  )}
                  {l.itens.slice(0, 60).map((i, idx) => (
                    <a
                      key={`${i.link}-${idx}`}
                      href={i.link}
                      className="block text-xs text-primary hover:underline"
                    >
                      {i.grupo}: {i.label}
                    </a>
                  ))}
                  {l.itens.length > 60 && (
                    <p className="text-xs text-muted-foreground">
                      +{l.itens.length - 60} itens não listados.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {linhas.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">Ninguém na sua equipe ainda.</p>
        )}
      </div>

      <Dialog open={!!cobranca} onOpenChange={(o) => !o && setCobranca(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {cobranca && cobranca.ids.length > 1
                ? `Cobrar ${cobranca.ids.length} pessoas`
                : "Cobrar"}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            rows={5}
            value={cobranca?.texto ?? ""}
            onChange={(e) => setCobranca((c) => (c ? { ...c, texto: e.target.value } : c))}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCobranca(null)}>
              Cancelar
            </Button>
            <Button onClick={enviarCobranca} disabled={enviando}>
              {enviando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Enviar cobrança
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Contagem({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="rounded border p-2">
      <div className={cn("text-lg font-semibold", valor > 0 && "text-rose-600")}>{valor}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
