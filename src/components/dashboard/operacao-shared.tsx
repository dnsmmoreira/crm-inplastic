import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatBRL } from "@/lib/crm-store";
import { useAuth } from "@/hooks/use-auth";
import { useAlertasPendentes } from "@/hooks/useAlertasPendentes";
import type { PedidoRow } from "@/lib/pedidos.functions";

/** Limiar de "parado" usado nos dashboards operacionais (dias corridos na etapa). */
export const DIAS_PARADO_ALERTA = 3;

export function diasNaEtapa(p: Pick<PedidoRow, "stage_changed_at">, agora = Date.now()): number {
  const t = new Date(p.stage_changed_at).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((agora - t) / 86_400_000));
}

export function Saudacao({ nome, papel }: { nome: string; papel: string }) {
  const h = Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(new Date()),
  );
  const saudacao = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  const primeiro = (nome || "").split(" ")[0] || "por aí";
  return (
    <div>
      <h1 className="text-2xl font-semibold md:text-3xl">
        {saudacao}, {primeiro}
      </h1>
      <p className="text-sm text-muted-foreground">{papel}</p>
    </div>
  );
}

export function ContadorCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: LucideIcon;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-lg bg-muted p-2">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-semibold">{value}</div>
          {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export function ListaPedidosCard({
  titulo,
  descricao,
  pedidos,
  onOpen,
  extra,
  destacarParado = false,
  vazio = "Nada aqui por enquanto.",
}: {
  titulo: string;
  descricao: string;
  pedidos: PedidoRow[];
  onOpen: (id: string) => void;
  extra?: (p: PedidoRow) => React.ReactNode;
  destacarParado?: boolean;
  vazio?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {titulo}
          <Badge variant="secondary">{pedidos.length}</Badge>
        </CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {pedidos.length === 0 && <p className="text-sm text-muted-foreground">{vazio}</p>}
        {pedidos.map((p) => {
          const dias = diasNaEtapa(p);
          const parado = destacarParado && dias >= DIAS_PARADO_ALERTA;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onOpen(p.id)}
              className={`flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${
                parado ? "border-destructive/40 bg-destructive/5" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span>{p.number}</span>
                  <span className="truncate text-muted-foreground">
                    {p.lead_company || "Cliente não informado"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatBRL(p.total)}
                  {p.vendedor_nome ? ` · ${p.vendedor_nome}` : ""}
                </div>
                {extra?.(p)}
              </div>
              <Badge variant={parado ? "destructive" : "outline"} className="shrink-0">
                {dias === 0 ? "hoje" : `${dias} dia${dias === 1 ? "" : "s"} na etapa`}
              </Badge>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

/** Alertas que exigem aceite do usuário logado — mesma fila do AlertaPendente global. */
export function AlertasPendentesCard() {
  const { user } = useAuth();
  const { pendentes } = useAlertasPendentes(user?.id ?? null);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4 text-muted-foreground" /> Alertas pendentes
          <Badge variant="secondary">{pendentes.length}</Badge>
        </CardTitle>
        <CardDescription>Avisos que ainda aguardam o seu aceite.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {pendentes.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum alerta aguardando aceite.</p>
        )}
        {pendentes.map((a) => (
          <div key={a.id} className="rounded-lg border p-3 text-sm">
            <div className="font-medium">{a.titulo || a.tipo}</div>
            <div className="text-xs text-muted-foreground">
              {new Date(a.created_at).toLocaleString("pt-BR")}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
