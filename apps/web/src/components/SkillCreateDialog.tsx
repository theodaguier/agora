import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api, type SkillRequest } from "@/lib/api";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";

const messages = defineMessages({
  en: {
    title: (name: string) => `Skill ${name}`,
    shared: "Every bot will be able to use it.",
    approved: "Skill approved.",
    approve: "Approve",
  },
  fr: {
    title: (name: string) => `Skill ${name}`,
    shared: "Tous les bots pourront s'en servir.",
    approved: "Skill validé.",
    approve: "Valider",
  },
});

/** Skill written by a bot: the admin reads its SKILL.md before sharing it with every bot. */
export function SkillCreateDialog({ request, onClose }: { request: SkillRequest | null; onClose: () => void }) {
  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">{request && <Review key={request.id} request={request} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function Review({ request, onClose }: { request: SkillRequest; onClose: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const approve = useMutation({
    mutationFn: () => api<SkillRequest>(`/skill-requests/${request.id}/approve`, { method: "POST" }),
    onSuccess: (next) => {
      qc.setQueryData(["skill-request", request.id], next);
      qc.invalidateQueries({ queryKey: ["skill-requests"] });
      onClose();
    },
    meta: { success: t.approved, error: false },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t.title(request.name)}</DialogTitle>
        <DialogDescription>
          {request.description} {t.shared}
        </DialogDescription>
      </DialogHeader>
      <ScrollArea className="max-h-96 rounded-xl border border-border">
        <pre className="whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed">{request.content}</pre>
      </ScrollArea>
      {approve.error && (
        <p role="alert" className="text-[13px] text-destructive">
          {approve.error.message}
        </p>
      )}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>{c.cancel}</DialogClose>
        <Button disabled={approve.isPending} onClick={() => approve.mutate()}>
          {approve.isPending ? c.inProgress : request.error ? c.retry : t.approve}
        </Button>
      </DialogFooter>
    </>
  );
}
