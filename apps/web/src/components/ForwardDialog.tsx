import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
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
    none: "No conversation yet.",
    unavailable: "Conversations unreachable for now.",
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
    none: "Aucune conversation pour l'instant.",
    unavailable: "Conversations injoignables pour l'instant.",
  },
});

/** Picks the conversations to forward a message to; with a single one, opens it. */
export function ForwardDialog({ conversationId, message, onClose }: { conversationId: string; message: Message | null; onClose: () => void }) {
  const t = useT(messages);
  const tc = useT(common);
  const { user } = useRouteContext({ from: "/app" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: conversations = [], isPending, isError } = useQuery(conversationsQuery);
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
  const preview = [message?.text.replace(/\s+/g, " ").trim(), files ? t.files(files) : ""].filter(Boolean).join(", ");

  return (
    <Dialog open={!!message} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription className="line-clamp-2">{preview}</DialogDescription>
        </DialogHeader>
        {/* Filter on the title only: the value holds the id, which must not match. */}
        <Command
          filter={(_, search, keywords) => (keywords?.some((k) => k.toLowerCase().includes(search.trim().toLowerCase())) ? 1 : 0)}
        >
          <CommandInput placeholder={t.search} />
          <CommandList className="max-h-72">
            {isPending ? (
              <div className="flex flex-col gap-1 p-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5">
                    <Skeleton className="size-6 rounded-full" />
                    <Skeleton className="h-4 flex-1" />
                  </div>
                ))}
              </div>
            ) : (
              <CommandEmpty>{isError ? t.unavailable : conversations.length ? t.empty : t.none}</CommandEmpty>
            )}
            {conversations.map((c) => {
              const title = conversationTitle(c, user.id);
              const checked = pickedIds.has(c.id);
              return (
                <CommandItem key={c.id} value={c.id} keywords={[title]} onSelect={() => toggle(c.id)}>
                  <ConversationAvatar conversation={c} me={user.id} className="size-6" />
                  <span className="flex-1 truncate">{title}</span>
                  <Checkbox checked={checked} tabIndex={-1} aria-hidden className="pointer-events-none" />
                </CommandItem>
              );
            })}
          </CommandList>
        </Command>
        {forward.isError && (
          <p role="alert" className="text-sm text-destructive">
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
