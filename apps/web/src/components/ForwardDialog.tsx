import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { forwardMessage, type Message } from "@/lib/api";
import { conversationsQuery } from "@/lib/queries";
import { ConversationAvatar } from "./ConversationAvatar";
import { conversationTitle } from "../lib/participants";

const MAX_TARGETS = 10;

const messages = defineMessages({
  en: {
    title: "Forward message",
    forwarded: "Message forwarded.",
    files: (n: number) => (n > 1 ? `${n} files` : "1 file"),
    search: "Search conversations",
    empty: "No conversation matches.",
    send: (n: number) => (n > 1 ? `Forward to ${n} conversations` : "Forward"),
    sending: "Forwarding…",
    failed: "Couldn't forward the message.",
  },
  fr: {
    title: "Transférer le message",
    forwarded: "Message transféré.",
    files: (n: number) => (n > 1 ? `${n} fichiers` : "1 fichier"),
    search: "Rechercher une conversation",
    empty: "Aucune conversation ne correspond.",
    send: (n: number) => (n > 1 ? `Transférer à ${n} conversations` : "Transférer"),
    sending: "Transfert…",
    failed: "Transfert impossible.",
  },
});

/** Picks the conversations to forward a message to; with a single one, opens it. */
export function ForwardDialog({ conversationId, message, onClose }: { conversationId: string; message: Message | null; onClose: () => void }) {
  const t = useT(messages);
  const tc = useT(common);
  const { user } = useRouteContext({ from: "/app" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: conversations = [] } = useQuery(conversationsQuery);
  const [picked, setPicked] = useState<string[]>([]);
  const pickedIds = new Set(picked);

  const close = () => {
    setPicked([]);
    forward.reset();
    onClose();
  };
  const forward = useMutation({
    mutationFn: () => forwardMessage(conversationId, message!.id, picked),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: conversationsQuery.queryKey });
      const [only] = picked.length === 1 ? picked : [];
      close();
      if (only && only !== conversationId) navigate({ to: "/c/$conversationId", params: { conversationId: only } });
    },
    meta: { success: t.forwarded, error: false },
  });
  const toggle = (id: string) =>
    setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : xs.length < MAX_TARGETS ? [...xs, id] : xs));

  const files = message?.data?.attachments?.length ?? 0;
  const preview = [message?.text.replace(/\s+/g, " ").trim(), files ? t.files(files) : ""].filter(Boolean).join(" · ");

  return (
    <Dialog open={!!message} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription className="line-clamp-2">{preview}</DialogDescription>
        </DialogHeader>
        {/* Filter on the title only: the value holds the id, which must not match. */}
        <Command
          className="rounded-xl border border-border p-1"
          filter={(_, search, keywords) => (keywords?.some((k) => k.toLowerCase().includes(search.trim().toLowerCase())) ? 1 : 0)}
        >
          <CommandInput placeholder={t.search} />
          <CommandList className="max-h-72">
            <CommandEmpty>{t.empty}</CommandEmpty>
            {conversations.map((c) => {
              const title = conversationTitle(c, user.id);
              const checked = pickedIds.has(c.id);
              return (
                <CommandItem key={c.id} value={c.id} keywords={[title]} onSelect={() => toggle(c.id)} className="h-10 gap-2.5 rounded-lg px-2 text-sm">
                  <ConversationAvatar conversation={c} me={user.id} className="size-6" />
                  <span className="flex-1 truncate">{title}</span>
                  <Checkbox checked={checked} tabIndex={-1} aria-hidden className="pointer-events-none" />
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
        {forward.isError && (
          <p role="alert" className="text-[13px] text-destructive">
            {t.failed}
          </p>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>{tc.cancel}</DialogClose>
          <Button disabled={!picked.length || forward.isPending} onClick={() => forward.mutate()}>
            {forward.isPending ? t.sending : t.send(picked.length)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
