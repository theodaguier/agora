import type { InboxRelay } from "@agora/core";
import { simple } from "@agora/core/i18n";
import { Link } from "@tanstack/react-router";
import { Item, ItemContent, ItemDescription } from "@/components/ui/item";
import { useT } from "@/i18n";
import { TaskRef } from "@/components/TaskRef";

/*
 * Figma « Mode simple », a colleague's request in the chat: what landed in their inbox, quoted under their
 * assistant's line (« Chloé t'a écrit dans … : »). It opens where it was said; a task shows as cited.
 * apps/mobile/src/components/simple/relay-card.tsx is its twin.
 */
export function RelayCard({ relay }: { relay: InboxRelay }) {
  const t = useT(simple);
  const quote = (
    <ItemContent>
      <ItemDescription className="line-clamp-6 border-l-2 pl-3 text-foreground">{relay.text}</ItemDescription>
    </ItemContent>
  );
  // A task: shown as it is cited in a message, its card on hover.
  if (relay.taskId)
    return (
      <Item variant="outline" className="mt-2 max-w-md">
        <ItemContent>
          <TaskRef taskId={relay.taskId} />
        </ItemContent>
      </Item>
    );
  if (!relay.conversationId)
    return (
      <Item variant="outline" className="mt-2 max-w-md">
        {quote}
      </Item>
    );
  return (
    <Item
      variant="outline"
      className="mt-2 max-w-md"
      render={<Link to="/c/$conversationId" params={{ conversationId: relay.conversationId }} search={relay.messageId ? { m: relay.messageId } : {}} aria-label={`${t.open}: ${relay.text}`} />}
    >
      {quote}
    </Item>
  );
}
