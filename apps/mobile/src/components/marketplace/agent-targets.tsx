import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { ControlField, ListGroup, Typography } from "heroui-native";
import { AgentAvatar } from "@/components/agent-avatar";
import { Section } from "@/components/admin/ui";
import { adminAgentsQuery, isDefaultProfile } from "@/lib/agents-admin";
import { defineMessages } from "@/lib/i18n";

/* apps/web/src/components/marketplace/AgentTargets.tsx */

const t = defineMessages({
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
        const installed = props.installed?.includes(a.id) ?? false;
        const checked = installed || props.value.includes(a.id);
        return (
          // A checkbox row: a ControlField the whole row toggles, as HeroUI's ListGroup example.
          <ControlField
            key={a.id}
            isSelected={checked}
            isDisabled={installed}
            onSelectedChange={() => toggle(a.id)}
            accessibilityLabel={installed ? `${a.name}, ${t.installed}` : a.name}
            className="flex-row items-center gap-3 px-4 py-3"
          >
            <AgentAvatar agent={{ avatar: { shape: a.avatarShape, color: a.avatarColor } }} size={30} />
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle>{a.name}</ListGroup.ItemTitle>
            </ListGroup.ItemContent>
            {installed && (
              <Typography type="body-sm" color="muted">
                {t.installed}
              </Typography>
            )}
            <ControlField.Indicator variant="checkbox" />
          </ControlField>
        );
      })}
    </Section>
  );
}
