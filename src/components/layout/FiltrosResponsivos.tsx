import * as React from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

export function FiltrosResponsivos({
  ativo,
  titulo = "Filtros",
  children,
}: {
  /** Liga o pontinho no botão. */
  ativo?: boolean;
  titulo?: string;
  children: React.ReactNode;
}) {
  // Renderiza os children uma só vez (celular: dentro da gaveta; computador: em linha).
  const isMobile = useIsMobile();
  if (!isMobile) {
    return <div className="hidden flex-wrap items-center gap-2 md:flex">{children}</div>;
  }
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="relative h-10 md:hidden">
          <SlidersHorizontal className="h-4 w-4" />
          {titulo}
          {ativo && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[85vw] max-w-sm overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{titulo}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 flex flex-col items-start gap-3">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
