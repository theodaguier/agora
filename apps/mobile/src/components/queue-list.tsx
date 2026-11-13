import { queue } from "@agora/core/i18n";
import { Button, Chip, Input, ListGroup, Separator, Typography } from "heroui-native";
import { Fragment, useState } from "react";
import { View } from "react-native";
import { ArrowUpIcon, CloseIcon, PencilIcon } from "@/components/icons";
import { withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";

/*
 * apps/web/src/components/QueueList.tsx: messages written while the agent works, above the composer;
 * they go in order once it is done. Each can be reworded, sent now, or taken out.
 */

export type QueueItem = { id: string; text: string; files: number };

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
  const t = tr(queue);
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
  const action = (label: string, id: string, onPress: () => void, icon: React.ReactNode) => (
    <Button isIconOnly size="sm" variant="ghost" accessibilityLabel={label} isDisabled={busy === id} onPress={withTap(onPress)}>
      {icon}
    </Button>
  );
  return (
    <ListGroup>
      <View className="flex-row items-center gap-2 px-4 pt-3 pb-2">
        <Typography type="body-sm" weight="medium">
          {t.title}
        </Typography>
        <Chip size="sm" variant="secondary">
          {String(items.length)}
        </Chip>
      </View>
      {items.map((item, i) => (
        <Fragment key={item.id}>
          <Separator />
          <ListGroup.Item>
            <ListGroup.ItemPrefix>
              <Typography type="body-xs" color="muted" className="w-4 text-center">
                {String(i + 1)}
              </Typography>
            </ListGroup.ItemPrefix>
            <ListGroup.ItemContent>
              {editing?.id === item.id ? (
                <Input autoFocus accessibilityLabel={t.edit} value={editing.text} onChangeText={(text) => setEditing({ id: item.id, text })} onSubmitEditing={save} onBlur={save} />
              ) : (
                <ListGroup.ItemTitle numberOfLines={1}>{item.text || t.files(item.files)}</ListGroup.ItemTitle>
              )}
            </ListGroup.ItemContent>
            <ListGroup.ItemSuffix className="flex-row items-center">
              {action(t.edit, item.id, () => setEditing({ id: item.id, text: item.text }), <PencilIcon size={16} className="text-muted" />)}
              {action(t.sendNow, item.id, () => run(item.id, () => onSendNow(item.id)), <ArrowUpIcon size={16} className="text-muted" />)}
              {action(t.remove, item.id, () => run(item.id, () => onRemove(item.id)), <CloseIcon size={16} className="text-muted" />)}
            </ListGroup.ItemSuffix>
          </ListGroup.Item>
        </Fragment>
      ))}
    </ListGroup>
  );
}
