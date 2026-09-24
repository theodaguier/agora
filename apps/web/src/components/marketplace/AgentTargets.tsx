import { useQuery } from "@tanstack/react-query";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { adminAgentsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** Bots to install or enable something for; the default profile is left out when it already sees everything. */
export function AgentTargets(props: { legend: string; hint?: string; value: string[]; onChange: (ids: string[]) => void; withoutDefault?: boolean }) {
  const { data: agents = [] } = useQuery(adminAgentsQuery);
  const choosable = props.withoutDefault ? agents.filter((a) => a.hermesProfile !== "default") : agents;
  const toggle = (id: string) => props.onChange(props.value.includes(id) ? props.value.filter((x) => x !== id) : [...props.value, id]);
  return (
    <FieldSet className="gap-0">
      <FieldLegend variant="label">{props.legend}</FieldLegend>
      <div className="overflow-hidden rounded-2xl border border-border">
        {choosable.map((a, i) => (
          <Field key={a.id} orientation="horizontal" className={cn("gap-3 px-4 py-2.5 hover:bg-secondary/60", i > 0 && "border-t border-border")}>
            <Checkbox id={`target-${a.id}`} checked={props.value.includes(a.id)} onCheckedChange={() => toggle(a.id)} />
            <FieldLabel htmlFor={`target-${a.id}`} className="cursor-pointer items-center gap-3 font-normal">
              <AgentAvatar agent={{ avatar: { shape: a.avatarShape, color: a.avatarColor } }} className="size-7" />
              {a.name}
            </FieldLabel>
          </Field>
        ))}
      </div>
      {props.hint && <FieldDescription className="mt-2 text-xs">{props.hint}</FieldDescription>}
    </FieldSet>
  );
}
