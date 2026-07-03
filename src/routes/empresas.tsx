import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ShieldAlert, Building2, Star, Save } from "lucide-react";
import { toast } from "sonner";

import { useCrm, useIsAdmin, type EmitterProfile } from "@/lib/crm-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/empresas")({
  component: EmpresasPage,
});

function EmpresasPage() {
  const isAdmin = useIsAdmin();
  const emitters = useCrm((s) => s.emitters);
  const defaultEmitterId = useCrm((s) => s.defaultEmitterId);
  const setDefaultEmitter = useCrm((s) => s.setDefaultEmitter);

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <Card className="border-destructive/40">
          <CardHeader className="flex flex-row items-center gap-3">
            <ShieldAlert className="h-6 w-6 text-destructive" />
            <CardTitle>Acesso restrito</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Somente administradores podem editar dados das empresas do grupo.{" "}
            <Link to="/" className="underline">
              Voltar ao dashboard
            </Link>
            .
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" /> Empresas do grupo
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cadastro dos CNPJs disponíveis para emissão de propostas. O vendedor escolhe qual
            empresa emitir na tela da proposta.
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {emitters.length} empresa{emitters.length === 1 ? "" : "s"} cadastrada
          {emitters.length === 1 ? "" : "s"}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Empresa padrão</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Novas propostas começam com a empresa marcada como padrão selecionada — o vendedor pode
          trocar por qualquer outra ao editar. Clique em <span className="font-medium">Definir como padrão</span> no card da empresa desejada.
        </CardContent>
      </Card>

      <Tabs defaultValue={emitters[0]?.id} className="w-full">
        <TabsList className="h-auto flex-wrap justify-start">
          {emitters.map((e) => (
            <TabsTrigger key={e.id} value={e.id} className="gap-2">
              {e.brand}
              {defaultEmitterId === e.id && (
                <Star className="h-3.5 w-3.5 fill-primary text-primary" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {emitters.map((e) => (
          <TabsContent key={e.id} value={e.id} className="mt-4">
            <EmitterForm
              emitter={e}
              isDefault={defaultEmitterId === e.id}
              onSetDefault={() => {
                setDefaultEmitter(e.id);
                toast.success(`${e.brand} agora é a empresa padrão para novas propostas.`);
              }}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function EmitterForm({
  emitter,
  isDefault,
  onSetDefault,
}: {
  emitter: EmitterProfile;
  isDefault: boolean;
  onSetDefault: () => void;
}) {
  const updateEmitter = useCrm((s) => s.updateEmitter);
  const [form, setForm] = useState<EmitterProfile>(emitter);
  const [dirty, setDirty] = useState(false);

  const patch = <K extends keyof EmitterProfile>(key: K, value: EmitterProfile[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDirty(true);
  };

  const save = () => {
    updateEmitter(emitter.id, {
      brand: form.brand.trim(),
      tagline: form.tagline?.trim(),
      legalName: form.legalName.trim(),
      cnpj: form.cnpj.trim(),
      ie: form.ie.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      whatsapp: form.whatsapp.trim(),
      email: form.email.trim(),
      website: form.website.trim(),
    });
    setDirty(false);
    toast.success(`Dados de ${form.brand} atualizados.`);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-lg">{emitter.brand}</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">CNPJ {emitter.cnpj}</p>
        </div>
        <div className="flex gap-2">
          {isDefault ? (
            <Badge className="gap-1">
              <Star className="h-3 w-3 fill-current" /> Empresa padrão
            </Badge>
          ) : (
            <Button variant="outline" size="sm" onClick={onSetDefault}>
              <Star className="h-3.5 w-3.5 mr-1" /> Definir como padrão
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <section className="space-y-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Marca no documento
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>Nome fantasia / marca</Label>
              <Input
                value={form.brand}
                onChange={(e) => patch("brand", e.target.value)}
                placeholder="Ex: INPLASTIC"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Aparece grande no topo da proposta.
              </p>
            </div>
            <div>
              <Label>Subtítulo (opcional)</Label>
              <Input
                value={form.tagline ?? ""}
                onChange={(e) => patch("tagline", e.target.value)}
                placeholder="Ex: Comércio de produtos plásticos"
              />
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Dados fiscais
          </div>
          <div>
            <Label>Razão social</Label>
            <Input value={form.legalName} onChange={(e) => patch("legalName", e.target.value)} />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>CNPJ</Label>
              <Input value={form.cnpj} onChange={(e) => patch("cnpj", e.target.value)} />
            </div>
            <div>
              <Label>Inscrição Estadual</Label>
              <Input value={form.ie} onChange={(e) => patch("ie", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Endereço completo</Label>
            <Textarea
              rows={2}
              value={form.address}
              onChange={(e) => patch("address", e.target.value)}
            />
          </div>
        </section>

        <section className="space-y-3">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Contato
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => patch("phone", e.target.value)} />
            </div>
            <div>
              <Label>WhatsApp</Label>
              <Input value={form.whatsapp} onChange={(e) => patch("whatsapp", e.target.value)} />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => patch("email", e.target.value)}
              />
            </div>
            <div>
              <Label>Site</Label>
              <Input value={form.website} onChange={(e) => patch("website", e.target.value)} />
            </div>
          </div>
        </section>

        <div className="flex items-center justify-between pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            {dirty ? "Você tem alterações não salvas." : "Nenhuma alteração pendente."}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setForm(emitter);
                setDirty(false);
              }}
              disabled={!dirty}
            >
              Descartar
            </Button>
            <Button onClick={save} disabled={!dirty}>
              <Save className="h-4 w-4 mr-1" /> Salvar alterações
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
