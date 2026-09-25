import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, type AdminAgent } from "@/lib/api";
import { adminAgentsQuery, agentsQuery, conversationsQuery } from "@/lib/queries";
import { AvatarPicker } from "./AvatarPicker";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";

const messages = defineMessages({
  en: { name: "Name", avatar: "Avatar", profile: (p: string) => `Hermes profile: ${p}. Set when the agent was created.` },
  fr: { name: "Nom", avatar: "Avatar", profile: (p: string) => `Profil Hermes : ${p}. Fixé à la création de l'agent.` },
});

/** The agent's name and avatar. The Hermes profile itself does not change after creation. */
export function AgentProfile({ agent }: { agent: AdminAgent }) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const [name, setName] = useState(agent.name);
  const [shape, setShape] = useState(agent.avatarShape);
  const [color, setColor] = useState(agent.avatarColor);
  const dirty = name.trim() !== agent.name || shape !== agent.avatarShape || color !== agent.avatarColor;

  const save = useMutation({
    mutationFn: () =>
      api(`/admin/agents/${encodeURIComponent(agent.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim(), avatarShape: shape, avatarColor: color }),
      }),
    // The name and avatar show up everywhere: list, threads, headers.
    onSuccess: () =>
      Promise.all(
        [adminAgentsQuery.queryKey, agentsQuery.queryKey, conversationsQuery.queryKey, ["conversation"]].map((queryKey) =>
          qc.invalidateQueries({ queryKey }),
        ),
      ),
    meta: { success: c.saved },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && name.trim()) save.mutate();
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`agent-name-${agent.id}`}>{t.name}</FieldLabel>
          <Input id={`agent-name-${agent.id}`} value={name} maxLength={60} required onChange={(e) => setName(e.target.value)} />
          <FieldDescription>{t.profile(agent.hermesProfile)}</FieldDescription>
        </Field>
        <FieldSet>
          <FieldLegend variant="label">{t.avatar}</FieldLegend>
          <AvatarPicker shape={shape} color={color} onShapeChange={setShape} onColorChange={setColor} />
        </FieldSet>
        <Field orientation="horizontal">
          <Button type="submit" disabled={!dirty || !name.trim() || save.isPending}>
            {save.isPending ? c.saving : c.save}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
