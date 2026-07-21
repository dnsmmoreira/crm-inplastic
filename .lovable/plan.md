## 1) O que o motor faz hoje (sem conceito de aninhamento)

Em `src/lib/logistica.ts`:

- **Linhas 65–67** — `alturaPilhaM(p)` retorna `(heightCm × pecasPorColuna) / 100`. Assume empilhamento cheio.
- **Linhas 178–181** — dentro de `calcularParaVeiculo`:
  ```
  alturaPecaM = heightCm / 100
  maxPecasPilhaAltura = floor(alturaUtilM / alturaPecaM)
  pecasPorPilha = min(pecasPorColuna, maxPecasPilhaAltura)
  ```
  Ou seja, a altura útil do veículo é dividida pela altura de **uma peça avulsa**, o que superestima a altura ocupada quando o produto é aninhável (ex.: MDLS = 15 cm × 25 peças = 375 cm no modelo atual, quando na realidade o volume aninhado tem 240 cm).

Não há hoje nenhum campo/lógica para altura de volume aninhado.

## 2) Proposta: coluna opcional `stack_height_cm`

Adicionar uma coluna nova, **opcional (nullable)**, em `public.produtos`:

- `stack_height_cm numeric` — altura real do volume completo empilhado/aninhado, em cm.

**Regra no motor** (dentro de `calcularParaVeiculo`):

- Se `stack_height_cm` **estiver preenchido**:
  - `stackHeightM = stack_height_cm / 100`
  - Se `alturaUtilM >= stackHeightM` → cabe a pilha inteira: `pecasPorPilha = pecas_por_coluna`.
  - Se não cabe (veículo mais baixo que o volume): prorratear linearmente — `pecasPorPilha = max(1, floor(pecas_por_coluna × alturaUtilM / stackHeightM))`. Emite aviso "Altura útil limita o volume a X peças".
- Se `stack_height_cm` **for null**: mantém a fórmula atual (`height_cm × pecas_por_coluna`), preservando 100% do comportamento para os 57 produtos sem dado técnico. Zero regressão de frete.

O `heightCm` continua sendo a altura da peça avulsa e continua útil para o fallback e para futuros cálculos (ex.: envio de peças soltas fora do volume).

## 3) Footprint (piso do veículo)

Sim — `width_cm × length_cm` recebem as dimensões **L × C do volume completo** que você informou (não da peça individual, porque quando aninhado o volume ocupa o footprint da peça externa maior). Para os pallets, largura/comprimento do volume = largura/comprimento de uma peça (a peça externa define o footprint), então isso bate com a informação de campo.

## 4) Tabela final por família

Cores (BRC/NAT/PRT/AZL/CNZ PRT) recebem valores idênticos dentro da família. HV6 empilha cheio; posso deixar `stack_height_cm` nulo (fallback = 16 × 15 = 240 cm) OU preencher com 240 explícito para documentar — proponho preencher explícito para clareza.

| Família (SKUs) | weight_kg | height_cm | width_cm | length_cm | pecas_por_coluna | stack_height_cm |
|---|---|---|---|---|---|---|
| EX1210 (BRC/NAT/PRT) | 7.600 | 15 | 100 | 120 | 75 | **230** |
| EXLS1210 (BRC/NAT/PRT) | 10.230 | 14 | 100 | 120 | 50 | **165** |
| MDLS (BRC/CNZ PRT/NAT/PRT) | 16.630 | 15 | 120 | 120 | 25 | **240** |
| HV3 (AZL/BRC/NAT/PRT) | 14.680 | 16 | 120 | 120 | 23 | **235** |
| HV6 (AZL/BRC/NAT/PRT) | 15.960 | 16 | 100 | 120 | 15 | **240** (empilha cheio; 16×15=240 coincide) |

Total: **17 SKUs** atualizados (3+3+4+4+4). EXCL = EXLS1210. MD é pulado.

### Impacto no cálculo de frete

Comparando altura ocupada antes vs. depois, num veículo tipo Truck (alturaUtilM = 2.7 m):

| Família | Antes (h×n) | Depois (stack) | Diferença |
|---|---|---|---|
| EX1210 | 15×75 = 1125 cm → limita a 18 peças/pilha | 230 cm → cabe pilha cheia (75) | **+4× peças/veículo** |
| EXLS1210 | 14×50 = 700 cm → limita a 19 | 165 cm → 50 cheia | **+2,6×** |
| MDLS | 15×25 = 375 cm → limita a 18 | 240 cm → 25 cheia | **+38%** |
| HV3 | 16×23 = 368 cm → limita a 16 | 235 cm → 23 cheia | **+43%** |
| HV6 | 16×15 = 240 cm → 15 cheia | 240 cm → 15 cheia | **0** (esperado — não aninha) |

Resultado esperado: frete/peça **cai** para EX1210/EXLS1210/MDLS/HV3 (menos veículos para a mesma quantidade). HV6 fica idêntico. Nenhum SKU sem dados técnicos muda (fallback intacto).

## Arquivos afetados quando implementarmos

- **Migration**: `ALTER TABLE public.produtos ADD COLUMN stack_height_cm numeric NULL;` + `UPDATE` dos 17 SKUs com os valores da tabela.
- `src/integrations/supabase/types.ts` — regenerado automaticamente pós-migration.
- `src/lib/logistica.ts` — adicionar `stackHeightCm?: number | null` em `ProdutoLog`; ajustar a lógica de `pecasPorPilha` em `calcularParaVeiculo` conforme regra do item 2. `alturaPilhaM` e `volumeUnitM3` ficam como estão (peça avulsa).
- `src/lib/logistica.functions.ts` — incluir `stack_height_cm` no SELECT/mapeamento.
- `src/routes/produtos.tsx` — expor o campo no cadastro de produto (input opcional "Altura do volume empilhado (cm)") para futuros SKUs. Se preferir só backfill agora e UI depois, também é válido — me diga.

## Aguardo aprovação

Ponto único de decisão: **incluir input de `stack_height_cm` no formulário de produtos agora**, ou só rodar a migration+backfill e deixar a UI para depois?
