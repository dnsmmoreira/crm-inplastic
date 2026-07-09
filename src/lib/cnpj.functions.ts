import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isValidCnpj, onlyDigitsCnpj } from "@/lib/cnpj";

export type CnpjSocio = {
  nome: string;
  qualificacao: string;
  desde: string;
  taxId?: string;
};

export type CnpjSuframa = {
  numero: string;
  status: string;
  desde: string;
  aprovado: boolean;
};

export type CnpjLookupResult = {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  inscricaoEstadual: string;
  situacao: string;
  porte: string;
  cnaePrincipal: string;
  cnaeCodigo: string;
  capitalSocial: number | null;
  naturezaJuridica: string;
  simplesOptante: boolean | null;
  simplesDesde: string;
  simeiOptante: boolean | null;
  dataAbertura: string;
  email: string;
  telefone: string;
  socios: CnpjSocio[];
  suframa: CnpjSuframa[];
  endereco: {
    cep: string;
    logradouro: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    uf: string;
  };
};


// CNPJá — https://cnpja.com/docs/api
// Endpoint: GET https://api.cnpja.com/office/{cnpj}?registrations=BR
// Auth: header `Authorization: <token>`
type CnpjaOffice = {
  taxId?: string;
  alias?: string | null;
  founded?: string;
  status?: { text?: string };
  statusDate?: string;
  company?: {
    name?: string;
    size?: { text?: string };
    equity?: number | string;
    nature?: { id?: number | string; text?: string };
    simples?: { optant?: boolean; since?: string };
    simei?: { optant?: boolean; since?: string };
    members?: Array<{
      since?: string;
      role?: { id?: number | string; text?: string };
      person?: { name?: string; taxId?: string; type?: string };
    }>;
  };
  address?: {
    zip?: string;
    street?: string;
    number?: string;
    details?: string;
    district?: string;
    city?: string;
    state?: string;
  };
  phones?: Array<{ area?: string; number?: string }>;
  emails?: Array<{ address?: string }>;
  mainActivity?: { id?: number | string; text?: string };
  registrations?: Array<{ state?: string; number?: string; enabled?: boolean }>;
  suframa?: Array<{
    number?: string;
    since?: string;
    approved?: boolean;
    approvalDate?: string;
    status?: { text?: string };
  }>;
};


export const lookupCnpj = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cnpj: string }) => {
    const digits = onlyDigitsCnpj(input?.cnpj || "");
    if (digits.length !== 14) throw new Error("CNPJ deve conter 14 dígitos");
    if (!isValidCnpj(digits)) throw new Error("CNPJ inválido (dígitos verificadores)");
    return { cnpj: digits };
  })
  .handler(async ({ data }): Promise<CnpjLookupResult> => {
    const token = process.env.CNPJA_API_KEY;
    if (!token) throw new Error("Token do CNPJá não configurado (CNPJA_API_KEY)");

    const url = `https://api.cnpja.com/office/${data.cnpj}?registrations=BR&simples=true&suframa=true`;

    const res = await fetch(url, {
      headers: {
        Authorization: token,
        Accept: "application/json",
      },
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error("Token do CNPJá inválido ou sem permissão");
    }
    if (res.status === 404) {
      throw new Error("CNPJ não encontrado na Receita Federal");
    }
    if (res.status === 429) {
      throw new Error("Limite de consultas do CNPJá atingido. Tente novamente em instantes.");
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Erro na consulta (${res.status}): ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as CnpjaOffice;
    if (!json?.company?.name) throw new Error("Resposta inválida da CNPJá");

    // IE ativa preferencial (do próprio estado da empresa) ou primeira habilitada
    const uf = json.address?.state ?? "";
    const regAtiva =
      json.registrations?.find((r) => r.enabled && r.state === uf) ??
      json.registrations?.find((r) => r.enabled) ??
      json.registrations?.[0];

    const telefone = json.phones?.[0]
      ? `(${json.phones[0].area ?? ""}) ${json.phones[0].number ?? ""}`.trim()
      : "";

    const capital =
      typeof json.company?.equity === "number"
        ? json.company.equity
        : json.company?.equity
          ? Number(String(json.company.equity).replace(/[^\d.,-]/g, "").replace(",", ".")) || null
          : null;

    const socios: CnpjSocio[] = (json.company?.members ?? []).map((m) => ({
      nome: m.person?.name ?? "",
      qualificacao: m.role?.text ?? "",
      desde: m.since ?? "",
      taxId: m.person?.taxId,
    })).filter((s) => s.nome);

    const suframa: CnpjSuframa[] = (json.suframa ?? []).map((s) => ({
      numero: s.number ?? "",
      status: s.status?.text ?? "",
      desde: s.since ?? s.approvalDate ?? "",
      aprovado: Boolean(s.approved),
    })).filter((s) => s.numero);

    return {
      cnpj: data.cnpj,
      razaoSocial: json.company.name ?? "",
      nomeFantasia: json.alias ?? "",
      inscricaoEstadual: regAtiva?.number ?? "",
      situacao: json.status?.text ?? "",
      porte: json.company.size?.text ?? "",
      cnaePrincipal: json.mainActivity?.text ?? "",
      cnaeCodigo: json.mainActivity?.id ? String(json.mainActivity.id) : "",
      capitalSocial: capital,
      naturezaJuridica: json.company?.nature?.text ?? "",
      simplesOptante: json.company?.simples?.optant ?? null,
      simplesDesde: json.company?.simples?.since ?? "",
      simeiOptante: json.company?.simei?.optant ?? null,
      dataAbertura: json.founded ?? "",
      email: json.emails?.[0]?.address ?? "",
      telefone,
      socios,
      suframa,
      endereco: {
        cep: json.address?.zip ?? "",
        logradouro: json.address?.street ?? "",
        numero: json.address?.number ?? "",
        complemento: json.address?.details ?? "",
        bairro: json.address?.district ?? "",
        cidade: json.address?.city ?? "",
        uf: json.address?.state ?? "",
      },
    };
  });

