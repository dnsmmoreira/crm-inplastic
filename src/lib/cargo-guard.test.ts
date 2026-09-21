/**
 * Guarda automatizada: ninguém pode voltar a ler o texto `profiles.cargo`
 * sem passar por aqui. A varredura vive em `src/lib/cargo-guard-scan.ts` e é
 * a mesma usada pelo plugin de build (vite.config.ts), que derruba o build.
 *
 * Ver `docs/profiles-cargo.md`.
 */
import { describe, it, expect } from "vitest";
import { verificarCargoGuard, mensagemDeFalha } from "@/lib/cargo-guard-scan";

describe("guarda de leitura direta de profiles.cargo", () => {
  const v = verificarCargoGuard();

  it("não surgiu nenhum arquivo novo lendo o texto do cargo", () => {
    expect(v.novos, mensagemDeFalha(v) ?? "").toEqual([]);
  });

  it("nenhum arquivo conhecido passou a usar mais o texto do cargo", () => {
    expect(v.cresceram, mensagemDeFalha(v) ?? "").toEqual([]);
  });

  it("nenhuma função externa (edge function) lê o texto do cargo", () => {
    expect(v.edgeFunctions).toEqual([]);
  });

  it("a mensagem de falha só aparece quando há violação", () => {
    expect(mensagemDeFalha(v)).toBeNull();
    expect(
      mensagemDeFalha({ novos: ["src/x.ts"], cresceram: [], edgeFunctions: [] }),
    ).toContain("profiles.cargo_id");
  });
});
