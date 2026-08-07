import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquare, Mail, Phone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { enviarMensagemDiretaCliente } from "@/lib/cliente-chat.functions";

type Props = {
  clienteId: string;
  email?: string | null;
  telefone?: string | null;
};

const ACTION_BTN =
  "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-600 w-full sm:w-auto justify-center";

export function ComunicacaoSection({ clienteId, email, telefone }: Props) {
  const enviar = useServerFn(enviarMensagemDiretaCliente);
  const [openEmail, setOpenEmail] = useState(false);
  const [openZap, setOpenZap] = useState(false);
  const [sending, setSending] = useState(false);

  const [emailTo, setEmailTo] = useState(email ?? "");
  const [assunto, setAssunto] = useState("");
  const [emailMsg, setEmailMsg] = useState("");

  const [phone, setPhone] = useState(telefone ?? "");
  const [zapMsg, setZapMsg] = useState("");

  const send = async (canal: "whatsapp" | "email") => {
    const destino = canal === "email" ? emailTo.trim() : phone.trim();
    const message = canal === "email" ? emailMsg.trim() : zapMsg.trim();
    if (!destino) {
      toast.error(canal === "email" ? "Informe o e-mail de destino." : "Informe o telefone.");
      return;
    }
    if (!message) {
      toast.error("Escreva a mensagem.");
      return;
    }
    setSending(true);
    try {
      await enviar({
        data: {
          clienteId,
          canal,
          destino,
          message,
          ...(canal === "email" ? { assunto: assunto.trim() || undefined } : {}),
        },
      });
      toast.success(canal === "email" ? "E-mail enviado" : "WhatsApp enviado");
      if (canal === "email") {
        setEmailMsg("");
        setOpenEmail(false);
      } else {
        setZapMsg("");
        setOpenZap(false);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar mensagem.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section aria-label="Comunicação" className="flex flex-col sm:flex-row gap-2">
      <Button asChild className={ACTION_BTN}>
        <Link to="/cliente/$id/chat" params={{ id: clienteId }}>
          <MessageSquare className="h-4 w-4 mr-2" /> Chat Hub
        </Link>
      </Button>

      <Button className={ACTION_BTN} onClick={() => setOpenEmail(true)}>
        <Mail className="h-4 w-4 mr-2" /> Enviar Email
      </Button>

      <Button className={ACTION_BTN} onClick={() => setOpenZap(true)}>
        <Phone className="h-4 w-4 mr-2" /> Enviar WhatsApp
      </Button>

      <Dialog open={openEmail} onOpenChange={setOpenEmail}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar e-mail</DialogTitle>
            <DialogDescription>Mensagem direta para o cliente por e-mail.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="com-email-to">Para</Label>
              <Input
                id="com-email-to"
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="cliente@empresa.com.br"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="com-email-assunto">Assunto</Label>
              <Input
                id="com-email-assunto"
                value={assunto}
                onChange={(e) => setAssunto(e.target.value)}
                placeholder="Mensagem da INPLASTIC"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="com-email-msg">Mensagem</Label>
              <Textarea
                id="com-email-msg"
                rows={6}
                value={emailMsg}
                onChange={(e) => setEmailMsg(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenEmail(false)} disabled={sending}>
              Cancelar
            </Button>
            <Button className={ACTION_BTN} onClick={() => send("email")} disabled={sending}>
              {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={openZap} onOpenChange={setOpenZap}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar WhatsApp</DialogTitle>
            <DialogDescription>Mensagem direta para o WhatsApp do cliente.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="com-zap-phone">Telefone</Label>
              <Input
                id="com-zap-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="com-zap-msg">Mensagem</Label>
              <Textarea
                id="com-zap-msg"
                rows={6}
                value={zapMsg}
                onChange={(e) => setZapMsg(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenZap(false)} disabled={sending}>
              Cancelar
            </Button>
            <Button className={ACTION_BTN} onClick={() => send("whatsapp")} disabled={sending}>
              {sending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
