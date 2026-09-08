import { describe, expect, it } from "vitest";
import {
  contatoPosVendaValido,
  dadosExigidosParaEntrar,
  diasUteisEntre,
  exigeResponsavel,
  faltamDados,
  posVendaAtrasado,
  posVendaPodeEncerrar,
} from "./pedido-avanco";

const campos = (p: Parameters<typeof faltamDados>[0], s: string) =>
  faltamDados(p, s).map((f) => f.campo);

describe("dados exigidos por etapa", () => {
  it("cada etapa pede o seu", () => {
    expect(dadosExigidosParaEntrar("em_producao")).toEqual(["previsao_entrega"]);
    expect(dadosExigidosParaEntrar("pronto")).toEqual(["modalidade_entrega", "transportadora"]);
    expect(dadosExigidosParaEntrar("faturado_em_rota")).toEqual(["nf_numero"]);
    expect(dadosExigidosParaEntrar("programacao")).toEqual([]);
  });

  it("produção exige previsão de entrega", () => {
    expect(campos({}, "em_producao")).toEqual(["previsao_entrega"]);
    expect(campos({ previsao_entrega: "2026-09-20" }, "em_producao")).toEqual([]);
  });

  it("pronto exige modalidade e transportadora quando é coleta", () => {
    expect(campos({}, "pronto")).toEqual(["modalidade_entrega", "transportadora"]);
    expect(campos({ modalidade_entrega: "coleta" }, "pronto")).toEqual(["transportadora"]);
    expect(
      campos({ modalidade_entrega: "coleta", transportadora: "Braspress" }, "pronto"),
    ).toEqual([]);
  });

  it("cliente retira ou entrega própria dispensam a transportadora", () => {
    expect(
      campos({ modalidade_entrega: "coleta", transportadora: "Cliente retira" }, "pronto"),
    ).toEqual([]);
    expect(
      campos({ modalidade_entrega: "coleta", transportadora: "Veículo próprio" }, "pronto"),
    ).toEqual([]);
    expect(campos({ modalidade_entrega: "entrega_propria" }, "pronto")).toEqual([]);
  });

  it("faturado em rota exige NF", () => {
    expect(campos({}, "faturado_em_rota")).toEqual(["nf_numero"]);
    expect(campos({ nf_numero: "12345" }, "faturado_em_rota")).toEqual([]);
  });
});

describe("responsável", () => {
  it("só as etapas operacionais exigem", () => {
    expect(exigeResponsavel("programacao")).toBe(true);
    expect(exigeResponsavel("em_producao")).toBe(true);
    expect(exigeResponsavel("pronto")).toBe(true);
    expect(exigeResponsavel("analise_financeira")).toBe(false);
    expect(exigeResponsavel("pos_venda")).toBe(false);
    expect(exigeResponsavel(null)).toBe(false);
  });
});

describe("dias úteis", () => {
  it("ignora sábado e domingo", () => {
    // sexta 04/09/2026 → quarta 09/09/2026 = seg, ter, qua = 3 dias úteis
    const from = new Date("2026-09-04T12:00:00.000Z");
    const to = new Date("2026-09-09T12:00:00.000Z");
    expect(diasUteisEntre(from, to)).toBe(3);
    expect(diasUteisEntre(to, from)).toBe(0);
  });
});

describe("pós-venda", () => {
  const entrada = "2026-09-01T12:00:00.000Z"; // terça
  const agora = new Date("2026-09-09T12:00:00.000Z"); // 6 dias úteis depois

  it("encerra quando há comprovação, contato e prazo cumprido", () => {
    expect(
      posVendaPodeEncerrar(
        { entrega_comprovada_em: entrada, pos_venda_contato_em: entrada },
        entrada,
        agora,
        5,
      ),
    ).toBe(true);
  });

  it("dispensa da comprovação conta igual", () => {
    expect(
      posVendaPodeEncerrar(
        { comprovacao_dispensada_em: entrada, pos_venda_contato_em: entrada },
        entrada,
        agora,
        5,
      ),
    ).toBe(true);
  });

  it("não encerra sem contato, sem comprovação, fora do prazo ou já encerrado", () => {
    expect(
      posVendaPodeEncerrar({ entrega_comprovada_em: entrada }, entrada, agora, 5),
    ).toBe(false);
    expect(posVendaPodeEncerrar({ pos_venda_contato_em: entrada }, entrada, agora, 5)).toBe(false);
    expect(
      posVendaPodeEncerrar(
        { entrega_comprovada_em: entrada, pos_venda_contato_em: entrada },
        entrada,
        agora,
        20,
      ),
    ).toBe(false);
    expect(
      posVendaPodeEncerrar(
        { entrega_comprovada_em: entrada, pos_venda_contato_em: entrada, encerrado_em: entrada },
        entrada,
        agora,
        5,
      ),
    ).toBe(false);
  });

  it("atrasado devolve o que falta", () => {
    const r = posVendaAtrasado({}, entrada, agora, 5);
    expect(r.atrasado).toBe(true);
    expect(r.faltando).toEqual(["comprovação de entrega", "contato de pós-venda"]);

    const soContato = posVendaAtrasado({ entrega_comprovada_em: entrada }, entrada, agora, 5);
    expect(soContato.faltaContato).toBe(true);
    expect(soContato.faltando).toEqual(["contato de pós-venda"]);

    expect(posVendaAtrasado({}, entrada, new Date("2026-09-02T12:00:00.000Z"), 5).atrasado).toBe(
      false,
    );
  });

  it("nota do contato precisa de 10 caracteres", () => {
    expect(contatoPosVendaValido("ok")).toBe(false);
    expect(contatoPosVendaValido("Falei com o comprador, tudo certo.")).toBe(true);
  });
});
