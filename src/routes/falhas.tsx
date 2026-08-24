/**
 * Tela de diagnóstico: falhas registradas, filas travadas e avisos sem aceite.
 * SOMENTE LEITURA — a única ação é marcar uma falha como resolvida.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, BellOff, CheckCircle2, ListTree, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { useHasPerm } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listarPainelFalhas, resolverFalha } from "@/lib/falhas.functions";

export const Route = createFileRoute("/falhas")({
  head: () => ({
    meta: [
      { title: "Falhas do sistema — CRM Inplastic" },
      {
        name: "description",
        content:
          "Painel de diagnóstico: falhas registradas pelo servidor, filas travadas e avisos pendentes de aceite.",
      },
      { property: "og:title", content: "Falhas do sistema — CRM Inplastic" },
      {
        property: "og:description",
        content: "Erros que antes só iam para o log agora aparecem aqui no mesmo dia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FalhasPage,
});

function idadeHoras(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return (Date.now() - t) / 3_600_000;
}

function formatarIdade(iso: string | null): string {
  const h = idadeHoras(iso);
  if (h === null) return "—";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} dias`;
}

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString("pt-BR") : "—";
}

function FalhasPage() {
  const podeVer = useHasPerm("sistema.ver_falhas");

  if (!podeVer) {
    return (
      <div className="p-4 md:p-8">
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-base">Acesso restrito</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Você não tem permissão para acessar esta tela.
          </CardContent>
        </Card>
      </div>
    );
  }

  return <PainelFalhas />;
}

function PainelFalhas() {
  const listar = useServerFn(listarPainelFalhas);
  const resolver = useServerFn(resolverFalha);
  const qc = useQueryClient();
  const [origem, setOrigem] = useState("todas");
  const [expandido, setExpandido] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["painel-falhas"],
    queryFn: () => listar({}),
    refetchInterval: 60_000,
  });

  const marcar = useMutation({
    mutationFn: (id: string) => resolver({ data: { id } }),
    onSuccess: () => {
      toast.success("Falha marcada como resolvida");
      qc.invalidateQueries({ queryKey: ["painel-falhas"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const origens = useMemo(
    () => Array.from(new Set((data?.falhas ?? []).map((f) => f.origem))).sort(),
    [data],
  );
  const falhas = useMemo(
    () => (data?.falhas ?? []).filter((f) => origem === "todas" || f.origem === origem),
    [data, origem],
  );

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-1 h-6 w-6 text-amber-500" />
        <div>
          <h1 className="text-xl font-semibold md:text-2xl">Falhas do sistema</h1>
          <p className="text-sm text-muted-foreground">
            Erros que o servidor capturou, filas paradas e avisos que ninguém aceitou. Tela de
            leitura: nada aqui reprocessa ou reenvia.
          </p>
        </div>
      </div>

      {/* Bloco 1 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="text-base">Falhas registradas</CardTitle>
          <Select value={origem} onValueChange={setOrigem}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Origem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as origens</SelectItem>
              {origens.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && falhas.length === 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Nenhuma falha aberta.
            </p>
          )}
          {falhas.map((f) => (
            <div key={f.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{f.origem}</Badge>
                    <Badge variant={f.ocorrencias > 1 ? "destructive" : "secondary"}>
                      {f.ocorrencias}×
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      última: {formatarData(f.ocorrido_em)} ({formatarIdade(f.ocorrido_em)} atrás)
                    </span>
                  </div>
                  <p className="mt-1 break-words text-sm">{f.mensagem}</p>
                  {f.contexto != null && (
                    <button
                      type="button"
                      className="mt-1 text-xs text-muted-foreground underline"
                      onClick={() => setExpandido(expandido === f.id ? null : f.id)}
                    >
                      {expandido === f.id ? "ocultar contexto" : "ver contexto"}
                    </button>
                  )}
                  {expandido === f.id && (
                    <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-xs">
                      {JSON.stringify(f.contexto, null, 2)}
                    </pre>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={marcar.isPending}
                  onClick={() => marcar.mutate(f.id)}
                >
                  Marcar como resolvida
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Bloco 2 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListTree className="h-4 w-4" /> Filas travadas
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {(data?.filas ?? []).map((f) => {
            const h = idadeHoras(f.mais_antigo_em);
            const critico = f.total > 0 && h !== null && h > 1;
            return (
              <div
                key={f.chave}
                className={`rounded-md border p-3 ${critico ? "border-destructive" : ""}`}
              >
                <div className="text-xs text-muted-foreground">{f.rotulo}</div>
                <div
                  className={`text-2xl font-semibold ${critico ? "text-destructive" : ""}`}
                  aria-live="polite"
                >
                  {f.total}
                </div>
                <div className={`text-xs ${critico ? "text-destructive" : "text-muted-foreground"}`}>
                  {f.total === 0
                    ? "sem itens parados"
                    : `mais antigo há ${formatarIdade(f.mais_antigo_em)}`}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Bloco 3 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BellOff className="h-4 w-4" /> Avisos sem aceite
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.avisos ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Todos os avisos foram aceitos.</p>
          )}
          {(data?.avisos ?? []).map((a) => {
            const h = idadeHoras(a.mais_antigo_em);
            const critico = h !== null && h > 24;
            return (
              <div
                key={a.user_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <span className="text-sm font-medium">{a.nome}</span>
                <span className="text-sm text-muted-foreground">
                  {a.total} {a.total === 1 ? "aviso" : "avisos"} — mais antigo há{" "}
                  <span className={critico ? "font-medium text-destructive" : ""}>
                    {formatarIdade(a.mais_antigo_em)}
                  </span>
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
