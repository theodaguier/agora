import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { ControlField, ListGroup } from "heroui-native";
import { AgentAvatar } from "@/components/agent-avatar";
import { Section } from "@/components/admin/ui";
import { adminAgentsQuery, isDefaultProfile } from "@/lib/agents-admin";

/* apps/web/src/components/marketplace/AgentTargets.tsx */

/** Bots to install or enable something for; the default profile is left out when it already sees everything. */
export function AgentTargets(props: { legend: string; hint?: string; value: string[]; onChange: (ids: string[]) => void; withoutDefault?: boolean }) {
  const { data: agents = [] } = useQuery(adminAgentsQuery);
  const choosable = props.withoutDefault ? agents.filter((a) => !isDefaultProfile(a)) : agents;
  const toggle = (id: string) => {
    void Haptics.selectionAsync();
    props.onChange(props.value.includes(id) ? props.value.filter((x) => x !== id) : [...props.value, id]);
  };
  if (!choosable.length) return null;
  return (
    <Section title={props.legend} footer={props.hint}>
      {choosable.map((a) => {
        const checked = props.value.includes(a.id);
        return (
          // A checkbox row: a ControlField the whole row toggles, as HeroUI's ListGroup example.
          <ControlField
            key={a.id}
            isSelected={checked}
            onSelectedChange={() => toggle(a.id)}
            accessibilityLabel={a.name}
            className="flex-row items-center gap-3 px-4 py-3"
          >
            <AgentAvatar agent={{ avatar: { shape: a.avatarShape, color: a.avatarColor } }} size={30} />
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle>{a.name}</ListGroup.ItemTitle>
            </ListGroup.ItemContent>
            <ControlField.Indicator variant="checkbox" />
          </ControlField>
        );
      })}
    </Section>
  );
}
