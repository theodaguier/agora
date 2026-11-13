import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Editor } from "@tiptap/react";
import { CheckIcon, CloseIcon, DownloadIcon } from "@/components/icons";
import { RichTextEditor, editorText, type EditorContentInput } from "@/components/editor/RichTextEditor";
import { Button } from "@/components/ui/button";
import { DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { defineMessages, useT } from "@/i18n";
import { useAutosave } from "@/lib/autosave";
import { DOCX_MIME, docToDocx, docxToHtml, type DocFormat } from "@/lib/documents";

const messages = defineMessages({
  en: {
    saving: "Saving…",
    saved: "Saved",
    failed: "Not saved",
    retry: "Retry",
    download: (name: string) => `Download ${name}`,
    close: "Close",
    loadFailed: "This document couldn't be opened.",
  },
  fr: {
    saving: "Enregistrement…",
    saved: "Enregistré",
    failed: "Non enregistré",
    retry: "Réessayer",
    download: (name: string) => `Télécharger ${name}`,
    close: "Fermer",
    loadFailed: "Impossible d'ouvrir ce document.",
  },
});

/**
 * A document of the conversation (a Word file, Markdown, text) open in the text editor, saved on
 * its own as you type, in place: the bot that wrote it reads the new version. Shown inside the
 * file preview's dialog; `registerFlush` hands the dialog what to await before it closes.
 */
export default function DocumentEditor({
  name,
  src,
  attachmentId,
  format,
  meta,
  downloadHref,
  onClose,
  registerFlush,
}: {
  name: string;
  src: string;
  attachmentId: string;
  format: DocFormat;
  meta?: React.ReactNode;
  downloadHref?: string;
  onClose: () => void;
  registerFlush: (flush: () => Promise<boolean>) => void;
}) {
  const t = useT(messages);
  const editor = useRef<Editor | null>(null);

  // Read fresh each time: it may have been edited since (here, or by the bot).
  const doc = useQuery({
    queryKey: ["document", attachmentId],
    gcTime: 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<EditorContentInput> => {
      const res = await fetch(src, { cache: "no-store", credentials: "include" });
      if (!res.ok) throw new Error(res.statusText);
      if (format === "docx") return { html: await docxToHtml(await res.arrayBuffer()) };
      const text = await res.text();
      return format === "markdown" ? { markdown: text } : { text };
    },
  });

  const autosave = useAutosave(async () => {
    const e = editor.current;
    if (!e) return;
    const body =
      format === "docx"
        ? new Blob([await docToDocx(e.getJSON())], { type: DOCX_MIME })
        : new Blob([format === "markdown" ? e.getMarkdown() : editorText(e)], { type: "text/plain;charset=utf-8" });
    const res = await fetch(`/api/attachments/${encodeURIComponent(attachmentId)}`, { method: "PUT", body, credentials: "include" });
    if (!res.ok) throw new Error(res.statusText);
  });
  const { flush } = autosave;
  useEffect(() => registerFlush(flush), [registerFlush, flush]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b pr-2 pl-4">
        <DialogTitle className="min-w-0 flex-1 truncate text-ui font-medium">{name}</DialogTitle>
        <span aria-live="polite" className="flex shrink-0 items-center gap-1 text-xs text-subtle-foreground tabular-nums">
          {autosave.status === "pending" || autosave.status === "saving" ? (
            t.saving
          ) : autosave.status === "saved" ? (
            <>
              <CheckIcon className="size-3.5" />
              {t.saved}
            </>
          ) : autosave.status === "error" ? (
            <>
              <span className="text-destructive">{t.failed}</span>
              <Button variant="ghost" size="xs" onClick={() => void autosave.retry()}>
                {t.retry}
              </Button>
            </>
          ) : (
            meta
          )}
        </span>
        {downloadHref && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t.download(name)}
            title={t.download(name)}
            nativeButton={false}
            // The file on disk is the saved one: what's typed goes there first.
            onClick={async (e) => {
              if (autosave.status === "idle" || autosave.status === "saved") return;
              e.preventDefault();
              if (await flush()) window.location.href = downloadHref;
            }}
            render={<a href={downloadHref} download={name} />}
          >
            <DownloadIcon />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" aria-label={t.close} title={t.close} onClick={onClose}>
          <CloseIcon />
        </Button>
      </div>
      {doc.data ? (
        <RichTextEditor
          initial={doc.data}
          plain={format === "text"}
          label={name}
          className="flex-1"
          contentClassName="mx-auto min-h-full w-full max-w-3xl px-6 py-8 sm:px-16"
          onChange={(e) => {
            editor.current = e;
            autosave.schedule();
          }}
        />
      ) : doc.error ? (
        <p className="m-auto p-6 text-ui text-muted-foreground">{t.loadFailed}</p>
      ) : (
        <Spinner className="m-auto" />
      )}
    </div>
  );
}
