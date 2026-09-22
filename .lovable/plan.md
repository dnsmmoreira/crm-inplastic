# "Esqueci minha senha" na tela de login

## Diagnóstico primeiro: por que os convites não chegaram

Verifiquei antes de planejar qualquer tela.

- **Quem envia hoje:** os e-mails de autenticação (convite, recuperação) saem pelo remetente padrão do Lovable, não por um domínio seu. O domínio próprio de envio **existe mas falhou**: `notify.crm.inplastic.com.br` ficou 14 dias aguardando DNS e a verificação expirou ("provisioning timed out — os registros NS não conferem").
- **Logs de envio:** não há nenhum evento de entrega na janela visível (30 dias). Ou seja: não há prova de entrega dos convites da Maxicaixa, e o caminho de envio está em estado falho.
- **Consequência prática:** e-mails de autenticação enviados por remetente genérico, sem SPF/DKIM no seu domínio, caem em spam ou são recusados por servidores corporativos — exatamente o que aconteceu com `@maxicaixa.com.br`.
- **Observação:** os e-mails de proposta ao cliente usam outro caminho (Resend, `propostas@notify.inplastic.com.br`) e não dependem disso.

### O que só você pode fazer (passo a passo)

Sem isto, o e-mail de redefinição continuará não chegando de forma confiável.

1. Abra **Configurações do projeto → E-mail** e veja o domínio de envio `notify.crm.inplastic.com.br`.
2. No provedor de DNS do domínio `crm.inplastic.com.br` (hoje o DNS de `inplastic.com.br` está na Hostinger), cadastre exatamente os registros mostrados nessa tela:
   - um registro **TXT** de verificação em `_lovable-email.crm.inplastic.com.br`;
   - **dois registros NS** para `notify.crm.inplastic.com.br`, apontando para o par de servidores indicado na tela.
   Copie os valores da tela — eles são exclusivos do seu projeto e não devem ser digitados de memória.
3. Volte em Configurações → E-mail e clique em **Verificar**. A propagação pode levar algumas horas.
4. Quando `aginext.com.br` entrar, repita o mesmo procedimento para o segundo domínio, se quiser remetente próprio também lá.
5. **Endereços de redirecionamento do login:** confirme na configuração de autenticação que `https://crm.inplastic.com.br` e `https://crm.aginext.com.br` estão liberados como endereços de retorno. Hoje o segundo ainda não está — ele só pode ser liberado depois que o domínio for conectado ao projeto.

Enquanto o DNS não estiver verificado, a funcionalidade funciona, mas a entrega continua no remetente padrão (risco de spam). Nada disso bloqueia a implementação.

## O que vou construir

### 1. Link na tela de login
Em `/auth`, um link "Esqueci minha senha" abre um painel com campo de e-mail e botão "Enviar link". A resposta é **sempre** a mesma frase, exista o e-mail ou não: "Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha." Nenhuma diferença de texto, de tempo ou de erro entre e-mail existente e inexistente.

O servidor já tem a função de recuperação genérica pronta (`solicitarRecuperacaoSenha`) — vou reaproveitá-la, apenas ajustando o texto e a auditoria.

### 2. Página de redefinição
A página `/definir-senha` já existe e já é usada pelos convites: valida o link, pede a senha duas vezes e aplica as mesmas regras de senha do sistema. Vou reaproveitá-la, com três acertos:

- ao concluir, marcar `senha_reset_exigido = false` (hoje ela não faz isso, então quem tem a marca ainda cairia na tela de troca obrigatória logo depois);
- bloquear conta inativa ou excluída (`ativo = false` ou `deleted_at`) antes de aplicar a nova senha — hoje o bloqueio existe no login e nas funções internas, mas não nessa página;
- deixar a pessoa já entrar no CRM ao concluir, em vez de voltar para o login.

A checagem de senha vazada continua sendo aplicada pelo provedor de autenticação (é ela que já recusou senhas fracas antes) — a mensagem de recusa passa a explicar em português que a senha apareceu em vazamentos.

### 3. Endereço do link
O link do e-mail é montado com `appUrl("/definir-senha")` do helper único — já é assim hoje. Ele acompanha automaticamente a troca para `crm.aginext.com.br`, sem endereço fixo em lugar nenhum.

### 4. Limite de tentativas
- O provedor de autenticação já aplica um limite próprio de e-mails por hora no projeto inteiro (baixo por padrão) e um intervalo mínimo entre envios ao mesmo endereço.
- No nosso lado já existe limite por e-mail (3 pedidos a cada 15 minutos). Vou **acrescentar limite por IP** (ex.: 10 pedidos a cada 15 minutos) e, ao estourar, manter a mesma resposta genérica — nunca um erro que denuncie o e-mail.
- Recomendo, depois que o domínio estiver verificado, elevar o limite horário de e-mails de autenticação para um valor compatível com o uso real.

### 5. Registro em auditoria
Cada pedido de recuperação e cada redefinição concluída entram em `user_audit_log` (campo, autor, data). Nunca a senha, nunca o token, nunca o link.

### 6. Texto do e-mail em português
Os e-mails de autenticação hoje usam o texto padrão em inglês. Vou criar os modelos próprios do CRM em português, com a identidade visual do sistema (título "INPLASTIC — CRM", cor primária, botão "Criar nova senha", aviso de validade e de "ignore se não foi você"). Esses modelos passam a valer para convite, recuperação e demais e-mails de acesso. Eles só saem do remetente próprio depois do passo de DNS acima.

## Detalhes técnicos

- `src/routes/auth.tsx`: novo estado de "recuperação" no formulário, chamando `solicitarRecuperacaoSenha` (`src/lib/invites.functions.ts`).
- `src/lib/invites.functions.ts`: rate limit adicional por IP, auditoria do pedido, mensagem alinhada ao texto pedido.
- Nova server function de conclusão de redefinição (sessão de recuperação): valida `ativo`/`deleted_at`, zera `senha_reset_exigido`, registra auditoria.
- `src/routes/definir-senha.tsx`: usar essa função ao concluir e seguir para `/` em vez de `/auth`.
- Modelos de e-mail de autenticação em português criados pelo scaffold oficial de e-mails de autenticação, com estilo lido de `src/styles.css`.
- Sem alteração em regras de acesso (RLS), sem alteração para a INPLASTIC nem para o fluxo de troca obrigatória em `/trocar-senha`.

## Validação antes de fechar

- Teste de que a resposta é idêntica para e-mail existente e inexistente.
- Teste de que conta inativa/excluída não consegue redefinir.
- Teste de que `senha_reset_exigido` fica falso após a redefinição.
- Teste dos limites por e-mail e por IP.
- Saída real de verificação de tipos, suíte completa e build.

Nada será publicado.
