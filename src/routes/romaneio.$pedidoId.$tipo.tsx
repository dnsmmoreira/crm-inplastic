import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/crm-store";
import {
  getRomaneioDocumento,
  ROMANEIO_LABELS,
  ROMANEIO_TIPOS,
  type RomaneioItem,
  type RomaneioTipo,
} from "@/lib/pedido-romaneios.functions";

export const Route = createFileRoute("/romaneio/$pedidoId/$tipo")({
  head: () => ({
    meta: [
      { title: "Romaneio do pedido — CRM" },
      {
        name: "description",
        content: "Documento operacional imprimível de separação e conferência do pedido.",
      },
      { property: "og:title", content: "Romaneio do pedido — CRM" },
      {
        property: "og:description",
        content: "Documento operacional imprimível de separação e conferência do pedido.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RomaneioPrintPage,
});

function isTipo(v: string): v is RomaneioTipo {
  return (ROMANEIO_TIPOS as readonly string[]).includes(v);
}

function RomaneioPrintPage() {
  const { pedidoId, tipo } = Route.useParams();
  const carregar = useServerFn(getRomaneioDocumento);
  const tipoValido = isTipo(tipo);

  const { data, isLoading, error } = useQuery({
    queryKey: ["romaneio-doc", pedidoId, tipo],
    enabled: tipoValido,
    queryFn: () => carregar({ data: { pedido_id: pedidoId, tipo: tipo as RomaneioTipo } }),
  });

  if (!tipoValido) {
    return <p className="p-8 text-sm text-muted-foreground">Tipo de romaneio inválido.</p>;
  }
  if (isLoading) {
    return <p className="p-8 text-sm text-muted-foreground">Carregando romaneio…</p>;
  }
  if (error) {
    return (
      <p className="p-8 text-sm text-destructive">
        {error instanceof Error ? error.message : "Falha ao carregar o romaneio."}
      </p>
    );
  }
  if (!data) {
    return (
      <p className="p-8 text-sm text-muted-foreground">
        Este romaneio ainda não foi gerado para o pedido.
      </p>
    );
  }

  const { romaneio, pedido } = data;
  const comValores = romaneio.tipo === "conferencia_nf";
  const itens = romaneio.itens ?? [];
  const totalGeral = itens.reduce((s, i) => s + (i.total_price ?? 0), 0);
  const pesoTotal = itens.reduce(
    (s, i) => s + (i.weight_kg != null ? i.weight_kg * i.quantity : 0),
    0,
  );

  return (
    <div className="p-4 md:p-8 space-y-4 print:p-0 print:space-y-0">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <h1 className="text-xl font-semibold">{ROMANEIO_LABELS[romaneio.tipo]}</h1>
        <Button className="gap-2" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      <div
        id="romaneio-print"
        className="bg-white text-[13px] leading-snug border rounded-lg p-8 shadow-sm print:border-0 print:shadow-none print:rounded-none print:p-0 print:text-[11px]"
      >
        <div className="flex items-start justify-between gap-6 border-b pb-3 mb-4 print-block">
          <div>
            <div className="text-base font-bold uppercase tracking-wide">
              {ROMANEIO_LABELS[romaneio.tipo]}
            </div>
            <div className="text-xs text-gray-600">
              Pedido <span className="font-mono font-semibold">{pedido.number}</span>
            </div>
          </div>
          <div className="text-right text-xs text-gray-600">
            <div className="font-semibold text-gray-900">{pedido.cliente_nome ?? "Cliente não identificado"}</div>
            <div>{pedido.cliente_cnpj ?? "CNPJ não informado"}</div>
            <div>
              Gerado em{" "}
              {format(new Date(romaneio.gerado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </div>
          </div>
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr className="print-head-row bg-gray-100 text-left">
              <Th>SKU</Th>
              <Th>Descrição</Th>
              <Th className="text-right">Qtd</Th>
              <Th>Un.</Th>
              <Th className="text-right">Peso un. (kg)</Th>
              <Th className="text-right">Peso total (kg)</Th>
              <Th className="text-right">A×L×C (cm)</Th>
              <Th className="text-right">Pç/coluna</Th>
              {comValores && <Th>NCM</Th>}
              {comValores && <Th className="text-right">Valor un.</Th>}
              {comValores && <Th className="text-right">Valor total</Th>}
            </tr>
          </thead>
          <tbody>
            {itens.map((i, idx) => (
              <Linha key={`${i.item_key}-${idx}`} item={i} comValores={comValores} />
            ))}
            {itens.length === 0 && (
              <tr>
                <td colSpan={comValores ? 11 : 8} className="py-6 text-center text-gray-500">
                  Romaneio sem itens.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t font-semibold">
              <td colSpan={5} className="px-2 py-2 text-right">
                Peso total
              </td>
              <td className="px-2 py-2 text-right">{pesoTotal.toFixed(2)}</td>
              <td colSpan={comValores ? 5 : 2} />
            </tr>
            {comValores && (
              <tr className="font-semibold">
                <td colSpan={10} className="px-2 py-2 text-right">
                  Total geral
                </td>
                <td className="px-2 py-2 text-right">{formatBRL(totalGeral)}</td>
              </tr>
            )}
          </tfoot>
        </table>

        <div className="mt-10 grid grid-cols-2 gap-10 text-xs text-gray-600 print-block">
          <div className="border-t pt-1">Responsável pela separação</div>
          <div className="border-t pt-1">Conferente</div>
        </div>
      </div>

      <style>{`
        @page { size: A4; margin: 14mm 12mm 16mm 12mm; }
        @media print {
          body { background: white; }
          aside, header, nav { display: none !important; }
          .print\\:hidden { display: none !important; }
          [data-sonner-toaster] { display: none !important; }
          #romaneio-print { font-size: 9pt; color: #111827; background: #fff; }
          #romaneio-print table { font-size: 8pt; width: 100%; }
          #romaneio-print th, #romaneio-print td { padding: 1.2mm 1.5mm; }
          #romaneio-print thead { display: table-header-group; }
          #romaneio-print tfoot { display: table-footer-group; }
          #romaneio-print tr, #romaneio-print .print-block {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={`border-b px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${className}`}>
      {children}
    </th>
  );
}

/** Dado ausente aparece em âmbar como "—": o operador precisa saber que falta cadastro. */
function Faltando() {
  return <span className="font-semibold text-amber-600">—</span>;
}

function Linha({ item, comValores }: { item: RomaneioItem; comValores: boolean }) {
  const pesoTotal = item.weight_kg != null ? item.weight_kg * item.quantity : null;
  const temDim = item.height_cm != null || item.width_cm != null || item.length_cm != null;
  return (
    <tr className="border-b align-top">
      <td className="px-2 py-1 font-mono text-[11px]">{item.sku ?? <Faltando />}</td>
      <td className="px-2 py-1">{item.description ?? "—"}</td>
      <td className="px-2 py-1 text-right">{item.quantity}</td>
      <td className="px-2 py-1">{item.unit ?? "—"}</td>
      <td className="px-2 py-1 text-right">
        {item.weight_kg != null ? item.weight_kg.toFixed(2) : <Faltando />}
      </td>
      <td className="px-2 py-1 text-right">
        {pesoTotal != null ? pesoTotal.toFixed(2) : <Faltando />}
      </td>
      <td className="px-2 py-1 text-right">
        {temDim ? (
          `${item.height_cm ?? "?"}×${item.width_cm ?? "?"}×${item.length_cm ?? "?"}`
        ) : (
          <Faltando />
        )}
      </td>
      <td className="px-2 py-1 text-right">
        {item.pecas_por_coluna != null ? item.pecas_por_coluna : <Faltando />}
      </td>
      {comValores && <td className="px-2 py-1 font-mono text-[11px]">{item.ncm ?? <Faltando />}</td>}
      {comValores && (
        <td className="px-2 py-1 text-right">
          {item.unit_price != null ? formatBRL(item.unit_price) : <Faltando />}
        </td>
      )}
      {comValores && (
        <td className="px-2 py-1 text-right">
          {item.total_price != null ? formatBRL(item.total_price) : <Faltando />}
        </td>
      )}
    </tr>
  );
}
