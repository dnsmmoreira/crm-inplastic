import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Trash2, ShieldAlert, Truck } from "lucide-react";
import { toast } from "sonner";

import { useHasPerm } from "@/hooks/use-auth";
import {
  atualizarTransportadora,
  criarTransportadora,
  excluirTransportadora,
  listarTransportadoras,
  type TransportadoraRow,
} from "@/lib/transportadoras.functions";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/transportadoras")({
  head: () => ({
    meta: [
      { title: "Transportadoras — CRM" },
      {
        name: "description",
        content: "Cadastro das transportadoras disponíveis para escolha nas propostas comerciais.",
      },
      { property: "og:title", content: "Transportadoras — CRM" },
      {
        property: "og:description",
        content: "Cadastro das transportadoras disponíveis para escolha nas propostas comerciais.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TransportadorasPage,
});

function TransportadorasPage() {
  const podeGerenciar = useHasPerm("empresas.editar");
  const qc = useQueryClient();
  const listar = useServerFn(listarTransportadoras);
  const criar = useServerFn(criarTransportadora);
  const atualizar = useServerFn(atualizarTransportadora);
  const excluir = useServerFn(excluirTransportadora);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TransportadoraRow | null>(null);
  const [nome, setNome] = useState("");
  const [ativo, setAtivo] = useState(true);

  const q = useQuery({
    queryKey: ["transportadoras"],
    queryFn: () => listar({ data: undefined as never }),
    enabled: podeGerenciar,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["transportadoras"] });

  const mSalvar = useMutation({
    mutationFn: async () => {
      const n = nome.trim();
      if (n.length < 2) throw new Error("Informe o nome da transportadora");
      if (editing) return atualizar({ data: { id: editing.id, nome: n, ativo } });
      return criar({ data: { nome: n } });
    },
    onSuccess: () => {
      toast.success(editing ? "Transportadora atualizada" : "Transportadora cadastrada");
      setDialogOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mToggle = useMutation({
    mutationFn: (t: TransportadoraRow) => atualizar({ data: { id: t.id, ativo: !t.ativo } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const mExcluir = useMutation({
    mutationFn: (t: TransportadoraRow) => excluir({ data: { id: t.id } }),
    onSuccess: () => {
      toast.success("Transportadora removida");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!podeGerenciar) {
    return (
      <div className="p-4 md:p-8">
        <Card className="max-w-lg mx-auto">
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-base">Acesso restrito</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Você não tem permissão para acessar esta tela.</p>
            <Button asChild variant="outline" size="sm">
              <Link to="/propostas">Voltar para Propostas</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const rows = q.data ?? [];
  const ativas = rows.filter((t) => t.ativo).length;

  const openNew = () => {
    setEditing(null);
    setNome("");
    setAtivo(true);
    setDialogOpen(true);
  };

  const openEdit = (t: TransportadoraRow) => {
    setEditing(t);
    setNome(t.nome);
    setAtivo(t.ativo);
    setDialogOpen(true);
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" /> Transportadoras
          </h1>
          <p className="text-sm text-muted-foreground">
            Cadastro das transportadoras que o vendedor pode escolher na proposta.{" "}
            <span className="font-medium text-foreground">{ativas}</span> de {rows.length} ativas.
          </p>
        </div>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-2" /> Nova transportadora
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catálogo</CardTitle>
        </CardHeader>
        <CardContent>
          {q.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma transportadora cadastrada ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead className="w-40 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.nome}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Switch checked={t.ativo} onCheckedChange={() => mToggle.mutate(t)} />
                        <Badge variant={t.ativo ? "default" : "outline"}>
                          {t.ativo ? "Ativa" : "Inativa"}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover {t.nome}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Propostas antigas continuam mostrando o nome escolhido na época.
                              Se preferir apenas tirar da lista, desative em vez de remover.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => mExcluir.mutate(t)}>
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar transportadora" : "Nova transportadora"}</DialogTitle>
            <DialogDescription>
              Somente o nome — a escolha de quem entrega é feita na proposta.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Transportadora Rodoviária XYZ"
              />
            </div>
            {editing && (
              <div className="flex items-center gap-2">
                <Switch checked={ativo} onCheckedChange={setAtivo} />
                <Label className="font-normal">Ativa (aparece na proposta)</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => mSalvar.mutate()} disabled={mSalvar.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
