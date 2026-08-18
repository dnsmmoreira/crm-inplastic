import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { listArenaAudit } from "@/lib/arena.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Row = Awaited<ReturnType<typeof listArenaAudit>>[number];

const ENTIDADES = [
  { id: "todas", label: "Todas as entidades" },
  { id: "arena_config", label: "Configuração" },
  { id: "arena_participacao", label: "Participação" },
  { id: "custo", label: "Custos" },
  { id: "receita", label: "Receitas" },
  { id: "licitacao", label: "Licitações" },
  { id: "aprovacao_extraordinaria", label: "Aprovações extraordinárias" },
  { id: "meta", label: "Metas" },
];

export function ArenaAuditPanel() {
  const load = useServerFn(listArenaAudit);
  const [entidade, setEntidade] = useState("todas");
  const [rows, setRows] = useState<Row[]>([]);
  const [carregado, setCarregado] = useState(false);

  const recarregar = useCallback(async () => {
    try {
      setRows(await load({ data: { limite: 200, ...(entidade === "todas" ? {} : { entidade }) } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar auditoria");
    } finally {
      setCarregado(true);
    }
  }, [entidade, load]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Auditoria unificada da ARENA</CardTitle>
            <p className="text-xs text-muted-foreground">
              Quem alterou, o que mudou, quando e por quê. Somente leitura.
            </p>
          </div>
          <Select value={entidade} onValueChange={setEntidade}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ENTIDADES.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {!carregado ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Nenhum registro de auditoria para o filtro selecionado.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quando</TableHead>
                <TableHead>Quem</TableHead>
                <TableHead>Entidade</TableHead>
                <TableHead>Campo</TableHead>
                <TableHead>De → Para</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs">
                    {new Date(r.criado_em).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.ator_nome}
                    {r.alvo_nome && <span className="text-muted-foreground"> → {r.alvo_nome}</span>}
                  </TableCell>
                  <TableCell className="text-xs">{r.entidade}</TableCell>
                  <TableCell className="text-xs">{r.campo}</TableCell>
                  <TableCell className="text-xs">
                    <span className="text-muted-foreground">{r.valor_anterior ?? "—"}</span> → {r.valor_novo ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[240px] text-xs">{r.motivo ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
