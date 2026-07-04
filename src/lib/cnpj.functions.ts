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

// SintegraWS — https://www.sintegraws.com.br
// Endpoint: GET /api/v1/execute-api.php?token=...&cnpj=...&plugin=RF
type SintegraResponse = {
  code?: number | string;
  status?: string;
  message?: string;
  nome?: string;
  fantasia?: string;
  cnpj?: string;
  inscricao_estadual?: string;
  situacao_cadastral?: string;
  data_situacao_cadastral?: string;
  data_inicio_atividade?: string;
  cnae_principal_codigo?: string;
  cnae_principal_descricao?: string;
  natureza_juridica?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  email?: string;
  telefone?: string;
  capital_social?: string | number;
  porte_empresa?: string;
};

export const lookupCnpj = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cnpj: string }) => {
    const digits = (input?.cnpj || "").replace(/\D/g, "");
    if (digits.length !== 14) throw new Error("CNPJ deve conter 14 dígitos");
    return { cnpj: digits };
  })
  .handler(async ({ data }): Promise<CnpjLookupResult> => {
    // Reaproveita a mesma secret já cadastrada (CNPJA_API_KEY = token do SintegraWS)
    const token = process.env.CNPJA_API_KEY;
    if (!token) throw new Error("Token do SintegraWS não configurado");

    const url = `https://www.sintegraws.com.br/api/v1/execute-api.php?token=${encodeURIComponent(
      token,
    )}&cnpj=${data.cnpj}&plugin=RF`;

    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Erro na consulta (${res.status}): ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as SintegraResponse;

    // SintegraWS retorna code/status quando dá erro (ex.: token inválido, sem créditos, CNPJ não encontrado)
    const codeNum = typeof json.code === "string" ? Number(json.code) : json.code;
    if (json.status && json.status !== "OK" && !json.nome) {
      throw new Error(json.message || `Falha SintegraWS (status ${json.status})`);
    }
    if (codeNum && codeNum !== 1 && !json.nome) {
      throw new Error(json.message || `Falha SintegraWS (code ${codeNum})`);
    }
    if (!json.nome) {
      throw new Error(json.message || "CNPJ não encontrado");
    }

    const capital =
      typeof json.capital_social === "number"
        ? json.capital_social
        : json.capital_social
          ? Number(String(json.capital_social).replace(/[^\d.,-]/g, "").replace(",", ".")) || null
          : null;

    return {
      cnpj: data.cnpj,
      razaoSocial: json.nome ?? "",
      nomeFantasia: json.fantasia ?? "",
      inscricaoEstadual: json.inscricao_estadual ?? "",
      situacao: json.situacao_cadastral ?? "",
      porte: json.porte_empresa ?? "",
      cnaePrincipal: json.cnae_principal_descricao ?? "",
      cnaeCodigo: json.cnae_principal_codigo ?? "",
      capitalSocial: capital,
      dataAbertura: json.data_inicio_atividade ?? "",
      email: json.email ?? "",
      telefone: json.telefone ?? "",
      endereco: {
        cep: json.cep ?? "",
        logradouro: json.logradouro ?? "",
        numero: json.numero ?? "",
        complemento: json.complemento ?? "",
        bairro: json.bairro ?? "",
        cidade: json.municipio ?? "",
        uf: json.uf ?? "",
      },
    };
  });
