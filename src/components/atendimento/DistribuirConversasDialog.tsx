import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Users, AlertTriangle } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listarConversasSemAtribuicao,
  listarVendedoresAtendimento,
  atribuirConversasEmLote,
} from "@/lib/atendimento.functions";

type ConversaPendente = {
  id: string;
  name: string | null;
  phone: string;
  requerHumano: boolean;
  paradaDesde: string;
};

type Vendedor = { id: string; name: string };

const SEM_RESPONSAVEL = "none";

export function DistribuirConversasDialog({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [conversas, setConversas] = useState<ConversaPendente[]>([]);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const listarConversas = useServerFn(listarConversasSemAtribuicao);
  const listarVendedores = useServerFn(listarVendedoresAtendimento);
  const salvar = useServerFn(atribuirConversasEmLote);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [c, v] = await Promise.all([listarConversas(), listarVendedores()]);
      setConversas(c as ConversaPendente[]);
      setVendedores(v);
    } catch (e) {
      toast.error("Falha ao carregar conversas", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }, [listarConversas, listarVendedores]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    if (open) void carregar();
  }, [open, carregar]);

  const selecionadas = useMemo(
    () => Object.entries(escolhas).filter(([, v]) => v && v !== SEM_RESPONSAVEL),
    [escolhas],
  );

  function aplicarAosRestantes(vendedorId: string) {
    setEscolhas((prev) => {
      const next = { ...prev };
      for (const c of conversas) {
        if (!next[c.id] || next[c.id] === SEM_RESPONSAVEL) next[c.id] = vendedorId;
      }
      return next;
    });
  }

  async function handleSalvar() {
    if (selecionadas.length === 0) return;
    setSaving(true);
    try {
      const res = await salvar({
        data: {
          atribuicoes: selecionadas.map(([conversaId, vendedorId]) => ({ conversaId, vendedorId })),
        },
      });
      toast.success(`${res.atribuidas} conversa(s) atribuída(s)`, {
        description:
          res.ignoradas > 0
            ? `${res.ignoradas} já tinham responsável e foram ignoradas.`
            : undefined,
      });
      setEscolhas({});
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error("Falha ao salvar atribuições", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Users className="h-4 w-4" />
          Distribuir conversas
          {conversas.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {conversas.length}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Distribuir conversas sem responsável</DialogTitle>
          <DialogDescription>
            Escolha um vendedor para cada conversa. Nada é salvo até você clicar em salvar; as
            conversas deixadas em branco continuam sem responsável.
          </DialogDescription>
        </DialogHeader>

        {vendedores.length > 0 && conversas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2 text-xs">
            <span className="text-muted-foreground">Aplicar às restantes:</span>
            {vendedores.map((v) => (
              <Button
                key={v.id}
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => aplicarAosRestantes(v.id)}
              >
                {v.name}
              </Button>
            ))}
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => setEscolhas({})}
            >
              Limpar escolhas
            </Button>
          </div>
        )}

        <div className="max-h-[50vh] overflow-auto rounded-lg border divide-y">
          {loading && (
            <div className="p-8 text-center text-sm text-muted-foreground">Carregando…</div>
          )}
          {!loading && conversas.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Todas as conversas já têm responsável.
            </div>
          )}
          {!loading &&
            conversas.map((c) => (
              <div key={c.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {c.name?.trim() || c.phone}
                    </span>
                    {c.requerHumano && (
                      <Badge
                        variant="outline"
                        className="gap-1 border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-600"
                      >
                        <AlertTriangle className="h-3 w-3" /> pediu humano
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.phone} ·{" "}
                    {formatDistanceToNow(new Date(c.paradaDesde), {
                      locale: ptBR,
                      addSuffix: true,
                    })}
                  </div>
                </div>
                <Select
                  value={escolhas[c.id] ?? SEM_RESPONSAVEL}
                  onValueChange={(v) => setEscolhas((prev) => ({ ...prev, [c.id]: v }))}
                >
                  <SelectTrigger className="h-8 w-[190px] text-xs">
                    <SelectValue placeholder="Escolher vendedor…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SEM_RESPONSAVEL}>Sem responsável</SelectItem>
                    {vendedores.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {selecionadas.length} de {conversas.length} com vendedor escolhido
          </span>
          <Button onClick={handleSalvar} disabled={saving || selecionadas.length === 0}>
            Salvar atribuições
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
