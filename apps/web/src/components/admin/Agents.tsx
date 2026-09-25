import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRightIcon } from "@/components/icons";
import { useState } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { type AvatarShape } from "@/lib/agent-avatar";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { api, type AdminAgent } from "@/lib/api";
import { adminAgentsQuery, agentsQuery } from "@/lib/queries";
import { AgentDetail } from "./AgentDetail";
import { AvatarPicker } from "./AvatarPicker";
import { avatarColors } from "../../lib/agent-avatar";
import { defineMessages, useT } from "@/i18n";
import { ErrorText, FormCard, SectionHeader } from "./ui";

const messages = defineMessages({
  en: {
    title: "Agents",
    text: "Each agent is a Hermes profile with its own model, tools and skills.",
    newAgent: "New agent",
    agentName: "Agent name",
    profile: "Hermes profile",
    profilePattern: "lowercase letters, digits and hyphens",
    profilePlaceholder: "hermes-profile",
    profileHelp: "The Hermes profile is created from the default profile (model, tools, skills), then editable here.",
    creating: "Creating the Hermes profile…",
    created: (name: string) => `${name} created.`,
    create: "Create agent",
  },
  fr: {
    title: "Agents",
    text: "Chaque agent est un profil Hermes : son modèle, ses outils et ses skills lui sont propres.",
    newAgent: "Nouvel agent",
    agentName: "Nom de l'agent",
    profile: "Profil Hermes",
    profilePattern: "minuscules, chiffres et tirets",
    profilePlaceholder: "profil-hermes",
    profileHelp: "Le profil Hermes est créé à partir du profil par défaut (modèle, outils, skills), puis modifiable ici.",
    creating: "Création du profil Hermes…",
    created: (name: string) => `${name} créé.`,
    create: "Créer l'agent",
  },
});

export function Agents() {
  const t = useT(messages);
  const { data: agents = [] } = useQuery(adminAgentsQuery);
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const current = agents.find((a) => a.id === selected);

  if (current) return <AgentDetail agent={current} onBack={() => setSelected(null)} />;

  return (
    <>
      <SectionHeader
        title={t.title}
        text={t.text}
        action={t.newAgent}
        onAction={() => setOpen(true)}
      />
      {open && <CreateAgent onClose={() => setOpen(false)} />}
      <ItemGroup className="gap-2">
        {agents.map((a) => (
          <Item key={a.id} variant="outline" role="listitem" render={<button type="button" onClick={() => setSelected(a.id)} />}>
            <ItemMedia>
              <AgentAvatar agent={{ avatar: { shape: a.avatarShape, color: a.avatarColor } }} className="size-9" />
            </ItemMedia>
            <ItemContent className="text-left">
              <ItemTitle>{a.name}</ItemTitle>
              <ItemDescription>{a.hermesProfile}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>
    </>
  );
}

function CreateAgent({ onClose }: { onClose: () => void }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const [shape, setShape] = useState<AvatarShape>("bean");
  const [color, setColor] = useState(avatarColors[0]!);
  const create = useMutation({
    mutationFn: (body: Omit<AdminAgent, "id">) => api("/admin/agents", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      onClose();
      qc.invalidateQueries({ queryKey: adminAgentsQuery.queryKey });
      qc.invalidateQueries({ queryKey: agentsQuery.queryKey });
    },
    meta: { loading: t.creating, success: (_: unknown, body: Omit<AdminAgent, "id">) => t.created(body.name), error: false },
  });

  return (
    <FormCard title={t.newAgent} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          create.mutate({
            name: String(f.get("name")),
            hermesProfile: String(f.get("profile")),
            avatarShape: shape,
            avatarColor: color,
          });
        }}
      >
        <FieldGroup>
          <div className="flex items-center gap-3">
            <AgentAvatar agent={{ avatar: { shape, color } }} className="size-12" />
            <Field>
              <FieldLabel htmlFor="new-agent-name" className="sr-only">{t.agentName}</FieldLabel>
              <Input id="new-agent-name" name="name" required placeholder={t.agentName} />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-agent-profile" className="sr-only">{t.profile}</FieldLabel>
              <Input
                id="new-agent-profile"
                name="profile"
                required
                pattern="[a-z0-9][a-z0-9\-]{0,39}"
                title={t.profilePattern}
                placeholder={t.profilePlaceholder}
              />
            </Field>
          </div>
          <AvatarPicker shape={shape} color={color} onShapeChange={setShape} onColorChange={setColor} />
          <FieldDescription>{t.profileHelp}</FieldDescription>
          <Field orientation="horizontal">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? t.creating : t.create}
            </Button>
            <ErrorText error={create.error} />
          </Field>
        </FieldGroup>
      </form>
    </FormCard>
  );
}
