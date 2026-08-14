import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import {
  CONDICOES_COMERCIAIS_KEY,
  formatDias,
  listarCondicoesComerciais,
  parseDias,
  type CondicaoComercial,
} from "@/lib/condicoes-comerciais";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * CRUD das condições comerciais (nome + prazos em dias) usadas para gerar
 * as parcelas da proposta. Sem exclusão física — apenas ativar/desativar.
 */
export function CondicoesComerciaisCard() {
  const qc = useQueryClient();
  const { data: rows = [], isLoading } = useQuery({
    queryKey: CONDICOES_COMERCIAIS_KEY,
    queryFn: listarCondicoesComerciais,
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CondicaoComercial | null>(null);
  const [nome, setNome] = useState("");
  const [diasRaw, setDiasRaw] = useState("");
  const [ativo, setAtivo] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: CONDICOES_COMERCIAIS_KEY });

  const salvar = useMutation({
    mutationFn: async (payload: { id?: string; nome: string; dias: number[]; ativo: boolean }) => {
      if (payload.id) {
        const { error } = await supabase
          .from("condicoes_comerciais")
          .update({ nome: payload.nome, dias: payload.dias, ativo: payload.ativo })
          .eq("id", payload.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("condicoes_comerciais")
          .insert({ nome: payload.nome, dias: payload.dias, ativo: payload.ativo });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      invalidate();
      setOpen(false);
      toast.success("Condição comercial salva");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alternarAtivo = useMutation({
    mutationFn: async (row: CondicaoComercial) => {
      const { error } = await supabase
        .from("condicoes_comerciais")
        .update({ ativo: !row.ativo })
        .eq("id", row.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const abrirNovo = () => {
    setEditing(null);
    setNome("");
    setDiasRaw("");
    setAtivo(true);
    setErro(null);
    setOpen(true);
  };

  const abrirEdicao = (row: CondicaoComercial) => {
    setEditing(row);
    setNome(row.nome);
    setDiasRaw(row.dias.join("/"));
    setAtivo(row.ativo);
    setErro(null);
    setOpen(true);
  };

  const submit = () => {
    const nomeTrim = nome.trim();
    if (nomeTrim.length < 2) return setErro("Informe o nome da condição (ex.: 21/28).");
    const { dias, erro: e } = parseDias(diasRaw);
    if (e) return setErro(e);
    setErro(null);
    salvar.mutate({ id: editing?.id, nome: nomeTrim, dias, ativo });
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="text-base">Condições Comerciais (prazos de faturamento)</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Cada condição gera as parcelas da proposta a partir da previsão de faturamento. 0 = à vista.
          </p>
        </div>
        <Button size="sm" onClick={abrirNovo}>
          <Plus className="h-4 w-4 mr-2" />
          Nova condição comercial
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Prazos (dias)</TableHead>
              <TableHead className="text-center">Parcelas</TableHead>
              <TableHead className="text-center">Ativa</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                  Carregando…
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                  Nenhuma condição comercial cadastrada.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.nome}</TableCell>
                <TableCell className="text-sm">{formatDias(r.dias)}</TableCell>
                <TableCell className="text-center">{r.dias.length}</TableCell>
                <TableCell className="text-center">
                  {r.ativo ? (
                    <Badge variant="default">Ativa</Badge>
                  ) : (
                    <Badge variant="outline">Inativa</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  <Button size="sm" variant="ghost" onClick={() => abrirEdicao(r)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => alternarAtivo.mutate(r)}>
                    {r.ativo ? "Desativar" : "Ativar"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar condição comercial" : "Nova condição comercial"}</DialogTitle>
            <DialogDescription>
              Informe o nome e os prazos em dias, em ordem crescente (0 = à vista).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: 21/28" />
            </div>
            <div>
              <Label>Prazos (dias)</Label>
              <Input
                value={diasRaw}
                onChange={(e) => setDiasRaw(e.target.value)}
                placeholder="Ex.: 21/28  ou  0/30/60/90"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Separe por barra ou vírgula. Use 0 para a parcela à vista.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={ativo} onCheckedChange={setAtivo} id="cc-ativo" />
              <Label htmlFor="cc-ativo">Disponível para os vendedores</Label>
            </div>
            {erro && <p className="text-sm text-destructive">{erro}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={salvar.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
