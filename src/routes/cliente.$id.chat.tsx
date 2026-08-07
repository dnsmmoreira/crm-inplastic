import { createFileRoute } from "@tanstack/react-router";
import { ClienteChatHub } from "@/components/chat/ClienteChatHub";

export const Route = createFileRoute("/cliente/$id/chat")({
  component: ClienteChatRoute,
  head: () => ({
    meta: [
      { title: "Chat Hub do Cliente — INPLASTIC - CRM" },
      {
        name: "description",
        content:
          "Central de conversas do cliente: WhatsApp e e-mail em um só painel, em tempo real.",
      },
      { property: "og:title", content: "Chat Hub do Cliente — INPLASTIC - CRM" },
      {
        property: "og:description",
        content:
          "Central de conversas do cliente: WhatsApp e e-mail em um só painel, em tempo real.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ClienteChatRoute() {
  const { id } = Route.useParams();
  return <ClienteChatHub clienteId={id} />;
}
