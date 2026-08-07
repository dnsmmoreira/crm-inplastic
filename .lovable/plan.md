# Diagnóstico — Venda para Pessoa Física (PF)

## 1) Cadastro de cliente

Formulário único, reutilizado em criação e edição:

- `src/components/clientes/ClienteFormFields.tsx` — componente do formulário
- `src/components/clientes/NovoClienteDialog.tsx:183` — usa o formulário no cadastro (rota `/clientes`, botão em `src/routes/clientes.index.tsx:121`, dialog em `:262`)
- `src/routes/clientes.$id.tsx:184` — usa o mesmo formulário na edição
- Server functions: `src/lib/clientes.functions.ts` (`ClienteInput` :38, validação :65-88, create :200-286, update :326-376)

Campos hoje (label → coluna em `public.clientes`):

| Card | Campo (arquivo:linha) | Coluna |
| --- | --- | --- |
| Identificação | CNPJ * (`ClienteFormFields.tsx:113`) | `cnpj` |
| | Razão social * (`:126`) | `razao_social` |
| | Nome fantasia (`:134`) | `nome_fantasia` |
| | Empresa padrão * (`:142`) | `empresa_padrao` |
| | Inscrição estadual (`:158`) + switch isento | `inscricao_estadual`, `ie_isento` |
| Endereço | Endereço/Número/CEP/Complemento/Bairro/UF/Cidade (`:181-220`) | `endereco`, `numero`, `cep`, `complemento`, `bairro`, `estado`, `cidade` |
| Contato | Contato/E-mail/Telefone/Telefone 2/Website (`:231-251`) | `contato`, `email`, `telefone`, `telefone2`, `website` |
| Regime fiscal | Simples, SUFRAMA isento, Inscrição SUFRAMA (`:259-279`) | `simples_optante`, `suframa_isento`, `suframa_numero` |
| Interno | Observação, Vendedor responsável (`:300-306`) | `observacao`, `vendedor_id` |

Tabela `public.clientes` (colunas): `id`, `cnpj`, `razao_social`, `nome_fantasia`, `inscricao_estadual`, `ie_isento`, `endereco`, `numero`, `complemento`, `bairro`, `cep`, `cidade`, `estado`, `contato`, `email`, `telefone`, `telefone2`, `website`, `observacao`, `empresa_padrao`, `vendedor_id`, `criado_por`, `criado_em`, `atualizado_em`, `ativo`, `omie_codigo_cliente_inplastic`, `omie_codigo_cliente_taoplast`, `simples_optante`, `suframa_isento`, `suframa_numero`.

Respostas diretas:
- **Tipo de pessoa (PJ/PF): não existe** — nenhuma coluna nem campo de UI.
- **CNPJ: existe** — coluna `clientes.cnpj`, UI em `ClienteFormFields.tsx:113`, obrigatório e imutável na edição (`clientes.functions.ts:338`).
- **CPF: não existe** — nem coluna, nem campo, nem validador (`src/lib/cnpj.ts` só valida CNPJ).
- Validação hoje **exige 14 dígitos + DV de CNPJ** (`clientes.functions.ts:68-69`), e há RPC `cnpj_status` usada no create (`:207`) e unique em `cnpj`.

## 2) Condições de pagamento

Tabela `public.condicoes_pagamento`: `id` (text), `label` (text), `method` (text), `splits` (jsonb — array de dias, `0` = à vista), `notes` (text), `active` (boolean), `created_at`, `updated_at`.

Tipo espelhado no app: `PaymentTerm` em `src/lib/crm-store.ts:621-628`; seed em `:632-653`.

Condições hoje no banco (21, todas ativas): Boleto (à vista, 14, 21, 28, 30, 105, entrada+30, 2x, 3x, 4x, 6x), PIX (à vista, 7, 14, 28), Depósito (à vista, 15), Dinheiro à vista, **Cartão à vista, Cartão 3x sem juros, Cartão 6x sem juros**.

- **Cartão de crédito: já existe** (`cartao-avista`, `cartao-3x`, `cartao-6x`, `method = "Cartão"`).
- **Campo "à vista / a prazo": não existe** explicitamente. É inferível apenas por `splits` (`[0]` = à vista; renderização em `src/routes/condicoes-comerciais.tsx:302`). Também não há campo de taxa/acréscimo.
- **Escolha na proposta**: `src/routes/propostas.$id.tsx:1125-1139` (Select), lista filtrada em `:179-180` (`activePaymentTerms` = só `active`). Persistência: `propostas.payment_term_id` (`src/lib/crm-sync.ts:390` e `:417`). Pedidos herdam via snapshot da proposta — não há seletor próprio de condição em `/pedidos`.
- **Cadastro/edição das condições (admin)**: `src/routes/condicoes-comerciais.tsx:69-171` e `:374-416`.

## 3) Vínculo cliente × condição

**Não existe nenhuma restrição por cliente.** A lista é montada só por `active` em `src/routes/propostas.$id.tsx:179-180`, alimentada por `useCrm(s => s.paymentTerms)` (carregado global em `src/lib/crm-sync.ts:480`). Não há coluna de segmento/tipo em `condicoes_pagamento`, nem tabela de junção cliente↔condição.

## 4) Mudança mínima para implementar depois

### (a) Tipo de cliente PJ/PF + CPF
- Migration: `ALTER TABLE public.clientes ADD COLUMN tipo_pessoa text NOT NULL DEFAULT 'PJ'`, `ADD COLUMN cpf text`; tornar `cnpj` opcional para PF (hoje é `NOT NULL` e único) — alternativa mais barata: manter `cnpj` como coluna de documento e usar `tipo_pessoa` para decidir a máscara/validação, gravando o CPF em `cpf` e deixando `cnpj` com valor vazio não é possível pelo unique — então o caminho correto é tornar `cnpj` nullable e criar unique parcial por `cpf`.
- `src/lib/cnpj.ts`: adicionar `isValidCpf` / `formatCpf`.
- `clientes.functions.ts:38` (`ClienteInput`) e `:65-88` (validação): validar CPF quando `tipo_pessoa = 'PF'`, CNPJ quando `'PJ'`; pular `cnpj_status`/lookup Receita no caso PF.
- `ClienteFormFields.tsx:110-176`: Select "Tipo de cliente" no topo do card Identificação; com PF, trocar "CNPJ" por "CPF", "Razão social" por "Nome completo" e esconder IE/Simples/SUFRAMA.
- `NovoClienteDialog.tsx:174` — esconder "Buscar dados na Receita" quando PF.

### (b) Restringir condições para PF
- Adicionar em `condicoes_pagamento` uma coluna de elegibilidade — mínimo: `permite_pf boolean NOT NULL DEFAULT false` (marcando `true` só nas à vista e nas de Cartão), evitando inferir por `splits`.
- Filtrar em `src/routes/propostas.$id.tsx:179-180`: quando o cliente do lead for PF, `activePaymentTerms` passa a exigir `permite_pf` (equivalente: `splits` = `[0]` **ou** `method = "Cartão"`), bloqueando Boleto a prazo.
- Validação de servidor ao salvar/enviar a proposta, para a regra não depender só da UI.
- Expor o toggle no formulário admin (`condicoes-comerciais.tsx:374-416`).

### (c) Cartão de crédito com acréscimo
- A condição já existe; falta a taxa. Mínimo: coluna `acrescimo_percent numeric NOT NULL DEFAULT 0` em `condicoes_pagamento`, editável em `/condicoes-comerciais`, aplicada no total da proposta (mesma trilha do `discountPercent`, `crm-store.ts:1403-1408`) e exibida na impressão.

Nada foi alterado — diagnóstico apenas.
