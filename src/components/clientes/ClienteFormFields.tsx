import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCnpj } from "@/lib/cnpj";
import { formatCep } from "@/lib/format";
import type { ClienteInput, ClienteRow } from "@/lib/clientes.functions";

export type ClienteFormState = ClienteInput;

export function emptyCliente(cnpjInicial = ""): ClienteFormState {
  return {
    cnpj: cnpjInicial,
    razao_social: "",
    nome_fantasia: "",
    inscricao_estadual: "",
    ie_isento: false,
    endereco: "",
    numero: "",
    complemento: "",
    bairro: "",
    cep: "",
    cidade: "",
    estado: "",
    contato: "",
    email: "",
    telefone: "",
    telefone2: "",
    website: "",
    observacao: "",
    empresa_padrao: "",
    vendedor_id: null,
    ativo: true,
    simples_optante: null,
    suframa_isento: null,
    suframa_numero: "",
  };
}

export function fromRow(r: ClienteRow): ClienteFormState {
  return {
    cnpj: r.cnpj,
    razao_social: r.razao_social,
    nome_fantasia: r.nome_fantasia ?? "",
    inscricao_estadual: r.inscricao_estadual ?? "",
    ie_isento: !!r.ie_isento,
    endereco: r.endereco ?? "",
    numero: r.numero ?? "",
    complemento: r.complemento ?? "",
    bairro: r.bairro ?? "",
    cep: r.cep ?? "",
    cidade: r.cidade ?? "",
    estado: r.estado ?? "",
    contato: r.contato ?? "",
    email: r.email ?? "",
    telefone: r.telefone ?? "",
    telefone2: r.telefone2 ?? "",
    website: r.website ?? "",
    observacao: r.observacao ?? "",
    empresa_padrao: r.empresa_padrao ?? "",
    vendedor_id: r.vendedor_id,
    ativo: r.ativo,
    simples_optante: r.simples_optante,
    suframa_isento: r.suframa_isento,
    suframa_numero: r.suframa_numero ?? "",
  };
}

export type Vendedor = { id: string; name: string; avatarColor: string; roles: string[] };

type Props = {
  value: ClienteFormState;
  onChange: (patch: Partial<ClienteFormState>) => void;
  cnpjDisabled?: boolean;
  readOnly?: boolean;
  isAdmin?: boolean;
  vendedores?: Vendedor[];
  showInternal?: boolean; // "Interno" card
};

export function ClienteFormFields({
  value,
  onChange,
  cnpjDisabled,
  readOnly,
  isAdmin,
  vendedores,
  showInternal = true,
}: Props) {
  const [cnpjMasked, setCnpjMasked] = useState(formatCnpj(value.cnpj));
  const [cepMasked, setCepMasked] = useState(formatCep(value.cep ?? ""));

  useEffect(() => setCnpjMasked(formatCnpj(value.cnpj)), [value.cnpj]);
  useEffect(() => setCepMasked(formatCep(value.cep ?? "")), [value.cep]);

  const disabled = !!readOnly;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Identificação</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>CNPJ *</Label>
            <Input
              value={cnpjMasked}
              disabled={disabled || cnpjDisabled}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 14);
                onChange({ cnpj: digits });
                setCnpjMasked(formatCnpj(digits));
              }}
              placeholder="00.000.000/0000-00"
            />
          </div>
          <div>
            <Label>Razão social *</Label>
            <Input
              value={value.razao_social}
              disabled={disabled}
              onChange={(e) => onChange({ razao_social: e.target.value })}
            />
          </div>
          <div>
            <Label>Nome fantasia</Label>
            <Input
              value={value.nome_fantasia ?? ""}
              disabled={disabled}
              onChange={(e) => onChange({ nome_fantasia: e.target.value })}
            />
          </div>
          <div>
            <Label>Empresa padrão *</Label>
            <Select
              value={value.empresa_padrao || undefined}
              onValueChange={(v) => onChange({ empresa_padrao: v })}
              disabled={disabled}
            >
              <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="INPLASTIC">INPLASTIC</SelectItem>
                <SelectItem value="TAOPLAST">TAOPLAST</SelectItem>
                <SelectItem value="LICITAPLAS">LICITAPLAS</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 flex items-end gap-3">
            <div className="flex-1">
              <Label>Inscrição estadual</Label>
              <Input
                value={value.ie_isento ? "" : (value.inscricao_estadual ?? "")}
                disabled={disabled || !!value.ie_isento}
                onChange={(e) => onChange({ inscricao_estadual: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 pb-2">
              <Switch
                checked={!!value.ie_isento}
                disabled={disabled}
                onCheckedChange={(c) => onChange({ ie_isento: c, inscricao_estadual: c ? "" : (value.inscricao_estadual ?? "") })}
              />
              <span className="text-sm">Isento</span>
            </label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Endereço</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-4">
            <Label>Endereço</Label>
            <Input value={value.endereco ?? ""} disabled={disabled}
              onChange={(e) => onChange({ endereco: e.target.value })} />
          </div>
          <div className="md:col-span-1">
            <Label>Número</Label>
            <Input value={value.numero ?? ""} disabled={disabled}
              onChange={(e) => onChange({ numero: e.target.value })} />
          </div>
          <div className="md:col-span-1">
            <Label>CEP</Label>
            <Input
              value={cepMasked}
              disabled={disabled}
              onChange={(e) => {
                const d = e.target.value.replace(/\D/g, "").slice(0, 8);
                onChange({ cep: d });
                setCepMasked(formatCep(d));
              }}
              placeholder="00000-000"
            />
          </div>
          <div className="md:col-span-2">
            <Label>Complemento</Label>
            <Input value={value.complemento ?? ""} disabled={disabled}
              onChange={(e) => onChange({ complemento: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label>Bairro</Label>
            <Input value={value.bairro ?? ""} disabled={disabled}
              onChange={(e) => onChange({ bairro: e.target.value })} />
          </div>
          <div className="md:col-span-1">
            <Label>UF</Label>
            <Input value={value.estado ?? ""} maxLength={2} disabled={disabled}
              onChange={(e) => onChange({ estado: e.target.value.toUpperCase() })} />
          </div>
          <div className="md:col-span-1" />
          <div className="md:col-span-4">
            <Label>Cidade</Label>
            <Input value={value.cidade ?? ""} disabled={disabled}
              onChange={(e) => onChange({ cidade: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Contato</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Contato</Label>
            <Input value={value.contato ?? ""} disabled={disabled}
              onChange={(e) => onChange({ contato: e.target.value })} />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={value.email ?? ""} disabled={disabled}
              onChange={(e) => onChange({ email: e.target.value })} />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={value.telefone ?? ""} disabled={disabled}
              onChange={(e) => onChange({ telefone: e.target.value })} />
          </div>
          <div>
            <Label>Telefone (2)</Label>
            <Input value={value.telefone2 ?? ""} disabled={disabled}
              onChange={(e) => onChange({ telefone2: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Label>Website</Label>
            <Input value={value.website ?? ""} disabled={disabled}
              onChange={(e) => onChange({ website: e.target.value })} />
          </div>
        </CardContent>
      </Card>

      {showInternal && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Interno</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Observação</Label>
              <Textarea value={value.observacao ?? ""} disabled={disabled} rows={3}
                onChange={(e) => onChange({ observacao: e.target.value })} />
            </div>
            {isAdmin && vendedores && vendedores.length > 0 && (
              <div>
                <Label>Vendedor responsável</Label>
                <Select
                  value={value.vendedor_id ?? undefined}
                  onValueChange={(v) => onChange({ vendedor_id: v })}
                  disabled={disabled}
                >
                  <SelectTrigger><SelectValue placeholder="Escolha o vendedor" /></SelectTrigger>
                  <SelectContent>
                    {vendedores.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <label className="flex items-center gap-2">
              <Switch
                checked={value.ativo !== false}
                disabled={disabled}
                onCheckedChange={(c) => onChange({ ativo: c })}
              />
              <span className="text-sm">Ativo</span>
            </label>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
