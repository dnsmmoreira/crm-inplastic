import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from '@react-email/components'

import { emailStyles } from './marca'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

const s = emailStyles

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head>
      <style>{s.darkModeCss}</style>
    </Head>
    <Preview>Criar uma nova senha no {siteName}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.marca}>{siteName}</Text>
        <Heading style={s.h1}>Criar uma nova senha</Heading>
        <Text style={s.text}>
          Recebemos um pedido para redefinir a sua senha do {siteName}. Clique no botão abaixo
          para escolher uma nova senha. O link é de uso único e expira em pouco tempo.
        </Text>
        <Button className="dm-btn" style={s.button} href={confirmationUrl}>
          Criar nova senha
        </Button>
        <Text style={s.footer}>
          Se você não pediu a troca de senha, pode ignorar este e-mail com segurança: a sua
          senha continua a mesma.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail
