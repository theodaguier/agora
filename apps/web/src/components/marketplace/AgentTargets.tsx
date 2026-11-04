import { useQuery } from "@tanstack/react-query";
import { Fragment } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import { Item, ItemActions, ItemContent, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { adminAgentsQuery } from "@/lib/queries";
import type { AdminAgent } from "@/lib/api";
import { defineMessages, useT } from "@/i18n";

const messages = defineMessages({
  en: { installed: "Installed", none: "No bots yet.", unavailable: "Bots unreachable for now.", all: "Check all", noneOf: "Uncheck all" },
  fr: { installed: "Installé", none: "Aucun bot pour l'instant.", unavailable: "Bots injoignables pour l'instant.", all: "Tout cocher", noneOf: "Tout décocher" },
});

/**
 * Bots to give something to (a connector, a skill, a secret): one checkbox per bot, « Tout cocher » beside
 * the title. The default profile is left out when it already sees everything (`withoutDefault`).
 * `locked`: bots that have it anyway, shown checked and disabled, with `lockedLabel` (« Installé » by default).
 */
export function AgentTargets(props: {
  legend: string;
  hint?: string;
  value: string[];
  onChange: (ids: string[]) => void;
  withoutDefault?: boolean;
  locked?: string[];
  lockedLabel?: string;
  /** The bots to choose from, when not every bot of the instance (admins only) but the person's own. */
  agents?: Pick<AdminAgent, "id" | "name" | "avatarShape" | "avatarColor" | "hermesProfile">[];
  /** `agents` still loading. */
  loading?: boolean;
}) {
  const t = useT(messages);
  const all = useQuery({ ...adminAgentsQuery, enabled: !props.agents });
  const { data: agents = [], isPending, isError } = props.agents ? { data: props.agents, isPending: !!props.loading, isError: false } : all;
  const choosable = props.withoutDefault ? agents.filter((a) => a.hermesProfile !== "default") : agents;
  const free = choosable.filter((a) => !props.locked?.includes(a.id));
  const everything = free.length > 0 && free.every((a) => props.value.includes(a.id));
  const toggle = (id: string) => props.onChange(props.value.includes(id) ? props.value.filter((x) => x !== id) : [...props.value, id]);
  return (
    <FieldSet className="gap-3">
      {/* The title and what it means, « Tout cocher » on the title's line. */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <FieldLegend variant="label" className="mb-0">
            {props.legend}
          </FieldLegend>
          {props.hint && <FieldDescription>{props.hint}</FieldDescription>}
        </div>
        {free.length > 1 && (
          <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => props.onChange(everything ? [] : free.map((a) => a.id))}>
            {everything ? t.noneOf : t.all}
          </Button>
        )}
      </div>
      {/* One grey surface, a row per bot split by hairlines, the box on the right. */}
      <ItemGroup className="gap-0 overflow-hidden rounded-xl bg-muted/50 has-data-[size=sm]:gap-0">
        {isPending &&
          [0, 1].map((i) => (
            <Item key={i} size="sm" className="rounded-none">
              <ItemMedia>
                <Skeleton className="size-6 rounded-full" />
              </ItemMedia>
              <ItemContent>
                <Skeleton className="h-4 w-1/3" />
              </ItemContent>
            </Item>
          ))}
        {!isPending && !choosable.length && <p className="px-3 py-2.5 text-sm text-muted-foreground">{isError ? t.unavailable : t.none}</p>}
        {choosable.map((a, i) => {
          const locked = props.locked?.includes(a.id) ?? false;
          return (
            <Fragment key={a.id}>
              {i > 0 && <ItemSeparator className="my-0" />}
              <Item size="sm" className="rounded-none" data-disabled={locked || undefined} render={<label htmlFor={`target-${a.id}`} />}>
                <ItemMedia>
                  <AgentAvatar agent={{ avatar: { shape: a.avatarShape, color: a.avatarColor } }} className="size-6" />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>{a.name}</ItemTitle>
                </ItemContent>
                <ItemActions>
                  {locked && <Badge variant="secondary">{props.lockedLabel ?? t.installed}</Badge>}
                  <Checkbox id={`target-${a.id}`} checked={locked || props.value.includes(a.id)} disabled={locked} onCheckedChange={() => toggle(a.id)} />
                </ItemActions>
              </Item>
            </Fragment>
          );
        })}
      </ItemGroup>
    </FieldSet>
  );
}
