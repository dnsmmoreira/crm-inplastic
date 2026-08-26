import * as React from "react";
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

export interface PropostaEmailProps {
  numero?: string;
  cliente?: string;
  contato?: string;
  total?: string;
  validade?: string;
  link?: string;
  vendedor?: string;
  emitente?: string;
}

function PropostaEmail({
  numero = "0000",
  cliente = "Cliente",
  contato = "",
  total = "",
  validade = "",
  link = "https://crm.inplastic.com.br",
  vendedor = "",
  emitente = "Inplastic",
}: PropostaEmailProps) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>{`Proposta comercial nº ${numero}`}</Preview>
      <Body style={{ backgroundColor: "#f4f5f7", fontFamily: "Arial, Helvetica, sans-serif", margin: 0, padding: "24px 0" }}>
        <Container style={{ backgroundColor: "#ffffff", borderRadius: 12, maxWidth: 600, padding: 0, overflow: "hidden", border: "1px solid #e5e7eb" }}>
          <Section style={{ backgroundColor: "#0f172a", padding: "24px 32px" }}>
            <Text style={{ color: "#ffffff", fontSize: 18, fontWeight: 700, margin: 0 }}>{emitente}</Text>
            <Text style={{ color: "#94a3b8", fontSize: 12, margin: "4px 0 0" }}>Proposta comercial</Text>
          </Section>

          <Section style={{ padding: "28px 32px" }}>
            <Heading as="h1" style={{ fontSize: 20, color: "#0f172a", margin: "0 0 8px" }}>
              {`Proposta nº ${numero}`}
            </Heading>
            <Text style={{ fontSize: 14, color: "#334155", margin: "0 0 16px" }}>
              {contato ? `Olá, ${contato}!` : "Olá!"} Segue a proposta comercial preparada para
              {" "}<strong>{cliente}</strong>. Você pode visualizar todos os itens, condições e prazos
              pelo link abaixo.
            </Text>

            {total ? (
              <Text style={{ fontSize: 14, color: "#334155", margin: "0 0 4px" }}>
                <strong>Valor total:</strong> {total}
              </Text>
            ) : null}
            {validade ? (
              <Text style={{ fontSize: 14, color: "#334155", margin: "0 0 4px" }}>
                <strong>Validade:</strong> {validade}
              </Text>
            ) : null}

            <Section style={{ textAlign: "center", padding: "24px 0 8px" }}>
              <Button
                href={link}
                style={{
                  backgroundColor: "#2563eb",
                  color: "#ffffff",
                  borderRadius: 8,
                  fontSize: 15,
                  fontWeight: 600,
                  padding: "12px 28px",
                  textDecoration: "none",
                }}
              >
                Ver proposta
              </Button>
            </Section>

            <Text style={{ fontSize: 12, color: "#64748b", margin: "8px 0 0", wordBreak: "break-all" }}>
              Se o botão não funcionar, copie e cole este endereço no navegador: {link}
            </Text>

            <Hr style={{ borderColor: "#e5e7eb", margin: "24px 0 16px" }} />
            <Text style={{ fontSize: 12, color: "#64748b", margin: 0 }}>
              {vendedor ? `Qualquer dúvida, fale com ${vendedor}.` : "Qualquer dúvida, estamos à disposição."}
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const template = {
  component: PropostaEmail,
  displayName: "Proposta comercial",
  subject: (data: Record<string, any>) => `Proposta comercial nº ${data?.numero ?? ""}`.trim(),
  previewData: {
    numero: "2026-0088",
    cliente: "CASA DE CARNES NOTRIA LTDA",
    contato: "João",
    total: "R$ 12.480,00",
    validade: "15 dias",
    link: "https://crm.inplastic.com.br/proposta-publica/00000000-0000-0000-0000-000000000000",
    vendedor: "Equipe comercial",
    emitente: "Inplastic",
  },
} satisfies TemplateEntry;
