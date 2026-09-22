/**
 * Rota legada: nenhum e-mail aponta mais para cá (convite e reenvio usam
 * /definir-senha). Mantida apenas para links antigos ainda na caixa de
 * entrada: redireciona imediatamente para /definir-senha preservando a query
 * string e o hash (é no hash que vem o token do Supabase), de forma que o
 * fluxo passe pelas proteções da rota nova.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/aceitar-convite")({
  component: AceitarConviteLegado,
});

function AceitarConviteLegado() {
  useEffect(() => {
    const { search, hash } = window.location;
    window.location.replace(`/definir-senha${search}${hash}`);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Redirecionando…
      </p>
    </div>
  );
}
