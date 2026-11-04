import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState, type ReactNode } from "react";
import type { VaultItem, VaultItemSecret } from "@agora/core";
import { CopyIcon, ExternalLinkIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { copyText, toastError } from "@/lib/feedback";
import { vaultSecretQuery } from "@/lib/queries";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { domainOf, hrefOf, ItemLogo, safeMessages } from "./shared";

const messages = defineMessages({
  en: {
    show: "Show",
    hide: "Hide",
    copy: "Copy",
    copyLabel: (label: string) => `Copy ${label.toLowerCase()}`,
    open: (site: string) => `Open ${site}`,
    noNotes: "No notes.",
    empty: "Nothing saved.",
    unreachable: "Can't show it for now.",
    done: "Done",
    removeTitle: (title: string) => `Remove “${title}”?`,
    removeText: "It's deleted from the vault for every member, and bots can no longer use it. This can't be undone.",
  },
  fr: {
    show: "Afficher",
    hide: "Masquer",
    copy: "Copier",
    copyLabel: (label: string) => `Copier : ${label.toLowerCase()}`,
    open: (site: string) => `Ouvrir ${site}`,
    noNotes: "Aucune note.",
    empty: "Rien d'enregistré.",
    unreachable: "Affichage impossible pour le moment.",
    done: "Terminé",
    removeTitle: (title: string) => `Retirer « ${title} » ?`,
    removeText: "Il est supprimé du coffre pour tous ses membres, et les bots ne peuvent plus s'en servir. C'est définitif.",
  },
});

type SecretKey = keyof VaultItemSecret;

/** An item opened from the list: its details, its secrets shown or copied on demand, then edit or remove. */
export function ItemDialog({ vaultId, item, onEdit, onRemoved }: { vaultId: string; item: VaultItem; onEdit: () => void; onRemoved: () => void }) {
  const t = useT(messages);
  const s = useT(safeMessages);
  const c = useT(common);
  const qc = useQueryClient();
  // Secrets on screen; they're fetched the first time one is asked for.
  const [shown, setShown] = useState<ReadonlySet<SecretKey>>(new Set());
  const secretQuery = vaultSecretQuery(vaultId, item.id);
  const secret = useQuery({ ...secretQuery, enabled: shown.size > 0 });
  const remove = useMutation({
    mutationFn: () => api(`/vaults/${encodeURIComponent(vaultId)}/items/${encodeURIComponent(item.id)}`, { method: "DELETE" }),
    onSuccess: async () => {
      await Promise.all([qc.invalidateQueries({ queryKey: ["vaults", vaultId, "items"] }), qc.invalidateQueries({ queryKey: ["vaults"], exact: true })]);
      onRemoved();
    },
    meta: { success: c.removed },
  });

  const toggle = (key: SecretKey) =>
    setShown((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  const copySecret = async (key: SecretKey) => {
    try {
      const value = (await qc.fetchQuery(secretQuery))[key];
      if (value) await copyText(value);
      else toastError(new Error(t.empty));
    } catch (e) {
      toastError(e);
    }
  };

  const f = item.fields;
  const domain = domainOf(item.website);
  const rows: { label: string; value: ReactNode; actions?: ReactNode }[] = [];
  const copyButton = (label: string, value: string) => (
    <Button variant="ghost" size="icon-sm" aria-label={t.copyLabel(label)} title={t.copy} onClick={() => void copyText(value)}>
      <CopyIcon />
    </Button>
  );
  const secretRow = (key: SecretKey, label: string) => {
    const open = shown.has(key);
    const value = secret.data?.[key];
    rows.push({
      label,
      value: !open ? (
        <span aria-label={label} className="tracking-widest text-muted-foreground">
          ••••••••••
        </span>
      ) : secret.isPending ? (
        <Skeleton className="h-4 w-32" />
      ) : secret.isError ? (
        <span className="font-normal text-muted-foreground">{t.unreachable}</span>
      ) : value ? (
        <span className={key === "notes" ? "whitespace-pre-wrap" : "font-mono break-all"}>{value}</span>
      ) : (
        <span className="font-normal text-muted-foreground">{key === "notes" ? t.noNotes : t.empty}</span>
      ),
      actions: (
        <>
          <Button variant="ghost" size="sm" onClick={() => toggle(key)}>
            {open ? t.hide : t.show}
          </Button>
          {key !== "notes" && (
            <Button variant="ghost" size="sm" onClick={() => void copySecret(key)}>
              {t.copy}
            </Button>
          )}
        </>
      ),
    });
  };
  const plainRow = (label: string, value: string | undefined, copy = false) => {
    if (value) rows.push({ label, value, actions: copy ? copyButton(label, value) : undefined });
  };

  if (item.kind === "login") {
    if (item.website)
      rows.push({
        label: s.field.website,
        value: domain ?? item.website,
        actions: (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t.open(domain ?? item.website)}
            title={t.open(domain ?? item.website)}
            nativeButton={false}
            render={<a href={hrefOf(item.website)} target="_blank" rel="noreferrer" />}
          >
            <ExternalLinkIcon />
          </Button>
        ),
      });
    plainRow(s.field.username, f.username, true);
    secretRow("password", s.field.password);
  } else if (item.kind === "card") {
    plainRow(s.field.holder, f.holder);
    if (f.last4) rows.push({ label: s.field.card, value: s.cardEnding(f.brand ?? "", f.last4) });
    plainRow(s.field.expiry, f.expiry);
    secretRow("number", s.field.number);
    secretRow("cvc", s.field.cvc);
  } else {
    plainRow(s.field.name, f.name);
    plainRow(s.field.email, f.email, true);
    plainRow(s.field.phone, f.phone, true);
    plainRow(s.field.address, f.address, true);
    plainRow(s.field.company, f.company);
  }
  if (item.hasNotes) secretRow("notes", s.field.notes);

  return (
    <DialogContent className="max-h-dvh overflow-y-auto sm:max-w-md">
      <DialogHeader className="flex-row items-center gap-3">
        <ItemLogo item={item} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <DialogTitle className="truncate">{item.title}</DialogTitle>
          <DialogDescription>{s.kinds[item.kind]}</DialogDescription>
        </div>
      </DialogHeader>
      {/* One grey surface, a row per detail split by hairlines. */}
      <ItemGroup className="gap-0 overflow-hidden rounded-xl bg-muted/50">
        {rows.map((row, i) => (
          <Fragment key={row.label}>
            {i > 0 && <ItemSeparator className="my-0" />}
            <Item size="sm" className="rounded-none">
              <ItemContent className="min-w-0">
                <ItemDescription>{row.label}</ItemDescription>
                <ItemTitle className="w-full min-w-0 break-words">{row.value}</ItemTitle>
              </ItemContent>
              {row.actions && <ItemActions>{row.actions}</ItemActions>}
            </Item>
          </Fragment>
        ))}
      </ItemGroup>
      <DialogFooter>
        <Button
          variant="destructive"
          className="sm:mr-auto"
          disabled={remove.isPending}
          onClick={async () => (await confirmAction({ title: t.removeTitle(item.title), description: t.removeText, action: c.remove })) && remove.mutate()}
        >
          {c.remove}
        </Button>
        <Button variant="outline" onClick={onEdit}>
          {c.edit}
        </Button>
        <DialogClose render={<Button />}>{t.done}</DialogClose>
      </DialogFooter>
    </DialogContent>
  );
}
