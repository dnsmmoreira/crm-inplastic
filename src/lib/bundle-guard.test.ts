import { describe, it, expect } from "vitest";
import { ehErroColunaInexistente, buildMudou } from "@/lib/build-version";
import { mesclarPreservandoPendentes } from "@/lib/crm-reload-merge";

describe("ehErroColunaInexistente", () => {
  it("reconhece 42703 e a mensagem do PostgREST", () => {
    expect(ehErroColunaInexistente({ code: "42703" })).toBe(true);
    expect(
      ehErroColunaInexistente({
        message: 'column "omie_codigo_produto" of relation "proposta_itens" does not exist',
      }),
    ).toBe(true);
    expect(
      ehErroColunaInexistente({
        code: "PGRST204",
        message: "Could not find the 'omie_codigo_produto' column of 'proposta_itens'",
      }),
    ).toBe(true);
  });

  it("não confunde com erro comum (RLS, rede)", () => {
    expect(ehErroColunaInexistente({ code: "42501", message: "permission denied" })).toBe(false);
    expect(ehErroColunaInexistente(null)).toBe(false);
  });
});

describe("buildMudou", () => {
  it("só acusa quando o build remoto é outro", () => {
    expect(buildMudou("a", "b")).toBe(true);
    expect(buildMudou("a", "a")).toBe(false);
    expect(buildMudou("dev", "b")).toBe(false);
    expect(buildMudou("a", undefined)).toBe(false);
  });
});

describe("mesclarPreservandoPendentes", () => {
  const remotos = [
    { id: "p1", v: "banco" },
    { id: "p2", v: "banco" },
  ];

  it("recarga não sobrescreve registro com alteração local pendente", () => {
    const locais = [
      { id: "p1", v: "local-editado" },
      { id: "p2", v: "banco" },
    ];
    const out = mesclarPreservandoPendentes(remotos, locais, (x) => x.id === "p1");
    expect(out).toEqual([
      { id: "p1", v: "local-editado" },
      { id: "p2", v: "banco" },
    ]);
  });

  it("mantém registro criado localmente que o banco ainda não tem", () => {
    const locais = [...remotos, { id: "p3", v: "novo" }];
    const out = mesclarPreservandoPendentes(remotos, locais, (x) => x.id === "p3");
    expect(out.map((x) => x.id)).toEqual(["p3", "p1", "p2"]);
  });

  it("sem pendências devolve o remoto intacto", () => {
    expect(mesclarPreservandoPendentes(remotos, remotos, () => false)).toBe(remotos);
  });
});
