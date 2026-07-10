import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Zap,
  AlertTriangle,
  CalendarClock,
  Users,
  PackageCheck,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { getXerifeConfig, updateXerifeConfig } from "@/lib/xerife.functions";

const ETAPAS = ["novo", "qualificacao", "proposta", "negociacao"] as const;
type Etapa = (typeof ETAPAS)[number];

type Cfg = {
  // SLAs
  sla_primeiro_contato_min: number;
  sla_primeiro_contato_escalar_min: number;
  sla_resposta_whatsapp_horas: number;
  sla_resposta_whatsapp_escalar_horas: number;
  tarefa_atrasada_horas: number;
  ia_sem_resposta_horas: number;
  // Cadência
  dias_sem_interacao_por_etapa: Record<Etapa, number>;
  max_dias_etapa: Record<Etapa, number>;
  cadencia_proposta_dias: string; // CSV para edição
  proposta_enviada_dias: number;
  // Carteira
  carteira_alerta_dias: number;
  carteira_critico_dias: number;
  reciclagem_perdidos_dias: number;
  // Pós-venda
  pos_venda_dias: string;
  // Agenda
  meta_atividades_dia: number;
  dias_uteis_inicio: string;
  dias_uteis_fim: string;
  horario_comercial_inicio: string;
  horario_comercial_fim: string;
  resumo_diario_ativo: boolean;
  resumo_hora: string;
  // Motor
  ativo: boolean;
};

const hhmm = (s: string | null | undefined, d: string) =>
  (s ?? d).slice(0, 5);

function parseCsvInts(s: string): number[] {
  return s
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function XerifeConfigForm() {
  const getFn = useServerFn(getXerifeConfig);
  const saveFn = useServerFn(updateXerifeConfig);
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const r = (await getFn()) as any;
      if (!r) return;
      const dias = r.dias_sem_interacao_por_etapa ?? {};
      const maxE = r.max_dias_etapa ?? {};
      setCfg({
        sla_primeiro_contato_min: r.sla_primeiro_contato_min ?? 15,
        sla_primeiro_contato_escalar_min: r.sla_primeiro_contato_escalar_min ?? 60,
        sla_resposta_whatsapp_horas: r.sla_resposta_whatsapp_horas ?? 2,
        sla_resposta_whatsapp_escalar_horas: r.sla_resposta_whatsapp_escalar_horas ?? 4,
        tarefa_atrasada_horas: r.tarefa_atrasada_horas ?? 24,
        ia_sem_resposta_horas: r.ia_sem_resposta_horas ?? 2,
        dias_sem_interacao_por_etapa: {
          novo: dias.novo ?? 1,
          qualificacao: dias.qualificacao ?? 2,
          proposta: dias.proposta ?? 3,
          negociacao: dias.negociacao ?? 2,
        },
        max_dias_etapa: {
          novo: maxE.novo ?? 1,
          qualificacao: maxE.qualificacao ?? 2,
          proposta: maxE.proposta ?? 3,
          negociacao: maxE.negociacao ?? 5,
        },
        cadencia_proposta_dias: (r.cadencia_proposta_dias ?? [2, 5, 10, 15]).join(", "),
        proposta_enviada_dias: r.proposta_enviada_dias ?? 3,
        carteira_alerta_dias: r.carteira_alerta_dias ?? 45,
        carteira_critico_dias: r.carteira_critico_dias ?? 60,
        reciclagem_perdidos_dias: r.reciclagem_perdidos_dias ?? 90,
        pos_venda_dias: (r.pos_venda_dias ?? [3, 15, 45]).join(", "),
        meta_atividades_dia: r.meta_atividades_dia ?? 15,
        dias_uteis_inicio: hhmm(r.dias_uteis_inicio, "08:00"),
        dias_uteis_fim: hhmm(r.dias_uteis_fim, "18:00"),
        horario_comercial_inicio: hhmm(r.horario_comercial_inicio, "07:00"),
        horario_comercial_fim: hhmm(r.horario_comercial_fim, "20:00"),
        resumo_diario_ativo: r.resumo_diario_ativo ?? true,
        resumo_hora: hhmm(r.resumo_hora, "08:00"),
        ativo: r.ativo ?? true,
      });
    })();
  }, [getFn]);

  function validateClient(c: Cfg): string | null {
    if (c.sla_primeiro_contato_escalar_min <= c.sla_primeiro_contato_min)
      return "Escalonar 1º contato deve ser > SLA";
    if (c.sla_resposta_whatsapp_escalar_horas <= c.sla_resposta_whatsapp_horas)
      return "Escalonar WhatsApp deve ser > SLA";
    if (c.carteira_critico_dias <= c.carteira_alerta_dias)
      return "Carteira crítico deve ser > alerta";
    const cad = parseCsvInts(c.cadencia_proposta_dias);
    if (cad.length === 0) return "Cadência de proposta vazia";
    if (cad.some((n, i, a) => i > 0 && n <= a[i - 1]!)) return "Cadência deve ser crescente";
    const pv = parseCsvInts(c.pos_venda_dias);
    if (pv.length === 0) return "Pós-venda vazio";
    if (pv.some((n, i, a) => i > 0 && n <= a[i - 1]!)) return "Pós-venda deve ser crescente";
    if (c.dias_uteis_inicio >= c.dias_uteis_fim)
      return "Início dias úteis deve ser antes do fim";
    if (c.horario_comercial_inicio >= c.horario_comercial_fim)
      return "Início horário comercial deve ser antes do fim";
    return null;
  }

  async function save() {
    if (!cfg) return;
    const err = validateClient(cfg);
    if (err) {
      toast.error("Corrija o formulário", { description: err });
      return;
    }
    setSaving(true);
    try {
      await saveFn({
        data: {
          sla_primeiro_contato_min: cfg.sla_primeiro_contato_min,
          sla_primeiro_contato_escalar_min: cfg.sla_primeiro_contato_escalar_min,
          sla_resposta_whatsapp_horas: cfg.sla_resposta_whatsapp_horas,
          sla_resposta_whatsapp_escalar_horas: cfg.sla_resposta_whatsapp_escalar_horas,
          tarefa_atrasada_horas: cfg.tarefa_atrasada_horas,
          ia_sem_resposta_horas: cfg.ia_sem_resposta_horas,
          dias_sem_interacao_por_etapa: cfg.dias_sem_interacao_por_etapa,
          max_dias_etapa: cfg.max_dias_etapa,
          cadencia_proposta_dias: parseCsvInts(cfg.cadencia_proposta_dias),
          proposta_enviada_dias: cfg.proposta_enviada_dias,
          carteira_alerta_dias: cfg.carteira_alerta_dias,
          carteira_critico_dias: cfg.carteira_critico_dias,
          reciclagem_perdidos_dias: cfg.reciclagem_perdidos_dias,
          pos_venda_dias: parseCsvInts(cfg.pos_venda_dias),
          meta_atividades_dia: cfg.meta_atividades_dia,
          dias_uteis_inicio: `${cfg.dias_uteis_inicio}:00`,
          dias_uteis_fim: `${cfg.dias_uteis_fim}:00`,
          horario_comercial_inicio: `${cfg.horario_comercial_inicio}:00`,
          horario_comercial_fim: `${cfg.horario_comercial_fim}:00`,
          resumo_diario_ativo: cfg.resumo_diario_ativo,
          resumo_hora: `${cfg.resumo_hora}:00`,
          ativo: cfg.ativo,
        },
      });
      toast.success("Configuração salva");
    } catch (e) {
      toast.error("Falha ao salvar", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSaving(false);
    }
  }

  if (!cfg) return <div className="p-8 text-sm text-muted-foreground">Carregando...</div>;

  const upd = (patch: Partial<Cfg>) => setCfg({ ...cfg, ...patch });
  const updDias = (
    field: "dias_sem_interacao_por_etapa" | "max_dias_etapa",
    e: Etapa,
    v: number,
  ) => setCfg({ ...cfg, [field]: { ...cfg[field], [e]: v } });

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* SLAs */}
        <Section icon={<AlertTriangle className="h-4 w-4 text-primary" />} title="SLAs de atendimento">
          <NumField
            label="1º contato — SLA (minutos úteis)"
            value={cfg.sla_primeiro_contato_min}
            onChange={(v) => upd({ sla_primeiro_contato_min: v })}
          />
          <NumField
            label="1º contato — escalar diretoria (minutos úteis)"
            value={cfg.sla_primeiro_contato_escalar_min}
            onChange={(v) => upd({ sla_primeiro_contato_escalar_min: v })}
          />
          <NumField
            label="Resposta WhatsApp — SLA (horas úteis)"
            value={cfg.sla_resposta_whatsapp_horas}
            onChange={(v) => upd({ sla_resposta_whatsapp_horas: v })}
          />
          <NumField
            label="Resposta WhatsApp — escalar (horas úteis)"
            value={cfg.sla_resposta_whatsapp_escalar_horas}
            onChange={(v) => upd({ sla_resposta_whatsapp_escalar_horas: v })}
          />
          <NumField
            label="Tarefa considerada atrasada (horas)"
            value={cfg.tarefa_atrasada_horas}
            onChange={(v) => upd({ tarefa_atrasada_horas: v })}
          />
          <NumField
            label="IA aguarda resposta do cliente (horas)"
            value={cfg.ia_sem_resposta_horas}
            onChange={(v) => upd({ ia_sem_resposta_horas: v })}
          />
        </Section>

        {/* Cadência */}
        <Section icon={<Zap className="h-4 w-4 text-primary" />} title="Cadência do funil">
          <div>
            <Label className="text-xs">Dias sem interação por etapa (alerta)</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {ETAPAS.map((e) => (
                <div key={e}>
                  <Label className="text-[10px] capitalize text-muted-foreground">{e}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={cfg.dias_sem_interacao_por_etapa[e]}
                    onChange={(ev) =>
                      updDias("dias_sem_interacao_por_etapa", e, Number(ev.target.value) || 1)
                    }
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Máx. dias na etapa (força ação)</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {ETAPAS.map((e) => (
                <div key={e}>
                  <Label className="text-[10px] capitalize text-muted-foreground">{e}</Label>
                  <Input
                    type="number"
                    min={1}
                    value={cfg.max_dias_etapa[e]}
                    onChange={(ev) =>
                      updDias("max_dias_etapa", e, Number(ev.target.value) || 1)
                    }
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Cadência da proposta (dias, separado por vírgula)</Label>
            <Input
              className="mt-1"
              value={cfg.cadencia_proposta_dias}
              onChange={(e) => upd({ cadencia_proposta_dias: e.target.value })}
              placeholder="2, 5, 10, 15"
            />
          </div>
          <NumField
            label="Proposta enviada sem resposta (dias)"
            value={cfg.proposta_enviada_dias}
            onChange={(v) => upd({ proposta_enviada_dias: v })}
          />
        </Section>

        {/* Carteira */}
        <Section icon={<Users className="h-4 w-4 text-primary" />} title="Carteira & reativação">
          <NumField
            label="Alerta de carteira (dias sem contato)"
            value={cfg.carteira_alerta_dias}
            onChange={(v) => upd({ carteira_alerta_dias: v })}
          />
          <NumField
            label="Crítico — notifica diretoria (dias)"
            value={cfg.carteira_critico_dias}
            onChange={(v) => upd({ carteira_critico_dias: v })}
          />
          <NumField
            label="Reciclagem de leads perdidos (dias)"
            value={cfg.reciclagem_perdidos_dias}
            onChange={(v) => upd({ reciclagem_perdidos_dias: v })}
          />
        </Section>

        {/* Pós-venda */}
        <Section icon={<PackageCheck className="h-4 w-4 text-primary" />} title="Pós-venda">
          <div>
            <Label className="text-xs">Marcos de pós-venda (dias após ganho)</Label>
            <Input
              className="mt-1"
              value={cfg.pos_venda_dias}
              onChange={(e) => upd({ pos_venda_dias: e.target.value })}
              placeholder="3, 15, 45"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Confirmação, satisfação e recompra. Tarefas exigem nota de conclusão.
            </p>
          </div>
        </Section>

        {/* Agenda */}
        <Section icon={<CalendarClock className="h-4 w-4 text-primary" />} title="Agenda & horário útil">
          <NumField
            label="Meta de atividades por vendedor/dia"
            value={cfg.meta_atividades_dia}
            onChange={(v) => upd({ meta_atividades_dia: v })}
          />
          <div className="grid grid-cols-2 gap-2">
            <TimeField
              label="Dias úteis — início"
              value={cfg.dias_uteis_inicio}
              onChange={(v) => upd({ dias_uteis_inicio: v })}
            />
            <TimeField
              label="Dias úteis — fim"
              value={cfg.dias_uteis_fim}
              onChange={(v) => upd({ dias_uteis_fim: v })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <TimeField
              label="Horário comercial — início"
              value={cfg.horario_comercial_inicio}
              onChange={(v) => upd({ horario_comercial_inicio: v })}
            />
            <TimeField
              label="Horário comercial — fim"
              value={cfg.horario_comercial_fim}
              onChange={(v) => upd({ horario_comercial_fim: v })}
            />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Resumo diário</Label>
              <p className="text-xs text-muted-foreground">Envia agenda por WhatsApp no início do dia.</p>
            </div>
            <Switch
              checked={cfg.resumo_diario_ativo}
              onCheckedChange={(v) => upd({ resumo_diario_ativo: v })}
            />
          </div>
          <TimeField
            label="Hora do resumo"
            value={cfg.resumo_hora}
            onChange={(v) => upd({ resumo_hora: v })}
          />
        </Section>

        {/* Motor */}
        <Section icon={<Settings2 className="h-4 w-4 text-primary" />} title="Motor">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Xerife ativo</Label>
              <p className="text-xs text-muted-foreground">
                Desligue para pausar todas as execuções automáticas.
              </p>
            </div>
            <Switch checked={cfg.ativo} onCheckedChange={(v) => upd({ ativo: v })} />
          </div>
        </Section>
      </div>

      <div className="sticky bottom-4 flex justify-end">
        <Button onClick={save} disabled={saving} size="lg">
          {saving ? "Salvando..." : "Salvar todas as configurações"}
        </Button>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-5 space-y-4">
      <header className="flex items-center gap-2">
        {icon}
        <h2 className="font-medium">{title}</h2>
      </header>
      {children}
    </section>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={1}
        className="mt-1"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 1)}
      />
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Input
        type="time"
        className="mt-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
