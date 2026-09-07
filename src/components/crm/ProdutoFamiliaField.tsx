import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFamiliasProduto } from "@/hooks/use-familias-produto";

const OUTRO = "__outro__";

/**
 * Campo "Produto" do lead: escolhe o MODELO (família) do catálogo — a cor é
 * decidida na proposta — ou descreve em texto livre ("Outro").
 */
export function ProdutoFamiliaField({
  product,
  productId,
  onChange,
}: {
  product: string;
  productId?: string | null;
  onChange: (v: { product: string; productId: string | null }) => void;
}) {
  const familias = useFamiliasProduto();
  const atual = productId ? familias.find((f) => f.representanteId === productId) : undefined;
  const [outro, setOutro] = useState(!atual && !!product);
  const [texto, setTexto] = useState(product);

  return (
    <div className="space-y-2">
      <Select
        value={atual ? atual.representanteId : outro ? OUTRO : ""}
        onValueChange={(v) => {
          if (v === OUTRO) {
            setOutro(true);
            onChange({ product: texto, productId: null });
            return;
          }
          setOutro(false);
          const f = familias.find((x) => x.representanteId === v);
          if (f) onChange({ product: f.rotulo, productId: f.representanteId });
        }}
      >
        <SelectTrigger>
          <SelectValue placeholder="Selecione o modelo do catálogo" />
        </SelectTrigger>
        <SelectContent>
          {familias.map((f) => (
            <SelectItem key={f.representanteId} value={f.representanteId}>
              {f.rotulo}
            </SelectItem>
          ))}
          <SelectItem value={OUTRO}>Outro (descrever)</SelectItem>
        </SelectContent>
      </Select>
      {(outro || (!atual && !!product)) && (
        <Input
          value={texto}
          placeholder="Descreva o produto de interesse"
          onChange={(e) => setTexto(e.target.value)}
          onBlur={() => onChange({ product: texto.trim(), productId: null })}
        />
      )}
    </div>
  );
}
