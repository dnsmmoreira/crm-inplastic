import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import {
  LayoutDashboard,
  KanbanSquare,
  Users,
  CheckSquare,
  Boxes,
  MessageSquare,
  Bot,
  Package,
  FileText,
  Settings2,
  Building2,
} from "lucide-react";


import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { useCrm, USERS, useCurrentUser, useIsAdmin } from "@/lib/crm-store";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">Página não encontrada.</p>
        <Link
          to="/"
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Voltar ao Dashboard
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">Tente novamente ou volte ao início.</p>
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CRM — Pallet de Plástico" },
      { name: "description", content: "CRM interno para gestão de leads e propostas do site palletdeplastico.com.br" },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "CRM — Pallet de Plástico" },
      { property: "og:description", content: "Gestão de leads e propostas do site palletdeplastico.com.br" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
  { to: "/pipeline", label: "Funil de Vendas", icon: KanbanSquare, adminOnly: false },
  { to: "/canais", label: "Canais de Entrada", icon: MessageSquare, adminOnly: false },
  { to: "/agente-ia", label: "Agente IA", icon: Bot, adminOnly: false },
  { to: "/contatos", label: "Contatos", icon: Users, adminOnly: false },
  { to: "/tarefas", label: "Tarefas", icon: CheckSquare, adminOnly: false },
  { to: "/propostas", label: "Propostas", icon: FileText, adminOnly: false },
  { to: "/produtos", label: "Produtos", icon: Package, adminOnly: false },
  { to: "/condicoes-comerciais", label: "Condições Comerciais", icon: Settings2, adminOnly: true },
  { to: "/empresas", label: "Empresas do Grupo", icon: Building2, adminOnly: true },

] as const;

function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = useIsAdmin();
  const nav = NAV.filter((n) => !n.adminOnly || isAdmin);
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden md:flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground">
        <div className="flex items-center gap-2 px-6 py-6 border-b border-sidebar-border">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Boxes className="h-5 w-5" />
          </div>
          <div className="leading-tight">
            <div className="font-display text-sm font-semibold">Pallet de Plástico</div>
            <div className="text-[11px] uppercase tracking-wider text-sidebar-foreground/60">CRM Interno</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <UserSwitcher />
        <div className="p-4 text-xs text-sidebar-foreground/50 border-t border-sidebar-border">

          v1.0 · palletdeplastico.com.br
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="flex flex-1 flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between border-b bg-sidebar text-sidebar-foreground px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
              <Boxes className="h-4 w-4" />
            </div>
            <span className="font-display font-semibold">PDP CRM</span>
          </div>
        </header>
        <nav className="md:hidden flex overflow-x-auto border-b bg-card">
          {nav.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm border-b-2",
                  active
                    ? "border-primary text-primary font-medium"
                    : "border-transparent text-muted-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <AppShell>
        <Outlet />
      </AppShell>
      <Toaster position="top-right" />
    </QueryClientProvider>
  );
}

function UserSwitcher() {
  const user = useCurrentUser();
  const setCurrentUser = useCrm((s) => s.setCurrentUser);
  const initials = user.name.split(" ").map((p) => p[0]).slice(0, 2).join("");
  return (
    <div className="border-t border-sidebar-border p-3 space-y-2">
      <div className="flex items-center gap-2 px-1">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full text-white text-xs font-semibold"
          style={{ background: user.avatarColor }}
        >
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium truncate text-sidebar-foreground">{user.name}</div>
          <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
            {user.role === "admin" ? "Administrador" : "Vendedor"}
          </div>
        </div>
      </div>
      <Select value={user.id} onValueChange={setCurrentUser}>
        <SelectTrigger className="h-8 bg-sidebar-accent/40 border-sidebar-border text-xs text-sidebar-foreground">
          <SelectValue placeholder="Trocar usuário" />
        </SelectTrigger>
        <SelectContent>
          {USERS.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.name} {u.role === "admin" ? "· admin" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
