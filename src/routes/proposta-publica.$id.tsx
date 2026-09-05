import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Boxes, Loader2 } from "lucide-react";

import { getPropostaPublica, type PropostaPublica } from "@/lib/propostas.functions";

export const Route = createFileRoute("/proposta-publica/$id")({
  component: PropostaPublicaPage,
  head: () => ({
    meta: [
      { title: "Proposta comercial · INPLASTIC" },
      {
        name: "description",
        content: "Visualize sua proposta comercial INPLASTIC: itens, valores, condições de pagamento e validade.",
      },
      { property: "og:title", content: "Proposta comercial · INPLASTIC" },
      {
        property: "og:description",
        content: "Visualize sua proposta comercial INPLASTIC: itens, valores, condições de pagamento e validade.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

const dataBr = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

function PropostaPublicaPage() {
  const { id } = Route.useParams();
  const fetchProposta = useServerFn(getPropostaPublica);
  const q = useQuery<PropostaPublica | null>({
    queryKey: ["proposta-publica", id],
    queryFn: () => fetchProposta({ data: { id } }),
  });

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-5">
          <Boxes className="h-7 w-7 text-emerald-400" />
          <div>
            <div className="text-lg font-bold tracking-wide">INPLASTIC</div>
            <div className="text-xs text-slate-300">Proposta comercial</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {q.isLoading ? (
          <div className="flex items-center gap-2 text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando proposta…
          </div>
        ) : !q.data ? (
          <div className="rounded-lg border bg-white p-8 text-center text-slate-600">
            Proposta não encontrada.
          </div>
        ) : (
          <Conteudo p={q.data} />
        )}
      </main>
    </div>
  );
}

function Conteudo({ p }: { p: PropostaPublica }) {
  const e = p.emitente;
  return (
    <article className="space-y-6 rounded-lg border bg-white p-6 text-[13px] shadow-sm md:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">{e?.brand ?? "INPLASTIC"}</h1>
          {e?.tagline && <div className="text-xs text-slate-500">{e.tagline}</div>}
          <div className="mt-2 text-[11px] leading-relaxed text-slate-600">
            {e?.legal_name && <div className="font-medium text-slate-800">{e.legal_name}</div>}
            {e?.cnpj && <div>CNPJ: {e.cnpj}{e.ie ? ` · IE: ${e.ie}` : ""}</div>}
            {e?.address && <div>{e.address}</div>}
            {(e?.phone || e?.whatsapp) && (
              <div>
                {e?.phone ? `Tel: ${e.phone}` : ""}
                {e?.phone && e?.whatsapp ? " · " : ""}
                {e?.whatsapp ? `WhatsApp: ${e.whatsapp}` : ""}
              </div>
            )}
            {(e?.email || e?.website) && (
              <div>{[e?.email, e?.website].filter(Boolean).join(" · ")}</div>
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider text-slate-500">Proposta Nº</div>
          <div className="text-2xl font-bold text-slate-900">{p.number}</div>
          <div className="mt-2 text-[11px] text-slate-600">
            <div>Data: {dataBr(p.created_at)}</div>
            <div>Validade: {p.validity_days ?? 0} dias</div>
          </div>
        </div>
      </div>

      <section>
        <div className="mb-1 text-xs uppercase tracking-wider text-slate-500">Para</div>
        <div className="font-semibold text-slate-900">{p.cliente.nome ?? "—"}</div>
        {p.cliente.contato && (
          <div className="text-[11px] text-slate-600">Aos cuidados de: {p.cliente.contato}</div>
        )}
      </section>

      <section>
        <div className="mb-1 text-xs uppercase tracking-wider text-slate-500">Itens</div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-100">
                <th className="border p-1.5 text-left w-8">#</th>
                <th className="border p-1.5 text-left">Descrição</th>
                <th className="border p-1.5 text-left">Código</th>
                <th className="border p-1.5 text-left w-24">NCM</th>
                <th className="border p-1.5 text-center w-12">Un</th>
                <th className="border p-1.5 text-right w-20">Qtd.</th>
                <th className="border p-1.5 text-right w-28">Preço un.</th>
                <th className="border p-1.5 text-right w-28">Total</th>
              </tr>
            </thead>
            <tbody>
              {p.itens.map((it, i) => (
                <tr key={it.id}>
                  <td className="border p-1.5">{i + 1}</td>
                  <td className="border p-1.5">{it.description ?? "—"}</td>
                  <td className="border p-1.5 font-mono">{it.sku ?? "—"}</td>
                  <td className="border p-1.5 font-mono">{it.ncm ?? "—"}</td>
                  <td className="border p-1.5 text-center">{it.unit ?? "—"}</td>
                  <td className="border p-1.5 text-right">{it.quantity.toLocaleString("pt-BR")}</td>
                  <td className="border p-1.5 text-right">{brl(it.unit_price)}</td>
                  <td className="border p-1.5 text-right font-semibold">
                    {brl(it.quantity * it.unit_price)}
                  </td>
                </tr>
              ))}
              {p.itens.length === 0 && (
                <tr>
                  <td colSpan={8} className="border p-3 text-center italic text-slate-500">
                    Nenhum item.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ml-auto w-full max-w-xs space-y-1 text-[12px]">
        <Linha label="Subtotal" valor={brl(p.totais.subtotal)} />
        {p.totais.desconto_valor > 0 && (
          <Linha
            label={`Desconto (${p.totais.desconto_percent}%)`}
            valor={`− ${brl(p.totais.desconto_valor)}`}
          />
        )}
        {p.totais.acrescimo_valor > 0 && (
          <Linha
            label={
              p.totais.cartao_parcelas
                ? `Acréscimo cartão de crédito (${p.totais.cartao_parcelas}x)`
                : `Acréscimo (${String(p.totais.acrescimo_percent).replace(".", ",")}%)`
            }
            valor={`+ ${brl(p.totais.acrescimo_valor)}`}
          />
        )}
        {p.frete.valor > 0 && <Linha label="Frete" valor={brl(p.frete.valor)} />}
        <div className="flex justify-between border-t pt-1 font-bold text-slate-900">
          <span>Total</span>
          <span>{brl(p.totais.total)}</span>
        </div>
      </section>

      <section>
        <div className="mb-1 text-xs uppercase tracking-wider text-slate-500">
          Condições de pagamento
        </div>
        <div className="text-[12px] text-slate-800">
          {p.condicao?.label ?? "A combinar."}
          {p.forma_pagamento ? ` · Forma: ${p.forma_pagamento}` : ""}
        </div>
        {p.condicao?.notes && (
          <div className="text-[11px] text-slate-500">{p.condicao.notes}</div>
        )}
        {p.totais.cartao_parcelas && p.parcelas.length > 0 && (
          <div className="mt-1 text-[12px] font-medium text-slate-900">
            {p.totais.cartao_parcelas}x de {brl(p.parcelas[0].amount)}
          </div>
        )}
        {p.parcelas.length > 0 && (
          <table className="mt-2 w-full border-collapse text-[11px]">
            <thead>
              <tr className="bg-slate-100">
                <th className="border p-1.5 text-left w-12">Nº</th>
                <th className="border p-1.5 text-left">Prazo</th>
                <th className="border p-1.5 text-left">Vencimento</th>
                <th className="border p-1.5 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {p.parcelas.map((r, i) => (
                <tr key={r.id}>
                  <td className="border p-1.5">
                    {i + 1}/{p.parcelas.length}
                  </td>
                  <td className="border p-1.5">{r.days === 0 ? "à vista" : `${r.days} dias`}</td>
                  <td className="border p-1.5">{dataBr(r.due_date)}</td>
                  <td className="border p-1.5 text-right">{brl(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {(p.frete.por_conta || p.frete.transportadora) && (
        <section className="text-[12px] text-slate-700">
          <div className="mb-1 text-xs uppercase tracking-wider text-slate-500">Transporte</div>
          {p.frete.transportadora && <div>Transportadora: {p.frete.transportadora}</div>}
          {p.frete.por_conta && <div>Frete por conta: {p.frete.por_conta}</div>}
        </section>
      )}

      {p.observations && (
        <section>
          <div className="mb-1 text-xs uppercase tracking-wider text-slate-500">Observações</div>
          <div className="whitespace-pre-wrap rounded border bg-slate-50 p-3 text-[12px]">
            {p.observations}
          </div>
        </section>
      )}

      {(e?.banco || e?.agencia || e?.conta || e?.pix) && (
        <section>
          <div className="mb-1 text-xs uppercase tracking-wider text-slate-500">
            Dados para pagamento
          </div>
          <div className="rounded border bg-slate-50 p-3 text-[11px] leading-relaxed">
            {e?.legal_name && <div className="font-semibold">{e.legal_name}</div>}
            {e?.cnpj && <div>CNPJ: {e.cnpj}</div>}
            {e?.banco && <div>Banco: {e.banco}</div>}
            {(e?.agencia || e?.conta) && (
              <div>
                {e?.agencia ? `Agência: ${e.agencia}` : ""}
                {e?.agencia && e?.conta ? " · " : ""}
                {e?.conta ? `Conta corrente: ${e.conta}` : ""}
              </div>
            )}
            {e?.pix && <div className="mt-1">Chave PIX: <span className="font-mono">{e.pix}</span></div>}
          </div>
        </section>
      )}

      <div className="border-t pt-4 text-[11px] text-slate-500">
        Atenciosamente, Departamento de Vendas · {e?.legal_name ?? "INPLASTIC"}
      </div>
    </article>
  );
}

function Linha({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex justify-between text-slate-700">
      <span>{label}</span>
      <span className="font-medium">{valor}</span>
    </div>
  );
}
