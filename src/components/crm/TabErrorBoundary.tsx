import React from "react";
import { reportLovableError } from "@/lib/lovable-error-reporting";

type Props = { children: React.ReactNode; label?: string };
type State = { error: Error | null };

export class TabErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[TabErrorBoundary]", this.props.label ?? "", error, info);
    reportLovableError(error, { boundary: "tab_error_boundary", label: this.props.label });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <div className="font-medium text-destructive">Não foi possível carregar esta aba.</div>
          <div className="mt-1 text-xs text-muted-foreground break-all">
            {this.state.error.message || "Erro desconhecido"}
          </div>
          <button
            type="button"
            onClick={this.reset}
            className="mt-3 inline-flex items-center rounded-md border border-input bg-background px-3 py-1.5 text-xs hover:bg-accent"
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children as React.ReactElement;
  }
}
