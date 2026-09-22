import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { avaliarSenha } from "@/components/usuarios/DefinirSenhaDialog";
import {
  concluirRedefinicaoSenha,
  validarSessaoRedefinicao,
} from "@/lib/recuperacao.functions";
import { mensagemErroSenha } from "@/lib/senha-mensagens";

export const Route = createFileRoute("/definir-senha")({
  component: DefinirSenhaPage,
  head: () => ({
    meta: [
      { title: "Definir senha — INPLASTIC - CRM" },
      {
        name: "description",
        content: "Defina sua senha de acesso ao CRM usando o link do convite.",
      },
      { property: "og:title", content: "Definir senha — INPLASTIC - CRM" },
      {
        property: "og:description",
        content: "Defina sua senha de acesso ao CRM usando o link do convite.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/**
 * Página de convite/recuperação. O token do e-mail (PKCE) é trocado pelo SDK
 * por uma sessão; aqui só é possível alterar a senha do PRÓPRIO usuário
 * autenticado por esse token. Sem sessão válida, nada pode ser alterado.
 *
 * Conta inativa ou excluída não redefine: a checagem é feita no servidor antes
 * da troca, e o próprio `AuthProvider` encerra qualquer sessão dessas contas.
 */
function DefinirSenhaPage() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState<"verificando" | "pronto" | "invalido">("verificando");
  const [senha, setSenha] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const validar = useServerFn(validarSessaoRedefinicao);
  const concluir = useServerFn(concluirRedefinicaoSenha);

  const forca = useMemo(() => avaliarSenha(senha), [senha]);
  const iguais = senha.length > 0 && senha === confirm;

  useEffect(() => {
    let vivo = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (vivo && session) setEstado("pronto");
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!vivo) return;
      setEstado(data.session ? "pronto" : "invalido");
    });
    return () => {
      vivo = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forca.ok) {
      toast.error(`Senha fraca: ${forca.problemas.join(", ")}.`);
      return;
    }
    if (!iguais) {
      toast.error("As senhas não coincidem.");
      return;
    }
    setBusy(true);
    try {
      // 1) Conta inativa/excluída não redefine (erro explícito, antes da troca).
      await validar({ data: undefined });

      // 2) Troca pelo SDK: é aqui que valem as regras de senha do sistema,
      //    incluindo a checagem de senha vazada.
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw new Error(mensagemErroSenha(error.message));

      // 3) Desliga a exigência de troca e registra a conclusão na auditoria.
      await concluir({ data: undefined });

      toast.success("Senha definida! Bem-vindo.");
      void navigate({ to: "/", replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao definir a senha";
      if (/sess|expirad|inválid|invalid|token|JWT|Unauthorized/i.test(msg)) {
        setEstado("invalido");
      }
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-6 text-white">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <KeyRound className="h-6 w-6" />
          </div>
          <div className="text-center">
            <h1 className="font-display text-xl font-semibold">Definir senha</h1>
            <p className="text-sm text-white/60">Use o link enviado para o seu e-mail.</p>
          </div>
        </div>

        {estado === "verificando" && (
          <div className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Validando link…
          </div>
        )}

        {estado === "invalido" && (
          <div className="rounded-xl bg-card p-6 space-y-3 text-sm">
            <p className="font-medium">Este link já foi usado ou expirou.</p>
            <p className="text-muted-foreground">
              Por segurança, cada link de senha vale uma única vez e por pouco tempo. Peça um
              novo link e tente de novo.
            </p>
            <Button
              className="w-full"
              onClick={() => navigate({ to: "/auth", search: { recuperar: true } })}
            >
              Pedir novo link
            </Button>
          </div>
        )}

        {estado === "pronto" && (
          <form className="rounded-xl bg-card p-6 shadow-xl space-y-3" onSubmit={submit}>
            <div className="space-y-1">
              <Label htmlFor="ds-nova">Nova senha</Label>
              <Input
                id="ds-nova"
                type="password"
                value={senha}
                maxLength={72}
                autoComplete="new-password"
                onChange={(e) => setSenha(e.target.value)}
              />
              <p className={`text-xs ${forca.ok ? "text-emerald-600" : "text-muted-foreground"}`}>
                {forca.ok ? "Senha válida." : `Requer ${forca.problemas.join(", ")}.`}
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ds-conf">Confirmar senha</Label>
              <Input
                id="ds-conf"
                type="password"
                value={confirm}
                maxLength={72}
                autoComplete="new-password"
                onChange={(e) => setConfirm(e.target.value)}
              />
              {confirm.length > 0 && !iguais && (
                <p className="text-xs text-destructive">As senhas não coincidem.</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={busy || !forca.ok || !iguais}>
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar senha
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
