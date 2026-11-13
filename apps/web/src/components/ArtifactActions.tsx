import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { previewFileName, type ArtifactDto } from "@agora/core";
import { useState, type ReactElement } from "react";
import { CopyIcon, DownloadIcon, ExternalLinkIcon, MoreIcon, PencilIcon, TrashIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { defineMessages, useT } from "@/i18n";
import { artifactContentUrl, artifactQuery, artifactShareUrl, artifactsQuery, deleteArtifact, renameArtifact } from "@/lib/artifacts";
import { confirmAction } from "@/lib/confirm";
import { copyText } from "@/lib/feedback";

const messages = defineMessages({
  en: {
    more: "Artifact actions",
    openTab: "Open in a new tab",
    copy: "Copy link",
    download: "Download",
    rename: "Rename",
    delete: "Delete",
    renameTitle: "Rename the artifact",
    save: "Rename",
    cancel: "Cancel",
    renamed: "Artifact renamed",
    deleteTitle: (title: string) => `Delete « ${title} »?`,
    deleteDescription: "Its versions go too, and its link stops working. The bot can write it again.",
    deleted: "Artifact deleted",
  },
  fr: {
    more: "Actions de l'artefact",
    openTab: "Ouvrir dans un onglet",
    copy: "Copier le lien",
    download: "Télécharger",
    rename: "Renommer",
    delete: "Supprimer",
    renameTitle: "Renommer l'artefact",
    save: "Renommer",
    cancel: "Annuler",
    renamed: "Artefact renommé",
    deleteTitle: (title: string) => `Supprimer « ${title} » ?`,
    deleteDescription: "Ses versions partent avec lui et son lien ne marche plus. Le bot pourra le réécrire.",
    deleted: "Artefact supprimé",
  },
});

function download(url: string, title: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = previewFileName(title);
  a.click();
}

/**
 * Everything one can do with an artifact, in its « … » menu: open it on its own, copy its link,
 * download it, and, for the conversation's members, rename or delete it. The same menu on the
 * gallery's cards, the thread's cards and the panel.
 */
export function ArtifactActionsMenu({ artifactId, version, trigger, onDeleted }: { artifactId: string; version?: number; trigger?: ReactElement; onDeleted?: () => void }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const { data: artifact } = useQuery(artifactQuery(artifactId));
  const [renaming, setRenaming] = useState(false);
  const refresh = (a?: ArtifactDto) => {
    if (a) qc.setQueryData(artifactQuery(artifactId).queryKey, a);
    void qc.invalidateQueries({ queryKey: artifactsQuery.queryKey });
  };
  const rename = useMutation({
    mutationFn: (title: string) => renameArtifact(artifactId, title),
    onSuccess: (a) => {
      refresh(a);
      setRenaming(false);
    },
    meta: { success: t.renamed },
  });
  const remove = useMutation({
    mutationFn: () => deleteArtifact(artifactId),
    onSuccess: () => {
      qc.removeQueries({ queryKey: artifactQuery(artifactId).queryKey });
      void qc.invalidateQueries({ queryKey: artifactsQuery.queryKey });
      onDeleted?.();
    },
    meta: { success: t.deleted },
  });
  const theme = document.documentElement.classList.contains("dark") ? "dark" : "light";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            trigger ?? (
              <Button variant="ghost" size="icon-sm" aria-label={t.more} disabled={!artifact}>
                <MoreIcon />
              </Button>
            )
          }
        />
        {artifact && (
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => window.open(artifact.sharePath, "_blank", "noopener")}>
              <ExternalLinkIcon />
              {t.openTab}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void copyText(artifactShareUrl(artifact))}>
              <CopyIcon />
              {t.copy}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => download(artifactContentUrl(artifactId, version, theme), artifact.title)}>
              <DownloadIcon />
              {t.download}
            </DropdownMenuItem>
            {artifact.canShare && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setRenaming(true)}>
                  <PencilIcon />
                  {t.rename}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onClick={async () => {
                    if (await confirmAction({ title: t.deleteTitle(artifact.title), description: t.deleteDescription, action: t.delete })) remove.mutate();
                  }}
                >
                  <TrashIcon />
                  {t.delete}
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        )}
      </DropdownMenu>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="sm:max-w-md">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const title = String(new FormData(e.currentTarget).get("title") ?? "").trim();
              if (title) rename.mutate(title);
            }}
          >
            <DialogHeader>
              <DialogTitle>{t.renameTitle}</DialogTitle>
            </DialogHeader>
            <Input name="title" defaultValue={artifact?.title} maxLength={120} autoFocus aria-label={t.renameTitle} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRenaming(false)}>
                {t.cancel}
              </Button>
              <Button type="submit" disabled={rename.isPending}>
                {t.save}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
