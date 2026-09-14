import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ClipboardList, Printer } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  atualizarFichaColeta,
  atualizarItemFichaColeta,
  emitirFichaColeta,
  getFichaColeta,
  mudarStatusFichaColeta,
} from "@/lib/ficha-coleta.functions";
import {
  FICHA_STATUS_LABEL,
  fichaEditavel,
  formatarCubagem,
  formatarPeso,
  itensSemMedida,
} from "@/lib/ficha-coleta";

export const Route = createFileRoute("/ficha-coleta/$id")({
  head: () => ({
    meta: [
      { title: "Ficha de Coleta — CRM" },
      {
        name: "description",
        content: "Autorização de coleta do pedido: itens, peso, cubagem, transportadora e contato.",
      },
      { property: "og:title", content: "Ficha de Coleta — CRM" },
      {
        property: "og:description",
        content: "Autorização de coleta do pedido: itens, peso, cubagem, transportadora e contato.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FichaColetaPage,
});

function FichaColetaPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const carregar = useServerFn(getFichaColeta);
  const salvar = useServerFn(atualizarFichaColeta);
  const salvarItem = useServerFn(atualizarItemFichaColeta);
  const emitir = useServerFn(emitirFichaColeta);
  const mudarStatus = useServerFn(mudarStatusFichaColeta);

  const q = useQuery({ queryKey: ["ficha-coleta", id], queryFn: () => carregar({ data: { id } }) });
  const ficha = q.data?.ficha;
  const itens = q.data?.itens ?? [];
  const editavel = ficha ? fichaEditavel(ficha.status) : false;
  const pendentes = itensSemMedida(itens);

  const [form, setForm] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!ficha) return;
    setForm({
      transportadora_nome: ficha.transportadora_nome ?? "",
      modalidade_entrega: ficha.modalidade_entrega ?? "",
      contato_nome: ficha.contato_nome ?? "",
      contato_telefone: ficha.contato_telefone ?? "",
      previsao_coleta_data: ficha.previsao_coleta_data ?? "",
      previsao_coleta_hora: ficha.previsao_coleta_hora ?? "",
      motorista: ficha.motorista ?? "",
      placa: ficha.placa ?? "",
      volumes: ficha.volumes ?? "",
      observacoes: ficha.observacoes ?? "",
    });
  }, [ficha?.id, ficha?.updated_at]);

  const campo = (k: string) => form[k] ?? "";
  const setCampo = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const recarregar = () => qc.invalidateQueries({ queryKey: ["ficha-coleta", id] });

  const mSalvar = useMutation({
    mutationFn: () =>
      salvar({
        data: {
          id,
          transportadora_nome: campo("transportadora_nome") || null,
          modalidade_entrega: campo("modalidade_entrega") || null,
          contato_nome: campo("contato_nome") || null,
          contato_telefone: campo("contato_telefone") || null,
          previsao_coleta_data: campo("previsao_coleta_data") || null,
          previsao_coleta_hora: campo("previsao_coleta_hora") || null,
          motorista: campo("motorista") || null,
          placa: campo("placa") || null,
          volumes: campo("volumes") || null,
          observacoes: campo("observacoes") || null,
        },
      }),
    onSuccess: () => {
      toast.success("Ficha salva");
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mItem = useMutation({
    mutationFn: (v: { item_id: string; peso_kg?: number | null; cubagem_m3?: number | null }) =>
      salvarItem({ data: v }),
    onSuccess: recarregar,
    onError: (e: Error) => toast.error(e.message),
  });

  const mEmitir = useMutation({
    mutationFn: () => emitir({ data: { id } }),
    onSuccess: () => {
      toast.success("Ficha emitida — os dados estão congelados");
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mStatus = useMutation({
    mutationFn: (v: { status: "em_coleta" | "coletada" | "cancelada"; motivo?: string }) =>
      mudarStatus({ data: { id, ...v } }),
    onSuccess: () => {
      toast.success("Status atualizado");
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <p className="p-8 text-sm text-muted-foreground">Carregando ficha…</p>;
  if (q.error)
    return (
      <p className="p-8 text-sm text-destructive">
        {q.error instanceof Error ? q.error.message : "Falha ao carregar a ficha."}
      </p>
    );
  if (!ficha) return <p className="p-8 text-sm text-muted-foreground">Ficha não encontrada.</p>;

  const cancelar = () => {
    const motivo = window.prompt("Motivo do cancelamento:")?.trim();
    if (!motivo) return;
    mStatus.mutate({ status: "cancelada", motivo });
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" /> {ficha.numero}
          </h1>
          <p className="text-sm text-muted-foreground">
            Pedido{" "}
            <Link to="/pedidos" className="underline">
              {(q.data?.pedido as { number?: string } | null)?.number ?? "—"}
            </Link>{" "}
            · <Badge variant={ficha.status === "cancelada" ? "outline" : "default"}>
              {FICHA_STATUS_LABEL[ficha.status]}
            </Badge>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {editavel && (
            <>
              <Button variant="outline" onClick={() => mSalvar.mutate()} disabled={mSalvar.isPending}>
                Salvar rascunho
              </Button>
              <Button onClick={() => mEmitir.mutate()} disabled={mEmitir.isPending}>
                Emitir ficha
              </Button>
            </>
          )}
          {ficha.status !== "rascunho" && (
            <Button asChild variant="outline" className="gap-2">
              <Link to="/ficha-coleta/$id/imprimir" params={{ id }}>
                <Printer className="h-4 w-4" /> Imprimir / PDF
              </Link>
            </Button>
          )}
          {ficha.status === "emitida" && (
            <Button variant="outline" onClick={() => mStatus.mutate({ status: "em_coleta" })}>
              Marcar em coleta
            </Button>
          )}
          {(ficha.status === "emitida" || ficha.status === "em_coleta") && (
            <>
              <Button variant="outline" onClick={() => mStatus.mutate({ status: "coletada" })}>
                Marcar como coletada
              </Button>
              <Button variant="ghost" className="text-destructive" onClick={cancelar}>
                Cancelar ficha
              </Button>
            </>
          )}
          {ficha.status === "rascunho" && (
            <Button variant="ghost" className="text-destructive" onClick={cancelar}>
              Cancelar ficha
            </Button>
          )}
        </div>
      </div>

      {!editavel && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          Esta ficha já foi emitida: os dados estão congelados. Para mudar alguma coisa, cancele e
          gere uma nova — o número {ficha.numero} não é reaproveitado.
        </div>
      )}

      {editavel && pendentes.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm flex gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive" />
          <span>
            {pendentes.length} item(ns) sem peso ou cubagem no cadastro do produto. Informe os
            valores à mão abaixo — eles ficam marcados como informados manualmente.
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da coleta</CardTitle>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <div>
            <Label>Transportadora</Label>
            <Input
              value={campo("transportadora_nome")}
              disabled={!editavel}
              onChange={(e) => setCampo("transportadora_nome", e.target.value)}
            />
          </div>
          <div>
            <Label>Modalidade de entrega</Label>
            <Input
              value={campo("modalidade_entrega")}
              disabled={!editavel}
              onChange={(e) => setCampo("modalidade_entrega", e.target.value)}
            />
          </div>
          <div>
            <Label>Contato responsável</Label>
            <Input
              value={campo("contato_nome")}
              disabled={!editavel}
              onChange={(e) => setCampo("contato_nome", e.target.value)}
            />
          </div>
          <div>
            <Label>Telefone do contato</Label>
            <Input
              value={campo("contato_telefone")}
              disabled={!editavel}
              onChange={(e) => setCampo("contato_telefone", e.target.value)}
            />
          </div>
          <div>
            <Label>Previsão de coleta (data)</Label>
            <Input
              type="date"
              value={campo("previsao_coleta_data")}
              disabled={!editavel}
              onChange={(e) => setCampo("previsao_coleta_data", e.target.value)}
            />
          </div>
          <div>
            <Label>Horário</Label>
            <Input
              value={campo("previsao_coleta_hora")}
              disabled={!editavel}
              placeholder="Ex: 14h às 17h"
              onChange={(e) => setCampo("previsao_coleta_hora", e.target.value)}
            />
          </div>
          <div>
            <Label>Motorista</Label>
            <Input
              value={campo("motorista")}
              disabled={!editavel}
              onChange={(e) => setCampo("motorista", e.target.value)}
            />
          </div>
          <div>
            <Label>Placa do veículo</Label>
            <Input
              value={campo("placa")}
              disabled={!editavel}
              onChange={(e) => setCampo("placa", e.target.value)}
            />
          </div>
          <div>
            <Label>Volumes / embalagem</Label>
            <Input
              value={campo("volumes")}
              disabled={!editavel}
              placeholder="Ex: 6 caixas em 1 palete"
              onChange={(e) => setCampo("volumes", e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Observações de carregamento</Label>
            <Textarea
              rows={2}
              value={campo("observacoes")}
              disabled={!editavel}
              onChange={(e) => setCampo("observacoes", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Itens — {formatarPeso(ficha.peso_total_kg)} · {formatarCubagem(ficha.cubagem_m3)}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="w-24">Qtd.</TableHead>
                <TableHead className="w-40">Peso (kg)</TableHead>
                <TableHead className="w-40">Cubagem (m³)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <div className="font-medium">{i.descricao}</div>
                    <div className="text-xs text-muted-foreground">{i.sku}</div>
                  </TableCell>
                  <TableCell>
                    {i.quantidade} {i.unidade ?? ""}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.001"
                      disabled={!editavel}
                      defaultValue={i.peso_kg ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        const n = v === "" ? null : Number(v);
                        if (n === (i.peso_kg ?? null)) return;
                        mItem.mutate({ item_id: i.id, peso_kg: n });
                      }}
                    />
                    {i.peso_manual && (
                      <span className="text-[11px] text-amber-600">informado manualmente</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.0001"
                      disabled={!editavel}
                      defaultValue={i.cubagem_m3 ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        const n = v === "" ? null : Number(v);
                        if (n === (i.cubagem_m3 ?? null)) return;
                        mItem.mutate({ item_id: i.id, cubagem_m3: n });
                      }}
                    />
                    {i.cubagem_manual && (
                      <span className="text-[11px] text-amber-600">informado manualmente</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {(q.data?.historico ?? []).length === 0 ? (
            <p className="text-muted-foreground">Sem eventos ainda.</p>
          ) : (
            (q.data?.historico ?? []).map((h) => (
              <div key={h.id} className="border-b pb-2 last:border-0">
                <div>{h.descricao}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(h.created_at).toLocaleString("pt-BR")}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
