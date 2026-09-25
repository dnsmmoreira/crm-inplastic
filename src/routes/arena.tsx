import { createFileRoute } from "@tanstack/react-router";
import { ShieldAlert, Trophy } from "lucide-react";

import { useHasPerm } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArenaConfigPanel } from "@/components/arena/ArenaConfigPanel";
import { ArenaGestaoPanel } from "@/components/arena/ArenaGestaoPanel";
import { ArenaKellyPanel } from "@/components/arena/ArenaKellyPanel";
import { ArenaEquilibrioPanel } from "@/components/arena/ArenaEquilibrioPanel";
import { ArenaAprovacoesPanel } from "@/components/arena/ArenaAprovacoesPanel";
import { ArenaAuditPanel } from "@/components/arena/ArenaAuditPanel";

import { PaginaCabecalho } from "@/components/layout/PaginaCabecalho";
export const Route = createFileRoute("/arena")({
  head: () => ({
    meta: [
      { title: "ARENA — Gestão Econômica Comercial" },
      {
        name: "description",
        content:
          "Painel administrativo da ARENA: custo comercial, margem, metas, carência, canal representante e auditoria.",
      },
      { property: "og:title", content: "ARENA — Gestão Econômica Comercial" },
      {
        property: "og:description",
        content: "Indicadores econômicos, ponto de equilíbrio e governança de margem da operação comercial.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ArenaPage,
});

function ArenaPage() {
  const podeVer = useHasPerm("metas.definir");

  if (!podeVer) {
    return (
      <div className="p-4 md:p-8">
        <Card className="mx-auto max-w-lg">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-base">Acesso restrito</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Você não tem permissão para acessar esta tela.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-4 md:space-y-6">
      <PaginaCabecalho
        titulo="ARENA — Gestão Econômica Comercial"
        icone={<Trophy className="h-6 w-6 text-amber-500" />}
        descricao="Parâmetros, custo comercial, margem e governança. Nenhum valor é estimado: cards sem lançamento aparecem como vazios, não como zero."
      />

      <Tabs defaultValue="gestao">
        <TabsList>
          <TabsTrigger value="gestao">Gestão</TabsTrigger>
          <TabsTrigger value="kelly">Canal representante</TabsTrigger>
          <TabsTrigger value="equilibrio">Ponto de equilíbrio</TabsTrigger>
          <TabsTrigger value="aprovacoes">Aprovações</TabsTrigger>
          <TabsTrigger value="config">Configuração</TabsTrigger>
          <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
        </TabsList>

        <TabsContent value="gestao" className="mt-4"><ArenaGestaoPanel /></TabsContent>
        <TabsContent value="kelly" className="mt-4"><ArenaKellyPanel /></TabsContent>
        <TabsContent value="equilibrio" className="mt-4"><ArenaEquilibrioPanel /></TabsContent>
        <TabsContent value="aprovacoes" className="mt-4"><ArenaAprovacoesPanel /></TabsContent>
        <TabsContent value="config" className="mt-4"><ArenaConfigPanel /></TabsContent>
        <TabsContent value="auditoria" className="mt-4"><ArenaAuditPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
