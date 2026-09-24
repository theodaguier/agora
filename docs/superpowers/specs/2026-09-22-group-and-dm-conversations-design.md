# Real-time group conversations and direct messages

Date: 2026-09-22 · Status: implemented (steps 1 to 3)

## Goal

Enable in e-do bots:

- **direct messages between employees** (human ↔ human), in real time;
- **group conversations** mixing humans and bots, where bots reply on @mention and can hand off to each other.

The current threads (one employee ↔ one bot) become a special case of direct conversation, with no loss of history or Hermes session.

## Settled decisions

| Topic | Decision |
|---|---|
| Entry point | NewChat's "To:" menu: "Create a group conversation" under "Create a new Bot", colleagues listed alongside bots (like Grok Bot). |
| Bots speaking in a group | On @mention only. A bot can @mention another bot in the group to hand off, limited to 4 handoffs per human message. |
| Access to bots | The group opens access: you can only add bots you have access to (`agent_access`); after that any member can mention them. |
| A bot's context in a group | One Hermes session per (group, bot). On each mention, it is sent the group messages posted since its last turn, with their authors. |
| Who can message whom | Any app user can message any other (same company). |
| Real-time transport | Per-user SSE (`GET /api/events`) + in-memory event bus behind a `publish/subscribe` interface. Sending via `POST`. WebSocket ruled out. |
| Bot execution | In the background, decoupled from the HTTP request; progress is broadcast to all members. |

## 1. Data model

`thread` is replaced by `conversation`. **Identifiers are preserved** during the migration, so existing Hermes sessions (`edo-<threadId>[-rN]`) remain valid.

### `conversation`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | Reuses `thread.id` for migrated threads. |
| `kind` | text | `direct` \| `group` |
| `title` | text null | Empty for a direct conversation; editable name for a group. |
| `directKey` | text null, unique | Sorted pair of participants, e.g. `a:<agentId>\|u:<userId>` or `u:<id1>\|u:<id2>`. Empty for a group. Guarantees a single direct conversation per pair. |
| `createdBy` | text → user.id, `set null` | |
| `createdAt`, `updatedAt` | timestamp | |

### `conversation_member` (humans)

`conversationId` → conversation (cascade), `userId` → user (cascade), `lastReadAt`, `joinedAt`. PK (conversationId, userId). Index on `userId`.

### `conversation_agent` (bots)

`conversationId` → conversation (cascade), `agentId` → agent (cascade), `addedBy` → user (`set null`), `model` text null (format `provider::model`, carried over from `thread.model`), `seenUntil` timestamp null (date of the last message already passed to this bot). PK (conversationId, agentId).

Two tables rather than a single `participant` table with two nullable columns: the fields differ (`lastReadAt` for a human, `model` and `seenUntil` for a bot) and queries stay simple.

### `message`

- `threadId` becomes `conversationId`.
- Adds `authorUserId` (→ user, `set null`) and `authorAgentId` (→ agent, `set null`), both nullable. For an `event` message, both are empty.
- `kind` keeps the values `user | bot | event` (`user` = any human).
- `data` additionally accepts `mentions: string[]` (agentIds), alongside `attachments`, `invocations`, `tools` and `choices`.
- The `(conversationId, createdAt)` index is kept.

### `attachment`

- `threadId` becomes `conversationId`.
- File location: in a direct conversation with a bot, it does not change (`<profile>/attachments/edo/`). In a group, it is `HERMES_HOME/edo-attachments/<conversationId>/`.
- **To check at the start of step 3**: can Hermes's file tools (`read_file`, `vision_analyze`) read outside the profile directory? If not, the file is copied into `<profile>/attachments/edo/` of each mentioned bot at send time.
- No attachments in human-to-human conversations in v1.

### Hermes sessions

- Direct conversation with a bot: `edo-<conversationId>[-rN]` (unchanged).
- Group: `edo-<conversationId>-<agentId>[-rN]`.
- `bumpAgentRevision` posts its `event` message in every conversation the agent belongs to (groups included).

### Migration

A single Drizzle migration file, generated then completed by hand with the SQL that moves the data:

1. Create `conversation`, `conversation_member` and `conversation_agent`.
2. For each `thread`: one `conversation` (same id, `kind = direct`, `directKey = 'a:'||agentId||'|u:'||userId`, `createdBy = userId`), one member (`lastReadAt` carried over) and one bot (`model` carried over, `seenUntil = null`).
3. `message`: add `conversationId` and the author columns, fill them (`kind = user` → `authorUserId = thread.userId`, `kind = bot` → `authorAgentId = thread.agentId`), repoint the foreign key, drop `threadId`.
4. `attachment`: same repointing.
5. Drop `thread`.

No machine-specific paths in the migration.

## 2. Real time and bot execution

### Event bus (`apps/api/src/events.ts`)

- In-memory table mapping each `userId` to its subscribers (one per open tab).
- `publishToUser(userId, event)` and `publishToConversation(conversationId, event)`. The latter looks up the human members; the list is cached and invalidated when membership changes.
- Isolated `publish/subscribe` interface, so it can move to Postgres `LISTEN/NOTIFY` once there are several API instances.

### `GET /api/events` stream (SSE)

- Protected by `requireUser`. Keep-alive signal (`ping`) every 25 s, below the 255 s `idleTimeout`.
- No replay: on (re)connection, the client invalidates its queries and reloads over REST.
- Events, all carrying `conversationId`:
  - `message.created` `{ message }`
  - `conversation.updated` `{ conversationId }` (creation, members, title)
  - `read` `{ userId, at }`
  - `typing` `{ userId }`
  - `bot.started` `{ turnId, agentId }`, `bot.delta` `{ turnId, text }`, `bot.tool` `{ turnId, name, status, label? }`, `bot.done` `{ turnId, messageId }`, `bot.error` `{ turnId, message }`

### REST API (`apps/api/src/routes/conversations.ts`)

| Method | Route | Purpose |
|---|---|---|
| GET | `/conversations` | Sidebar list: type, title, participants (avatars), preview with author, unread. |
| POST | `/conversations/direct` | `{ userId }` or `{ agentId }`: opens or creates the direct conversation (checks `agent_access` for a bot). |
| POST | `/conversations/group` | `{ title?, userIds[], agentIds[] }`: at least 2 participants besides the creator; bots limited to those the creator can access and not in setup (`onboarding = false`). |
| GET | `/conversations/:id` | Details and members. |
| PATCH | `/conversations/:id` | Rename (group). |
| POST / DELETE | `/conversations/:id/members` | Add or remove humans and bots (rules in part 3). |
| GET / POST | `/conversations/:id/messages` | History (last 500) / send. |
| POST | `/conversations/:id/read` | Updates `lastReadAt` and publishes `read`. |
| POST | `/conversations/:id/typing` | Publishes `typing`. |
| POST | `/conversations/:id/attachments` | File upload (direct with a bot, or group). |
| GET / PUT | `/conversations/:id/models`, `/model` | Direct conversation with a bot only. |
| GET | `/conversations/:id/commands` | Direct conversation with a bot only. |
| POST | `/conversations/:id/turns/:turnId/cancel` | Stops a bot turn. |

Every `/:id/*` route checks that the user is a member and returns `404` otherwise. `routes/agents.ts` keeps bot creation (`POST /agents`) and the list of accessible bots, used by NewChat.

### Sending a message

`POST /conversations/:id/messages` with `{ text, attachmentIds, invocations, mentions }`:

1. Validate (current rules, plus `mentions`: agentIds, filtered against `conversation_agent`; an invalid mention is ignored).
2. Save the message with `authorUserId` and publish `message.created`.
3. Decide on bot turns:
   - direct conversation with a bot: the bot, on every message;
   - direct conversation between humans: none;
   - group: each mentioned bot.
4. Respond `201 { message }` immediately.

`invocations` (`/skill`, MCP) is only accepted in a direct conversation with a bot.

### Bot execution (`apps/api/src/bot-runner.ts`)

- **A single queue per (conversation, bot) pair**, an in-memory promise chain: a bot never processes two turns at once in the same Hermes session. Different bots reply in parallel.
- Each turn has a registered `turnId` and `AbortController`, so it can be cancelled.
- Turn flow:
  1. Publish `bot.started`.
  2. Build the message for Hermes:
     - direct conversation: as today (invocations, attachments, setup prompt if `onboarding`);
     - group: messages after `seenUntil`, excluding this bot's own, formatted `[Name] text` (`[Bot Name]` for a bot), then the triggering message and its attachments.
  3. For a group, `turnContext` adds: the group name, the human members, the other bots that can be @mentioned, and the rule "only mention another bot to hand off to it".
  4. `chat()`; publish `bot.delta` and `bot.tool` as they come.
  5. Save the bot's message (`authorAgentId`), publish `message.created` and `bot.done`, and set `seenUntil` to the date of the last message passed on.
  6. In a direct conversation: the current setup logic (`parseReply`, rename, `writeSoul`, `bumpAgentRevision`) is moved here unchanged.
  7. In a group, **handoff**: if the reply contains `@Name` of another bot in the group (exact name match, not itself), queue a turn for that bot with `hops + 1`. At `hops = 4`, nothing is queued and an `event` message "Bot relay limit reached" is added.
- A bot in setup (`onboarding = true`) cannot be added to a group.

## 3. Interface

### Routes

- `/c/$conversationId`: conversation screen.
- `/a/$agentId` remains a redirect: `POST /conversations/direct { agentId }`, then `/c/<id>`.
- `/new`: NewChat.

### NewChat ("To:")

List, in order:

1. "Create a new Bot" (admins);
2. "Create a group conversation" (`Users` icon);
3. accessible bots;
4. colleagues (initials avatar).

The search filter applies to bots and colleagues. Picking a bot or a colleague opens or creates the direct conversation.

In **group** mode, the "To:" field switches to multi-select:

- each choice becomes a chip; backspace in the empty field removes the last one;
- the list only shows bots and colleagues not yet chosen;
- an optional "Group name" field and a "Create" button, enabled from 2 participants besides yourself;
- Escape returns to normal mode.

### Sidebar

- Single list of conversations (`GET /conversations`), sorted by last message.
- Avatar by type: the bot's avatar, the colleague's initials, or a stack of 2 or 3 avatars for a group.
- Group title: its name, otherwise the participants' first names.
- Preview prefixed by the author in a group ("Léa: …").
- Unread: last message from another author newer than `lastReadAt`, updated in real time.

### Conversation screen

- My messages: `UserBubble`, on the right.
- Other humans: new `PeerBubble`, on the left.
- Bots: `BotBubble`.
- In a group, the author's avatar and name are shown at the start of each run of consecutive messages.
- One provisional bubble per in-progress bot turn (store `turnId` → partial text, tools), with `ToolLine`. Several bots can write at the same time.
- "X is typing…" (`TypingBubble`): the indicator disappears 5 s after the last `typing`. The client sends `typing` at most every 3 s.
- The stop button calls `cancel` on the in-progress turn you triggered.
- Composer:
  - `@` opens a menu of the group's bots, built on the `SlashMenu` model. The mention is inserted as `@Name` and the agentId is kept aside for sending;
  - `/` (skills, MCP) and `ModelPicker` only exist in a direct conversation with a bot.
- Group header: title and stacked avatars; a click opens the members panel. Direct conversation header: as today.

### Members panel (group)

It takes the place of `RightPanel`.

- It lists humans and bots.
- Any member can add colleagues and bots (only those they have access to) and rename the group.
- Anyone can leave the group; only the creator or an admin can remove someone else.
- Each change adds an `event` message ("Théo added Real Estate Agent") and publishes `conversation.updated`.
- A group with no humans is deleted.

### Real-time client

- `useEvents()` is mounted in `AppShell` and opens a single `EventSource` on `/api/events`.
- `message.created`: appended to `["messages", conversationId]` (deduplicated by id), then `["conversations"]` is invalidated.
- `bot.*`: updates the in-progress turns store; `bot.done` and `bot.error` clear it for that turn.
- `conversation.updated`: invalidates `["conversations"]` and `["conversation", id]`.
- Reconnection: clear the turns store and invalidate all conversation queries.

### Out of scope for v1

Browser or push notifications, human mentions, reactions, message editing and deletion, message search, attachments between humans, `/skill` in a group.

## 4. Errors

- **Hermes failure**: publish `bot.error`, save an `event` message "<Bot> could not reply" and do not update `seenUntil`. If part of the reply was already written, it is saved.
- **Cancelled turn**: save what was already written and update `seenUntil`.
- **Bot removed or deleted during a turn**: the turn completes without publishing its result; pending turns for that bot are dropped.
- **API restart**: in-progress turns are lost. The client recovers by reloading its data on reconnection.
- **Access**: `404` for a non-member; the bus only sends an event to members.

## 5. Tests

Add `bun test` in `apps/api` for the pure logic:

- `directKey`: the result does not depend on order and covers human/bot and human/human pairs;
- group context formatting: authors, excluding the bot's own messages, honoring `seenUntil`;
- handoff detection: group bots only, not itself, stops at 4 handoffs;
- migration: on an already populated dev database, identifiers and history preserved, and a direct conversation's `hermesSessionId` identical to the old one.

Simulated mode (empty `HERMES_API_URL`): if the received text contains `handoff`, the fake bot mentions the first other bot in the list it is given, to test handoffs without Hermes.

Manual end-to-end check, with two browsers and two accounts, in simulated mode then with Hermes: a direct message between humans, a group with two bots, an @mention, a handoff, stopping a turn and a network drop.

## 6. Delivery order

1. **Foundation**: schema, migration, bus, `/api/events`, runner, `/conversations` routes, switching Thread and the Sidebar to conversations. The user-facing behavior is the same as today.
2. **Direct messages between humans**: colleagues in NewChat, `PeerBubble`, "is typing", real-time unread counts.
3. **Groups**: creation with multi-select, @mentions, group context, handoff, members panel, attachments in groups.

## Hermes dependencies

No new dependency: `/v1/chat/completions` (stream, `X-Hermes-Session-Id`), `/v1/skills`, `/api/model/options` and `/p/<profile>` routing. Hermes must keep accepting any `X-Hermes-Session-Id` (group format `edo-<conversationId>-<agentId>[-rN]`). This has been flagged to the session writing the Hermes compatibility check (`hermes-contract.ts`).

## Deviations and clarifications during implementation

- **Date precision**: Postgres keeps microseconds, a JS `Date` truncates them. The group context bounds (`seenUntil`, triggering message) are therefore compared in SQL (`unseenMessages`), and `seenUntil` receives the triggering message's date as read in SQL. The list's date aggregates (`max(created_at)`) go through `.mapWith(message.createdAt)`, otherwise they come back as text without a time zone and the client reads them as local time.
- **`seenUntil`** is set to the triggering message, not to the bot's reply: anything written during the reply is still to be passed on the next turn.
- **Sidebar list**: `GET /conversations` creates the direct conversation for each accessible bot if needed, to keep the previous behavior (every bot visible in the sidebar).
- **Simulated mode**: `simulate()` honors the abort signal, like the real Hermes call.
- **Hermes reading attachments**: verified in the Hermes code. Only writing is restricted (`write_denied`), so the shared `HERMES_HOME/edo-attachments/` directory is readable by bots.
- **Colleagues**: `GET /api/users` (all accounts except yourself and banned accounts).
