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

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

const s = emailStyles

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head>
      <style>{s.darkModeCss}</style>
    </Head>
    <Preview>Confirme seu e-mail no {siteName}</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.marca}>{siteName}</Text>
        <Heading style={s.h1}>Confirme seu e-mail</Heading>
        <Text style={s.text}>
          Confirme o endereço {recipient} para ativar o seu acesso ao {siteName} ({siteUrl}).
        </Text>
        <Button className="dm-btn" style={s.button} href={confirmationUrl}>
          Confirmar e-mail
        </Button>
        <Text style={s.footer}>
          Se não foi você, pode ignorar este e-mail com segurança.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail
