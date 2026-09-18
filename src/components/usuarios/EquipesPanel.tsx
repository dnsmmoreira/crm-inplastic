/**
 * Catálogo de equipes comerciais (aba "Equipes" em /usuarios).
 *
 * A equipe define o que um Supervisor ADM enxerga (leitura). O nome é apenas
 * rótulo — renomear não muda regra nenhuma.
 */
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Plus, Pencil, Power } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  listEquipesAdmin,
  createEquipe,
  renameEquipe,
  setEquipeAtiva,
  type EquipeRow,
} from "@/lib/equipes.functions";

export function EquipesPanel() {
  const listar = useServerFn(listEquipesAdmin);
  const criar = useServerFn(createEquipe);
  const renomear = useServerFn(renameEquipe);
  const alternar = useServerFn(setEquipeAtiva);

  const [rows, setRows] = useState<EquipeRow[] | null>(null);
  const [novo, setNovo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editandoNome, setEditandoNome] = useState("");

  const load = useCallback(async () => {
    try {
      setRows((await listar({})) as EquipeRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar equipes");
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

  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle className="text-base">Equipes</CardTitle>
        <p className="text-sm text-muted-foreground">
          A equipe de cada pessoa define o que um Supervisor ADM consegue acompanhar. O nome é só
          para exibição — pode renomear à vontade.
        </p>
        <div className="flex gap-2">
          <Input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            placeholder="Nova equipe (ex.: Equipe Sul)"
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
                "Equipe criada",
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
          <div className="p-6 text-sm text-muted-foreground">Nenhuma equipe cadastrada ainda.</div>
        ) : (
          <div className="divide-y">
            {rows.map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-2 p-3">
                <div className="min-w-0 flex-1">
                  {editandoId === e.id ? (
                    <div className="flex gap-2">
                      <Input
                        value={editandoNome}
                        onChange={(ev) => setEditandoNome(ev.target.value)}
                        maxLength={80}
                        autoFocus
                      />
                      <Button
                        size="sm"
                        disabled={busy === e.id || editandoNome.trim().length < 2}
                        onClick={() =>
                          acao(
                            e.id,
                            async () => {
                              await renomear({ data: { id: e.id, nome: editandoNome.trim() } });
                              setEditandoId(null);
                            },
                            "Equipe renomeada",
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
                      <span className={e.ativo ? "font-medium" : "font-medium text-muted-foreground line-through"}>
                        {e.nome}
                      </span>
                      {!e.ativo && <Badge variant="secondary" className="text-[10px]">inativa</Badge>}
                      <Badge variant="outline" className="text-[10px]">
                        {e.emUso === 1 ? "1 pessoa" : `${e.emUso} pessoas`}
                      </Badge>
                    </div>
                  )}
                </div>

                {editandoId !== e.id && (
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      title="Renomear"
                      onClick={() => {
                        setEditandoId(e.id);
                        setEditandoNome(e.nome);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      title={e.ativo ? "Desativar" : "Ativar"}
                      disabled={busy === e.id}
                      onClick={() =>
                        acao(
                          e.id,
                          () => alternar({ data: { id: e.id, ativo: !e.ativo } }),
                          e.ativo ? "Equipe desativada" : "Equipe ativada",
                        )
                      }
                    >
                      {busy === e.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Power className={`h-4 w-4 ${e.ativo ? "text-emerald-600" : "text-muted-foreground"}`} />
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
