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
import { formatCnpj, formatCpf, isValidCpf } from "@/lib/cnpj";
import { formatCep } from "@/lib/format";
import type { ClienteInput, ClienteRow } from "@/lib/clientes.functions";
import { useCrm } from "@/lib/crm-store";

const SEM_PRAZO = "__sem_prazo__";

export type ClienteFormState = ClienteInput;


export function emptyCliente(cnpjInicial = ""): ClienteFormState {
  return {
    tipo_pessoa: "PJ",
    cnpj: cnpjInicial,
    cpf: "",
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
    condicao_pagamento_padrao_id: null,
    email_nf: "",
    regras_faturamento: "",
    aceite_desconto_duplicata: false,
  };

}

export function fromRow(r: ClienteRow): ClienteFormState {
  return {
    tipo_pessoa: r.tipo_pessoa === "PF" ? "PF" : "PJ",
    cnpj: r.cnpj ?? "",
    cpf: r.cpf ?? "",
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
    condicao_pagamento_padrao_id: r.condicao_pagamento_padrao_id ?? null,
    email_nf: r.email_nf ?? "",
    regras_faturamento: r.regras_faturamento ?? "",
    aceite_desconto_duplicata: !!r.aceite_desconto_duplicata,
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
  const [cpfMasked, setCpfMasked] = useState(formatCpf(value.cpf ?? ""));
  const [cepMasked, setCepMasked] = useState(formatCep(value.cep ?? ""));

  useEffect(() => setCnpjMasked(formatCnpj(value.cnpj)), [value.cnpj]);
  useEffect(() => setCpfMasked(formatCpf(value.cpf ?? "")), [value.cpf]);
  useEffect(() => setCepMasked(formatCep(value.cep ?? "")), [value.cep]);

  const disabled = !!readOnly;
  const isPF = value.tipo_pessoa === "PF";
  const cpfInvalido = isPF && (value.cpf ?? "").length === 11 && !isValidCpf(value.cpf ?? "");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Identificação</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Tipo de cliente *</Label>
            <Select
              value={isPF ? "PF" : "PJ"}
              onValueChange={(v) =>
                onChange(
                  v === "PF"
                    ? { tipo_pessoa: "PF", cnpj: "", inscricao_estadual: "", ie_isento: false, simples_optante: null, suframa_isento: null, suframa_numero: "" }
                    : { tipo_pessoa: "PJ", cpf: "" },
                )
              }
              disabled={disabled || cnpjDisabled}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PJ">Pessoa Jurídica (PJ)</SelectItem>
                <SelectItem value="PF">Pessoa Física (PF)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isPF ? (
            <div>
              <Label>CPF *</Label>
              <Input
                value={cpfMasked}
                disabled={disabled || cnpjDisabled}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                  onChange({ cpf: digits });
                  setCpfMasked(formatCpf(digits));
                }}
                placeholder="000.000.000-00"
                aria-invalid={cpfInvalido}
              />
              {cpfInvalido && <p className="text-xs text-destructive mt-1">CPF inválido</p>}
            </div>
          ) : (
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
          )}

          <div>
            <Label>{isPF ? "Nome completo *" : "Razão social *"}</Label>
            <Input
              value={value.razao_social}
              disabled={disabled}
              onChange={(e) => onChange({ razao_social: e.target.value })}
            />
          </div>
          {!isPF && (
            <div>
              <Label>Nome fantasia</Label>
              <Input
                value={value.nome_fantasia ?? ""}
                disabled={disabled}
                onChange={(e) => onChange({ nome_fantasia: e.target.value })}
              />
            </div>
          )}
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
          {!isPF && (
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
          )}
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

      {!isPF && (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Regime fiscal</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex items-center gap-2">
            <Switch
              checked={value.simples_optante === true}
              disabled={disabled}
              onCheckedChange={(c) => onChange({ simples_optante: c })}
            />
            <span className="text-sm">Optante do Simples Nacional</span>
          </label>
          <label className="flex items-center gap-2">
            <Switch
              checked={value.suframa_isento === true}
              disabled={disabled}
              onCheckedChange={(c) => onChange({ suframa_isento: c, suframa_numero: c ? (value.suframa_numero ?? "") : "" })}
            />
            <span className="text-sm">Possui SUFRAMA (isenção fiscal)</span>
          </label>
          {value.suframa_isento && (
            <div className="md:col-span-2">
              <Label>Inscrição SUFRAMA</Label>
              <Input
                value={value.suframa_numero ?? ""}
                disabled={disabled}
                onChange={(e) => onChange({ suframa_numero: e.target.value })}
                placeholder="Ex.: 12.3456.7890-1"
              />
            </div>
          )}
          <p className="md:col-span-2 text-[11px] text-muted-foreground">
            Usado para sugerir automaticamente a empresa emitente das propostas
            (SUFRAMA → TAOPLAST; Simples → LICITAPLAS; caso contrário → INPLASTIC).
          </p>
        </CardContent>
      </Card>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Faturamento</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label>Prazo de pagamento padrão</Label>
            <Select
              value={value.condicao_pagamento_padrao_id ?? SEM_PRAZO}
              onValueChange={(v) => onChange({ condicao_pagamento_padrao_id: v === SEM_PRAZO ? null : v })}
              disabled={disabled}
            >
              <SelectTrigger><SelectValue placeholder="Sem padrão definido" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={SEM_PRAZO}>Sem padrão definido</SelectItem>
                {prazos.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>E-mail para envio de NFs</Label>
            <Input
              type="email"
              value={value.email_nf ?? ""}
              disabled={disabled}
              onChange={(e) => onChange({ email_nf: e.target.value })}
              placeholder="financeiro@empresa.com.br"
            />
          </div>
          <div className="md:col-span-2">
            <Label>Regras para faturamento</Label>
            <Textarea
              value={value.regras_faturamento ?? ""}
              disabled={disabled}
              rows={4}
              onChange={(e) => onChange({ regras_faturamento: e.target.value })}
              placeholder="Ex.: enviar boleto com 5 dias de antecedência; faturar contra a matriz."
            />
          </div>
          <label className="md:col-span-2 flex items-center gap-2">
            <Switch
              checked={value.aceite_desconto_duplicata === true}
              disabled={disabled}
              onCheckedChange={(c) => onChange({ aceite_desconto_duplicata: c })}
            />
            <span className="text-sm">Cliente autoriza desconto de duplicata</span>
          </label>
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
