import * as React from 'react'

import { Body, Container, Head, Heading, Html, Preview, Text } from '@react-email/components'

import { emailStyles } from './marca'

interface ReauthenticationEmailProps {
  token: string
}

const s = emailStyles

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu código de verificação</Preview>
    <Body style={s.main}>
      <Container style={s.container}>
        <Text style={s.marca}>INPLASTIC - CRM</Text>
        <Heading style={s.h1}>Código de verificação</Heading>
        <Text style={s.text}>Use o código abaixo para confirmar a sua identidade:</Text>
        <Text style={s.codigo}>{token}</Text>
        <Text style={s.footer}>
          O código expira em poucos minutos. Se não foi você, ignore este e-mail.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail
