import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, Trash2, ShieldAlert, Truck, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useHasPerm } from "@/hooks/use-auth";
import { lookupCnpj } from "@/lib/cnpj.functions";
import { DIFAL_ALIQUOTAS_PADRAO } from "@/lib/difal";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  const [form, setForm] = useState<Record<string, string>>({});
  const [ufs, setUfs] = useState<string[]>([]);
  const [buscandoCnpj, setBuscandoCnpj] = useState(false);
  const buscarCnpj = useServerFn(lookupCnpj);

  const campo = (k: string) => form[k] ?? "";
  const setCampo = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const toggleUf = (uf: string) =>
    setUfs((atual) => (atual.includes(uf) ? atual.filter((u) => u !== uf) : [...atual, uf].sort()));

  const preencherPorCnpj = async () => {
    const digitos = campo("cnpj").replace(/\D/g, "");
    if (digitos.length !== 14) {
      toast.error("Informe os 14 dígitos do CNPJ");
      return;
    }
    setBuscandoCnpj(true);
    try {
      const r = await buscarCnpj({ data: { cnpj: digitos } });
      setForm((f) => ({
        ...f,
        cnpj: digitos,
        razao_social: r.razaoSocial || f.razao_social || "",
        ie: r.inscricaoEstadual || f.ie || "",
        telefone: r.telefone || f.telefone || "",
        email: r.email || f.email || "",
        cep: r.endereco.cep || "",
        logradouro: r.endereco.logradouro || "",
        numero: r.endereco.numero || "",
        complemento: r.endereco.complemento || "",
        bairro: r.endereco.bairro || "",
        cidade: r.endereco.cidade || "",
        uf: r.endereco.uf || "",
      }));
      if (!nome.trim()) setNome(r.nomeFantasia || r.razaoSocial || "");
      toast.success("Dados carregados pelo CNPJ");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBuscandoCnpj(false);
    }
  };

  const q = useQuery({
    queryKey: ["transportadoras"],
    queryFn: () => listar({ data: undefined as never }),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["transportadoras"] });

  const mSalvar = useMutation({
    mutationFn: async () => {
      const n = nome.trim();
      if (n.length < 2) throw new Error("Informe o nome da transportadora");
      const dados = {
        nome: n,
        cnpj: campo("cnpj").replace(/\D/g, "") || null,
        razao_social: campo("razao_social") || null,
        ie: campo("ie") || null,
        cep: campo("cep") || null,
        logradouro: campo("logradouro") || null,
        numero: campo("numero") || null,
        complemento: campo("complemento") || null,
        bairro: campo("bairro") || null,
        cidade: campo("cidade") || null,
        uf: campo("uf").toUpperCase().slice(0, 2) || null,
        telefone: campo("telefone") || null,
        email: campo("email") || null,
        abrangencia_ufs: ufs,
      };
      if (editing) return atualizar({ data: { id: editing.id, ativo, ...dados } });
      return criar({ data: dados });
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




  const rows = q.data ?? [];
  const ativas = rows.filter((t) => t.ativo).length;

  const openNew = () => {
    setEditing(null);
    setNome("");
    setAtivo(true);
    setForm({});
    setUfs([]);
    setDialogOpen(true);
  };

  const openEdit = (t: TransportadoraRow) => {
    setEditing(t);
    setNome(t.nome);
    setAtivo(t.ativo);
    setForm({
      cnpj: t.cnpj ?? "",
      razao_social: t.razao_social ?? "",
      ie: t.ie ?? "",
      cep: t.cep ?? "",
      logradouro: t.logradouro ?? "",
      numero: t.numero ?? "",
      complemento: t.complemento ?? "",
      bairro: t.bairro ?? "",
      cidade: t.cidade ?? "",
      uf: t.uf ?? "",
      telefone: t.telefone ?? "",
      email: t.email ?? "",
    });
    setUfs(t.abrangencia_ufs ?? []);
    setDialogOpen(true);
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <PaginaCabecalho
        titulo="Transportadoras"
        icone={<Truck className="h-5 w-5 text-primary" />}
        descricao={
          <>
            Cadastro das transportadoras que o vendedor pode escolher na proposta.{" "}
            <span className="font-medium text-foreground">{ativas}</span> de {rows.length} ativas.
          </>
        }
        resumoMobile={`${ativas} de ${rows.length} ativas`}
        acoes={
          podeGerenciar ? (
            <Button size="sm" className="h-10 md:h-8" onClick={openNew}>
              <Plus className="h-4 w-4 mr-2" /> Nova transportadora
            </Button>
          ) : undefined
        }
      />

      {!podeGerenciar && (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <ShieldAlert className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <p className="text-muted-foreground">
            Modo somente leitura: a gestão do cadastro é feita pela administração. Para usar uma
            transportadora que ainda não está na lista, cadastre direto pelo campo Transportador da
            proposta.
          </p>
        </div>
      )}


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
            <TabelaResponsiva
              mobile={rows.map((t) => (
                <LinhaLista
                  key={t.id}
                  titulo={t.nome}
                  subtitulo={juntarCampos(t.cnpj, (t.abrangencia_ufs ?? []).join(", "))}
                  acento={t.ativo ? "bg-success" : "bg-muted-foreground/40"}
                  abaixo={
                    <span className={t.ativo ? "font-medium text-success" : "font-medium text-muted-foreground"}>
                      {t.ativo ? "Ativa" : "Inativa"}
                    </span>
                  }
                  acoes={
                    podeGerenciar ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-10 w-10 -mr-2" aria-label="Ações">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(t)}>
                            <Pencil className="h-4 w-4" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => mToggle.mutate(t)}>
                            {t.ativo ? "Desativar" : "Ativar"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              if (
                                confirm(
                                  `Remover ${t.nome}? Propostas antigas continuam mostrando o nome escolhido na época.`,
                                )
                              )
                                mExcluir.mutate(t);
                            }}
                          >
                            <Trash2 className="h-4 w-4" /> Remover
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : undefined
                  }
                />
              ))}
            >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-40">CNPJ</TableHead>
                  <TableHead>Abrangência</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  {podeGerenciar && <TableHead className="w-40 text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.nome}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.cnpj || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {(t.abrangencia_ufs ?? []).length
                        ? (t.abrangencia_ufs ?? []).join(", ")
                        : "Não informada"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {podeGerenciar && (
                          <Switch checked={t.ativo} onCheckedChange={() => mToggle.mutate(t)} />
                        )}
                        <Badge variant={t.ativo ? "default" : "outline"}>
                          {t.ativo ? "Ativa" : "Inativa"}
                        </Badge>
                      </div>
                    </TableCell>
                    {podeGerenciar && (
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
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </TabelaResponsiva>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar transportadora" : "Nova transportadora"}</DialogTitle>
            <DialogDescription>
              Dados usados na proposta e na Ficha de Coleta. Busque pelo CNPJ para preencher
              endereço e razão social automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <Label>CNPJ</Label>
                <div className="flex gap-2">
                  <Input
                    value={campo("cnpj")}
                    onChange={(e) => setCampo("cnpj", e.target.value)}
                    placeholder="00.000.000/0000-00"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={preencherPorCnpj}
                    disabled={buscandoCnpj}
                  >
                    {buscandoCnpj ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div>
                <Label>Nome</Label>
                <Input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Transportadora Rodoviária XYZ"
                />
              </div>
              <div className="md:col-span-2">
                <Label>Razão social</Label>
                <Input
                  value={campo("razao_social")}
                  onChange={(e) => setCampo("razao_social", e.target.value)}
                />
              </div>
              <div>
                <Label>Inscrição Estadual</Label>
                <Input value={campo("ie")} onChange={(e) => setCampo("ie", e.target.value)} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input
                  value={campo("telefone")}
                  onChange={(e) => setCampo("telefone", e.target.value)}
                />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input value={campo("email")} onChange={(e) => setCampo("email", e.target.value)} />
              </div>
              <div>
                <Label>CEP</Label>
                <Input value={campo("cep")} onChange={(e) => setCampo("cep", e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <Label>Logradouro</Label>
                <Input
                  value={campo("logradouro")}
                  onChange={(e) => setCampo("logradouro", e.target.value)}
                />
              </div>
              <div>
                <Label>Número</Label>
                <Input value={campo("numero")} onChange={(e) => setCampo("numero", e.target.value)} />
              </div>
              <div>
                <Label>Complemento</Label>
                <Input
                  value={campo("complemento")}
                  onChange={(e) => setCampo("complemento", e.target.value)}
                />
              </div>
              <div>
                <Label>Bairro</Label>
                <Input value={campo("bairro")} onChange={(e) => setCampo("bairro", e.target.value)} />
              </div>
              <div>
                <Label>Cidade</Label>
                <Input value={campo("cidade")} onChange={(e) => setCampo("cidade", e.target.value)} />
              </div>
              <div>
                <Label>UF</Label>
                <Input
                  value={campo("uf")}
                  maxLength={2}
                  onChange={(e) => setCampo("uf", e.target.value.toUpperCase())}
                />
              </div>
            </div>

            <div>
              <Label>Abrangência (estados atendidos)</Label>
              <div className="mt-2 grid grid-cols-4 sm:grid-cols-6 gap-2">
                {DIFAL_ALIQUOTAS_PADRAO.map((a) => (
                  <label key={a.uf} className="flex items-center gap-1.5 text-sm">
                    <Checkbox
                      checked={ufs.includes(a.uf)}
                      onCheckedChange={() => toggleUf(a.uf)}
                    />
                    {a.uf}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {ufs.length ? `${ufs.length} estado(s) selecionado(s).` : "Nenhum estado marcado."}
              </p>
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
