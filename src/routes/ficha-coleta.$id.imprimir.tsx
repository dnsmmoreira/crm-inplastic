import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QRCodeSVG } from "qrcode.react";
import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getFichaColeta, registrarImpressaoFicha } from "@/lib/ficha-coleta.functions";
import { FICHA_STATUS_LABEL, formatarCubagem, formatarPeso } from "@/lib/ficha-coleta";

export const Route = createFileRoute("/ficha-coleta/$id/imprimir")({
  head: () => ({
    meta: [
      { title: "Imprimir Ficha de Coleta — CRM" },
      {
        name: "description",
        content: "Versão imprimível da autorização de coleta, com itens, peso, cubagem e QR de conferência.",
      },
      { property: "og:title", content: "Imprimir Ficha de Coleta — CRM" },
      {
        property: "og:description",
        content: "Versão imprimível da autorização de coleta, com itens, peso, cubagem e QR de conferência.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FichaColetaImprimir,
});

function linhaEndereco(c: Record<string, any> | null | undefined): string {
  if (!c) return "—";
  const partes = [c.endereco, c.numero, c.complemento, c.bairro, c.cidade, c.estado, c.cep];
  const txt = partes.filter((p) => p && String(p).trim()).join(", ");
  return txt || "—";
}

function FichaColetaImprimir() {
  const { id } = Route.useParams();
  const carregar = useServerFn(getFichaColeta);
  const registrar = useServerFn(registrarImpressaoFicha);

  const q = useQuery({
    queryKey: ["ficha-coleta-print", id],
    queryFn: () => carregar({ data: { id } }),
  });

  const ficha = q.data?.ficha;

  useEffect(() => {
    if (ficha?.id) void registrar({ data: { id } }).catch(() => {});
  }, [ficha?.id]);

  if (q.isLoading) return <p className="p-8 text-sm text-muted-foreground">Carregando…</p>;
  if (!ficha) return <p className="p-8 text-sm text-muted-foreground">Ficha não encontrada.</p>;

  const snap = (ficha.snapshot ?? {}) as Record<string, any>;
  const emitente = (snap.emitente ?? q.data?.emitente ?? {}) as Record<string, any>;
  const cliente = (snap.cliente ?? {}) as Record<string, any>;
  const transportadora = (snap.transportadora ?? {}) as Record<string, any>;
  const itens = (Array.isArray(snap.itens) ? snap.itens : (q.data?.itens ?? [])) as Array<any>;
  const coleta = (snap.coleta ?? {}) as Record<string, any>;
  const urlPublica =
    typeof window !== "undefined" ? `${window.location.origin}/ficha-coleta-publica/${id}` : "";

  return (
    <div className="p-4 md:p-8 space-y-4 print:p-0 print:space-y-0">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <h1 className="text-xl font-semibold">Ficha de Coleta {ficha.numero}</h1>
        <Button className="gap-2" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      <div className="mx-auto max-w-[820px] bg-background text-foreground border rounded-md p-6 print:border-0 print:rounded-none print:p-0 space-y-4">
        <header className="flex items-start justify-between gap-4 border-b pb-3">
          <div>
            <div className="text-lg font-bold">{emitente.brand ?? "—"}</div>
            <div className="text-xs">{emitente.legal_name ?? ""}</div>
            <div className="text-xs">CNPJ {emitente.cnpj ?? "—"}</div>
            <div className="text-xs">{emitente.endereco_coleta || emitente.address || ""}</div>
          </div>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide">Autorização de coleta</div>
            <div className="text-lg font-bold">{ficha.numero}</div>
            <div className="text-xs">{FICHA_STATUS_LABEL[ficha.status]}</div>
            {urlPublica && <QRCodeSVG value={urlPublica} size={84} className="mt-2 ml-auto" />}
          </div>
        </header>

        <section className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="font-semibold text-xs uppercase text-muted-foreground">Destinatário</div>
            <div>{cliente.razao_social || cliente.company || "—"}</div>
            <div className="text-xs">CNPJ {cliente.cnpj ?? "—"}</div>
            <div className="text-xs">{linhaEndereco(cliente)}</div>
          </div>
          <div>
            <div className="font-semibold text-xs uppercase text-muted-foreground">Transportadora</div>
            <div>{transportadora.nome || ficha.transportadora_nome || "—"}</div>
            <div className="text-xs">CNPJ {transportadora.cnpj ?? "—"}</div>
            <div className="text-xs">Modalidade: {ficha.modalidade_entrega ?? "—"}</div>
          </div>
          <div>
            <div className="font-semibold text-xs uppercase text-muted-foreground">Pedido</div>
            <div>{snap.pedido?.number ?? (q.data?.pedido as any)?.number ?? "—"}</div>
            <div className="text-xs">Vendedor: {snap.vendedor?.name ?? "—"}</div>
          </div>
          <div>
            <div className="font-semibold text-xs uppercase text-muted-foreground">
              Contato Inplastic
            </div>
            <div>
              {ficha.contato_nome ?? "—"} · {ficha.contato_telefone ?? "—"}
            </div>
            <div className="text-xs">
              Coleta prevista: {ficha.previsao_coleta_data ?? "—"} {ficha.previsao_coleta_hora ?? ""}
            </div>
          </div>
        </section>

        <table className="w-full text-sm border-t">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground">
              <th className="py-1">SKU</th>
              <th>Descrição</th>
              <th className="text-right">Qtd.</th>
              <th className="text-right">Peso (kg)</th>
              <th className="text-right">Cubagem (m³)</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i, idx) => (
              <tr key={i.id ?? idx} className="border-t">
                <td className="py-1">{i.sku ?? "—"}</td>
                <td>{i.descricao}</td>
                <td className="text-right">
                  {i.quantidade} {i.unidade ?? ""}
                </td>
                <td className="text-right">{Number(i.peso_kg ?? 0).toLocaleString("pt-BR")}</td>
                <td className="text-right">{Number(i.cubagem_m3 ?? 0).toLocaleString("pt-BR")}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t font-semibold">
              <td colSpan={3} className="py-1 text-right">
                Total
              </td>
              <td className="text-right">{formatarPeso(ficha.peso_total_kg)}</td>
              <td className="text-right">{formatarCubagem(ficha.cubagem_m3)}</td>
            </tr>
          </tfoot>
        </table>

        <section className="text-sm space-y-1">
          <div>
            <span className="font-semibold">Motorista:</span> {ficha.motorista ?? "____________"} ·{" "}
            <span className="font-semibold">Placa:</span> {ficha.placa ?? "________"}
          </div>
          <div>
            <span className="font-semibold">Volumes/embalagem:</span> {ficha.volumes ?? "—"}
          </div>
          <div>
            <span className="font-semibold">Observações:</span>{" "}
            {ficha.observacoes ?? coleta.observacoes ?? "—"}
          </div>
        </section>

        <section className="pt-10 grid grid-cols-2 gap-8 text-xs">
          <div className="border-t pt-1 text-center">Assinatura de quem retira / RG</div>
          <div className="border-t pt-1 text-center">Data e hora da retirada</div>
        </section>
      </div>
    </div>
  );
}
