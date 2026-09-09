/**
 * Faixa "sem resposta agora": clientes esperando há mais de 30 minutos em
 * horário comercial, visível para toda a equipe. Só visibilidade — quem
 * assume usa o mesmo caminho de servidor do botão "Assumir".
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlarmClock, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { conversasSemRespostaAgora, assumirConversa } from "@/lib/atendimento.functions";

export function SemRespostaAgora({ onSelect }: { onSelect: (id: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const buscar = useServerFn(conversasSemRespostaAgora);
  const assumirFn = useServerFn(assumirConversa);
  const qc = useQueryClient();

  const { data } = useQuery({
    queryKey: ["conversas-sem-resposta-agora"],
    queryFn: () => buscar(),
    refetchInterval: 60_000,
  });

  const mAssumir = useMutation({
    mutationFn: (conversaId: string) => assumirFn({ data: { conversaId } }),
    onSuccess: (_r, id) => {
      toast.success("Conversa assumida.");
      void qc.invalidateQueries({ queryKey: ["conversas-sem-resposta-agora"] });
      onSelect(id);
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Não foi possível assumir."),
  });

  const itens = data?.itens ?? [];
  if (itens.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium"
      >
        <AlarmClock className="h-4 w-4 text-amber-600" />
        {itens.length === 1
          ? "1 cliente esperando resposta há mais de 30 min"
          : `${itens.length} clientes esperando resposta há mais de 30 min`}
        {aberto ? (
          <ChevronUp className="ml-auto h-4 w-4" />
        ) : (
          <ChevronDown className="ml-auto h-4 w-4" />
        )}
      </button>

      {aberto && (
        <ul className="divide-y border-t">
          {itens.map((i) => (
            <li key={i.conversaId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <button
                type="button"
                onClick={() => onSelect(i.conversaId)}
                className="font-medium underline-offset-2 hover:underline"
              >
                {i.nome}
              </button>
              <span className="text-xs text-muted-foreground">
                {i.dono ? `com ${i.dono}` : "sem responsável"} · há{" "}
                {i.minutos >= 60
                  ? `${Math.floor(i.minutos / 60)}h${String(i.minutos % 60).padStart(2, "0")}`
                  : `${i.minutos} min`}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-7"
                disabled={mAssumir.isPending}
                onClick={() => {
                  if (!window.confirm(`Assumir o atendimento de ${i.nome}?`)) return;
                  mAssumir.mutate(i.conversaId);
                }}
              >
                Assumir
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
