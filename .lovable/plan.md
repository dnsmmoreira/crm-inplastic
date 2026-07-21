## Diagnóstico

**Sintoma**: ao clicar em "Calcular logística" (ou "Calcular" em Transporte) na proposta 2026-0008, aparece erro tipo "CEP não localizado" / "frete não encontrado". Nenhum km/frete é salvo.

**Causa raiz confirmada por reprodução direta contra o gateway**:

Existem duas chaves Google Maps no projeto:
- `GOOGLE_MAPS_API_KEY_1` → conexão "Denis's Google Maps Platform" (a customizada, restrita por HTTP referrer para funcionar no domínio próprio no browser).
- `GOOGLE_MAPS_API_KEY` → conexão "Google Maps Platform" padrão, sem restrição de referrer.

O código do server function prioriza a `_1`:

```ts
// src/lib/logistica.functions.ts:19-21 e src/lib/freight.functions.ts:6-8
function getGoogleMapsConnectionKey() {
  return process.env.GOOGLE_MAPS_API_KEY_1 ?? process.env.GOOGLE_MAPS_API_KEY;
}
```

Ao chamar `/maps/api/geocode/json` server-side com a `_1`, o Google devolve HTTP 200 + JSON:

```json
{ "status": "REQUEST_DENIED",
  "error_message": "API keys with referer restrictions cannot be used with this API." }
```

O código atual não trata `status = REQUEST_DENIED`: como `res.ok` é `true` e `data.status !== "OK"`, cai no genérico `throw new Error("CEP não localizado: ${cep}")` (src/lib/logistica.functions.ts:54 e src/lib/freight.functions.ts:53). Daí a mensagem enganosa que o usuário viu.

A chave `GOOGLE_MAPS_API_KEY` padrão funciona no mesmo endpoint (retornei o endereço completo de 02422-230 nos testes). Ou seja: a chave custom nunca deveria ter sido usada em server functions — ela é para o browser no domínio próprio (Maps JavaScript API).

Efeito colateral: a proposta 2026-0008 é FOB, mas o card "Logística inteligente" é renderizado sempre (src/routes/propostas.$id.tsx:1033), independente do payer — então o erro afeta CIF e FOB.

## Correção proposta (mínima, sem mudar UI nem regras de negócio)

### 1. Inverter a prioridade das chaves para uso server-side

Em `src/lib/logistica.functions.ts:19-21` e `src/lib/freight.functions.ts:6-8`:

```ts
function getGoogleMapsConnectionKey() {
  return process.env.GOOGLE_MAPS_API_KEY ?? process.env.GOOGLE_MAPS_API_KEY_1;
}
```

Justificativa: server functions rodam no worker, sem referrer; a chave restrita por referrer **nunca** funciona a partir dali. A chave "padrão" é a única viável server-side. A chave `_1` continua servindo pro browser em `crm.inplastic.com.br` (Maps JavaScript API via `GOOGLE_MAPS_BROWSER_KEY_1` já é browser).

### 2. Tratar `REQUEST_DENIED` / `ZERO_RESULTS` com mensagem correta

Em `geocodeCep` (ambos arquivos), separar os casos antes do throw genérico:

```ts
if (data.status === "REQUEST_DENIED") {
  throw new Error(
    `Google Maps recusou a chave server-side (${data.error_message ?? "REQUEST_DENIED"}). ` +
    `Verifique restrições da API key.`
  );
}
if (data.status === "OVER_QUERY_LIMIT") {
  throw new Error("Google Maps: cota excedida. Tente novamente em alguns minutos.");
}
if (data.status !== "OK" || !data.results?.length) {
  throw new Error(`CEP não localizado: ${cep}`);
}
```

Isso evita que futuros bloqueios de chave sejam disfarçados de "CEP inválido".

### 3. Não persistir automaticamente `distanceKm`/`freightValue` — sem mudanças

Não altera store nem UI. O botão "Usar" continua aplicando o frete escolhido normalmente.

## Arquivos afetados

- `src/lib/logistica.functions.ts` — inverter fallback + tratamento de `REQUEST_DENIED`.
- `src/lib/freight.functions.ts` — idem (mesma função duplicada; correções idênticas).

Nenhuma migration, nenhuma alteração de tabela, nenhuma mudança em UI de proposta. Zero impacto em dados existentes.

## Como validar depois de aplicar

1. Reabrir proposta 2026-0008 → clicar em "Calcular logística" → deve retornar distância (≈ poucos km, ambos CEPs em SP capital) e a tabela por veículo (Truck deve aparecer como "melhor" ou 3/4, com aproveitamento e frete/peça).
2. Trocar payer para CIF e usar o botão "Calcular" na seção Transporte → deve preencher km e valor aproximado sem erro.
3. Em caso de erro futuro, a mensagem agora diz explicitamente se foi a chave ou o CEP.

## Aguardo aprovação para implementar

Ponto único de decisão: aprovar a inversão da prioridade das chaves (a `_1` continua sendo usada no browser normalmente — só sai do caminho server-side).