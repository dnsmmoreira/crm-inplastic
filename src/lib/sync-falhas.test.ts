import { describe, it, expect, vi, beforeEach } from "vitest";
import { toast } from "sonner";
import { reportarFalhaSync, rotuloColecao, _resetAvisosSync } from "./sync-falhas";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

describe("reportarFalhaSync", () => {
  beforeEach(() => {
    _resetAvisosSync();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("avisa o usuário com o rótulo da coleção", () => {
    reportarFalhaSync("leads", "upsert", { message: "rls" });
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.error).mock.calls[0]?.[0]).toContain("Falha ao salvar leads");
  });

  it("não empilha o mesmo toast em ciclos seguidos", () => {
    reportarFalhaSync("tasks", "upsert", { message: "x" });
    reportarFalhaSync("tasks", "upsert", { message: "x" });
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(2);
  });

  it("traduz nomes internos de coleção", () => {
    expect(rotuloColecao("proposalParcelas")).toBe("parcelas da proposta");
  });
});
