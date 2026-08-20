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
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  KanbanSquare,
  Users,
  CheckSquare,
  Boxes,
  Gavel,

  MessageSquare,
  Bot,
  Package,
  FileText,
  Settings2,
  Building2,
  LogOut,
  UserCog,
  Radio,
  ClipboardList,
  Trophy,
  BookOpen,
  BarChart3,
  Tags,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,



} from "lucide-react";



import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/lib/crm-store";
import { AuthProvider, useAuth, hasPerm } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { NotificacoesBell } from "@/components/layout/NotificacoesBell";
import { NovaConversaAlerta } from "@/components/atendimento/NovaConversaAlerta";


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
      { title: "CRM — TAOPLAST" },
      { name: "description", content: "CRM interno para gestão de leads e propostas do site palletdeplastico.com.br" },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "CRM — TAOPLAST" },
      { property: "og:description", content: "CRM interno para gestão de leads e propostas do site palletdeplastico.com.br" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "CRM — TAOPLAST" },
      { name: "twitter:description", content: "CRM interno para gestão de leads e propostas do site palletdeplastico.com.br" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/c38f4e5c-b54a-4421-b64d-b224942f93a7/id-preview-15311775--485ac5c1-f718-452a-bd55-8c46d65a25ea.lovable.app-1783120021664.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/c38f4e5c-b54a-4421-b64d-b224942f93a7/id-preview-15311775--485ac5c1-f718-452a-bd55-8c46d65a25ea.lovable.app-1783120021664.png" },
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

type NavCtx = { isAdmin: boolean; user: ReturnType<typeof useAuth>["user"] };

/** Código de cores por área: cor só em ícones/indicadores, nunca no texto do item. */
type Accent = "neutral" | "blue" | "emerald" | "amber" | "sky" | "violet" | "slate" | "cyan";

const ACCENT: Record<Accent, { icon: string; active: string; hover: string; border: string; label: string }> = {
  neutral: {
    icon: "text-sidebar-foreground/70",
    active: "bg-sidebar-accent",
    hover: "hover:bg-sidebar-accent",
    border: "border-sidebar-foreground/40",
    label: "text-sidebar-foreground/60",
  },
  blue: {
    icon: "text-blue-500 dark:text-blue-400",
    active: "bg-blue-500/10",
    hover: "hover:bg-blue-500/5",
    border: "border-blue-500 dark:border-blue-400",
    label: "text-blue-400/80",
  },
  emerald: {
    icon: "text-emerald-500 dark:text-emerald-400",
    active: "bg-emerald-500/10",
    hover: "hover:bg-emerald-500/5",
    border: "border-emerald-500 dark:border-emerald-400",
    label: "text-emerald-400/80",
  },
  amber: {
    icon: "text-amber-500 dark:text-amber-400",
    active: "bg-amber-500/10",
    hover: "hover:bg-amber-500/5",
    border: "border-amber-500 dark:border-amber-400",
    label: "text-amber-400/80",
  },
  sky: {
    icon: "text-sky-500 dark:text-sky-400",
    active: "bg-sky-500/10",
    hover: "hover:bg-sky-500/5",
    border: "border-sky-500 dark:border-sky-400",
    label: "text-sky-400/80",
  },
  violet: {
    icon: "text-violet-500 dark:text-violet-400",
    active: "bg-violet-500/10",
    hover: "hover:bg-violet-500/5",
    border: "border-violet-500 dark:border-violet-400",
    label: "text-violet-400/80",
  },
  slate: {
    icon: "text-slate-400 dark:text-slate-300",
    active: "bg-slate-400/10",
    hover: "hover:bg-slate-400/5",
    border: "border-slate-400 dark:border-slate-300",
    label: "text-slate-300/80",
  },
  cyan: {
    icon: "text-cyan-500 dark:text-cyan-400",
    active: "bg-cyan-500/10",
    hover: "hover:bg-cyan-500/5",
    border: "border-cyan-500 dark:border-cyan-400",
    label: "text-cyan-400/80",
  },
};

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  show: (c: NavCtx) => boolean;
  accent?: Accent;
};

type NavGroup = {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  items: NavItem[];
  accent: Accent;
};

/** Vendedor comum = perfil de vendas (chave propostas.editar). Financeiro/Operacional não têm. */
const isVendedorComum = (c: NavCtx) => !c.isAdmin && hasPerm(c.user, "propostas.editar");
// hasPerm já embute a rede de bootstrap (admin sem perfil vinculado vê tudo).
const key = (chave: string) => (c: NavCtx) => hasPerm(c.user, chave);

const always = () => true;
const vendas = (c: NavCtx) => c.isAdmin || isVendedorComum(c);
const vendasOu = (chave: string) => (c: NavCtx) => vendas(c) || hasPerm(c.user, chave);

const NAV_ROOT: NavItem[] = [
  { to: "/", label: "Início", icon: LayoutDashboard, show: always },
  
  { to: "/conversas", label: "Conversas", icon: MessageSquare, show: key("whatsapp.atender"), accent: "emerald" },
  { to: "/placar", label: "Placar", icon: Trophy, show: vendas, accent: "amber" },
];

const NAV_GROUPS: NavGroup[] = [
  {
    id: "pipeline",
    accent: "blue",
    label: "Pipeline",
    icon: KanbanSquare,
    items: [
      { to: "/pipeline", label: "Funil de Vendas", icon: KanbanSquare, show: vendas },
      { to: "/pedidos", label: "Funil Operacional", icon: ClipboardList, show: vendasOu("pedidos.ver_todos") },
    ],
  },
  {
    id: "cadastros",
    accent: "sky",
    label: "Cadastros",
    icon: Building2,
    items: [
      { to: "/clientes", label: "Clientes", icon: Building2, show: vendasOu("clientes.ver_todos") },
      { to: "/contatos", label: "Contatos", icon: Users, show: vendasOu("clientes.ver_todos") },
      { to: "/empresas", label: "Empresas", icon: Building2, show: vendasOu("clientes.ver_todos") },
      { to: "/produtos", label: "Produtos", icon: Package, show: vendasOu("clientes.ver_todos") },
    ],
  },
  {
    id: "negocios",
    accent: "emerald",
    label: "Negócios",
    icon: FileText,
    items: [
      { to: "/propostas", label: "Propostas", icon: FileText, show: vendasOu("propostas.ver_todas") },
      
      { to: "/condicoes-comerciais", label: "Condições Comerciais", icon: Settings2, show: key("empresas.editar") },
      { to: "/tabela-precos", label: "Tabela de Preços", icon: Tags, show: vendas },
    ],
  },
  {
    id: "meu-dia",
    accent: "violet",
    label: "Meu Dia",
    icon: ClipboardList,
    items: [
      { to: "/minha-agenda", label: "Minha Agenda", icon: ClipboardList, show: always },
      { to: "/tarefas", label: "Tarefas", icon: CheckSquare, show: always },
    ],
  },
  {
    id: "empresa",
    accent: "slate",
    label: "Empresa",
    icon: BarChart3,
    items: [
      { to: "/relatorios", label: "Relatórios", icon: BarChart3, show: key("relatorios.ver") },
      { to: "/estoque", label: "Estoque", icon: Boxes, show: key("estoque.ver") },
      { to: "/licitacoes", label: "Licitações", icon: Gavel, show: key("licitacoes.gerenciar") },

      { to: "/arena", label: "ARENA", icon: Trophy, show: key("metas.definir") },
      {
        to: "/usuarios",
        label: "Usuários",
        icon: UserCog,
        show: (c) => hasPerm(c.user, "usuarios.gerenciar"),
      },
    ],
  },
  {
    id: "ia-canais",
    accent: "cyan",
    label: "IA & Canais",
    icon: Bot,
    items: [
      { to: "/atendimento-ia", label: "Atendimento IA", icon: Radio, show: key("agente_ia.editar_prompt") },
      { to: "/agente-ia", label: "Agente IA", icon: Bot, show: key("agente_ia.editar_prompt") },
      { to: "/canais", label: "Canais", icon: MessageSquare, show: key("canais.configurar") },
    ],
  },
];

const OPEN_STORAGE_KEY = "crm-sidebar-groups";



function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = useIsAdmin();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem("crm-sidebar-collapsed") === "1");
    } catch {
      /* ignore */
    }
  }, []);
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("crm-sidebar-collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const ctx: NavCtx = { isAdmin, user };
  const rootItems = NAV_ROOT.filter((i) => i.show(ctx));
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.show(ctx)) })).filter(
    (g) => g.items.length > 0,
  );

  const activeGroupId = groups.find((g) => g.items.some((i) => i.to === pathname))?.id ?? null;
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [mobileOpen, setMobileOpen] = useState<string | null>(null);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(OPEN_STORAGE_KEY);
      if (raw) setOpenGroups(JSON.parse(raw) as string[]);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    if (!activeGroupId) return;
    setOpenGroups((prev) => (prev.includes(activeGroupId) ? prev : [...prev, activeGroupId]));
    setMobileOpen(activeGroupId);
  }, [activeGroupId]);
  const toggleGroup = (id: string) => {
    setOpenGroups((prev) => {
      const next = prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id];
      try {
        window.localStorage.setItem(OPEN_STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const toggleMobileGroup = (id: string) => setMobileOpen((prev) => (prev === id ? null : id));

  const itemLinkClass = (active: boolean, indent: boolean, accent: Accent = "neutral") => {
    const a = ACCENT[accent];
    return cn(
      "flex items-center gap-3 rounded-md border-l-[3px] px-3 py-2 text-sm transition-colors",
      collapsed && "justify-center px-2",
      indent && !collapsed && "pl-8",
      active
        ? cn("font-medium text-sidebar-foreground", a.active, a.border)
        : cn("border-transparent text-sidebar-foreground/80 hover:text-sidebar-foreground", a.hover),
    );
  };


  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside
        className={cn(
          "hidden md:flex shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 border-b border-sidebar-border py-6",
            collapsed ? "flex-col px-2 gap-3" : "px-6",
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Boxes className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="font-display text-sm font-semibold truncate">INPLASTIC - CRM</div>
              <div className="text-[11px] uppercase tracking-wider text-sidebar-foreground/60">CRM Interno</div>
            </div>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            className="shrink-0 rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {rootItems.map((item) => {
            const Icon = item.icon;
            const accent = item.accent ?? "neutral";
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={itemLinkClass(pathname === item.to, false, accent)}
              >
                <Icon className={cn("h-4 w-4 shrink-0", ACCENT[accent].icon)} />
                {!collapsed && item.label}
              </Link>
            );
          })}

          {groups.map((group) => {
            const GroupIcon = group.icon;
            const open = collapsed || openGroups.includes(group.id);
            const ga = ACCENT[group.accent];
            return (
              <div key={group.id} className="pt-1">
                {!collapsed && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={open}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md border-l-[3px] border-transparent px-3 py-2 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60 transition-colors hover:text-sidebar-foreground",
                      ga.hover,
                    )}
                  >
                    <GroupIcon className={cn("h-4 w-4 shrink-0", ga.icon)} />
                    <span className="flex-1 text-left">{group.label}</span>
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} />
                  </button>
                )}
                {open &&
                  group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        title={collapsed ? item.label : undefined}
                        className={itemLinkClass(pathname === item.to, true, group.accent)}
                      >
                        <Icon className={cn("h-4 w-4 shrink-0", ga.icon)} />
                        {!collapsed && item.label}
                      </Link>
                    );
                  })}
              </div>
            );
          })}

          <a
            href="/manual.html"
            target="_blank"
            rel="noopener noreferrer"
            title={collapsed ? "Manual do CRM" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              collapsed && "justify-center px-2",
              "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            )}
          >
            <BookOpen className="h-4 w-4 shrink-0" />
            {!collapsed && "Manual do CRM"}
          </a>
        </nav>

        <UserBadge collapsed={collapsed} />
        {!collapsed && (
          <div className="p-4 text-xs text-sidebar-foreground/50 border-t border-sidebar-border">
            v1.0 · palletdeplastico.com.br
          </div>
        )}
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
          <NotificacoesBell />
        </header>

        <nav className="md:hidden border-b bg-card p-2 space-y-1">
          {rootItems.map((item) => {
            const Icon = item.icon;
            const a = ACCENT[item.accent ?? "neutral"];
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2 rounded-md border-l-[3px] px-3 py-2 text-sm transition-colors",
                  active
                    ? cn("font-medium text-foreground", a.active, a.border)
                    : cn("border-transparent text-muted-foreground", a.hover),
                )}
              >
                <Icon className={cn("h-4 w-4", a.icon)} />
                {item.label}
              </Link>
            );
          })}
          {groups.map((group) => {
            const GroupIcon = group.icon;
            const open = mobileOpen === group.id;
            const ga = ACCENT[group.accent];
            return (
              <div key={group.id}>
                <button
                  type="button"
                  onClick={() => toggleMobileGroup(group.id)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-2 rounded-md border-l-[3px] border-transparent px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  <GroupIcon className={cn("h-4 w-4", ga.icon)} />
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} />
                </button>
                {open &&
                  group.items.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.to;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className={cn(
                          "flex items-center gap-2 rounded-md border-l-[3px] py-2 pl-8 pr-3 text-sm transition-colors",
                          active
                            ? cn("font-medium text-foreground", ga.active, ga.border)
                            : cn("border-transparent text-muted-foreground", ga.hover),
                        )}
                      >
                        <Icon className={cn("h-4 w-4", ga.icon)} />
                        {item.label}
                      </Link>
                    );
                  })}
              </div>
            );
          })}

          <a
            href="/manual.html"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm border-b-2",
              "border-transparent text-muted-foreground",
            )}
          >
            <BookOpen className="h-4 w-4" />
            Manual do CRM
          </a>
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
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
      <Toaster position="top-right" />
    </QueryClientProvider>
  );
}

function AuthGate() {
  const { user, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (pathname === "/auth") return <Outlet />;

  // Enquanto o Supabase não terminou a restauração inicial da sessão, mostramos loading.
  // Isso evita redirecionar pra /auth num flash logo depois do login, quando o cliente
  // ainda não hidratou o user a partir do localStorage.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Carregando…</div>
      </div>
    );
  }

  if (!user) {
    return <RedirectToAuth />;
  }

  // Troca de senha obrigatória: bloqueia qualquer outra rota até concluir.
  if (user.mustChangePassword && pathname !== "/trocar-senha") {
    return <RedirectTo to="/trocar-senha" />;
  }
  if (pathname === "/trocar-senha") return <Outlet />;

  return (
    <>
      <AppShell><Outlet /></AppShell>
      <NovaConversaAlerta />
    </>
  );
}

function RedirectToAuth() {
  return <RedirectTo to="/auth" />;
}

function RedirectTo({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    void router.navigate({ to, replace: true });
  }, [router, to]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-sm text-muted-foreground">Redirecionando…</div>
    </div>
  );
}


function UserBadge({ collapsed = false }: { collapsed?: boolean }) {
  const { user, signOut } = useAuth();
  if (!user) return null;
  const initials = user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 border-t border-sidebar-border p-3">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full text-white text-xs font-semibold"
          style={{ background: user.avatarColor }}
          title={user.name}
        >
          {initials || "?"}
        </div>
        <NotificacoesBell />
        <button
          type="button"
          onClick={() => { void signOut(); }}
          title="Sair"
          aria-label="Sair"
          className="rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    );
  }
  return (
    <div className="border-t border-sidebar-border p-3 space-y-2">
      <div className="flex items-center gap-2 px-1">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full text-white text-xs font-semibold shrink-0"
          style={{ background: user.avatarColor }}
        >
          {initials || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium truncate text-sidebar-foreground">{user.name}</div>
          <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
            {user.role === "admin" ? "Administrador" : "Vendedor"}
          </div>
        </div>
        <NotificacoesBell />
      </div>
      <Button
        variant="outline"
        size="sm"
        className="w-full h-8 bg-sidebar-accent/40 border-sidebar-border text-xs text-sidebar-foreground hover:bg-sidebar-accent"
        onClick={() => { void signOut(); }}
      >
        <LogOut className="h-3 w-3 mr-2" />
        Sair
      </Button>
    </div>
  );
}


