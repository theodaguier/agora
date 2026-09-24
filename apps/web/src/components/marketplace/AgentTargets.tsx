import { useQuery } from "@tanstack/react-query";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { adminAgentsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { defineMessages, useT } from "@/i18n";

const messages = defineMessages({
  en: { installed: "Installed" },
  fr: { installed: "Installé" },
});

/**
 * Bots to install or enable something for; the default profile is left out when it already sees everything.
 * `installed`: bots that already have it, shown checked and locked.
 */
export function AgentTargets(props: {
  legend: string;
  hint?: string;
  value: string[];
  onChange: (ids: string[]) => void;
  withoutDefault?: boolean;
  installed?: string[];
}) {
  const t = useT(messages);
  const { data: agents = [] } = useQuery(adminAgentsQuery);
  const choosable = props.withoutDefault ? agents.filter((a) => a.hermesProfile !== "default") : agents;
  const toggle = (id: string) => props.onChange(props.value.includes(id) ? props.value.filter((x) => x !== id) : [...props.value, id]);
  return (
    <FieldSet className="gap-0">
      <FieldLegend variant="label">{props.legend}</FieldLegend>
      <div className="overflow-hidden rounded-2xl border border-border">
        {choosable.map((a, i) => {
          const installed = props.installed?.includes(a.id) ?? false;
          return (
            <Field
              key={a.id}
              orientation="horizontal"
              data-disabled={installed || undefined}
              className={cn("gap-3 px-4 py-2.5", !installed && "hover:bg-secondary/60", i > 0 && "border-t border-border")}
            >
              <Checkbox
                id={`target-${a.id}`}
                checked={installed || props.value.includes(a.id)}
                disabled={installed}
                onCheckedChange={() => toggle(a.id)}
              />
              <FieldLabel htmlFor={`target-${a.id}`} className={cn("items-center gap-3 font-normal", !installed && "cursor-pointer")}>
                <AgentAvatar agent={{ avatar: { shape: a.avatarShape, color: a.avatarColor } }} className="size-7" />
                {a.name}
              </FieldLabel>
              {installed && <span className="ml-auto shrink-0 text-sm text-muted-foreground">{t.installed}</span>}
            </Field>
          );
        })}
      </div>
      {props.hint && <FieldDescription className="mt-2 text-xs">{props.hint}</FieldDescription>}
    </FieldSet>
  );
}
