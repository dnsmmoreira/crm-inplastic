import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  dataAbertura: string;
  email: string;
  telefone: string;
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

type CnpjaResponse = {
  taxId: string;
  founded?: string;
  company?: {
    name?: string;
    size?: { text?: string };
    equity?: number;
  };
  alias?: string;
  status?: { text?: string };
  mainActivity?: { id?: number; text?: string };
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
  registrations?: Array<{ state?: string; number?: string; enabled?: boolean }>;
};

export const lookupCnpj = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cnpj: string }) => {
    const digits = (input?.cnpj || "").replace(/\D/g, "");
    if (digits.length !== 14) throw new Error("CNPJ deve conter 14 dígitos");
    return { cnpj: digits };
  })
  .handler(async ({ data }): Promise<CnpjLookupResult> => {
    const apiKey = process.env.CNPJA_API_KEY;
    if (!apiKey) throw new Error("CNPJA_API_KEY não configurada");

    const url = `https://api.cnpja.com/office/${data.cnpj}?registrations=BR&simples=false`;
    const res = await fetch(url, {
      headers: { Authorization: apiKey },
    });

    if (res.status === 404) throw new Error("CNPJ não encontrado");
    if (res.status === 401 || res.status === 403) throw new Error("Chave da API CNPJá inválida");
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Erro na consulta (${res.status}): ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as CnpjaResponse;
    const addr = json.address ?? {};
    const activePhone = json.phones?.[0];
    const activeEmail = json.emails?.[0]?.address ?? "";
    const activeIE = json.registrations?.find((r) => r.enabled) ?? json.registrations?.[0];

    return {
      cnpj: data.cnpj,
      razaoSocial: json.company?.name ?? "",
      nomeFantasia: json.alias ?? "",
      inscricaoEstadual: activeIE?.number ?? "",
      situacao: json.status?.text ?? "",
      porte: json.company?.size?.text ?? "",
      cnaePrincipal: json.mainActivity?.text ?? "",
      cnaeCodigo: json.mainActivity?.id ? String(json.mainActivity.id) : "",
      capitalSocial: json.company?.equity ?? null,
      dataAbertura: json.founded ?? "",
      email: activeEmail,
      telefone: activePhone ? `(${activePhone.area ?? ""}) ${activePhone.number ?? ""}`.trim() : "",
      endereco: {
        cep: addr.zip ?? "",
        logradouro: addr.street ?? "",
        numero: addr.number ?? "",
        complemento: addr.details ?? "",
        bairro: addr.district ?? "",
        cidade: addr.city ?? "",
        uf: addr.state ?? "",
      },
    };
  });
