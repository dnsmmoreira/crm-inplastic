/**
 * Tela administrativa "Frases prontas".
 *
 * Duas coisas diferentes convivem aqui e a tela deixa isso explícito:
 *  - FRASE PRONTA: texto interno colado no compositor, só vale DENTRO da
 *    janela de 24h;
 *  - MODELO META: template aprovado pela Meta, única forma de falar fora da
 *    janela de 24h.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  MessageSquareText,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  CATEGORIAS_ORDEM,
  CATEGORIA_LABEL,
  EXEMPLOS_VARIAVEL,
  MSG_EMPRESA_PROIBIDA,
  VARIAVEIS,
  aplicarVariaveisFrase,
  citaNomeDeEmpresa,
  converterParaMeta,
  ordemCategoria,

  validarParaMeta,
  variaveisInvalidas,
} from "@/lib/frases-prontas";
import {
  enviarFraseParaMeta,
  enviarSugeridasParaMeta,
  excluirFrase,
  excluirTemplateNaMeta,
  listarFrasesAdmin,
  nomeTemplateAutomatico,
  reordenarFrases,
  salvarFrase,
  sincronizarStatusMeta,
} from "@/lib/frases-prontas.functions";

export const Route = createFileRoute("/frases-prontas")({
  head: () => ({
    meta: [
      { title: "Frases prontas — CRM Inplastic" },
      {
        name: "description",
        content:
          "Catálogo de frases do atendimento e envio dos modelos para aprovação da conta oficial do WhatsApp.",
      },
      { property: "og:title", content: "Frases prontas — CRM Inplastic" },
      {
        property: "og:description",
        content: "Textos do atendimento e modelos aprovados para falar fora da janela de 24h.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FrasesProntasPage,
});

type Frase = {
  id: string;
  titulo: string;
  categoria: string;
  corpo: string;
  ativo: boolean;
  ordem: number | null;
  meta_nome: string | null;
  meta_id: string | null;
  meta_status: string | null;
  meta_categoria: string | null;
  meta_erro: string | null;
  meta_sugerido: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  APPROVED: "Aprovado",
  PENDING: "Pendente",
  REJECTED: "Rejeitado",
  PAUSED: "Pausado",
  DISABLED: "Desativado",
  ERRO: "Erro",
};

function corDoStatus(status: string | null): string {
  switch (status) {
    case "APPROVED":
      return "border-emerald-500/40 text-emerald-600 dark:text-emerald-400";
    case "PENDING":
      return "border-amber-500/40 text-amber-600 dark:text-amber-400";
    case "REJECTED":
    case "ERRO":
      return "border-destructive/40 text-destructive";
    default:
      return "text-muted-foreground";
  }
}

function FrasesProntasPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  if (!isAdmin) {
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

  return <PainelFrases />;
}

function PainelFrases() {
  const qc = useQueryClient();
  const listar = useServerFn(listarFrasesAdmin);
  const salvar = useServerFn(salvarFrase);
  const excluir = useServerFn(excluirFrase);
  const reordenar = useServerFn(reordenarFrases);
  const enviarUma = useServerFn(enviarFraseParaMeta);
  const enviarSugeridas = useServerFn(enviarSugeridasParaMeta);
  const sincronizar = useServerFn(sincronizarStatusMeta);
  const nomeAutomatico = useServerFn(nomeTemplateAutomatico);
  const excluirMeta = useServerFn(excluirTemplateNaMeta);

  const [edicao, setEdicao] = useState<Partial<Frase> | null>(null);
  const [confirmar, setConfirmar] = useState<
    | { tipo: "excluir-frase"; id: string; titulo: string }
    | { tipo: "enviar-sugeridas"; total: number }
    | { tipo: "excluir-meta"; name: string; etapa: 1 | 2 }
    | null
  >(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["frases-prontas"],
    queryFn: () => listar({}),
  });
  const { data: automatico } = useQuery({
    queryKey: ["frases-prontas", "template-automatico"],
    queryFn: () => nomeAutomatico({}),
  });

  const [metaTodos, setMetaTodos] = useState<
    Array<{ name: string; language?: string; status?: string; category?: string }>
  >([]);
  const [foraDoCrm, setForaDoCrm] = useState<
    Array<{ name: string; language?: string; status?: string; category?: string }>
  >([]);

  const frases = (data?.itens ?? []) as Frase[];

  const invalidar = () => qc.invalidateQueries({ queryKey: ["frases-prontas"] });

  const mSalvar = useMutation({
    mutationFn: (f: Partial<Frase>) =>
      salvar({
        data: {
          ...(f.id ? { id: f.id } : {}),
          titulo: String(f.titulo ?? "").trim(),
          categoria: f.categoria as (typeof CATEGORIAS_ORDEM)[number],
          corpo: String(f.corpo ?? "").trim(),
          ativo: f.ativo ?? true,
          meta_sugerido: f.meta_sugerido ?? false,
          meta_categoria: (f.meta_categoria ?? null) as "MARKETING" | "UTILITY" | null,
        },
      }),
    onSuccess: () => {
      toast.success("Frase salva");
      setEdicao(null);
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mAtivo = useMutation({
    mutationFn: (f: Frase) =>
      salvar({
        data: {
          id: f.id,
          titulo: f.titulo,
          categoria: f.categoria as (typeof CATEGORIAS_ORDEM)[number],
          corpo: f.corpo,
          ativo: !f.ativo,
          meta_sugerido: f.meta_sugerido,
          meta_categoria: (f.meta_categoria ?? null) as "MARKETING" | "UTILITY" | null,
        },
      }),
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });

  const mExcluir = useMutation({
    mutationFn: (id: string) => excluir({ data: { id } }),
    onSuccess: () => {
      toast.success("Frase excluída");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mReordenar = useMutation({
    mutationFn: (ids: string[]) => reordenar({ data: { ids } }),
    onSuccess: invalidar,
    onError: (e: Error) => toast.error(e.message),
  });

  const mEnviarUma = useMutation({
    mutationFn: (id: string) => enviarUma({ data: { id } }),
    onSuccess: (r) => {
      if (r.ok) toast.success(`Enviado para aprovação (${STATUS_LABEL[r.status ?? ""] ?? "Pendente"})`);
      else toast.error(r.erro ?? "Falha ao enviar.");
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mEnviarSugeridas = useMutation({
    mutationFn: () => enviarSugeridas({}),
    onSuccess: (r) => {
      toast.success(`${r.enviadas} frase(s) enviada(s) para aprovação`);
      for (const e of r.erros) toast.error(`${e.titulo}: ${e.erro}`);
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mSincronizar = useMutation({
    mutationFn: () => sincronizar({}),
    onSuccess: (r) => {
      setMetaTodos(r.metaTodos ?? []);
      setForaDoCrm(r.foraDoCrm ?? []);
      toast.success(`${r.atualizadas} frase(s) atualizada(s) com o status da Meta`);
      invalidar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mExcluirMeta = useMutation({
    mutationFn: (name: string) => excluirMeta({ data: { name } }),
    onSuccess: () => {
      toast.success("Modelo excluído da conta oficial");
      mSincronizar.mutate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const contadores = useMemo(() => {
    const c = { aprovados: 0, pendentes: 0, rejeitados: 0, naoEnviados: 0 };
    for (const f of frases) {
      if (f.meta_status === "APPROVED") c.aprovados += 1;
      else if (f.meta_status === "PENDING") c.pendentes += 1;
      else if (f.meta_status === "REJECTED" || f.meta_status === "ERRO") c.rejeitados += 1;
      else c.naoEnviados += 1;
    }
    return c;
  }, [frases]);

  const sugeridasPendentes = frases.filter(
    (f) =>
      f.meta_sugerido &&
      f.ativo &&
      (!f.meta_status || f.meta_status === "REJECTED" || f.meta_status === "ERRO"),
  ).length;

  const grupos = useMemo(() => {
    const mapa = new Map<string, Frase[]>();
    for (const f of frases) {
      const arr = mapa.get(f.categoria) ?? [];
      arr.push(f);
      mapa.set(f.categoria, arr);
    }
    return [...mapa.entries()]
      .map(([categoria, itens]) => ({
        categoria,
        itens: [...itens].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0)),
      }))
      .sort((a, b) => ordemCategoria(a.categoria) - ordemCategoria(b.categoria));
  }, [frases]);

  function mover(itens: Frase[], index: number, delta: number) {
    const destino = index + delta;
    if (destino < 0 || destino >= itens.length) return;
    const ordenado = [...itens];
    const [alvo] = ordenado.splice(index, 1);
    if (!alvo) return;
    ordenado.splice(destino, 0, alvo);
    // A ordem é global: reenviamos a lista inteira já com o grupo reposicionado.
    const idsGlobais = grupos.flatMap((g) =>
      g.categoria === alvo.categoria ? ordenado.map((f) => f.id) : g.itens.map((f) => f.id),
    );
    mReordenar.mutate(idsGlobais);
  }

  return (
    <TooltipProvider>
      <div className="space-y-6 p-4 md:p-8">
        <div>
          <h1 className="text-2xl font-semibold">Frases prontas</h1>
          <p className="text-sm text-muted-foreground">
            Textos do atendimento e modelos aprovados para falar fora da janela de 24h.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <MessageSquareText className="h-4 w-4 text-emerald-500" />
                <CardTitle className="text-base">Frases prontas</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Texto interno que o atendente cola no compositor do chat. Só funciona{" "}
              <strong>dentro da janela de 24h</strong>, ou seja, quando o cliente escreveu nas
              últimas 24 horas.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-sky-500" />
                <CardTitle className="text-base">Modelos aprovados Meta</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Única forma de falar <strong>fora da janela de 24h</strong>. O texto passa por
              aprovação da Meta, que normalmente leva de alguns minutos até 24 horas.
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => setEdicao({ categoria: "abertura", ativo: true })}>
            <Plus className="mr-1.5 h-4 w-4" /> Nova frase
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={sugeridasPendentes === 0 || mEnviarSugeridas.isPending}
            onClick={() => setConfirmar({ tipo: "enviar-sugeridas", total: sugeridasPendentes })}
          >
            <Send className="mr-1.5 h-4 w-4" /> Enviar todas as sugeridas ({sugeridasPendentes})
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={mSincronizar.isPending}
            onClick={() => mSincronizar.mutate()}
          >
            <RefreshCw className={`mr-1.5 h-4 w-4 ${mSincronizar.isPending ? "animate-spin" : ""}`} />
            Atualizar status na Meta
          </Button>
          <div className="ml-auto flex flex-wrap gap-2 text-xs">
            <Badge variant="outline" className={corDoStatus("APPROVED")}>
              Aprovados: {contadores.aprovados}
            </Badge>
            <Badge variant="outline" className={corDoStatus("PENDING")}>
              Pendentes: {contadores.pendentes}
            </Badge>
            <Badge variant="outline" className={corDoStatus("REJECTED")}>
              Rejeitados: {contadores.rejeitados}
            </Badge>
            <Badge variant="outline" className="text-muted-foreground">
              Não enviados: {contadores.naoEnviados}
            </Badge>
          </div>
        </div>

        {isLoading ? <p className="text-sm text-muted-foreground">Carregando frases…</p> : null}
        {error ? (
          <p className="text-sm text-destructive">{(error as Error).message}</p>
        ) : null}

        <div className="space-y-6">
          {grupos.map((g) => (
            <div key={g.categoria} className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {CATEGORIA_LABEL[g.categoria] ?? g.categoria}
              </h2>
              <div className="divide-y rounded-lg border">
                {g.itens.map((f, i) => {
                  const bloqueado = f.meta_status === "APPROVED" || f.meta_status === "PENDING";
                  const textoMeta = converterParaMeta(f.corpo).texto;
                  const prefixado = textoMeta.startsWith("Olá ") && !f.corpo.startsWith("Olá ");

                  return (
                    <div key={f.id} className="flex flex-col gap-2 p-3 md:flex-row md:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{f.titulo}</span>
                          <StatusBadge status={f.meta_status} erro={f.meta_erro} />
                          {f.meta_sugerido ? (
                            <Badge variant="secondary" className="text-[10px]">
                              Sugerida
                            </Badge>
                          ) : null}
                        </div>
                        <p className="line-clamp-2 text-sm text-muted-foreground">{f.corpo}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        <Switch
                          checked={f.ativo}
                          onCheckedChange={() => mAtivo.mutate(f)}
                          aria-label="Ativa"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Subir"
                          disabled={i === 0}
                          onClick={() => mover(g.itens, i, -1)}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Descer"
                          disabled={i === g.itens.length - 1}
                          onClick={() => mover(g.itens, i, 1)}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={bloqueado || mEnviarUma.isPending}
                                onClick={() => mEnviarUma.mutate(f.id)}
                              >
                                <Send className="mr-1.5 h-3.5 w-3.5" />
                                {f.meta_status === "REJECTED" || f.meta_status === "ERRO"
                                  ? "Reenviar"
                                  : "Enviar para aprovação"}
                              </Button>
                            </span>
                          </TooltipTrigger>
                          {bloqueado ? (
                            <TooltipContent>
                              Já existe na Meta ({STATUS_LABEL[f.meta_status ?? ""]}). Exclua na Meta
                              antes de reenviar.
                            </TooltipContent>
                          ) : null}
                        </Tooltip>
                        {prefixado ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="max-w-[180px] truncate text-[11px] text-muted-foreground">
                                Meta: {textoMeta}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              Enviado à Meta como: {textoMeta}
                            </TooltipContent>
                          </Tooltip>
                        ) : null}

                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Editar"
                          onClick={() => setEdicao(f)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Excluir"
                          onClick={() =>
                            setConfirmar({ tipo: "excluir-frase", id: f.id, titulo: f.titulo })
                          }
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Modelos na Meta que não vieram do CRM</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {metaTodos.length === 0 ? (
              <p className="text-muted-foreground">
                Clique em “Atualizar status na Meta” para carregar a lista da conta oficial.
              </p>
            ) : foraDoCrm.length === 0 ? (
              <p className="text-muted-foreground">
                Todos os modelos da conta oficial têm frase correspondente aqui.
              </p>
            ) : (
              foraDoCrm.map((t) => {
                const usado = automatico?.nome && automatico.nome === t.name;
                return (
                  <div
                    key={t.name}
                    className="flex flex-wrap items-center gap-2 rounded-md border p-2"
                  >
                    <span className="font-mono text-xs">{t.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {t.language ?? "—"}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] ${corDoStatus(t.status ?? null)}`}>
                      {STATUS_LABEL[t.status ?? ""] ?? t.status ?? "—"}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {t.category ?? "—"}
                    </Badge>
                    {usado ? (
                      <Badge variant="secondary" className="text-[10px]">
                        usado nos envios automáticos
                      </Badge>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="ml-auto text-destructive"
                      disabled={Boolean(usado) || mExcluirMeta.isPending}
                      onClick={() => setConfirmar({ tipo: "excluir-meta", name: t.name, etapa: 1 })}
                    >
                      <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Excluir da Meta
                    </Button>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {edicao ? (
        <FraseDialog
          frase={edicao}
          salvando={mSalvar.isPending}
          onCancel={() => setEdicao(null)}
          onSave={(f) => mSalvar.mutate(f)}
        />
      ) : null}

      <AlertDialog open={confirmar !== null} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmar?.tipo === "excluir-frase"
                ? "Excluir frase?"
                : confirmar?.tipo === "enviar-sugeridas"
                  ? "Enviar frases para aprovação?"
                  : confirmar?.etapa === 1
                    ? "Excluir modelo da conta oficial?"
                    : "Confirmar exclusão definitiva"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar?.tipo === "excluir-frase"
                ? `“${confirmar.titulo}” sai do catálogo interno. O modelo já enviado à Meta não é afetado.`
                : confirmar?.tipo === "enviar-sugeridas"
                  ? `${confirmar.total} texto(s) serão submetidos à conta oficial do WhatsApp para aprovação da Meta. A análise costuma levar de minutos até 24 horas.`
                  : confirmar?.etapa === 1
                    ? `O modelo “${confirmar.name}” deixa de existir na conta oficial do WhatsApp.`
                    : `Confirmando, qualquer envio automático que dependa de “${confirmar?.tipo === "excluir-meta" ? confirmar.name : ""}” passará a falhar. Esta ação não pode ser desfeita.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                if (!confirmar) return;
                if (confirmar.tipo === "excluir-frase") mExcluir.mutate(confirmar.id);
                else if (confirmar.tipo === "enviar-sugeridas") mEnviarSugeridas.mutate();
                else if (confirmar.etapa === 1) {
                  e.preventDefault();
                  setConfirmar({ ...confirmar, etapa: 2 });
                  return;
                } else mExcluirMeta.mutate(confirmar.name);
                setConfirmar(null);
              }}
            >
              {confirmar?.tipo === "excluir-meta" && confirmar.etapa === 1 ? "Continuar" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}

function StatusBadge({ status, erro }: { status: string | null; erro: string | null }) {
  if (!status) {
    return (
      <Badge variant="outline" className="text-[10px] text-muted-foreground">
        —
      </Badge>
    );
  }
  const badge = (
    <Badge variant="outline" className={`text-[10px] ${corDoStatus(status)}`}>
      {STATUS_LABEL[status] ?? status}
    </Badge>
  );
  if ((status === "REJECTED" || status === "ERRO") && erro) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>{badge}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{erro}</TooltipContent>
      </Tooltip>
    );
  }
  return badge;
}

function FraseDialog({
  frase,
  salvando,
  onCancel,
  onSave,
}: {
  frase: Partial<Frase>;
  salvando: boolean;
  onCancel: () => void;
  onSave: (f: Partial<Frase>) => void;
}) {
  const [titulo, setTitulo] = useState(frase.titulo ?? "");
  const [categoria, setCategoria] = useState(frase.categoria ?? "abertura");
  const [corpo, setCorpo] = useState(frase.corpo ?? "");
  const [sugerido, setSugerido] = useState(frase.meta_sugerido ?? false);
  const [metaCategoria, setMetaCategoria] = useState(frase.meta_categoria ?? "MARKETING");
  const areaRef = useRef<HTMLTextAreaElement | null>(null);

  function inserir(v: string) {
    const el = areaRef.current;
    const token = `{{${v}}}`;
    if (!el) {
      setCorpo((c) => c + token);
      return;
    }
    const ini = el.selectionStart ?? corpo.length;
    const fim = el.selectionEnd ?? corpo.length;
    const novo = corpo.slice(0, ini) + token + corpo.slice(fim);
    setCorpo(novo);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(ini + token.length, ini + token.length);
    });
  }

  const previa = aplicarVariaveisFrase(corpo, {
    nome: EXEMPLOS_VARIAVEL.nome,
    empresa: EXEMPLOS_VARIAVEL.empresa,
    atendente: EXEMPLOS_VARIAVEL.atendente,
  });

  const problemasMeta = sugerido ? validarParaMeta(corpo) : [];

  function submeter() {
    if (titulo.trim().length < 3) {
      toast.error("O título precisa de pelo menos 3 caracteres.");
      return;
    }
    if (corpo.trim().length < 5) {
      toast.error("Escreva o texto da frase.");
      return;
    }
    if (citaNomeDeEmpresa(corpo) || citaNomeDeEmpresa(titulo)) {
      toast.error(`${MSG_EMPRESA_PROIBIDA} — os clientes chegam por canais diferentes.`);
      return;
    }
    const invalidas = variaveisInvalidas(corpo);
    if (invalidas.length > 0) {
      toast.error(
        `Variáveis não permitidas: ${invalidas.map((v) => `{{${v}}}`).join(", ")}. Use apenas {{nome}}, {{empresa}} e {{atendente}}.`,
      );
      return;
    }
    if (problemasMeta.length > 0) {
      toast.error(problemasMeta.join(" "));
      return;
    }
    onSave({
      ...(frase.id ? { id: frase.id } : {}),
      titulo: titulo.trim(),
      categoria,
      corpo: corpo.trim(),
      ativo: frase.ativo ?? true,
      meta_sugerido: sugerido,
      meta_categoria: sugerido ? metaCategoria : null,
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{frase.id ? "Editar frase" : "Nova frase"}</DialogTitle>
          <DialogDescription>
            Frases prontas são coladas no compositor pelo atendente, dentro da janela de 24h.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="titulo">Título</Label>
              <Input id="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={categoria} onValueChange={setCategoria}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIAS_ORDEM.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CATEGORIA_LABEL[c] ?? c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="corpo">Texto</Label>
              <span
                className={`text-xs ${corpo.length > 1024 ? "text-destructive" : "text-muted-foreground"}`}
              >
                {corpo.length}/1024
              </span>
            </div>
            <Textarea
              id="corpo"
              ref={areaRef}
              rows={6}
              maxLength={1024}
              value={corpo}
              onChange={(e) => setCorpo(e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {VARIAVEIS.map((v) => (
                <Button key={v} type="button" size="sm" variant="secondary" onClick={() => inserir(v)}>
                  {`{{${v}}}`}
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-md border bg-muted/40 p-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Prévia (Carlos / Empresa Exemplo / Beatriz)
            </p>
            <p className="whitespace-pre-wrap text-sm">{previa || "—"}</p>
          </div>

          {problemasMeta.length > 0 ? (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {problemasMeta.join(" ")}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={sugerido} onCheckedChange={(v) => setSugerido(v === true)} />
              Sugerir para a Meta
            </label>
            <div className="flex items-center gap-2">
              <Label className="text-sm">Categoria na Meta</Label>
              <Select
                value={metaCategoria}
                onValueChange={setMetaCategoria}
                disabled={!sugerido}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MARKETING">MARKETING</SelectItem>
                  <SelectItem value="UTILITY">UTILITY</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={submeter} disabled={salvando}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
