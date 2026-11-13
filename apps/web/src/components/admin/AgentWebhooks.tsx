import { agentTriggers, common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState, type FormEvent } from "react";
import { FormLabel } from "@/components/FormLabel";
import { MoreIcon, PencilIcon, TrashIcon, GlobeIcon } from "@/components/icons";
import { ListCard, ListCardHeader, ListCardRows } from "@/components/list-card";
import { Button } from "@/components/ui/button";
import { CardAction, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n";
import { api, type BotWebhook } from "@/lib/api";
import { confirmAction } from "@/lib/confirm";
import { copyText } from "@/lib/feedback";
import { dateFormat } from "@/lib/intl";
import { LoadError, Loading, SettingTile } from "./ui";

const messages = agentTriggers;

const when = (iso: string) => dateFormat({ dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

export function AgentWebhooks({ agentId }: { agentId: string }) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const path = `/agents/${agentId}/webhooks`;
  const key = ["agents", agentId, "webhooks"];
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const { data, isPending, error } = useQuery({ queryKey: key, queryFn: () => api<BotWebhook[]>(path) });
  /** The form: a trigger being edited, or true for a new one. */
  const [form, setForm] = useState<BotWebhook | true | null>(null);
  /** Address of the trigger just created, shown this once. */
  const [created, setCreated] = useState<string | null>(null);

  const toggle = useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => api(`${path}/${id}`, { method: "PATCH", body: JSON.stringify({ enabled }) }),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`${path}/${id}`, { method: "DELETE" }),
    onSettled: refresh,
    meta: { success: c.deleted },
  });

  return (
    <ListCard>
      <ListCardHeader>
        <CardTitle>{t.title}</CardTitle>
        <CardDescription>{t.intro}</CardDescription>
        <CardAction>
          <Button size="sm" onClick={() => setForm(true)}>
            {t.add}
          </Button>
        </CardAction>
      </ListCardHeader>
      {isPending || !data?.length ? (
        <CardContent className="py-(--card-spacing)">
          {isPending ? <Loading /> : !data ? <LoadError error={error} /> : <p className="text-sm text-muted-foreground">{t.empty}</p>}
        </CardContent>
      ) : (
        <ListCardRows>
          {data.map((hook) => (
            <Item key={hook.id} size="xs" role="listitem" className="flex-nowrap">
              <SettingTile>
                <GlobeIcon />
              </SettingTile>
              <ItemContent className="min-w-0">
                <ItemTitle>{hook.name}</ItemTitle>
                <ItemDescription className="truncate">
                  {hook.lastStatus && hook.lastReceivedAt ? t.last(t.status[hook.lastStatus], when(hook.lastReceivedAt)) : t.never}. {t.runsAs(hook.owner)}
                </ItemDescription>
              </ItemContent>
              <ItemActions>
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.actions} title={t.actions} />}>
                    <MoreIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuGroup>
                      <DropdownMenuItem onClick={() => setForm(hook)}>
                        <PencilIcon />
                        {t.edit}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={async () =>
                          (await confirmAction({ title: t.deleteTitle(hook.name), description: t.deleteBody, action: t.delete })) && remove.mutate(hook.id)
                        }
                      >
                        <TrashIcon />
                        {t.delete}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Switch aria-label={hook.name} checked={hook.enabled} onCheckedChange={(enabled) => toggle.mutate({ id: hook.id, enabled })} />
              </ItemActions>
            </Item>
          ))}
        </ListCardRows>
      )}
      <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}>
        <DialogContent className="sm:max-w-md">
          {form && (
            <WebhookForm
              key={form === true ? "new" : form.id}
              path={path}
              hook={form === true ? null : form}
              onDone={(url) => {
                refresh();
                setForm(null);
                if (url) setCreated(url);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!created} onOpenChange={(open) => !open && setCreated(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.createdTitle}</DialogTitle>
            <DialogDescription>{t.createdBody}</DialogDescription>
          </DialogHeader>
          <Input aria-label={t.address} readOnly value={created ?? ""} onFocus={(e) => e.target.select()} />
          <DialogFooter>
            <Button variant="outline" onClick={() => created && copyText(created)}>
              {t.copy}
            </Button>
            <DialogClose render={<Button />}>{t.done}</DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListCard>
  );
}

function WebhookForm({ path, hook, onDone }: { path: string; hook: BotWebhook | null; onDone: (url?: string) => void }) {
  const t = useT(messages);
  const c = useT(common);
  const id = useId();
  const [name, setName] = useState(hook?.name ?? "");
  const [instructions, setInstructions] = useState(hook?.instructions ?? "");
  const [dedupeField, setDedupeField] = useState(hook?.dedupeField ?? "");
  const [autoMerge, setAutoMerge] = useState(hook?.autoMerge ?? false);
  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({ name, instructions, dedupeField, autoMerge });
      return hook ? api(`${path}/${hook.id}`, { method: "PATCH", body }).then(() => undefined) : api<{ url: string }>(path, { method: "POST", body }).then((r) => r.url);
    },
    onSuccess: onDone,
    meta: { success: hook ? c.saved : undefined, error: false },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{hook ? t.editTitle : t.add}</DialogTitle>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FormLabel htmlFor={`${id}-name`} required>
            {t.name}
          </FormLabel>
          <Input id={`${id}-name`} required maxLength={120} value={name} placeholder={t.namePlaceholder} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field>
          <FormLabel htmlFor={`${id}-instructions`} required>
            {t.instructions}
          </FormLabel>
          <Textarea
            id={`${id}-instructions`}
            required
            rows={4}
            maxLength={4000}
            value={instructions}
            placeholder={t.instructionsPlaceholder}
            onChange={(e) => setInstructions(e.target.value)}
          />
        </Field>
        <Field>
          <FormLabel htmlFor={`${id}-field`}>{t.field}</FormLabel>
          <Input id={`${id}-field`} maxLength={200} value={dedupeField} placeholder={t.fieldPlaceholder} onChange={(e) => setDedupeField(e.target.value)} />
          <FieldDescription>{t.fieldHelp}</FieldDescription>
        </Field>
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={`${id}-merge`}>{t.autoMerge}</FieldLabel>
            <FieldDescription>{t.autoMergeHelp}</FieldDescription>
          </FieldContent>
          <Switch id={`${id}-merge`} checked={autoMerge} onCheckedChange={setAutoMerge} />
        </Field>
      </FieldGroup>
      {save.error && (
        <p role="alert" className="text-sm text-destructive">
          {save.error.message}
        </p>
      )}
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>{c.cancel}</DialogClose>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? c.saving : c.save}
        </Button>
      </DialogFooter>
    </form>
  );
}
