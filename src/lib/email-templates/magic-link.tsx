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

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

const s = emailStyles

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head>
      <style>{s.darkModeCss}</style>
    </Head>
    <Preview>Seu link de acesso ao {siteName}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.marca}>{siteName}</Text>
        <Heading style={s.h1}>Seu link de acesso</Heading>
        <Text style={s.text}>
          Use o botão abaixo para entrar no {siteName}. O link é de uso único e expira em pouco
          tempo.
        </Text>
        <Button className="dm-btn" style={s.button} href={confirmationUrl}>
          Entrar no CRM
        </Button>
        <Text style={s.footer}>Se não foi você que pediu, ignore este e-mail.</Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail
