import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Save } from "lucide-react";

import { getArenaConfig, saveArenaConfig } from "@/lib/arena.functions";
import type { ArenaConfig } from "@/lib/arena";
import { temporadaAtual } from "@/lib/arena";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Campo = { key: keyof ArenaConfig; label: string; hint?: string; step?: string };

const GRUPOS: Array<{ titulo: string; descricao: string; campos: Campo[] }> = [
  {
    titulo: "Custo e comissões",
    descricao: "Parâmetros econômicos do modelo comercial. Nada é hardcoded no sistema.",
    campos: [
      { key: "custo_interno_teto_pct", label: "Teto de custo comercial interno (%)", step: "0.1" },
      { key: "comissao_logiscal_pct", label: "Comissão Logiscal (%)", step: "0.1" },
      { key: "comissao_kelly_pct", label: "Comissão Kelly (%)", step: "0.1" },
      { key: "encargos_fator", label: "Fator de encargos", hint: "Multiplicador sobre salário", step: "0.01" },
    ],
  },
  {
    titulo: "Margem e preço",
    descricao: "Enquanto não houver custo de produto no banco, vale o piso comercial.",
    campos: [
      { key: "margem_minima_pct", label: "Margem mínima (%)", hint: "Usada quando há custo de produto", step: "0.1" },
      { key: "margem_piso_comercial_pct", label: "Piso comercial de margem (%)", step: "0.1" },
      { key: "custo_produto_pct_estimado", label: "Custo de produto estimado (% da receita)", hint: "0 = não parametrizado", step: "0.1" },
      { key: "piso_preco_pct", label: "Piso de preço (%)", step: "0.1" },
    ],
  },
  {
    titulo: "Metas e rampa",
    descricao: "Metas individuais continuam sendo alteradas apenas na tela de usuários.",
    campos: [
      { key: "carencia_meses_default", label: "Carência padrão (meses)", step: "1" },
      { key: "meta_canal_representante", label: "Referência do canal representante (R$)", step: "1000" },
    ],
  },
  {
    titulo: "Premiação e temporada",
    descricao: "Nada é computado antes da data de início oficial da ARENA.",
    campos: [
      { key: "arena_orcamento_mensal", label: "Orçamento mensal da premiação (R$)", step: "50" },
      { key: "arena_cap_temporada", label: "Cap por temporada (R$)", step: "100" },
      { key: "temporada_meses", label: "Duração da temporada (meses)", step: "1" },
      { key: "piso_rodada_pace_pct", label: "Pace mínimo da rodada quinzenal (%)", step: "1" },
    ],
  },
  {
    titulo: "Ponto de equilíbrio (representante x interno)",
    descricao: "Alimenta o estudo de equilíbrio. Sem decisão automática.",
    campos: [
      { key: "interno_custo_fixo_mensal", label: "Custo fixo de um vendedor interno (R$/mês)", step: "100" },
      { key: "interno_custo_variavel_pct", label: "Custo variável do interno (%)", step: "0.1" },
      { key: "rep_custo_fixo_incremental_mensal", label: "Custo fixo incremental do canal (R$/mês)", step: "100" },
      { key: "rep_custo_variavel_pct", label: "Custo variável do canal (%)", step: "0.1" },
    ],
  },
];

export function ArenaConfigPanel() {
  const load = useServerFn(getArenaConfig);
  const save = useServerFn(saveArenaConfig);

  const [cfg, setCfg] = useState<ArenaConfig | null>(null);
  const [inicial, setInicial] = useState<ArenaConfig | null>(null);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [rampaRaw, setRampaRaw] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const r = (await load()) as unknown as ArenaConfig | null;
        if (r) {
          setCfg(r);
          setInicial(r);
          setRampaRaw((r.rampa_metas ?? []).join(", "));
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao carregar a configuração");
      }
    })();
  }, [load]);

  if (!cfg || !inicial) {
    return <p className="text-sm text-muted-foreground">Carregando configuração…</p>;
  }

  const set = (k: keyof ArenaConfig, v: unknown) => setCfg((c) => (c ? { ...c, [k]: v } : c));

  const temporada = temporadaAtual(cfg.arena_data_inicio, cfg.temporada_meses);

  const handleSave = async () => {
    const patch: Record<string, unknown> = {};
    for (const g of GRUPOS) {
      for (const c of g.campos) {
        const novo = Number(cfg[c.key]);
        if (Number(inicial[c.key]) !== novo) patch[c.key as string] = novo;
      }
    }
    if (cfg.base_calculo_default !== inicial.base_calculo_default) patch["base_calculo_default"] = cfg.base_calculo_default;
    if (cfg.base_calculo_logiscal !== inicial.base_calculo_logiscal) patch["base_calculo_logiscal"] = cfg.base_calculo_logiscal;
    if (cfg.arena_data_inicio !== inicial.arena_data_inicio) patch["arena_data_inicio"] = cfg.arena_data_inicio;
    if (cfg.piso_rodada_ativo !== inicial.piso_rodada_ativo) patch["piso_rodada_ativo"] = cfg.piso_rodada_ativo;

    const metas = rampaRaw
      .split(/[,;]/)
      .map((s) => Number(s.trim().replace(/\./g, "").replace(",", ".")))
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (JSON.stringify(metas) !== JSON.stringify(inicial.rampa_metas ?? [])) patch["rampa_metas"] = metas;

    if (Object.keys(patch).length === 0) {
      toast.info("Nenhuma alteração para salvar");
      return;
    }

    setSalvando(true);
    try {
      const r = (await save({ data: { patch, motivo: motivo.trim() || undefined } })) as { alteracoes: number };
      toast.success(`Configuração salva (${r.alteracoes} alteração(ões) auditada(s))`);
      setInicial({ ...cfg, rampa_metas: metas });
      setMotivo("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Vigência da ARENA</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="ac-inicio">Data de início oficial</Label>
            <Input
              id="ac-inicio"
              type="date"
              value={cfg.arena_data_inicio}
              onChange={(e) => set("arena_data_inicio", e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ac-tmeses">Temporada (meses)</Label>
            <Input
              id="ac-tmeses"
              type="number"
              min={1}
              max={12}
              value={String(cfg.temporada_meses)}
              onChange={(e) => set("temporada_meses", Number(e.target.value) || 1)}
            />
          </div>
          <div className="space-y-1">
            <Label>Temporada corrente</Label>
            <div className="rounded-md border px-3 py-2 text-sm">
              {temporada.vigente
                ? `Temporada ${temporada.numero} · ${temporada.inicio} → ${temporada.fim}`
                : `Ainda não iniciada · 1ª temporada ${temporada.inicio} → ${temporada.fim}`}
            </div>
          </div>
          <div className="md:col-span-3 flex items-center justify-between rounded-lg border p-3">
            <div>
              <div className="text-sm font-medium">Piso de elegibilidade da rodada quinzenal</div>
              <p className="text-xs text-muted-foreground">
                Desligado por decisão da diretoria. É apenas um parâmetro — não há lógica condicionada a data.
              </p>
            </div>
            <Switch checked={cfg.piso_rodada_ativo} onCheckedChange={(v) => set("piso_rodada_ativo", v)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Base de cálculo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {(["base_calculo_default", "base_calculo_logiscal"] as const).map((k) => (
            <div key={k} className="space-y-1">
              <Label>{k === "base_calculo_default" ? "Base padrão (todos)" : "Base do canal representante"}</Label>
              <Select value={String(cfg[k])} onValueChange={(v) => set(k, v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="recebido">Recebido</SelectItem>
                  <SelectItem value="faturado">Faturado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
          {cfg.base_calculo_default !== cfg.base_calculo_logiscal && (
            <p className="md:col-span-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-700">
              BASES DE CÁLCULO DIFERENTES — os indicadores do canal representante não são comparáveis diretamente aos demais.
            </p>
          )}
        </CardContent>
      </Card>

      {GRUPOS.map((g) => (
        <Card key={g.titulo}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{g.titulo}</CardTitle>
            <p className="text-xs text-muted-foreground">{g.descricao}</p>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {g.campos.map((c) => (
              <div key={String(c.key)} className="space-y-1">
                <Label htmlFor={`ac-${String(c.key)}`}>{c.label}</Label>
                <Input
                  id={`ac-${String(c.key)}`}
                  type="number"
                  step={c.step ?? "0.01"}
                  value={String(cfg[c.key] ?? 0)}
                  onChange={(e) => set(c.key, Number(e.target.value) || 0)}
                />
                {c.hint && <p className="text-xs text-muted-foreground">{c.hint}</p>}
              </div>
            ))}
            {g.titulo === "Metas e rampa" && (
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="ac-rampa">Metas da rampa (fases, separadas por vírgula)</Label>
                <Input id="ac-rampa" value={rampaRaw} onChange={(e) => setRampaRaw(e.target.value)} />
                <p className="text-xs text-muted-foreground">
                  Fase 1 = meses 1–2, fase 2 = meses 3–4, e assim por diante.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6 md:flex-row md:items-end">
          <div className="flex-1 space-y-1">
            <Label htmlFor="ac-motivo">Motivo da alteração</Label>
            <Input
              id="ac-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={300}
              placeholder="Registrado no log unificado de auditoria da ARENA"
            />
          </div>
          <Button onClick={() => void handleSave()} disabled={salvando}>
            <Save className="mr-2 h-4 w-4" />
            {salvando ? "Salvando…" : "Salvar configuração"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
