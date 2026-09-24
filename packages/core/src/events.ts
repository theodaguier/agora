/**
 * System events posted in a conversation ("Théo added Legal"). They are stored
 * with their parameters so every member reads them in their own language; the
 * message text holds a rendering in the organization's language, used for the
 * agents' context and as a fallback.
 */
export type ConversationEvent =
  | { type: "group.created"; actor: string }
  | { type: "group.renamed"; actor: string; title: string }
  | { type: "group.unnamed"; actor: string }
  | { type: "members.added"; actor: string; names: string[] }
  | { type: "member.removed"; actor: string; name: string }
  | { type: "member.left"; actor: string }
  | { type: "bot.failed"; bot: string }
  | { type: "bot.noAllowedModel"; bot: string }
  /** The API restarted while the bot was replying: the reply is lost. */
  | { type: "bot.interrupted"; bot: string }
  | { type: "relay.limit" }
  /** Posted in a direct conversation: the bot brought other bots into a group opened from it. */
  | { type: "relay.group"; bot: string; bots: string[]; conversationId: string }
  | { type: "session.reset"; actor: string }
  | { type: "session.compacted"; actor: string }
  | { type: "session.compactFailed"; bot: string }
  | { type: "agent.updated" }
  | { type: "agent.ready"; name: string }
  | { type: "skill.refused"; skill: string }
  | { type: "skill.installed"; skill: string; bot: string }
  | { type: "skill.shared"; skill: string }
  | { type: "skill.failed"; skill: string; error: string }
  | { type: "mcp.exists"; name: string }
  | { type: "mcp.approved"; title: string }
  | { type: "mcp.refused"; title: string }
  | { type: "mcp.installed"; title: string; tools: number; bot: string | null; restartNeeded: boolean }
  /** A bot asked for a connector the instance already has: turned on for it (admin requester). */
  | { type: "mcp.enabled"; title: string; bot: string; restartNeeded: boolean }
  /** Same, but an admin has to turn it on for the bot. */
  | { type: "mcp.notEnabled"; title: string; bot: string }
  /** A request for this connector is already waiting for an admin or for its authorization. */
  | { type: "mcp.pending"; title: string }
  | { type: "task.assigned"; actor: string; title: string; assignee: string }
  | { type: "task.status"; actor: string; title: string; status: "todo" | "in_progress" | "done" }
  | { type: "task.priority"; actor: string; title: string; priority: "low" | "normal" | "high" | "urgent" }
  /** `until` null: turned off; shown in the person's time zone. */
  | { type: "availability.dnd"; actor: string; person: string; until: string | null; timezone: string }
  | { type: "availability.hours"; actor: string; person: string }
  | { type: "availability.absence"; actor: string; person: string; kind: "vacation" | "sick" | "other"; startOn: string; endOn: string; removed: boolean };

export type EventLocale = "en" | "fr";

const list = (names: string[], and: string) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} ${and} ${names.at(-1)}`;

export function renderEvent(e: ConversationEvent, locale: EventLocale): string {
  const fr = locale === "fr";
  switch (e.type) {
    case "group.created":
      return fr ? `${e.actor} a créé le groupe` : `${e.actor} created the group`;
    case "group.renamed":
      return fr ? `${e.actor} a renommé le groupe « ${e.title} »` : `${e.actor} renamed the group “${e.title}”`;
    case "group.unnamed":
      return fr ? `${e.actor} a retiré le nom du groupe` : `${e.actor} removed the group name`;
    case "members.added":
      return fr ? `${e.actor} a ajouté ${list(e.names, "et")}` : `${e.actor} added ${list(e.names, "and")}`;
    case "member.removed":
      return fr ? `${e.actor} a retiré ${e.name}` : `${e.actor} removed ${e.name}`;
    case "member.left":
      return fr ? `${e.actor} a quitté le groupe` : `${e.actor} left the group`;
    case "bot.failed":
      return fr ? `${e.bot} n'a pas pu répondre.` : `${e.bot} couldn't reply.`;
    case "bot.interrupted":
      return fr
        ? `La réponse de ${e.bot} a été interrompue par un redémarrage du serveur. Renvoie ton message pour la relancer.`
        : `${e.bot}'s reply was interrupted by a server restart. Send your message again to retry.`;
    case "bot.noAllowedModel":
      return fr
        ? `${e.bot} n'a pas pu répondre : aucun de ses modèles n'est autorisé. Voir avec un administrateur.`
        : `${e.bot} couldn't reply: none of its models are allowed. Check with an administrator.`;
    case "agent.updated":
      return fr ? "Personnalité de l'agent mise à jour" : "Agent personality updated";
    case "agent.ready":
      return fr ? `${e.name} est prêt` : `${e.name} is ready`;
    case "relay.limit":
      return fr ? "Limite de relais entre bots atteinte." : "Bot-to-bot relay limit reached.";
    case "relay.group":
      return fr ? `${e.bot} a ouvert un groupe avec ${list(e.bots, "et")}` : `${e.bot} opened a group with ${list(e.bots, "and")}`;
    case "session.reset":
      return fr ? `${e.actor} a démarré un nouveau contexte` : `${e.actor} started a fresh context`;
    case "session.compacted":
      return fr ? `${e.actor} a compacté le contexte` : `${e.actor} compacted the context`;
    case "session.compactFailed":
      return fr ? `Le contexte de ${e.bot} n'a pas pu être compacté.` : `${e.bot}'s context couldn't be compacted.`;
    case "skill.refused":
      return fr ? `Skill ${e.skill} refusé par un administrateur.` : `Skill ${e.skill} declined by an administrator.`;
    case "skill.shared":
      return fr ? `Skill ${e.skill} ajouté pour tous les bots.` : `Skill ${e.skill} added for every bot.`;
    case "skill.installed":
      return fr ? `Skill ${e.skill} installé pour ${e.bot}.` : `Skill ${e.skill} installed for ${e.bot}.`;
    case "skill.failed":
      return fr ? `Skill ${e.skill} non installé : ${e.error}` : `Skill ${e.skill} not installed: ${e.error}`;
    case "mcp.exists":
      return fr ? `Un connecteur « ${e.name} » existe déjà : demande ignorée.` : `A “${e.name}” connector already exists: request ignored.`;
    case "mcp.enabled": {
      const restart = e.restartNeeded ? (fr ? " Un administrateur doit redémarrer Hermes pour l'activer." : " An administrator must restart Hermes to enable it.") : "";
      return fr ? `Connecteur ${e.title} activé pour ${e.bot}.${restart}` : `Connector ${e.title} enabled for ${e.bot}.${restart}`;
    }
    case "mcp.notEnabled":
      return fr
        ? `Le connecteur ${e.title} existe déjà. Un administrateur peut l'activer pour ${e.bot} dans Administration › Agents.`
        : `The ${e.title} connector already exists. An administrator can enable it for ${e.bot} in Administration › Agents.`;
    case "mcp.pending":
      return fr ? `Une demande de connecteur ${e.title} est déjà en cours.` : `A request for the ${e.title} connector is already in progress.`;
    case "mcp.approved":
      return fr ? `Connecteur ${e.title} validé par un administrateur.` : `Connector ${e.title} approved by an administrator.`;
    case "mcp.refused":
      return fr ? `Connecteur ${e.title} refusé par un administrateur.` : `Connector ${e.title} declined by an administrator.`;
    case "task.assigned":
      return fr ? `${e.actor} a assigné « ${e.title} » à ${e.assignee}` : `${e.actor} assigned “${e.title}” to ${e.assignee}`;
    case "task.status":
      if (e.status === "done") return fr ? `${e.actor} a terminé « ${e.title} »` : `${e.actor} completed “${e.title}”`;
      if (e.status === "in_progress") return fr ? `${e.actor} a commencé « ${e.title} »` : `${e.actor} started “${e.title}”`;
      return fr ? `${e.actor} a remis « ${e.title} » à faire` : `${e.actor} moved “${e.title}” back to to-do`;
    case "availability.dnd": {
      if (!e.until) return fr ? `${e.actor} a désactivé « ne pas déranger » pour ${e.person}` : `${e.actor} turned off do not disturb for ${e.person}`;
      const at = new Date(e.until).toLocaleString(fr ? "fr-FR" : "en-US", { timeZone: e.timezone, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
      return fr ? `${e.actor} a mis ${e.person} en « ne pas déranger » jusqu'au ${at}` : `${e.actor} set ${e.person} to do not disturb until ${at}`;
    }
    case "availability.hours":
      return fr ? `${e.actor} a modifié les horaires de travail de ${e.person}` : `${e.actor} changed ${e.person}'s working hours`;
    case "availability.absence": {
      const d = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString(fr ? "fr-FR" : "en-US", { day: "numeric", month: "short", timeZone: "UTC" });
      const days = e.startOn === e.endOn ? (fr ? `le ${d(e.startOn)}` : `on ${d(e.startOn)}`) : fr ? `du ${d(e.startOn)} au ${d(e.endOn)}` : `from ${d(e.startOn)} to ${d(e.endOn)}`;
      // A sick day reads as a plain absence, like everywhere else.
      const what = e.kind === "vacation" ? (fr ? "un congé" : "leave") : fr ? "une absence" : "an absence";
      if (e.removed) return fr ? `${e.actor} a retiré ${what} de ${e.person} ${days}` : `${e.actor} removed ${e.person}'s ${what.replace(/^an? /, "")} ${days}`;
      return fr ? `${e.actor} a noté ${what} pour ${e.person} ${days}` : `${e.actor} added ${what} for ${e.person} ${days}`;
    }
    case "task.priority": {
      const label = fr
        ? { low: "basse", normal: "normale", high: "haute", urgent: "urgente" }[e.priority]
        : { low: "low", normal: "normal", high: "high", urgent: "urgent" }[e.priority];
      return fr ? `${e.actor} a passé « ${e.title} » en priorité ${label}` : `${e.actor} set “${e.title}” to ${label} priority`;
    }
    case "mcp.installed": {
      const tools = e.tools ? (fr ? ` (${e.tools} outil${e.tools > 1 ? "s" : ""})` : ` (${e.tools} tool${e.tools > 1 ? "s" : ""})`) : "";
      const bot = e.bot ? (fr ? ` pour ${e.bot}` : ` for ${e.bot}`) : "";
      const restart = e.restartNeeded ? (fr ? " Un administrateur doit redémarrer Hermes pour l'activer." : " An administrator must restart Hermes to enable it.") : "";
      return fr ? `Connecteur ${e.title} installé${tools}${bot}.${restart}` : `Connector ${e.title} installed${tools}${bot}.${restart}`;
    }
  }
}
