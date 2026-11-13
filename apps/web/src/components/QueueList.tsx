import { useState } from "react";
import { ArrowUpIcon, CloseIcon, PencilIcon } from "@/components/icons";
import { ListCard, ListCardHeader, ListCardRows } from "@/components/list-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { queue } from "@agora/core/i18n";
import { useT } from "@/i18n";

const messages = queue;

export type QueueItem = { id: string; text: string; files: number };

function IconAction({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={label} disabled={disabled} onClick={onClick} />}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Messages written while the agent works, above the composer: they go in order once it is done.
 * Each can be reworded, sent now, or taken out.
 */
export function QueueList({
  items,
  onEdit,
  onSendNow,
  onRemove,
}: {
  items: QueueItem[];
  onEdit: (id: string, text: string) => Promise<unknown>;
  onSendNow: (id: string) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
}) {
  const t = useT(messages);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  if (!items.length) return null;

  const run = (id: string, action: () => Promise<unknown>) => {
    setBusy(id);
    action().finally(() => setBusy(null));
  };
  const save = () => {
    if (!editing) return;
    const { id, text } = editing;
    setEditing(null);
    run(id, () => onEdit(id, text));
  };

  return (
    <ListCard size="sm" className="mb-2">
      <ListCardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          {t.title}
          <Badge variant="secondary">{items.length}</Badge>
        </CardTitle>
      </ListCardHeader>
      <ListCardRows>
        {items.map((item, i) => (
          <Item key={item.id} size="xs">
            <ItemMedia className="w-4 justify-center text-xs text-muted-foreground tabular-nums">{i + 1}</ItemMedia>
            <ItemContent className="min-w-0">
              {editing?.id === item.id ? (
                <Input
                  autoFocus
                  aria-label={t.edit}
                  value={editing.text}
                  onChange={(e) => setEditing({ id: item.id, text: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      save();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setEditing(null);
                    }
                  }}
                  onBlur={save}
                />
              ) : (
                <ItemTitle className="w-full truncate font-normal">{item.text || t.files(item.files)}</ItemTitle>
              )}
            </ItemContent>
            <ItemActions className="gap-0.5">
              <IconAction label={t.edit} disabled={busy === item.id} onClick={() => setEditing({ id: item.id, text: item.text })}>
                <PencilIcon />
              </IconAction>
              <IconAction label={t.sendNow} disabled={busy === item.id} onClick={() => run(item.id, () => onSendNow(item.id))}>
                <ArrowUpIcon />
              </IconAction>
              <IconAction label={t.remove} disabled={busy === item.id} onClick={() => run(item.id, () => onRemove(item.id))}>
                <CloseIcon />
              </IconAction>
            </ItemActions>
          </Item>
        ))}
      </ListCardRows>
    </ListCard>
  );
}
