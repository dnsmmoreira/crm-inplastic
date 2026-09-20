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
    reportarFalhaSync("products", "upsert", { message: "x" });
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast.error).mock.calls[0]?.[0]).toContain("Falha ao salvar produtos");
  });

  it("lead recusado pela RLS explica que o dono é outro", () => {
    reportarFalhaSync("leads", "upsert", {
      code: "42501",
      message: 'new row violates row-level security policy for table "leads"',
    });
    expect(vi.mocked(toast.error).mock.calls[0]?.[0]).toMatch(/outro vendedor/i);
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

  it("falha transitória avisa que vai tentar de novo, sem pedir recarga", () => {
    reportarFalhaSync("tasks", "upsert", { message: "Failed to fetch" }, { tentativa: 1 });
    const msg = String(vi.mocked(toast.error).mock.calls[0]?.[0]);
    expect(msg).toContain("tentar de novo");
    expect(msg).not.toContain("Recarregue a página");
  });

  it("tentativas esgotadas avisam que o motor parou e atualizou a tela", () => {
    reportarFalhaSync("tasks", "upsert", { message: "Failed to fetch" }, { esgotado: true });
    const msg = String(vi.mocked(toast.error).mock.calls[0]?.[0]);
    expect(msg).toContain("Parei de tentar");
    expect(msg).not.toContain("Recarregue a página");
  });
});
