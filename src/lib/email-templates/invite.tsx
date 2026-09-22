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

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

const s = emailStyles

export const InviteEmail = ({ siteName, siteUrl, confirmationUrl }: InviteEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head>
      <style>{s.darkModeCss}</style>
    </Head>
    <Preview>Seu acesso ao {siteName}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.marca}>{siteName}</Text>
        <Heading style={s.h1}>Você foi convidado para o CRM</Heading>
        <Text style={s.text}>
          Um administrador criou o seu acesso ao {siteName} ({siteUrl}). Clique no botão abaixo
          para definir a sua senha e entrar. O link é de uso único e expira em pouco tempo.
        </Text>
        <Button className="dm-btn" style={s.button} href={confirmationUrl}>
          Definir minha senha
        </Button>
        <Text style={s.footer}>
          Se você não esperava este convite, pode ignorar este e-mail.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail
