## Fase 1 — Cadastro técnico dos produtos

Complementa a tabela `produtos` (que já tem SKU, nome, peso, dimensões, NCM) com o mínimo para virar coluna no caminhão:

- `pecas_por_coluna` (int) — quantas peças empilham antes do peso/altura limitar. Vendedor não digita altura de pilha; sistema calcula: `altura_pilha = height_cm × pecas_por_coluna` e `peso_pilha = weight_kg × pecas_por_coluna`.
- `family` (text, opcional) — agrupador para relatório ("HV", "Container Bin", "Caixa Vazada"). Não afeta cálculo.

Volume unitário (m³) e volume da pilha ficam **calculados na UI** a partir de comprimento×largura×altura, nunca persistidos (evita divergência).

Tela `/produtos` ganha:
- Campo "Peças por coluna" com preview: "Pilha = 20 peças · altura 1,80 m · 260 kg".
- Campo "Família" (autocomplete simples com valores já cadastrados).

## Fase 2 — Cadastro da frota (admin)

Frota vive em `system_workspace.data.frota` (JSON, admin-only já protegido por RLS). Nova aba em **Condições comerciais → Frota** com CRUD dos veículos:

| Campo             | Ex.: Truck        | Ex.: Carreta       | Ex.: Contêiner 20' |
| ----------------- | ----------------- | ------------------ | ------------------ |
| nome              | Truck             | Carreta            | Container 20'      |
| tipo              | truck             | carreta            | container_20       |
| comprimento_util_m| 7,5               | 14,0               | 5,9                |
| largura_util_m    | 2,4               | 2,4                | 2,35               |
| altura_util_m     | 2,7               | 2,9                | 2,39               |
| capacidade_kg     | 12000             | 27000              | 22000              |
| rs_por_km         | 6,50              | 9,20               | 11,00              |
| ativo             | true              | true               | true               |

Preset inicial já vem com **VUC · ¾ · Toco · Truck · Carreta · Container 20' · Container 40' · Bitrem · Rodotrem** — admin ajusta valores.

## Fase 3 — Calculadora de logística

Server fn `calcularLogistica` recebe `{ itens: [{ sku, qtd }], originCep, destinationCep }` e devolve, para cada veículo ativo:

```text
{
  totalPeso_kg, totalVolume_m3, totalColunas,
  distancia_km,   ← reutiliza calculateFreightDistance existente
  veiculos: [
    {
      nome: "Truck",
      colunasPorVeiculo,        ← floor(area_piso / footprint_sku) × pecas_por_coluna
      veiculosNecessarios,      ← teto( colunas / colunasPorVeiculo ) OU teto( peso / capacidade_kg )
      limitante: "volume"|"peso",
      aproveitamento_pct,
      freteTotal, fretePorColuna, fretePorPeca
    }, ...
  ]
}
```

Regras de cálculo:
- **Cabimento** = `floor(comprimento_util / max(L, C)) × floor(largura_util / min(L, C))` — sistema testa também a orientação girada 90° e fica com o maior. Depois multiplica por `pecas_por_coluna`.
- **Altura** limita colunas se `altura_pilha > altura_util_m` (avisa e reduz).
- **Frete** = `distancia_km × rs_por_km × veiculos_necessarios`.
- Chamada única ao Google Maps por cotação (cache por par de CEPs no cliente durante a sessão).

## Fase 4 — UI na proposta

Novo bloco "Logística" dentro de `/propostas/:id`:
- Já lê os itens da proposta (não precisa redigitar "650 HV-6").
- Campos: CEP origem (default da matriz) e CEP destino (default do lead).
- Botão **Calcular** → renderiza tabela dos veículos:

```text
┌──────────────┬─────┬─────────┬──────────┬────────────┬───────────┐
│ Veículo      │ Qtd │ Aprov.  │ Limitado │ Frete total│ R$/peça   │
├──────────────┼─────┼─────────┼──────────┼────────────┼───────────┤
│ Truck        │  2  │  94 %   │ volume   │ R$ 12.480  │ R$ 19,20  │
│ Carreta      │  1  │  87 %   │ volume   │ R$  8.464  │ R$ 13,02  │  ← sugerida
│ Container 20'│  2  │  71 %   │ volume   │ R$ 20.240  │ R$ 31,14  │
└──────────────┴─────┴─────────┴──────────┴────────────┴───────────┘
```

- Sistema destaca automaticamente o menor R$/peça viável.
- Botão "Adicionar frete à proposta" prefill do campo de valor de frete existente.

## Detalhes técnicos

- Migração: `ALTER TABLE produtos ADD pecas_por_coluna INT NOT NULL DEFAULT 1, ADD family TEXT`.
- Frota: schema TypeScript em `src/lib/frota.ts` + hook `useFrota()` que lê/escreve `system_workspace.data.frota` via store existente (`crm-store.ts`).
- Cálculo puro em `src/lib/logistica.ts` (funções testáveis, sem dependência de rede).
- Server fn `calcularLogistica` em `src/lib/logistica.functions.ts` — protege com `requireSupabaseAuth`, orquestra `calculateFreightDistance` + `logistica.ts` puro.
- Cache in-memory de distância por par de CEPs no componente (`useRef<Map>`).
- Sem mudanças no schema de `propostas` — o frete calculado grava no campo de valor de frete que já existe.

## Fora do escopo desta iteração

- Restrição por NCM/ANTT (perigosos, refrigerados).
- Otimização mista (2 truck + 1 VUC no mesmo pedido).
- Roteirização multi-parada.
- Tabela de frete manual por UF (você escolheu R$/km × distância).

Posso implementar direto se aprovado, ou você prefere quebrar em duas entregas (Fase 1+2 primeiro, depois 3+4)?
