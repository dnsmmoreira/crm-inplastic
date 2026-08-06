# Diagnóstico — "Com 3% de desconto" nas propostas

Verificado em código e no banco. Nada foi alterado.

## (1) Onde o texto é gerado

O texto **não é gerado por nenhum cálculo**: ele é o campo `notes` da condição de pagamento, exibido como está.

- `src/lib/crm-store.ts:633` — seed: `{ id: "pix-avista", label: "PIX à vista", ..., notes: "Com 3% de desconto" }`
- `src/lib/crm-store.ts:637` — seed: `dinheiro-avista` com `notes: "Com 5% de desconto"`
- `src/routes/propostas.$id.tsx:1196-1197` — renderiza `term.notes` abaixo da tabela de parcelas (tela)
- `src/routes/propostas.$id.tsx:1429` — mesmo `term.notes` na versão de impressão/A4
- `src/routes/condicoes-comerciais.tsx:414` — campo editável "Observação" da condição, com placeholder `Ex: Com 3% de desconto`

Nenhum trecho monta a string "Com X% de desconto" dinamicamente — busca por essa expressão só encontra os literais acima.

## (2) De onde vem o 3%

Vem do **banco**, na tabela `condicoes_pagamento`, coluna `notes` — populada a partir do seed de `crm-store.ts`. Consulta atual:

```
pix-avista       | PIX à vista       | "Com 3% de desconto"
dinheiro-avista  | Dinheiro à vista  | "Com 5% de desconto"
```

Não existe regra por forma de pagamento nem cálculo condicional para "à vista". É texto livre editável em `/condicoes-comerciais`.

## (3) Afeta o valor?

**Não.** É puramente textual.

- O único desconto real é `propostas.discount_percent` → `discountPercent`, definido manualmente pelo vendedor no campo de desconto (`src/routes/propostas.$id.tsx:1215-1227`, limitado pelo teto do admin).
- O total sai de `src/lib/crm-store.ts:1403-1408`, que usa apenas `p.discountPercent`; a condição de pagamento não entra na conta.
- As parcelas são rateio do total já calculado — o `notes` não participa.
- Confirmado nos dados: as 10 propostas mais recentes, incluindo as com `payment_term_id = pix-avista` e `dinheiro-avista`, todas têm `discount_percent = 0`.

Ou seja: hoje a proposta **diz** 3% mas **cobra** o valor cheio — divergência entre texto e valor, o que é o risco comercial real aqui.

## (4) Mudança mínima

Limpar o `notes` das duas condições no banco — nada de código:

```sql
UPDATE public.condicoes_pagamento
SET notes = NULL, updated_at = now()
WHERE id IN ('pix-avista', 'dinheiro-avista');
```

Isso já remove o texto da tela e da impressão, porque ambos os pontos de render são condicionais (`{term.notes && ...}`).

Complemento recomendado (opcional, mesma mudança mínima):
- Remover os dois literais `notes:` do seed em `src/lib/crm-store.ts:633` e `:637`, para que uma reinicialização/reseed não traga o texto de volta.

O que **não** muda: o campo de desconto manual da proposta continua funcionando igual, e o admin continua podendo escrever qualquer observação em `/condicoes-comerciais`.
