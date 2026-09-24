import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AgentAvatar } from "@/components/AgentAvatar";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { defineMessages, useT } from "@/i18n";
import { api } from "@/lib/api";
import { mentionStyle, type MentionTarget } from "@/lib/mentions";
import { openAgentProfile, openProfile } from "@/lib/profile";
import { conversationsQuery, userProfileQuery } from "@/lib/queries";

const messages = defineMessages({
  en: { bot: "Bot", viewProfile: "View profile", message: "Send a message" },
  fr: { bot: "Bot", viewProfile: "Voir le profil", message: "Envoyer un message" },
});

/** A colored "@Name" with the avatar of whoever it designates; hovering shows their card. */
export function Mention({ text, color, target }: { text: string; color: string; target?: MentionTarget }) {
  const pill = "rounded-[5px] px-[3px] font-medium";
  if (!target) {
    return (
      <span className={pill} style={mentionStyle(color)}>
        {text}
      </span>
    );
  }
  const avatar = "mr-[3px] inline-block size-[1.05em] align-[-0.18em]";
  return (
    <HoverCard>
      <HoverCardTrigger delay={300} render={<span className={`${pill} cursor-default whitespace-nowrap`} style={mentionStyle(color)} />}>
        {target.kind === "agent" ? <AgentAvatar agent={target.agent} className={avatar} /> : <PersonAvatar person={target.person} className={avatar} />}
        {text}
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-72 p-3">
        {target.kind === "agent" ? <AgentCard agent={target.agent} /> : <PersonCard person={target.person} />}
      </HoverCardContent>
    </HoverCard>
  );
}

function AgentCard({ agent }: { agent: Extract<MentionTarget, { kind: "agent" }>["agent"] }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const open = useMutation({
    mutationFn: () => api<{ id: string }>("/conversations/direct", { method: "POST", body: JSON.stringify({ agentId: agent.id }) }),
    onSuccess: async ({ id }) => {
      await qc.invalidateQueries({ queryKey: conversationsQuery.queryKey });
      navigate({ to: "/c/$conversationId", params: { conversationId: id } });
    },
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <AgentAvatar agent={agent} className="size-10" />
        <div className="min-w-0">
          <p className="truncate font-medium">{agent.name}</p>
          <p className="text-[13px] text-muted-foreground">{t.bot}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={() => openAgentProfile(agent.id)}>
          {t.viewProfile}
        </Button>
        <Button variant="secondary" size="sm" className="flex-1" disabled={open.isPending} onClick={() => open.mutate()}>
          {t.message}
        </Button>
      </div>
    </div>
  );
}

function PersonCard({ person }: { person: Extract<MentionTarget, { kind: "person" }>["person"] }) {
  const t = useT(messages);
  // Mounted only while the card is open: the full profile (bio) is fetched on hover.
  const { data: profile } = useQuery(userProfileQuery(person.id));
  const title = profile?.title || person.title;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <PersonAvatar person={person} className="size-10" />
        <div className="min-w-0">
          <p className="truncate font-medium">{person.name}</p>
          <p className="truncate text-[13px] text-muted-foreground">{[title, `@${person.handle}`].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      {profile?.bio && <p className="line-clamp-3 text-[13px] text-muted-foreground">{profile.bio}</p>}
      <Button variant="secondary" size="sm" onClick={() => openProfile(person.id)}>
        {t.viewProfile}
      </Button>
    </div>
  );
}
