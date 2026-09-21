import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ShieldCheck, ThumbsDown, ThumbsUp, AlertTriangle } from "lucide-react";
import {
  listarAcoesXerife,
  opcoesAuditoriaXerife,
  avaliarAcaoXerife,
  registrarDeixouPassar,
  resumoAuditoriaXerife,
  type AcaoXerife,
} from "@/lib/xerife-auditoria.functions";

export const Route = createFileRoute("/auditoria-xerife")({
  component: AuditoriaXerifePage,
  head: () => ({
    meta: [
      { title: "Auditoria do Xerife — INPLASTIC - CRM" },
      {
        name: "description",
        content: "Acompanhe e avalie as cobranças automáticas do Xerife na sua equipe.",
      },
      { property: "og:title", content: "Auditoria do Xerife — INPLASTIC - CRM" },
      {
        property: "og:description",
        content: "Cobrança justa, cobrança indevida e o que o Xerife deixou passar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const TODOS = "__todos__";

function dataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function AuditoriaXerifePage() {
  const qc = useQueryClient();
  const carregarOpcoes = useServerFn(opcoesAuditoriaXerife);
  const carregarAcoes = useServerFn(listarAcoesXerife);
  const carregarResumo = useServerFn(resumoAuditoriaXerife);
  const avaliar = useServerFn(avaliarAcaoXerife);
  const registrarPassou = useServerFn(registrarDeixouPassar);

  const [vendedorId, setVendedorId] = useState<string>(TODOS);
  const [regra, setRegra] = useState<string>(TODOS);
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [emAvaliacao, setEmAvaliacao] = useState<{
    acao: AcaoXerife;
    veredito: "justa" | "indevida";
  } | null>(null);
  const [nota, setNota] = useState("");
  const [passouAberto, setPassouAberto] = useState(false);
  const [passouVendedor, setPassouVendedor] = useState("");
  const [passouDescricao, setPassouDescricao] = useState("");

  const opcoes = useQuery({
    queryKey: ["auditoria-xerife", "opcoes"],
    queryFn: () => carregarOpcoes(),
  });

  const filtros = useMemo(
    () => ({
      vendedorId: vendedorId === TODOS ? undefined : vendedorId,
      regra: regra === TODOS ? undefined : regra,
      de: de ? new Date(`${de}T00:00:00`).toISOString() : undefined,
      ate: ate ? new Date(`${ate}T23:59:59`).toISOString() : undefined,
    }),
    [vendedorId, regra, de, ate],
  );

  const acoes = useQuery({
    queryKey: ["auditoria-xerife", "acoes", filtros],
    queryFn: () => carregarAcoes({ data: filtros }),
  });

  const isAdmin = opcoes.data?.isAdmin === true;
  const podeAvaliar = opcoes.data?.podeAvaliar === true;

  const resumo = useQuery({
    queryKey: ["auditoria-xerife", "resumo"],
    queryFn: () => carregarResumo(),
    enabled: isAdmin,
  });

  async function confirmarAvaliacao() {
    if (!emAvaliacao) return;
    try {
      await avaliar({
        data: {
          xerifeLogId: emAvaliacao.acao.id,
          veredito: emAvaliacao.veredito,
          nota: nota.trim() || undefined,
        },
      });
      toast.success("Avaliação registrada");
      setEmAvaliacao(null);
      setNota("");
      void qc.invalidateQueries({ queryKey: ["auditoria-xerife"] });
    } catch (e) {
      toast.error("Não foi possível registrar", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function confirmarDeixouPassar() {
    try {
      await registrarPassou({
        data: { vendedorId: passouVendedor, descricao: passouDescricao.trim() },
      });
      toast.success("Registrado: o Xerife deixou passar");
      setPassouAberto(false);
      setPassouVendedor("");
      setPassouDescricao("");
      void qc.invalidateQueries({ queryKey: ["auditoria-xerife"] });
    } catch (e) {
      toast.error("Não foi possível registrar", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (opcoes.isError) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Você não tem acesso à auditoria do Xerife.
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-amber-600" />
          <h1 className="text-xl font-semibold">Auditoria do Xerife</h1>
        </div>
        {podeAvaliar && (
          <Button variant="outline" size="sm" onClick={() => setPassouAberto(true)}>
            <AlertTriangle className="mr-1 h-4 w-4" /> Registrar "deixou passar"
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Estas são as cobranças automáticas feitas na sua equipe. Avalie cada uma para
        ajudar a afinar o Xerife. Nada aqui cobra ou altera o trabalho de ninguém.
      </p>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-4">
          <div className="space-y-1">
            <Label>Vendedor</Label>
            <Select value={vendedorId} onValueChange={setVendedorId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos</SelectItem>
                {(opcoes.data?.vendedores ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Regra</Label>
            <Select value={regra} onValueChange={setRegra}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todas</SelectItem>
                {(opcoes.data?.regras ?? []).map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="de">De</Label>
            <Input id="de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ate">Até</Label>
            <Input id="ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Resumo por regra</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {(resumo.data?.porRegra ?? []).length === 0 ? (
              <p className="text-muted-foreground">Ainda não há avaliações registradas.</p>
            ) : (
              (resumo.data?.porRegra ?? []).map((r) => (
                <div key={r.regra} className="flex items-center justify-between border-b py-1">
                  <span className="font-medium">{r.regra}</span>
                  <span className="text-muted-foreground">
                    {r.justas} justas · {r.indevidas} indevidas
                  </span>
                </div>
              ))
            )}
            <p className="pt-2 text-muted-foreground">
              Situações que o Xerife deixou passar: {resumo.data?.deixouPassarTotal ?? 0}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {acoes.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Carregando…</p>
          ) : (acoes.data ?? []).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhuma cobrança do Xerife no período selecionado.
            </p>
          ) : (
            <div className="divide-y">
              {(acoes.data ?? []).map((a) => (
                <div key={a.id} className="flex flex-wrap items-start gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <span>{a.vendedor ?? "—"}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-normal">
                        {a.regra}
                      </span>
                      <span className="text-[11px] font-normal text-muted-foreground">
                        {dataHora(a.created_at)}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {a.acao_tomada ?? "—"}
                      {a.lead ? ` · ${a.lead}` : ""}
                    </div>
                    {a.avaliacao && (
                      <div className="mt-1 text-[11px]">
                        <span
                          className={
                            a.avaliacao.veredito === "justa"
                              ? "text-emerald-600"
                              : "text-destructive"
                          }
                        >
                          {a.avaliacao.veredito === "justa"
                            ? "Cobrança justa"
                            : "Cobrança indevida"}
                        </span>
                        {a.avaliacao.nota ? ` — ${a.avaliacao.nota}` : ""}
                      </div>
                    )}
                  </div>
                  {podeAvaliar && (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setNota(a.avaliacao?.nota ?? "");
                          setEmAvaliacao({ acao: a, veredito: "justa" });
                        }}
                      >
                        <ThumbsUp className="mr-1 h-3.5 w-3.5" /> Justa
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setNota(a.avaliacao?.nota ?? "");
                          setEmAvaliacao({ acao: a, veredito: "indevida" });
                        }}
                      >
                        <ThumbsDown className="mr-1 h-3.5 w-3.5" /> Indevida
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!emAvaliacao} onOpenChange={(o) => !o && setEmAvaliacao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {emAvaliacao?.veredito === "justa" ? "Cobrança justa" : "Cobrança indevida"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="nota">Observação (opcional)</Label>
            <Textarea
              id="nota"
              rows={4}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Por que esta cobrança foi justa ou indevida?"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEmAvaliacao(null)}>Cancelar</Button>
            <Button onClick={() => void confirmarAvaliacao()}>Registrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={passouAberto} onOpenChange={setPassouAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>O Xerife deixou passar</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Vendedor</Label>
              <Select value={passouVendedor} onValueChange={setPassouVendedor}>
                <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
                <SelectContent>
                  {(opcoes.data?.vendedores ?? []).map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="desc">O que deveria ter sido cobrado</Label>
              <Textarea
                id="desc"
                rows={4}
                value={passouDescricao}
                onChange={(e) => setPassouDescricao(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPassouAberto(false)}>Cancelar</Button>
            <Button
              disabled={!passouVendedor || passouDescricao.trim().length < 5}
              onClick={() => void confirmarDeixouPassar()}
            >
              Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
