/**
 * Catálogo de cargos (aba "Cargos" em /usuarios).
 *
 * O cargo é INFORMATIVO: não concede permissão, não define papel nem perfil de
 * acesso. Um cargo em uso não pode ser desativado.
 */
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Loader2, Plus, Pencil, Power } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  listCargosAdmin,
  createCargo,
  renameCargo,
  setCargoAtivo,
  reorderCargos,
  type CargoRow,
} from "@/lib/cargos.functions";

export function CargosPanel() {
  const listar = useServerFn(listCargosAdmin);
  const criar = useServerFn(createCargo);
  const renomear = useServerFn(renameCargo);
  const alternar = useServerFn(setCargoAtivo);
  const reordenar = useServerFn(reorderCargos);

  const [rows, setRows] = useState<CargoRow[] | null>(null);
  const [novo, setNovo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editandoNome, setEditandoNome] = useState("");

  const load = useCallback(async () => {
    try {
      setRows((await listar({})) as CargoRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar cargos");
    }
  }, [listar]);

  useEffect(() => {
    void load();
  }, [load]);

  const acao = async (id: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(id);
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na operação");
    } finally {
      setBusy(null);
    }
  };

  const mover = async (index: number, delta: number) => {
    if (!rows) return;
    const destino = index + delta;
    if (destino < 0 || destino >= rows.length) return;
    const ids = rows.map((r) => r.id);
    const [item] = ids.splice(index, 1);
    ids.splice(destino, 0, item);
    await acao("ordem", () => reordenar({ data: { ids } }), "Ordem atualizada");
  };

  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle className="text-base">Cargos</CardTitle>
        <p className="text-sm text-muted-foreground">
          O cargo aparece na ficha da pessoa e nos relatórios. Ele não dá acesso a nada — quem
          define o que cada um pode fazer é o perfil de permissões.
        </p>
        <div className="flex gap-2">
          <Input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            placeholder="Novo cargo (ex.: Representante)"
            maxLength={80}
          />
          <Button
            className="gap-1 shrink-0"
            disabled={busy === "novo" || novo.trim().length < 2}
            onClick={() =>
              acao(
                "novo",
                async () => {
                  await criar({ data: { nome: novo.trim() } });
                  setNovo("");
                },
                "Cargo criado",
              )
            }
          >
            {busy === "novo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Adicionar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {!rows ? (
          <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">Nenhum cargo cadastrado ainda.</div>
        ) : (
          <div className="divide-y">
            {rows.map((c, i) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 p-3">
                <div className="flex flex-col">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-6"
                    title="Subir"
                    disabled={i === 0 || busy !== null}
                    onClick={() => void mover(i, -1)}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-5 w-6"
                    title="Descer"
                    disabled={i === rows.length - 1 || busy !== null}
                    onClick={() => void mover(i, 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="min-w-0 flex-1">
                  {editandoId === c.id ? (
                    <div className="flex gap-2">
                      <Input
                        value={editandoNome}
                        onChange={(e) => setEditandoNome(e.target.value)}
                        maxLength={80}
                        autoFocus
                      />
                      <Button
                        size="sm"
                        disabled={busy === c.id || editandoNome.trim().length < 2}
                        onClick={() =>
                          acao(
                            c.id,
                            async () => {
                              await renomear({ data: { id: c.id, nome: editandoNome.trim() } });
                              setEditandoId(null);
                            },
                            "Cargo renomeado",
                          )
                        }
                      >
                        Salvar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditandoId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className={c.ativo ? "font-medium" : "font-medium text-muted-foreground line-through"}>
                        {c.nome}
                      </span>
                      {!c.ativo && <Badge variant="secondary" className="text-[10px]">inativo</Badge>}
                      <Badge variant="outline" className="text-[10px]">
                        {c.emUso === 1 ? "1 pessoa" : `${c.emUso} pessoas`}
                      </Badge>
                    </div>
                  )}
                </div>

                {editandoId !== c.id && (
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Renomear"
                      onClick={() => {
                        setEditandoId(c.id);
                        setEditandoNome(c.nome);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title={c.ativo ? "Desativar" : "Ativar"}
                      disabled={busy === c.id}
                      onClick={() =>
                        acao(
                          c.id,
                          () => alternar({ data: { id: c.id, ativo: !c.ativo } }),
                          c.ativo ? "Cargo desativado" : "Cargo ativado",
                        )
                      }
                    >
                      {busy === c.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Power className={`h-4 w-4 ${c.ativo ? "text-emerald-600" : "text-muted-foreground"}`} />
                      )}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
