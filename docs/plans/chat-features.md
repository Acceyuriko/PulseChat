# Messaging features — implementation plan

**Status: built.** Kept as written — a plan rewritten after the fact stops being a plan —
with an as-built note at the head of each section where the code ended up somewhere else.
`docs/DECISIONS.md` says what the code _is_; this file says what was intended, and where
reality disagreed.

The UI baseline is the Figma file **Full-Stack Developer Assignment**
(`CBKcxWGEJGFe05ZsbgZZ2z`). Its inventory is reproduced in
[Appendix A](#appendix-a--design-inventory) so this plan does not depend on Figma access
going forward.

> **Figma access is gone.** The account's starter-plan API quota is exhausted (HTTP 429), so
> the design cannot be re-fetched. Appendix A is the record; treat it as the source, not a
> cache of one.

---

## 1. What the scaffold already has

One vertical slice, verified end to end against a real MongoDB:

- seeded `User` / `Conversation` / `Message` documents
- a `conversations` query that resolves participants and `lastMessage`, ordered by recency
- header-based fake login (`x-user-id` / `auth.userId`) resolved into `context.currentUser`
- a socket.io handshake that authenticates, joins `user:<id>`, and gates `conversation:subscribe`
  on membership
- 23 passing tests — 12 backend unit, 7 backend integration, 4 frontend component

Nothing in this plan existed when it was written. All of it does now; the test count at the
end of M8 is **212** (93 API — 12 unit, 7 integration, 3 socket contract — plus 119 web).

## 2. Where the design exceeds the requirement

The design depicts a whole community product (top bar, left nav with Forum / Matches /
Members / Contributors, channel + DM list, conversation panel). The requirement is a chat
UI and says outright: _"Implement web UI according to design, don't need to 100% follow the
design."_

The requirement list is closed — two required items, four optional, and no bonus section:

| #   | Requirement                                                         | Status   |
| --- | ------------------------------------------------------------------- | -------- |
| 1   | Web UI according to the design (not 100%)                           | required |
| 2   | Essential chat feature over socket.io or another realtime framework | required |
| 3   | Unread count                                                        | optional |
| 4   | Quote reply **database model and related API**                      | optional |
| 5   | Mention someone                                                     | optional |
| 6   | Frontend and backend unit tests                                     | optional |

Threads, attachments, search, and pagination appear in the design but in none of these
lines. Sentence 1 above is the licence to drop them; see
[§9](#9-deliberate-omissions).

## 3. Locked decisions

| #   | Decision                                                                                                                                                                  | Why                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | Three-column shell built; **top bar and left nav render statically** (no data, only `Chat` highlighted)                                                                   | First impression matches the design without implementing the community modules.                                                                                                                                        |
| P2  | Message body is a **markdown subset**; a parser turns it into **React nodes — never `innerHTML`**                                                                         | Buys the composer toolbar honestly and removes the XSS class entirely instead of managing it with a sanitizer.                                                                                                         |
| P3  | `Conversation.kind: CHANNEL \| DM`; `title` required for `CHANNEL`, null for `DM`                                                                                         | `participantIds.length === 2` is a heuristic that breaks on a two-member channel, and it would leak into several components.                                                                                           |
| P4  | `participantIds` → `members: [{ userId, lastReadAt }]`; unread count is **derived**, never stored                                                                         | One source of truth. A stored counter drifts between send / read / delete.                                                                                                                                             |
| P5  | Quote reply stores a **frozen snapshot** `{ messageId, senderId, senderDisplayName, bodyExcerpt, createdAt }` on the new message                                          | Zero joins on the read path; the card survives deletion of the quoted message; the design's `Devon Lane: Check out …` line is the snapshot itself. The snapshot never nests a `replyTo`, so quote depth is fixed at 1. |
| P6  | Mentions are inline markdown links — `[@Devon Lane](mention:<userId>)` — with **conversation members** as the only candidates, and no separate mention-unread             | Display name and id stay decoupled, so renaming a user does not break a mention. Unparsed, it degrades to the readable `@Devon Lane`.                                                                                  |
| P7  | Message hover toolbar = **quote + delete**, delete is a **soft delete** (`deletedAt`) restricted to the sender                                                            | The design draws two buttons; a dead button reads as unfinished. See §4 for what soft delete does and does not buy.                                                                                                    |
| P8  | Writes stay on GraphQL mutations; socket.io only pushes (**D4 unchanged**). The receiver gets the message over the socket and it lands in the cache **without a refetch** | A refetch after the event is what would make socket.io look decorative.                                                                                                                                                |
| P9  | Identity moves from `localStorage` to **`sessionStorage`**                                                                                                                | `localStorage` is shared per origin, so two tabs can never be two users — which removes the "receiver" from the demo entirely.                                                                                         |
| P10 | Two rooms with different jobs: `message:created` → `conversation:<id>`; `conversation:activity` → each member's `user:<id>` carrying a **server-computed** `unreadCount`  | The list pane must update while you are _not_ looking at the conversation. Client-side `+1` drifts across tabs, reconnects, and deletes.                                                                               |
| P11 | Socket handlers write the **Apollo normalized cache** (`updateQuery` / `modify`); list order is applied by the component sorting on `lastActivityAt`                      | Sorting in a hand-written `Query.merge` function is the fragile way to do it. `updateQuery`, `modify`, `batch` and `evict` all exist in `@apollo/client@4.3.0`.                                                        |
| P12 | Design tokens via Tailwind 4 `@theme`; **Inter self-hosted**; one breakpoint (< 1100px collapses the 165px nav rail to icons)                                             | The palette belongs in one place. A CDN font breaks the offline "clone and run" guarantee. 1366-wide laptops are common.                                                                                               |
| P13 | Tests in three layers, with the **socket contract under automation**                                                                                                      | The realtime path is one of only two required items and it is currently verified by nothing.                                                                                                                           |
| P14 | Explicitly out of scope: threads, attachments/upload, search, pagination, reactions, message edit, presence, typing indicator, theme switching                            | Not in the requirement, not a bonus item.                                                                                                                                                                              |

## 4. Data model changes

### `User`

Add `title: String | null` — the mention dropdown renders a subtitle (`CTO@Apple`) and the
model has no such field today.

### `Conversation`

| Field            | Change                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------- |
| `participantIds` | **Replaced** by `members: [{ userId, lastReadAt }]`                                               |
| `kind`           | New, enum `CHANNEL \| DM`                                                                         |
| `title`          | Becomes conditionally required (`CHANNEL` only)                                                   |
| `lastMessage`    | Still a field resolver, but must now skip soft-deleted messages                                   |
| `unreadCount`    | New field resolver: `count(createdAt > viewer.lastReadAt ∧ senderId ≠ viewer ∧ deletedAt = null)` |

### `Message`

| Field       | Change                                                                        |
| ----------- | ----------------------------------------------------------------------------- |
| `body`      | Semantics tightened: markdown subset source, not opaque text                  |
| `replyTo`   | New, the frozen snapshot from P5                                              |
| `deletedAt` | New, `Date \| null`                                                           |
| index       | `{ conversationId: 1, createdAt: -1, deletedAt: 1 }` replaces the current one |

**Soft delete: what it actually buys.** It does _not_ make the unread count monotonic —
the count is derived, so deleting an unread message lowers it exactly as a hard delete
would. What it buys is that a message id stays resolvable (`此消息已删除` instead of a
dangling reference), and that the row is recoverable. The price is filter discipline:
**every** message read must exclude `deletedAt != null`, and forgetting it once makes
deleted messages reappear. That filter gets exactly one choke point — a
`liveMessages()` filter builder, or a `pre(/^find/)` hook on the model gated by an explicit
opt-out — and a regression test that asserts a deleted message never surfaces.

Deleting the newest message in a conversation also moves `lastMessage` and `lastActivityAt`
back to the previous live message, which can reorder the list. Accepted, and recorded here
so it is not later mistaken for a bug.

### `Conversations` query becomes an aggregation

Resolving `lastMessage`, `lastActivityAt` and `unreadCount` per conversation row is three
per-row reads if done naively. One pipeline (match by member → `$lookup`/`$group` for the
newest live message per conversation → `$size` over a filtered sub-array for the unread
count) returns the whole list in one round trip.

## 5. GraphQL surface

```graphql
enum ConversationKind {
  CHANNEL
  DM
}

type ConversationMember {
  user: User!
  lastReadAt: DateTime
}

type QuoteSnapshot {
  messageId: ID!
  senderId: ID!
  senderDisplayName: String!
  bodyExcerpt: String!
  createdAt: DateTime!
}

type Message {
  id: ID!
  conversationId: ID!
  sender: User!
  body: String!
  replyTo: QuoteSnapshot
  mentions: [User!]! # derived by parsing `body`, not stored a second time
  createdAt: DateTime!
  deletedAt: DateTime
}

type Conversation {
  id: ID!
  kind: ConversationKind!
  title: String
  members: [ConversationMember!]!
  lastMessage: Message
  lastActivityAt: DateTime!
  unreadCount: Int! # viewer-scoped
}

type Mutation {
  sendMessage(input: SendMessageInput!): SendMessagePayload!
  deleteMessage(id: ID!): DeleteMessagePayload!
  markConversationRead(conversationId: ID!): MarkConversationReadPayload!
}
```

`mentions` is a field resolver over the body rather than a stored array on purpose: a
parallel `mentionIds` array is a second source of truth that can disagree with the text.
The requirement's own wording — _"quote reply database model and related API"_ — is why
the quote gets a named type rather than an opaque id.

## 6. Realtime contract

`packages/shared/src/realtime.ts` stays the single declaration of event names and payloads
(the `satisfies` clause fails the build when a constant and an interface drift apart).

**Client → server** (unchanged): `conversation:subscribe`, `conversation:unsubscribe`.

**Server → client**

| Event                   | Room                   | Payload                                                    |
| ----------------------- | ---------------------- | ---------------------------------------------------------- |
| `socket:ready`          | the socket             | `{ userId, joinedRooms }`                                  |
| `socket:error`          | the socket             | `{ code, message }`                                        |
| `message:created`       | `conversation:<id>`    | `{ conversationId, message }`                              |
| `message:deleted`       | `conversation:<id>`    | `{ conversationId, messageId }`                            |
| `conversation:activity` | `user:<id>` per member | `{ conversationId, unreadCount, lastActivityAt, preview }` |

Two rules that are easy to get wrong and are therefore stated here:

1. **The sender is in the conversation room and will receive their own `message:created`.**
   The client merges by message id; anything that appends blindly renders the message twice.
2. **`markConversationRead` must emit `conversation:activity` to the same user's room**, or a
   second open tab keeps showing a badge that the first tab cleared.

`conversation:subscribe` keeps validating membership — a non-member must not be able to
join a room and receive its traffic. That was verified by hand during scaffolding and
becomes an automated case under P13.

> **As built — one correction.** The `message:deleted` payload grew a `conversation` field
> (`RealtimeConversationActivity`), so the peer can correct its list row — preview, activity
> time and badge — without a refetch, exactly as `message:created` does. Shipping only
> `{ conversationId, messageId }` left the row showing the text of a message the stream had
> already replaced with a placeholder. The `conversation:activity` emit to the _other_
> members on delete is what the same payload also covers.

## 7. Modules

The answer to "what needs building", grouped by where it lands.

### A. Contracts — `packages/shared`

1. SDL additions from §5 (`ConversationKind`, `ConversationMember`, `QuoteSnapshot`, new fields)
2. Realtime event constants and payload interfaces from §6
3. The markdown/mention grammar as shared constants, so the composer and the renderer cannot
   disagree about what a mention looks like

### B. Persistence — `apps/api/src/models`

4. `User.title`
5. `Conversation.kind` + `members[]` (replacing `participantIds`)
6. `Message.replyTo` snapshot + `deletedAt`
7. The message index, and the single `deletedAt: null` choke point from §4

### C. Domain logic — pure functions, unit-testable

8. Markdown subset parser: `**bold**`, `*italic*`, `~~strike~~`, ordered + bullet lists, escapes
9. Mention parse/serialise round trip (`[@Name](mention:<id>)` ⇄ node)
10. Quote snapshot builder — excerpt length, whitespace collapse, degradation when the target is gone
11. Derivation of the unread count from `(members, lastReadAt, messages)`

### D. GraphQL API — `apps/api/src/graphql`

12. `sendMessage` mutation (accepts `replyToMessageId`, validates membership, freezes the snapshot)
13. `deleteMessage` mutation (soft, sender-only)
14. `markConversationRead` mutation (advances the cursor, returns the new count)
15. `Conversation.unreadCount` resolver
16. `Conversation.lastMessage` resolver, now skipping deleted rows
17. The `Conversations` aggregation from §4
18. `Conversation.members` exposure — also the mention candidate list

### E. Realtime — `apps/api/src/realtime`

19. Emitters for `message:created`, `message:deleted`, `conversation:activity`
20. Server-computed per-member unread count at emit time
21. Subscription/unsubscription hardening (membership check is already there; add leave-on-close)

### F. Frontend base — `apps/web/src`

22. Design tokens in `@theme`, self-hosted Inter, the breakpoint
23. `sessionStorage` identity (P9) — a default-argument change plus one call site
24. Apollo cache policy: field merge rules and the `lastActivityAt` ordering used by the list
25. The socket → cache adapter, including id-based dedupe

### G. UI

26. Shell: static top bar, static nav rail (Chat highlighted, unread badge), three columns + breakpoint
27. Conversation list: row component implementing the design's two rules — channel vs DM naming,
    collage vs single avatar, `Sender: ` prefix only for non-DM
28. Conversation header (title + member-count pill)
29. Message stream: date separators, own/other bubbles, author + time, quoted card, deleted placeholder
30. Hover toolbar (quote, delete) and message grouping
31. Composer: markdown input, 7-button toolbar, mention dropdown (avatar / name / title),
    quote-editing state with a dismiss button, send
32. Markdown → React renderer (P2: no `innerHTML` anywhere in the path)
33. Realtime panel: connection state, last event name + timestamp, received-event counter —
    the thing that makes the socket path visible to a reviewer

### H. Tests

34. Unit: parser, mention round trip, snapshot builder, unread derivation, DTO mappers
35. Integration: `sendMessage` with `replyTo` and with a mention, `markConversationRead`,
    soft delete then `lastMessage`, non-member `FORBIDDEN`
36. **Socket contract under automation**: real http server + real `socket.io-client`, asserting
    the `message:created` payload, the `conversation:activity` count, and room isolation
37. Frontend: markdown rendering, the row naming rules, mention dropdown filtering

### I. Data and docs

38. Seed rebuilt to the design's shape — 8 conversations, unread badges of 3 and 6, one message
    carrying a quote, one carrying a mention, group conversations with multiple members
39. Deterministic letter avatars generated locally (no external avatar service, no network)
40. README / AGENTS / DECISIONS updated as each piece lands

## 8. Milestones

| #   | Milestone                                 | Delivers                                            |
| --- | ----------------------------------------- | --------------------------------------------------- |
| M1  | Contracts + model + seed (A, B, I-38/39)  | An empty app that seeds the design's data shape     |
| M2  | Domain logic + its unit tests (C, H-34)   | The parser and derivations, proven in isolation     |
| M3  | GraphQL API + integration tests (D, H-35) | The whole write path, exercised against MongoDB     |
| M4  | Realtime + socket tests (E, H-36)         | Events emitted, rooms isolated, contract frozen     |
| M5  | Frontend base (F)                         | Tokens, identity per tab, cache policy, the shell   |
| M6  | List + message stream (G-27…30)           | A readable conversation that updates live           |
| M7  | Composer + realtime panel (G-31…33)       | Sending, quoting, mentioning, observing             |
| M8  | Docs and cleanup (I-40)                   | Consistency pass across README / AGENTS / DECISIONS |

M1 → M4 is backend-only and each step is verifiable without a browser. M5 → M7 assumes the
socket contract is already frozen, so the frontend never has to guess at a payload shape.

> **As built — all eight are done.** M1–M4 landed in `9d514b2`; M5–M7 in `78d1317`; M8 is the
> docs commit that carries this note. `pnpm verify` is green at 212 tests.
>
> The whole realtime path was also checked end to end against a running server with two real
> socket clients on one machine — the sender's echo, the receiver's `message:created`, the
> server-computed `unreadCount`, the DM preview _not_ being sender-prefixed, the frozen quote
> excerpt, the delete fan-out, and `FORBIDDEN` when one user deletes another's message.
> The automation in M4 covers the same contract; the manual pass is what proves the HTTP and
> websocket halves agree on a single payload.

## 9. Deliberate omissions

Each of these is in the design and out of scope. Reasons, so none of them reads as an
oversight:

- **Threads** — `thread` and `icon/threads` exist in the component library but were never
  placed into any frame. Not drawn, not required.
- **Attachments / upload** — the `file` and `image` toolbar buttons are **not rendered**
  (a dead button is worse than an absent one, per P2). The list previews keep literal
  `[File] Design Guideline.pdf` / `[Photo]` text, which is seed data and needs no capability.
- **Search** — both search boxes render statically as part of the shell (P1).
- **Pagination** — messages load as the most recent N. Adding a cursor would drag in
  `Query.merge` ordering and socket-insertion invariants for no requirement.
- **Reactions, message edit, presence, typing indicator** — not in the requirement, and the
  two frames show no UI for them.
- **Theme switching** — the design is dark-only.

## Appendix A — design inventory

Reproduced so the plan is self-contained. Mildly lossy: the Figma API's starter-plan rate
limit cut off before a few instance-level values, noted inline.

### Layout

- **Canvas** 1440 × 916, dark, Inter throughout
- **Top bar** 1440 × 70 — logo, `Gradual Community`, search field, `UTC -05:00 Chicago`, bell,
  help, avatar
- **Left nav rail** 165 wide, `padding-top: 60px`, groups `Engage` (Forum, Chat, Matches) and
  `People` (Members, Contributors), separated by a hairline; `Powered by Gradual` badge pinned
  to the bottom. The `Chat` item carries an **unread badge**, whose value did not survive the
  rate limit — assume it mirrors the list total.
- **Conversation list** 340 wide — a 20px-padded search row with a 1px bottom hairline, then
  rows of `padding: 15px 20px, gap: 10px`: avatar, then a column of `name + time` (space-between)
  and a preview line. Selected row uses `#26252D`; idle uses `#1D1C21`.
- **Conversation panel** — `padding: 10px 0 0`, header row (`padding: 0 20px`) with the title
  (18px semibold) and a pill showing the member count (`padding: 10px 30px`, 1px border,
  `radius: 50px`), then a hairline, then the message area (`padding: 0 20px`, `gap: 30px`), then
  the composer pinned to the bottom.

### Colour

| Token             | Value     | Used for                          |
| ----------------- | --------- | --------------------------------- |
| `bg`              | `#0C0E13` | page background                   |
| `card bg`         | `#1D1C21` | conversation list / idle row      |
| `Card 2`          | `#26252D` | selected row                      |
| `card Highlight2` | `#454451` | others' bubble, page chrome       |
| `#35343E`         | `#35343E` | dropdown / mention popover        |
| `text primary`    | `#C9C7D0` | names, body                       |
| `text secondary`  | `#7B798F` | previews, timestamps              |
| `red-warning`     | `#FE3438` | unread badge                      |
| outgoing bubble   | `#82D8BE` | own messages, dark text `#0C0E13` |

Radii in use: 6 (dropdown, footer badge), 8 (quote card, bubbles), 10 (icon buttons), 50
(pill), 100 (badge). Bubbles are asymmetric: own `8px 0 8px 8px`, others `0 8px 8px 8px`.

### Type

Inter. H5 16px / 23px (channel names), H6 14px / 20px (previews, group headings), 15px / 1.6em
(message body, composer), 13px / 1.6em (quote excerpt), 12px (timestamps, mention name), 11px
title-case (badge digits), 18px semibold (conversation title).

### Conversation rows

| Row               | Avatar  | Preview                              |
| ----------------- | ------- | ------------------------------------ |
| Announcements     | collage | `Jerry: [File] Design Guideline.pdf` |
| Share your story  | collage | `Allen: [Photo]`                     |
| General           | collage | `Tim: If you want to learn more ...` |
| Design product    | collage | `Eric: Yeah I know 🫢`               |
| Product team      | collage | `Grace: @Lynne have time to huddle?` |
| Courtney Henry    | single  | `So, what's your plan this weekend?` |
| Albert Flores     | single  | `What's the progress on that task?`  |
| Darlene Robertson | single  | `Yeah! You're right.`                |

Unread badges: `3` on row 1, `6` on row 2. The rule this table encodes — a non-DM preview is
prefixed with `Sender: `, a DM preview is not — is P3's whole justification.

### The four frames

All four are the same screen; each pins a different feature state.

1. **Quote — hover.** A floating toolbar at the message's right edge (`padding: 5px`, 1px
   border, `radius: 10px`) holding two icon buttons: `la:quote-left` and `iconoir:trash`. A
   separate `icon/hover` 30 × 30 backing sits behind the hovered icon.
2. **Mentions.** The composer holds `@Darr|` and a dropdown opens above it (`padding: 10px 0`,
   `radius: 6px`), whose rows are `pool list` entries: a 30px avatar plus a column of name (12px,
   white) and title (10px, secondary) — `Darrell Steward` / `CTO@Apple`.
3. **Quote — entering.** Inside the composer: a card (`padding: 10px`, gap 10px, `radius: 8px`)
   holding a 2 × 20 accent bar and one truncated line, `Devon Lane: Check out Vanilla Forums
(11/17 - 11/...`, plus a `closed` (X) button to dismiss.
4. **Quote — sent.** The same card rendered inside a sent bubble alongside its own text, with the
   full composer toolbar visible.

### Composer toolbar

Left to right: `bold`, `Italic`, `Strikethrough`, divider, `ordered`, `bullet`, divider,
`emoji`, `file`, `mention`. Declared in the component library but never placed: `link`, `image`,
`more`. Per P2 the seven that need no upload or navigation are built and the rest are not
rendered.

## Appendix B — open risks

1. **Apollo Client 4 merges.** D11 already warns that v4 is a substantial rewrite. The APIs P11
   relies on were checked present in `@apollo/client@4.3.0` (`updateQuery`, `writeQuery`,
   `readQuery`, `modify`, `batch`, `evict` on the cache; `useQuery`, `useMutation`,
   `useSubscription`, `useReactiveVar` in `./react`). v3 idioms still must not be copied.
2. **`deletedAt` filter discipline.** The single-choke-point mitigation in §4 is the whole
   defence. Without it, one forgotten filter silently resurrects deleted messages.
3. **`sessionStorage` per tab.** Refreshing keeps the identity; opening a fresh tab requires
   re-picking one. Acceptable for a fake login, and it is what makes a two-user demo possible on
   one machine.
4. **Seed fidelity vs. real capability.** The list previews look like the design because of
   literal `[File]` / `[Photo]` text. Seed data must not drift into implying an upload feature
   that does not exist.
5. **Automated socket tests need `socket.io-client` as an `apps/api` dev dependency.** The
   manual probe that verified the handshake ran from `apps/web`, which already has it.
