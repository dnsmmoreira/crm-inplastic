# Desenho — Caso 1 (contato duplicado) e DIFAL/Inscrição Estadual

Feito agora, sem esperar aprovação: a tarefa órfã da Verapaz (40485be9) passou para o Daniel.
Caso 3: sem ação, confirmado.

---

## Parte A — Caso 1: contato novo cai sempre no dono certo

### O que acontece hoje (causa dos dois "Mauricio")
Existem três portas de entrada de contato, cada uma com uma regra diferente:

1. **WhatsApp (mensagem recebida)** — procura a conversa pelo telefone em dois
   formatos (com e sem o 55) e, se não achar, procura um lead só pelo campo
   `telefone_whatsapp` **em formato exato**. Foi aqui que o "5519996733919"
   não encontrou o lead gravado como "19996733919" e nasceu um segundo lead.
2. **Lead externo (OPA/n8n)** — normaliza o telefone e já consulta a carteira;
   é a porta mais correta hoje, mas não olha CNPJ.
3. **Cadastro manual na tela** — grava o lead direto, sem nenhuma checagem de
   duplicidade.

A regra de carteira (que compara DDD + os 8 últimos dígitos, imune ao 55 e ao
nono dígito) só é consultada depois, e apenas para decidir o dono da conversa —
nunca para evitar a criação de um lead repetido.

### Desenho proposto
Uma única porta de entrada compartilhada, `resolverContatoEntrada`, usada pelas
três rotas acima, com esta ordem:

1. Normaliza telefone (chave DDD + 8 dígitos), CNPJ (14 dígitos) e e-mail.
2. Procura **cliente da carteira** por telefone ou CNPJ → vincula ao cliente e
   entrega ao vendedor dele. Não cria lead novo nem entra em rodízio.
3. Procura **lead ativo** (etapa não encerrada) por telefone ou CNPJ → reaproveita
   esse lead, vincula a conversa a ele e mantém o dono atual.
4. Só quando nada bate, cria lead novo e segue o rodízio de hoje.
5. Empresa/nome sozinhos **não** vinculam automaticamente — geram apenas um aviso
   de "possível duplicidade" na tela do vendedor, para ele decidir. Nome é fraco
   demais para mesclar sozinho.

Detalhes:
- A busca por telefone passa a usar a mesma chave da carteira em todos os
  caminhos (fim do casamento por texto exato).
- Quando o CNPJ chega depois (lead que nasceu só com telefone), a regra já
  existente de "CNPJ que chega depois" continua valendo e agora também aponta
  leads irmãos ativos.
- Nada é apagado: quando dois leads ativos batem entre si, o mais novo é
  marcado como duplicado e a conversa migra para o canônico, com nota no
  histórico e aviso ao dono.
- Teste de aceitação com o caso real: 1205330c e 97df561a devem ser reconhecidos
  como o mesmo contato (5519996733919 ≡ 19996733919).

Não mexe em RLS/policies. Precisa de uma consulta nova no banco para "lead ativo
por telefone/CNPJ" (função de leitura, nos mesmos moldes de `localizar_carteira`).

---

## Parte B — DIFAL / Inscrição Estadual

### O que já existe
- `leads.inscricao_estadual` e `clientes.inscricao_estadual`, com a marca
  "isento de IE" no cadastro de cliente.
- UF do destinatário no cadastro (`estado`).
- Na proposta: subtotal, desconto, acréscimo, frete e total. **Não existe**
  nenhuma tabela de alíquota, nem UF de origem no cadastro do emitente
  (o emitente só tem endereço em texto livre), nem campo de DIFAL.

Ou seja: hoje não há de onde tirar a alíquota. Ela precisa ser criada.

### Proposta de desenho (preciso da sua confirmação)
1. **Origem da alíquota**: uma tabela de configuração por UF de destino, com
   alíquota interna do estado de destino e alíquota interestadual (7% ou 12%
   conforme a UF de origem). A UF de origem passa a ser um campo do emitente
   (hoje inexistente) — sugiro MG, confirme.
   O DIFAL é a diferença entre a alíquota interna do destino e a interestadual,
   aplicada quando o destinatário não tem inscrição estadual (consumidor final
   não contribuinte).
2. **Quando entra**: só quando o cliente/lead da proposta está sem inscrição
   estadual e não está marcado como isento, e a UF de destino é diferente da UF
   de origem.
3. **Automático ou sugestão**: sugiro **calcular automaticamente e deixar
   editável** — a proposta já nasce com o valor certo, e quem monta pode ajustar
   ou zerar com um clique, ficando registrado quem alterou. Confirme se prefere
   totalmente automático e travado.
4. **Onde aparece**: linha própria no bloco de totais, logo depois do acréscimo
   e antes do frete — "DIFAL (destinatário sem inscrição estadual) — R$ X" —
   somada ao total, e repetida na proposta pública/PDF.
5. **Alerta**: aviso amarelo na tela da proposta e no cadastro do cliente/lead:
   "Sem inscrição estadual — DIFAL aplicado".

### Pontos que preciso que você decida
- UF de origem da empresa (uma só ou uma por emitente?).
- Base de cálculo: base simples (valor × diferença de alíquota) ou base dupla /
  "por dentro"? Isso muda o valor final e não dá para adivinhar.
- Automático travado ou automático editável.
- A tabela de alíquotas por UF: eu preencho com os valores públicos atuais e
  você revisa, ou você me manda a tabela usada pela contabilidade?

Só implemento depois da sua resposta nesses quatro pontos.
