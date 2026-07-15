import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { reenviarPedidoOmie } from "@/lib/omie.functions";

type Empresa = "INPLASTIC" | "TAOPLAST" | "LICITAPLAS";
type OmieStatus = "enviado" | "erro" | "pendente" | "nao_aplicavel" | null;

type Row = {
  empresa: Empresa | null;
  omie_status: OmieStatus;
  omie_numero_pedido: string | null;
  omie_erro: string | null;
};

export function OmieLeadSection({ leadId }: { leadId: string }) {
  const [row, setRow] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const reenviar = useServerFn(reenviarPedidoOmie);

  async function load() {
    // A tabela `leads` está fora dos types gerados p/ estas colunas novas; usamos `any` de forma controlada.
    const client = supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (k: string, v: string) => {
            maybeSingle: () => Promise<{ data: Row | null; error: unknown }>;
          };
        };
      };
    };
    const { data } = await client
      .from("leads")
      .select("empresa, omie_status, omie_numero_pedido, omie_erro")
      .eq("id", leadId)
      .maybeSingle();
    if (data) setRow(data);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId]);

  async function setEmpresa(v: Empresa) {
    setSaving(true);
    const client = supabase as unknown as {
      from: (t: string) => {
        update: (patch: Record<string, unknown>) => {
          eq: (k: string, v: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    };
    const { error } = await client.from("leads").update({ empresa: v }).eq("id", leadId);
    setSaving(false);
    if (error) {
      toast.error("Falha ao salvar empresa", { description: error.message });
      return;
    }
    toast.success("Empresa atualizada");
    setRow((r) => (r ? { ...r, empresa: v } : { empresa: v, omie_status: null, omie_numero_pedido: null, omie_erro: null }));
  }

  async function handleReenviar() {
    const t = toast.loading("Liberando reenvio...");
    try {
      await reenviar({ data: { lead_id: leadId } });
      toast.dismiss(t);
      toast.success("Reenvio liberado. Mova o lead para Ganho novamente.");
      void load();
    } catch (e) {
      toast.dismiss(t);
      toast.error("Falha", { description: e instanceof Error ? e.message : String(e) });
    }
  }

  const status = row?.omie_status ?? null;

  return (
    <>
      <Separator />
      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Integração Omie
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Empresa</Label>
            <Select
              value={row?.empresa ?? ""}
              onValueChange={(v) => void setEmpresa(v as Empresa)}
              disabled={saving}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="INPLASTIC">INPLASTIC</SelectItem>
                <SelectItem value="TAOPLAST">TAOPLAST</SelectItem>
                <SelectItem value="LICITAPLAS">LICITAPLAS (sem Omie)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status do pedido</Label>
            <div className="mt-1 flex items-center gap-2 min-h-9">
              {status === "enviado" ? (
                <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30" variant="outline">
                  ✅ Pedido #{row?.omie_numero_pedido ?? "?"}
                </Badge>
              ) : status === "erro" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-red-500/15 text-red-700 border-red-500/30" variant="outline">
                    ❌ Erro
                  </Badge>
                  <Button size="sm" variant="outline" onClick={handleReenviar}>
                    Liberar reenvio
                  </Button>
                </div>
              ) : status === "pendente" ? (
                <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30" variant="outline">
                  ⏳ Enviando...
                </Badge>
              ) : status === "nao_aplicavel" ? (
                <Badge className="bg-muted text-muted-foreground" variant="outline">
                  ⚫ LICITAPLAS — sem Omie
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Nenhum pedido enviado ainda.
                </span>
              )}
            </div>
          </div>
        </div>
        {status === "erro" && row?.omie_erro && (
          <div className="text-xs text-red-700 bg-red-500/10 border border-red-500/30 rounded px-3 py-2">
            {row.omie_erro}
          </div>
        )}
      </div>
    </>
  );
}
