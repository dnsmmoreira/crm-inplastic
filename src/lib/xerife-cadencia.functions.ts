import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CadenciaVendedor = {
  user_id: string;
  name: string;
  pendentes: number;
  atrasadas: number;
  escalonadas: number;
  por_tipo: Record<string, number>;
};

export type CadenciaSlaAberto = {
  tipo: string;
  total: number;
  vencidas_ate_1h: number;
  vencidas_ate_4h: number;
  vencidas_mais_1d: number;
};

export type CadenciaCarteiraRisco = {
  lead_id: string;
  company: string | null;
  owner_id: string | null;
  owner_name: string | null;
  stage: string;
  dias_sem_contato: number;
  last_contact_at: string | null;
};

export type CadenciaLeadEsfriando = {
  lead_id: string;
  company: string | null;
  owner_id: string | null;
  owner_name: string | null;
  stage: string;
  dias_na_etapa: number;
  etapa_changed_at: string | null;
};

export type CadenciaSnapshot = {
  totals: {
    tarefas_pendentes: number;
    tarefas_atrasadas: number;
    tarefas_escalonadas: number;
    carteira_risco: number;
    leads_esfriando: number;
  };
  slaAbertos: CadenciaSlaAberto[];
  porVendedor: CadenciaVendedor[];
  carteiraRisco: CadenciaCarteiraRisco[];
  leadsEsfriando: CadenciaLeadEsfriando[];
};

export const getCadenciaSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CadenciaSnapshot> => {
    const { supabase } = context;

    // Config: thresholds por etapa
    const { data: cfg } = await supabase
      .from("xerife_config")
      .select("dias_sem_interacao_por_etapa")
      .eq("id", 1)
      .maybeSingle();
    const diasEtapa =
      (cfg?.dias_sem_interacao_por_etapa as Record<string, number>) ?? {
        novo: 1,
        qualificacao: 2,
        proposta: 3,
        negociacao: 2,
      };

    const nowIso = new Date().toISOString();

    // Tarefas pendentes/adiadas
    const { data: tarefas } = await supabase
      .from("tarefas")
      .select("id, owner_id, tipo, kind, status, due_date, escalonamentos")
      .in("status", ["pendente", "adiada"]);

    const tks = tarefas ?? [];

    // Profiles map
    const ownerIds = Array.from(
      new Set(tks.map((t) => t.owner_id).filter((x): x is string => !!x)),
    );
    const { data: profs } = ownerIds.length
      ? await supabase.from("profiles").select("id, name").in("id", ownerIds)
      : { data: [] as { id: string; name: string | null }[] };
    const profMap = new Map((profs ?? []).map((p) => [p.id, p.name ?? "—"]));

    // Agrega por vendedor
    const vendMap = new Map<string, CadenciaVendedor>();
    let totalPendentes = 0;
    let totalAtrasadas = 0;
    let totalEscalonadas = 0;

    for (const t of tks) {
      const uid = t.owner_id ?? "sem-dono";
      const atrasada = t.due_date && t.due_date < nowIso;
      const escalonada = (t.escalonamentos ?? 0) > 0;
      totalPendentes++;
      if (atrasada) totalAtrasadas++;
      if (escalonada) totalEscalonadas++;

      let v = vendMap.get(uid);
      if (!v) {
        v = {
          user_id: uid,
          name: uid === "sem-dono" ? "Sem responsável" : profMap.get(uid) ?? "—",
          pendentes: 0,
          atrasadas: 0,
          escalonadas: 0,
          por_tipo: {},
        };
        vendMap.set(uid, v);
      }
      v.pendentes++;
      if (atrasada) v.atrasadas++;
      if (escalonada) v.escalonadas++;
      const tipo = t.tipo ?? t.kind ?? "outro";
      v.por_tipo[tipo] = (v.por_tipo[tipo] ?? 0) + 1;
    }

    // SLA abertos: tarefas atrasadas, agrupadas por tipo
    const slaMap = new Map<string, CadenciaSlaAberto>();
    const now = Date.now();
    for (const t of tks) {
      if (!t.due_date || t.due_date >= nowIso) continue;
      const tipo = t.tipo ?? t.kind ?? "outro";
      let s = slaMap.get(tipo);
      if (!s) {
        s = { tipo, total: 0, vencidas_ate_1h: 0, vencidas_ate_4h: 0, vencidas_mais_1d: 0 };
        slaMap.set(tipo, s);
      }
      s.total++;
      const atrasoH = (now - new Date(t.due_date).getTime()) / 3_600_000;
      if (atrasoH <= 1) s.vencidas_ate_1h++;
      else if (atrasoH <= 4) s.vencidas_ate_4h++;
      else if (atrasoH >= 24) s.vencidas_mais_1d++;
    }

    // Carteira em risco: leads ganhos ou clientes com last_contact_at > 45 dias
    const limiteCarteira = new Date(now - 45 * 86_400_000).toISOString();
    const { data: carteiraRaw } = await supabase
      .from("leads")
      .select("id, company, owner_id, stage, last_contact_at, created_at")
      .eq("stage", "ganho")
      .or(`last_contact_at.lt.${limiteCarteira},last_contact_at.is.null`)
      .order("last_contact_at", { ascending: true, nullsFirst: true })
      .limit(50);

    const carteiraRisco: CadenciaCarteiraRisco[] = (carteiraRaw ?? []).map((l) => {
      const ref = l.last_contact_at ?? l.created_at;
      const dias = ref
        ? Math.floor((now - new Date(ref).getTime()) / 86_400_000)
        : 999;
      return {
        lead_id: l.id,
        company: l.company,
        owner_id: l.owner_id,
        owner_name: l.owner_id ? profMap.get(l.owner_id) ?? null : null,
        stage: l.stage as string,
        dias_sem_contato: dias,
        last_contact_at: l.last_contact_at,
      };
    });

    // Leads esfriando: ativos (não ganho/perdido) com etapa_changed_at > threshold
    const { data: esfriandoRaw } = await supabase
      .from("leads")
      .select("id, company, owner_id, stage, etapa_changed_at")
      .in("stage", ["novo", "qualificacao", "proposta", "negociacao", "atendimento"])
      .order("etapa_changed_at", { ascending: true, nullsFirst: true })
      .limit(200);

    const leadsEsfriando: CadenciaLeadEsfriando[] = [];
    for (const l of esfriandoRaw ?? []) {
      const limite = diasEtapa[l.stage as string] ?? 3;
      const ref = l.etapa_changed_at;
      if (!ref) continue;
      const dias = Math.floor((now - new Date(ref).getTime()) / 86_400_000);
      if (dias < limite) continue;
      leadsEsfriando.push({
        lead_id: l.id,
        company: l.company,
        owner_id: l.owner_id,
        owner_name: l.owner_id ? profMap.get(l.owner_id) ?? null : null,
        stage: l.stage as string,
        dias_na_etapa: dias,
        etapa_changed_at: l.etapa_changed_at,
      });
    }
    leadsEsfriando.sort((a, b) => b.dias_na_etapa - a.dias_na_etapa);

    // Enrich owner_name na carteira também caso profile faltou
    const extraOwnerIds = Array.from(
      new Set(
        [...carteiraRisco, ...leadsEsfriando]
          .map((x) => x.owner_id)
          .filter((x): x is string => !!x && !profMap.has(x)),
      ),
    );
    if (extraOwnerIds.length) {
      const { data: extras } = await supabase
        .from("profiles")
        .select("id, name")
        .in("id", extraOwnerIds);
      for (const p of extras ?? []) profMap.set(p.id, p.name ?? "—");
      carteiraRisco.forEach((c) => {
        if (c.owner_id) c.owner_name = profMap.get(c.owner_id) ?? c.owner_name;
      });
      leadsEsfriando.forEach((c) => {
        if (c.owner_id) c.owner_name = profMap.get(c.owner_id) ?? c.owner_name;
      });
    }

    const porVendedor = Array.from(vendMap.values()).sort(
      (a, b) => b.atrasadas - a.atrasadas || b.pendentes - a.pendentes,
    );
    const slaAbertos = Array.from(slaMap.values()).sort((a, b) => b.total - a.total);

    return {
      totals: {
        tarefas_pendentes: totalPendentes,
        tarefas_atrasadas: totalAtrasadas,
        tarefas_escalonadas: totalEscalonadas,
        carteira_risco: carteiraRisco.length,
        leads_esfriando: leadsEsfriando.length,
      },
      slaAbertos,
      porVendedor,
      carteiraRisco: carteiraRisco.slice(0, 50),
      leadsEsfriando: leadsEsfriando.slice(0, 50),
    };
  });
