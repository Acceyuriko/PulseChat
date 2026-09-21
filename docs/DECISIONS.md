# Architecture decisions

Why this project is put together the way it is. Each entry records the decision, the reason, and — often more usefully — what was rejected and why.

Format: `D<n>` = decision, `R<n>` = version landmine to respect.

---

## Decisions

### D1 — Built in stages, not in one pass

The first stage delivered a complete scaffold plus **one vertical slice**: a user's conversations, read from MongoDB through GraphQL and rendered by the web app. The second stage added the messaging features on top — sending, unread counts, quote replies, mentions — against a realtime contract that was frozen before any client code was written.

Sending messages was deliberately _not_ sketched in ahead of time: for the first stage there were no placeholder `replyTo` / `mentions` fields on the models. Pre-placing schema for features that do not exist yet is how scaffolds turn into guesses. The staging paid for itself twice — the timestamp bug in D19 and the parser hang in D20 were both only reachable once a real database and a real request existed.

Decisions D20–D26 record what the second stage settled. The forward-looking record, including the milestone breakdown and the design inventory taken from Figma, is `docs/plans/chat-features.md`.

### D2 — React + Vite, not Next.js

Vite 8 with a plain SPA, plus TypeScript and Tailwind 4.

Next.js was considered and rejected for a specific reason: the realtime requirement needs a **long-running Node process** holding WebSocket connections, and the deployment target for Next.js is usually a serverless platform that cannot do that. Taking the framework that fights the transport is the wrong trade.

### D3 — Apollo Server 5, SDL schema-first

`@apollo/server` 5 with `graphql@^16.11`, Express 5, and an SDL schema-first design.

Chosen over GraphQL Yoga for two reasons: its error-code conventions line up with the `SCREAMING_SNAKE` convention standardised in `apps/api/src/graphql/errors.ts`, and the Apollo landing page doubles as a live demo of the API in development.

The cost is explicit and accepted: `graphql` is pinned to 16 because that is what Apollo Server 5 declares.

### D4 — GraphQL owns every write; socket.io only pushes

Both are mounted on **the same process and the same `http.Server`**, sharing one identity resolution path and one database connection.

With a single write path, validation, authorisation and persistence exist in exactly one place, and there are no "which transport do I use for this?" conversations. The cost is one extra round trip per message — tens of milliseconds locally, unnoticeable in a chat UI.

The alternative — sending over the socket for lower latency — was rejected because it duplicates every authorisation and validation rule across two paths, and every feature after this one would have to be maintained twice.

Scaling out later means attaching `@socket.io/redis-adapter`; the process topology does not change.

### D5 — ESLint + Prettier, TypeScript pinned to `~6.0.3`

ESLint 10 with type-aware linting (`typescript-eslint` 8), Prettier 3, and `prettier-plugin-tailwindcss` so class order is never a review comment.

Biome was rejected despite being a single fast tool: type-aware rules (the ones that catch real bugs) are weaker there, and it would have removed a piece of the toolchain that reviewers recognise.

See R1 — this decision is also what forces the TypeScript pin.

### D6 — No Turborepo

pnpm workspaces are enough for three packages. A task runner would add a layer of concepts without paying for itself at this size.

### D7 — Three packages, `shared` holds the contracts

`apps/web` + `apps/api` + `packages/shared`.

`packages/shared` exists for two reasons, and both are **contracts rather than code**, which is the only justification for a shared package:

1. The GraphQL SDL — schema-first means the schema must live somewhere both sides can read.
2. The socket.io event names and payload types — otherwise `'socket:ready'` is a string literal duplicated in two applications.

Shared `tsconfig` / ESLint / Prettier configuration lives at the repository root instead of in a fourth `config` package; with two applications that would be indirection for its own sake.

### D8 — Mongoose over the native driver

Mongoose 9. The features layered on top of the scaffold — unread counts, quote replies, mentions — are all about relations and subdocuments. With the raw driver, validation, population and relations would all be hand-written, which is a net loss on a deadline.

MongoDB Atlas was rejected as the default: a network dependency between the app and the database is a bad first-run experience for anyone evaluating the repository. Local MongoDB is the documented path, with a one-line `docker run` alternative in the README.

### D9 — Scaffold plus one vertical slice

Standing up a directory tree and a set of config files proves nothing. This stage therefore ends with a working round trip: seeded documents in MongoDB → GraphQL query → authorisation by identity → rendered list in the browser.

### D10 — Header-based fake login

No password flow. A user id travels in the `x-user-id` header and in the socket handshake's `auth.userId`, resolved into `context.currentUser` before any resolver runs.

The point is that the _shape_ is real: `currentUser` is nullable, resolvers declare their own requirement through `requireUser()`, and the socket handshake authenticates before any handler runs. Replacing this with JWTs means rewriting one module and its two call sites.

Real registration was rejected as scope the project does not need yet; no identity at all was rejected because unread counts and mentions are impossible without it.

### D11 — Apollo Client 4 with the codegen `client` preset

Matching the server's ecosystem keeps the vocabulary consistent, and Apollo's normalised cache is what makes incremental updates cheap once message broadcasts arrive — `cache.updateQuery` / `cache.modify` on a `message:created` event is far less code than hand-managed cache invalidation, and it is why D24 can promise "no refetch".

**Caveat:** Apollo Client 4 is a substantial rewrite (it introduces `rxjs` as a peer, and the React entry points moved to `@apollo/client/react`). Do not copy version 3 patterns.

### D11.1 — Where generated code lives

- `packages/shared/schema/*.graphql` — the SDL, single source of truth
- `packages/shared/src/realtime.ts` — shared socket event contract
- `apps/api/src/generated/` — server types (`typescript` + `typescript-resolvers`)
- `apps/web/src/gql/` — client operation types and hooks (`client` preset)

The rule: **share the source and the contract, never the generated output.** Each app generates what it consumes.

### D12 — Generated artefacts are committed

`apps/api/src/generated/` and `apps/web/src/gql/` are committed so that a fresh clone runs without an extra step, and excluded from ESLint and Prettier. See AGENTS.md.

### D13 — Vitest on both sides

Unit tests for pure logic (identity parsing, DTO mapping, error codes) run with no database. Anything needing MongoDB is an integration test that **skips itself with a printed reason** when the database is unreachable — never passing silently.

`mongodb-memory-server` was rejected: it downloads a second MongoDB binary for tests, in a project that already requires a local MongoDB to run.

One trap worth writing down: Vitest's `globals` is **off** here, which also disables Testing Library's self-registering auto-cleanup. Without an explicit `afterEach(cleanup)` in `src/test/setup.ts`, rendered trees pile up in `document.body` and later queries fail with "found multiple elements" — and only from the second test onward, which reads as a component bug rather than a harness one.

### D14 — husky + lint-staged + commitlint

Conventional Commits, enforced. A readable history costs almost nothing to set up and is the first thing anyone looks at.

### D15 — `tsc` builds the server, `tsx` runs it

`tsx watch` in development, `tsc` to `dist` for production, native ESM with `NodeNext` resolution. No bundler on the server — it needs a compiler, not a bundler.

Consequence: relative imports in `apps/api` and `packages/shared` carry the `.js` extension.

### D16 — No Dockerfile

The README documents local development and the production build. A container would add a layer to explain without removing a problem this stage has.

### D17 — Server `DateTime` is a `Date`, client `DateTime` is a `string`

The scalar is mapped per side in each codegen config. The server works with `Date` objects; over the wire it is an ISO-8601 string. Mapping both sides to the same type is how you end up calling `.getTime()` on a string.

### D18 — `packages/shared` has separate entry points per runtime

The package publishes subpath exports rather than a single barrel:

- `@pulsechat/shared/realtime` — event constants and socket.io interfaces. No Node APIs. This is what `apps/web` imports.
- `@pulsechat/shared/schema` — `readTypeDefs()`, which loads the SDL with `node:fs`.
- `@pulsechat/shared` — the barrel, re-exporting both. Server-only.

The two things in this package look similar but have opposite audiences: a contract both sides need, and a file reader only the server can run. A single entry point cannot express that, so importing one constant for a socket event name would pull `node:fs`, `node:path` and `node:url` into the browser bundle.

The failure mode is quiet, which is the real argument: Vite **externalises** the Node built-ins with a warning and the build still succeeds. The bundle simply carries dead references until something calls them. The fix was one `exports` entry and one changed import specifier, and the browser bundle dropped ~1.4 kB.

### D19 — Timestamp paths are declared in the schema, but never `required`

`createdAt` / `updatedAt` are written into every schema explicitly, even though `timestamps: true` already maintains them. This is for TypeScript: `InferSchemaType` cannot see the paths the timestamps option adds at runtime, so a document read back from MongoDB would look like it has no `createdAt` — and the DTO mappers, which require a `Date`, would refuse it.

They must **not** be marked `required`. Mongoose runs validators _before_ the timestamps plugin writes the values, so `required: true` fails every insert with a message that points nowhere near the cause:

```
ValidationError: User validation failed: updatedAt: Path `updatedAt` is required.,
createdAt: Path `createdAt` is required.
```

Measured rather than assumed — of the three plausible spellings, only the two without `required` work:

| Declaration                                   | Insert                                      |
| --------------------------------------------- | ------------------------------------------- |
| `{ type: Date, required: true }` + timestamps | fails validation                            |
| `{ type: Date }` + timestamps                 | works, values stamped by Mongoose           |
| path omitted + timestamps                     | works, but the document type loses the keys |

Worth recording _how_ this was found: the scaffold was written, linted, type-checked and committed before a MongoDB was ever reachable, so every test either avoided the database or skipped itself. The model layer had never been executed. Connecting a real database was the first honest test of it.

### D20 — The message body is a markdown subset, parsed to React nodes, never `innerHTML`

`**bold**`, `*italic*`, `~~strikethrough~~`, ordered and bullet lists, links, and mentions. The parser produces an AST; the renderer maps that AST to React nodes.

Two reasons this is not "markdown support":

1. **The composer toolbar needs real formatting.** The design draws seven buttons. Buttons that insert literal asterisks and render nothing are theatre.
2. **It removes the XSS class instead of managing it.** There is no `dangerouslySetInnerHTML` in the path and no sanitiser either — a parser that can only ever emit a closed set of node types has no injection surface. The concrete case is links: a destination that is not `http(s)://` or `mention:` is not emitted as a link at all, so there is no `javascript:` URL to escape downstream. A sanitiser would be a second, weaker statement of the same rule.

The parser is also **bounded on purpose**. An early version could fail to advance inside an unmatched inline marker and spin forever, pinning a core (found as 30% CPU and a hung request, not by reading the code). The fix clamps every `indexOf` substring to the source length and requires a non-empty span before a marker counts as closed — `**` does not close on the second character of itself. There are termination tests with a hard timeout for this bug class specifically, because a hang is not something a normal assertion catches.

### D21 — Quotes are frozen snapshots, not foreign keys

`replyTo` stores `{ messageId, senderId, senderDisplayName, bodyExcerpt, createdAt }` on the replying message.

A join would have been the reflexive choice. It was rejected for three reasons: the read path does zero joins, the quoted card survives the quoted message being deleted, and the design's `Devon Lane: Check out Vanilla Forums (11/17 - 11/…` line _is_ the snapshot — it is a truncated copy, not a reference. The snapshot never nests a `replyTo`, so quote depth is fixed at 1 by construction rather than by a depth check.

The cost is that a renamed user's older quotes keep the old display name. Accepted: a quote is a record of what was said, not a live join.

### D22 — Unread is derived, never stored

The count is `count(messages after the viewer's read cursor, from someone else, not deleted)`, computed by the server and pushed per recipient.

A stored counter was rejected outright: it has to be incremented on send, decremented on read, and adjusted on delete, and any missed path drifts silently and permanently. A derived count cannot drift — it is a query over the same rows the UI reads.

The honest consequence is that **soft delete does not make the count monotonic.** Deleting an unread message lowers the count exactly as a hard delete would, because the count is a projection of live rows. That is written down here so it is never mistaken for a bug.

### D23 — `NOT_FOUND` for a non-member, `FORBIDDEN` for the wrong sender

`requireMembership` throws `NOT_FOUND` when the viewer is not a member of the conversation, rather than `FORBIDDEN`.

`FORBIDDEN` would confirm the conversation exists, which makes the API an enumeration oracle for every id in the database. `NOT_FOUND` says the same thing to an attacker and the true thing to nobody. `FORBIDDEN` is reserved for the case where the viewer _is_ a member and the request is still refused — deleting someone else's message — where the refusal leaks nothing they cannot already see.

A field resolver returns `null` rather than throwing when a row is missing, for the same reason: absence is not an error.

This is about a **row**, not a **member-gated query**. `conversation(id:)` is membership-gated, so it throws `NOT_FOUND` in both the missing and the non-member case — it cannot return `null` without answering the question the two cases were merged to hide. `Conversation.lastMessage` is the field resolver the paragraph above describes: an empty conversation is a legitimate state and yields `null`.

### D24 — Socket events write the cache; there is no refetch

On `message:created`, `message:deleted` or `conversation:activity` the client writes the Apollo normalised cache (`cache.updateQuery` / `cache.modify`) and does not refetch.

**An Apollo cache entry is keyed by document _and_ variables.** The `limit` a component reads with is therefore part of a write's contract, not a detail of the read: `{ conversationId }` and `{ conversationId, limit: 50 }` are two different entries, and writing the first while a component reads the second is a no-op with no error attached to it. `MESSAGES_QUERY_LIMIT` in `lib/write.ts` is the single definition both sides use, so the two variable sets cannot drift.

`conversation:activity` carries `lastMessage` as a **message**, not as a pre-rendered `preview` string. The row's preview line is a rendering of `lastMessage` — channel rows are `Sender: `-prefixed, DM rows are not, a deleted newest message says so — and the client already owns that rule. A flattened string would be a second source of truth that a later delete could not correct.

This is the decision that separates a realtime feature from a notification bell. If the handler refetched, the socket would be a latency-adding way to trigger a polling loop, and the cache would be a formality.

Two rules that follow, and are enforced by tests rather than comments:

- **Merge by message id.** Fan-out is room-based, so the sender receives their own `message:created`. A blind append renders every sent message twice.
- **Dedupe, do not reorder.** The conversation list is sorted by the component on `lastActivityAt` (P11). Sorting inside a hand-written `Query.merge` would fight the pagination invariant for no gain.

All of these writes live in `apps/web/src/lib/write.ts`, one file, so they are unit-testable without a socket and reviewable in one pass.

**The boundary of "no refetch" is events, not reads.** `message:created` fans out to the conversation room only, so a message sent while the tab had a different conversation open never reached the socket handler — the cached `messages` entry for that conversation is stale by construction, and no amount of socket fidelity repairs it. Re-entering the conversation therefore revalidates: `MessageStream` reads with `fetchPolicy: 'cache-and-network'`, which renders the cached rows instantly and reconciles with the server in the background. The fetch rides the **navigation**, not a socket event, so the decision above is untouched — the open conversation still runs entirely on socket cache patches with zero network traffic. The conversations list keeps `cache-first` because its rows _are_ kept current by the user room's `conversation:activity`, which every tab receives.

### D25 — The Express app is mounted before socket.io is attached

`httpServer.on('request', createApp(...))` runs **before** `attachRealtime(httpServer)`. The order is load-bearing.

socket.io's `attach` snapshots `server.listeners('request')` at call time, removes them, and installs a dispatcher that replays that snapshot for every path except `/socket.io/**`. A listener registered afterwards is not in the snapshot, so it remains a second, independent listener and handles `/socket.io/**` too.

The reverse cost is that the emitter does not exist yet when the app is built, which is why `createApp` takes a **thunk** (`() => RealtimeEmitter`) rather than the emitter itself. That thunk is only ever called from inside a resolver, long after `main()` has returned.

The socket tests connect with `transports: ['websocket']`, which is not a browser's behaviour: a browser opens with a polling handshake, an ordinary `GET /socket.io/?EIO=4&transport=polling`. Any test of this ordering has to exercise that request rather than a websocket connection.

### D26 — Identity lives in `sessionStorage`

The fake login moved from `localStorage` to `sessionStorage`.

`localStorage` is shared per origin, so two tabs are always the same user. On a single machine — which is how this will be reviewed — that removes the receiving half of the demo entirely: you can never be the person the message arrives for. Per-tab identity makes the realtime path demonstrable with one browser and no second device.

### D27 — An identity switch remounts the workspace

`<Workspace>` is keyed on the identity, so switching users tears down the workspace and builds a new one: `selectedId`, the unread total, and every pane's local state start from zero.

The failure this prevents is specific, and was reproduced before it was fixed. With the selection kept, the socket — rebuilt under the new user's handshake auth — connects, and the subscribe effect re-sends `conversation:subscribe` for the **previous** user's open conversation. That re-send is not itself wrong: it is the same mechanism that re-joins the room after any reconnect, because socket.io drops a socket's rooms on disconnect and never replays them. What was wrong is the id. The new user is not a member of that conversation, so the server answered `FORBIDDEN` on the socket, the realtime panel stuck on that error (a successful subscribe has no ack to clear it), and the pane read "Conversation not found" until something else was picked.

Alternatives that were rejected:

- **Filtering the subscribe client-side.** The socket layer would need to know which conversations the current identity can see, which means feeding it the list query's data — a dependency the realtime module otherwise does not have, to guard one transition.
- **Clearing `selectedId` inside the switch handler.** It covers exactly one way of changing identity, and exactly one piece of state. The key states the rule structurally: nothing carries across identities, including state added later.
- **Ignoring a non-member subscribe server-side.** The membership check is the authorisation boundary (D23). Silently accepting would trade a visible client bug for an invisible server one.

---

## Version landmines

Measured, not assumed. `R1` is the one that actually constrains the toolchain.

| #   | Package             | Current latest | Pinned here  | Why                                                                                                                                                                                       |
| --- | ------------------- | -------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `typescript`        | **7.0.2**      | **`~6.0.3`** | `@typescript-eslint/parser@8.70` declares `typescript: >=4.8.4 <6.1.0` — type-aware linting does not support TypeScript 7 yet, and 6.0.3 is the highest stable release inside that range. |
| R2  | `graphql`           | 17.0.2         | `^16.11.0`   | `@apollo/server@5.5.1` declares `graphql: ^16.11.0`.                                                                                                                                      |
| R3  | `@apollo/client`    | 4.3.0          | `^4.3.0`     | v4 introduces an `rxjs` peer and moved the React entry points to `@apollo/client/react`.                                                                                                  |
| R4  | `graphql-sock`      | 1.0.1          | `^1.0.1`     | An undeclared-looking peer of `@graphql-codegen/client-preset` and `typescript-resolvers`. Codegen fails without it installed in the same package.                                        |
| R5  | `mongoose`          | 9.10.1         | `^9.10.1`    | Requires Node >= 20.19.                                                                                                                                                                   |
| R6  | `@tailwindcss/vite` | 4.3.3          | `^4.3.3`     | Declares `vite: ^5.2 \|\| ^6 \|\| ^7 \|\| ^8`.                                                                                                                                            |

### R7 — `verbatimModuleSyntax` is off on purpose

The base `tsconfig` does not enable it. GraphQL Codegen emits `import { X } from '...'` statements that are frequently type-only, which `verbatimModuleSyntax` rejects. Leaving it on means either fighting the generator or hand-editing generated files.
