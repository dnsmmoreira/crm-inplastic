import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { decidirAprovacaoExtraordinaria, listAprovacoesExtraordinarias } from "@/lib/arena.functions";
import { pct } from "@/lib/arena";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Row = Awaited<ReturnType<typeof listAprovacoesExtraordinarias>>[number];

export function ArenaAprovacoesPanel() {
  const load = useServerFn(listAprovacoesExtraordinarias);
  const decidir = useServerFn(decidirAprovacaoExtraordinaria);
  const [rows, setRows] = useState<Row[]>([]);
  const [obs, setObs] = useState<Record<string, string>>({});
  const [carregado, setCarregado] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      setRows(await load());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar aprovações");
    } finally {
      setCarregado(true);
    }
  }, [load]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  const acao = async (id: string, decisao: "aprovada" | "recusada") => {
    const observacao = (obs[id] ?? "").trim();
    if (!observacao) {
      toast.error("Informe o motivo da decisão — ele fica registrado na auditoria");
      return;
    }
    try {
      await decidir({ data: { id, decisao, observacao } });
      toast.success(decisao === "aprovada" ? "Aprovação extraordinária concedida" : "Solicitação recusada");
      void recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar a decisão");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Aprovação Extraordinária da Diretoria</CardTitle>
        <p className="text-xs text-muted-foreground">
          Propostas abaixo do piso de margem. A decisão exige motivo e é registrada na auditoria da ARENA.
        </p>
      </CardHeader>
      <CardContent>
        {!carregado ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Nenhuma solicitação registrada.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proposta</TableHead>
                <TableHead>Solicitante</TableHead>
                <TableHead>Margem</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Decisão</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.proposta_numero}</TableCell>
                  <TableCell>{r.solicitante_nome}</TableCell>
                  <TableCell className="text-xs">
                    {r.margem_proposta_pct === null ? "—" : pct(Number(r.margem_proposta_pct))} / mín.{" "}
                    {r.margem_minima_pct === null ? "—" : pct(Number(r.margem_minima_pct))}
                  </TableCell>
                  <TableCell className="max-w-[240px] text-xs">{r.motivo}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === "pendente" ? "secondary" : r.status === "aprovada" ? "default" : "destructive"}>
                      {r.status}
                    </Badge>
                    {r.aprovador_nome && <div className="mt-1 text-[11px] text-muted-foreground">por {r.aprovador_nome}</div>}
                  </TableCell>
                  <TableCell>
                    {r.status === "pendente" ? (
                      <div className="flex flex-col gap-2">
                        <Input
                          placeholder="Motivo da decisão"
                          value={obs[r.id] ?? ""}
                          onChange={(e) => setObs((o) => ({ ...o, [r.id]: e.target.value }))}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => void acao(r.id, "aprovada")}>Aprovar</Button>
                          <Button size="sm" variant="outline" onClick={() => void acao(r.id, "recusada")}>Recusar</Button>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{r.observacao ?? "—"}</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
