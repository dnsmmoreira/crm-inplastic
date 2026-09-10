/**
 * Roster de representantes.
 *
 * ESCOPO: acesso, atividade e os dados de representação (comissão própria e
 * região) — gravados em `arena_participacao`, a mesma linha que diz se a
 * pessoa entra no placar. Criação/edição do usuário continua em `/usuarios`.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Handshake, Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import {
  atualizarDadosRepresentante,
  listRepresentantes,
  type RepresentanteLinha,
} from "@/lib/representantes.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/representantes")({
  head: () => ({
    meta: [
      { title: "Representantes — CRM" },
      {
        name: "description",
        content:
          "Roster de representantes com acesso ao sistema: carteira, leads abertos, propostas do mês e participação na Arena.",
      },
      { property: "og:title", content: "Representantes — CRM" },
      {
        property: "og:description",
        content: "Quem representa a marca, o que cada um tem em mãos e quem entra no placar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RepresentantesPage,
});

const fmtData = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

function RepresentantesPage() {
  const listar = useServerFn(listRepresentantes);
  const salvar = useServerFn(atualizarDadosRepresentante);

  const [rows, setRows] = useState<RepresentanteLinha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<RepresentanteLinha | null>(null);
  const [participa, setParticipa] = useState(false);
  const [comissao, setComissao] = useState("");
  const [regiao, setRegiao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const load = useCallback(async () => {
    try {
      setErro(null);
      const data = (await listar()) as RepresentanteLinha[];
      setRows(data);
    } catch (e) {
      setRows([]);
      setErro(e instanceof Error ? e.message : "Falha ao carregar representantes");
    }
  }, [listar]);

  useEffect(() => {
    void load();
  }, [load]);

  const abrir = (r: RepresentanteLinha) => {
    setEditando(r);
    setParticipa(r.participaArena);
    setComissao(r.comissaoPct === null ? "" : String(r.comissaoPct));
    setRegiao(r.regiao ?? "");
  };

  const confirmar = async () => {
    if (!editando) return;
    const bruto = comissao.trim().replace(",", ".");
    const pct = bruto === "" ? null : Number(bruto);
    if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
      toast.error("Informe a comissão como um número entre 0 e 100.");
      return;
    }
    setSalvando(true);
    try {
      await salvar({
        data: {
          userId: editando.id,
          participaArena: participa,
          comissaoPct: pct,
          regiao: regiao.trim() || null,
        },
      });
      toast.success("Representante atualizado");
      setEditando(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível salvar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Handshake className="h-6 w-6" /> Representantes
          </h1>
          <p className="text-sm text-muted-foreground">
            Representante usa o sistema como vendedor, mas é medido por comissão — por isso fica
            fora do placar.
          </p>
        </div>
        <Button asChild>
          <Link to="/usuarios">
            <Plus className="mr-2 h-4 w-4" /> Novo representante
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quem está no time</CardTitle>
        </CardHeader>
        <CardContent>
          {erro ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{erro}</p>
          ) : rows === null ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Ninguém com o cargo Representante ainda. Cadastre em Usuários.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Placar</TableHead>
                    <TableHead className="text-right">Carteira</TableHead>
                    <TableHead className="text-right">Leads abertos</TableHead>
                    <TableHead className="text-right">Propostas no mês</TableHead>
                    <TableHead>Última atividade</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.nome}</TableCell>
                      <TableCell>
                        {r.excluido ? (
                          <Badge variant="outline">Excluído</Badge>
                        ) : r.ativo ? (
                          <Badge variant="secondary">Ativo</Badge>
                        ) : (
                          <Badge variant="outline">Inativo</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.participaArena ? "default" : "outline"}>
                          {r.participaArena ? "Participa" : "Fora"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{r.carteira}</TableCell>
                      <TableCell className="text-right">{r.leadsAbertos}</TableCell>
                      <TableCell className="text-right">{r.propostasMes}</TableCell>
                      <TableCell>{fmtData(r.ultimaAtividade)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => abrir(r)}>
                          <Pencil className="mr-1 h-4 w-4" /> Editar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editando} onOpenChange={(v) => !v && setEditando(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editando?.nome}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-between gap-4 py-2">
            <div>
              <Label htmlFor="participa-arena">Participa do placar/Arena</Label>
              <p className="text-xs text-muted-foreground">
                Representante normalmente fica fora — é medido por comissão.
              </p>
            </div>
            <Switch id="participa-arena" checked={participa} onCheckedChange={setParticipa} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={() => void confirmar()} disabled={salvando}>
              {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
