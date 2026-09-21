import { describe, it, expect, afterEach } from "vitest";

import { appBaseUrl, appUrl, appHost, URLS_PERMITIDAS, URL_PADRAO } from "./app-url";

const original = process.env.APP_PUBLIC_URL;
afterEach(() => {
  if (original === undefined) delete process.env.APP_PUBLIC_URL;
  else process.env.APP_PUBLIC_URL = original;
});

describe("endereço público do CRM", () => {
  it("usa o valor de APP_PUBLIC_URL quando ele está na allowlist", () => {
    process.env.APP_PUBLIC_URL = "https://crm-inplastic.lovable.app";
    expect(appBaseUrl()).toBe("https://crm-inplastic.lovable.app");
  });

  it("aceita o domínio novo crm.aginext.com.br", () => {
    expect(URLS_PERMITIDAS).toContain("https://crm.aginext.com.br");
    process.env.APP_PUBLIC_URL = "https://crm.aginext.com.br";
    expect(appBaseUrl()).toBe("https://crm.aginext.com.br");
  });

  it("mantém os endereços antigos permitidos", () => {
    expect(URLS_PERMITIDAS).toContain("https://crm.inplastic.com.br");
    expect(URLS_PERMITIDAS).toContain("https://crm-inplastic.lovable.app");
  });

  it("recusa endereço fora da allowlist e cai no padrão", () => {
    process.env.APP_PUBLIC_URL = "https://evil.example.com";
    expect(appBaseUrl()).toBe(URL_PADRAO);
    expect(URL_PADRAO).toBe("https://crm.inplastic.com.br");
  });

  it("ignora barra final e monta caminhos", () => {
    process.env.APP_PUBLIC_URL = "https://crm.inplastic.com.br/";
    expect(appBaseUrl()).toBe("https://crm.inplastic.com.br");
    expect(appUrl("/conversas?c=1")).toBe("https://crm.inplastic.com.br/conversas?c=1");
    expect(appUrl("equipe")).toBe("https://crm.inplastic.com.br/equipe");
    expect(appHost("/equipe")).toBe("crm.inplastic.com.br/equipe");
  });
});
