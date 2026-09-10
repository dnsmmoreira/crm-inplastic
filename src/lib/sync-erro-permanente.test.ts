import { describe, it, expect } from "vitest";
import { ehErroPermanente } from "./sync-erro-permanente";

describe("ehErroPermanente", () => {
  it("RLS é permanente", () => {
    expect(
      ehErroPermanente({
        code: "42501",
        message: 'new row violates row-level security policy for table "tarefas"',
      }),
    ).toBe(true);
  });

  it("FK quebrada é permanente", () => {
    expect(
      ehErroPermanente({ code: "23503", message: "violates foreign key constraint" }),
    ).toBe(true);
  });

  it("check constraint é permanente", () => {
    expect(ehErroPermanente({ code: "23514", message: "tarefas_status_chk" })).toBe(true);
  });

  it("exceção de trigger é permanente", () => {
    expect(ehErroPermanente({ code: "P0001", message: "nota_conclusao obrigatória" })).toBe(true);
  });

  it("rede caída continua com retry", () => {
    expect(ehErroPermanente({ message: "Failed to fetch" })).toBe(false);
    expect(ehErroPermanente({ message: "network error" })).toBe(false);
    expect(ehErroPermanente(new Error("request timed out"))).toBe(false);
  });

  it("erro desconhecido é tratado como transitório", () => {
    expect(ehErroPermanente({ message: "algo estranho" })).toBe(false);
    expect(ehErroPermanente(null)).toBe(false);
  });

  it("mensagem de RLS sem código também conta", () => {
    expect(ehErroPermanente({ message: "permission denied for table tarefas" })).toBe(true);
  });
});
