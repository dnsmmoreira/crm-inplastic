# Cartão de crédito — forma de pagamento + novo modelo de taxa

Plano técnico para revisão. Nada publicado. Sem alterar RLS/policies (só uma
coluna nova em tabela existente + UPDATE pontual).

## Levantamento

- `PaymentForm`/`PAYMENT_FORMS` (`src/lib/crm-store.ts:751-752`) hoje: Boleto,
  Depósito em Conta, PIX. `PaymentMethod` (catálogo) já tem "Cartão".
- O select "Forma de pagamento" (`propostas.$id.tsx` ~2387) grava
  `proposal.formaPagamento` e **não** tem hoje nenhum vínculo com o
  "Prazo de pagamento" logo abaixo (`paymentTermId`) — são campos independentes.
- Engine: `fatorCartao(n, taxa, compostos) = (1+taxa)^(n-1)`, fator 1 em 1x;
  `simularCartao` monta a tabela; `SimulacaoCartaoDialog` exibe e marca 1x como
  "sem acréscimo"; `acrescimoEfetivo` decide proposta × catálogo.
- `PaymentTerm` carrega `acrescimoPercent`, `maxParcelas`, `jurosCompostos`
  (mapeados em `crm-sync.ts` `rowToPayTerm`/`payTermToInsert`).
- Tela `condicoes-comerciais.tsx` já rotula o campo como "Taxa por parcela
  adicional (%)" quando é cartão.

## 1) "Cartão" no seletor de forma de pagamento

- `PaymentForm` e `PAYMENT_FORMS` passam a incluir `"Cartão"`; placeholder do
  select atualizado.
- Vínculo com o prazo (proposta de desenho, confirmar):
  - ao escolher **Cartão** na forma de pagamento, a lista de "Prazo de pagamento"
    passa a mostrar primeiro as condições de cartão e, se houver exatamente uma
    condição de cartão ativa e o prazo atual não for de cartão, abrir a
    simulação já sugerindo essa condição;
  - ao escolher uma condição de cartão no prazo, `formaPagamento` é ajustada
    para "Cartão" automaticamente;
  - nenhum bloqueio rígido — o usuário continua livre para combinar.

## 2) Novo modelo de taxa

- Migration: `ALTER TABLE public.condicoes_pagamento ADD COLUMN
  cartao_taxa_base_percent numeric NOT NULL DEFAULT 0;` + UPDATE na linha
  `cartao-credito` (`acrescimo_percent = 1.5`, `cartao_taxa_base_percent = 5`).
  Sem tocar em policies.
- `PaymentTerm.cartaoTaxaBasePercent?: number` + mapeamento em `crm-sync.ts`
  (leitura e escrita) e campo na tela de condições ("Taxa base do cartão (%)",
  visível só para cartão, com texto explicando que vale já na 1x).
- `cartao-simulacao.ts`:
  - `fatorCartao(n, taxaAdicional, compostos = true, taxaBase = 0)` →
    `(1 + base) * (1 + taxa)^(n-1)` (compostos) ou
    `(1 + base) * (1 + (n-1) * taxa)` (simples).
  - `simularCartao({ ..., taxaBasePercent })` repassa a base; `acrescimoPercent`
    de cada linha continua arredondado a 2 casas (é o que vai gravado na
    proposta e impresso); o teste confere o **fator** contra a tabela de 4 casas
    (1x 5,00 · 2x 6,575 · 3x 8,1736 … 12x 23,6846).
  - `acrescimoEfetivo` sem mudança de assinatura (no cartão já manda o valor
    gravado na proposta, que agora nunca é 0 em 1x).
- `SimulacaoCartaoDialog.tsx`: remove o selo "sem acréscimo" da 1x (passa a
  mostrar o próprio acréscimo, ex. "+5,00%") e a descrição do topo cita as duas
  taxas: base (5%, já na 1x) + por parcela adicional (1,5%, composta).
- `propostas.$id.tsx`: passa `taxaBasePercent` da condição ao diálogo.

## Testes

- `cartao-simulacao.test.ts`: nova tabela 1x–12x com base 5% + 1,5% composto;
  base zero mantém o comportamento antigo (regressão); juros simples com base;
  soma das parcelas = total.
- `bunx vitest run` + `bunx tsgo --noEmit` + build antes do diff.

## Pontos a confirmar

1. Nome da coluna: `cartao_taxa_base_percent` (campo `cartaoTaxaBasePercent`).
2. Vínculo forma ↔ prazo como descrito acima (sugestão, sem bloqueio).
3. O % gravado na proposta continua com 2 casas (ex. 8,17% na 3x), embora a
   tabela de conferência traga 4 casas. Manter assim?
