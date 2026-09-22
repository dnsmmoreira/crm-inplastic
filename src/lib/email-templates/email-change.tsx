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

interface EmailChangeEmailProps {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

const s = emailStyles

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  email,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head>
      <style>{s.darkModeCss}</style>
    </Head>
    <Preview>Confirme a troca de e-mail no {siteName}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.marca}>{siteName}</Text>
        <Heading style={s.h1}>Confirme seu novo e-mail</Heading>
        <Text style={s.text}>
          Foi pedida a troca do e-mail de acesso de {oldEmail || email} para {newEmail}. Confirme
          no botão abaixo para concluir.
        </Text>
        <Button className="dm-btn" style={s.button} href={confirmationUrl}>
          Confirmar troca de e-mail
        </Button>
        <Text style={s.footer}>
          Se não foi você, ignore este e-mail e avise o administrador do CRM.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail
