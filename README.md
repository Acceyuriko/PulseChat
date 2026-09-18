# PulseChat

A realtime chat application in a pnpm monorepo: **React + GraphQL + MongoDB + socket.io**, end to end — messaging, unread counts, quote replies and mentions, with linting, formatting, code generation, git hooks and tests wired up.

Built as a staged assignment: a scaffold carrying one vertical slice first, then the messaging features on top of a frozen realtime contract.

---

## What works today

| Area                     | State                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| GraphQL API (`/graphql`) | Working — Apollo Server 5, SDL schema-first, typed resolvers                                            |
| MongoDB persistence      | Working — Mongoose models for `User` / `Conversation` / `Message`, plus a seed script                   |
| Identity                 | Working — header-based fake login, resolved once for both HTTP and the socket handshake                 |
| Messaging                | Working — `sendMessage` / `deleteMessage` / `markConversationRead`, soft delete, quote snapshots        |
| Realtime                 | Working — socket.io push, room fan-out, server-computed unread counts, no refetch on receive            |
| Frontend                 | Working — three-column shell, live conversation list, message stream, composer with markdown + mentions |
| Markdown                 | Working — a subset parsed to an AST and rendered as React nodes; no `innerHTML` anywhere in the path    |
| Tests                    | Working — 212 (93 API incl. real-MongoDB integration + socket contract, 119 web)                        |
| Tooling                  | Working — ESLint (type-aware), Prettier, GraphQL Codegen, husky + lint-staged + commitlint, Vitest      |

---

## Stack

Versions are pinned deliberately; the reasoning is recorded in [`docs/DECISIONS.md`](./docs/DECISIONS.md).

| Layer               | Choice                                                                             |
| ------------------- | ---------------------------------------------------------------------------------- |
| Frontend            | React 19, Vite 8, TypeScript, Tailwind CSS 4                                       |
| Data layer (client) | Apollo Client 4 + GraphQL Code Generator (`client` preset)                         |
| API                 | Node.js, TypeScript, Express 5, Apollo Server 5, `graphql` 16, SDL schema-first    |
| Database            | MongoDB 8 via Mongoose 9                                                           |
| Realtime            | socket.io 4 (server-to-client push only)                                           |
| Codegen             | `typescript` + `typescript-resolvers` on the server, `client` preset on the client |
| Lint / format       | ESLint 10 (type-aware) + Prettier 3 + `prettier-plugin-tailwindcss`                |
| Tests               | Vitest 5 (node for the API, jsdom + Testing Library for the web app)               |

> **TypeScript is pinned to `~6.0.3` on purpose.** `typescript@7.x` is the native compiler, but the ESLint ecosystem (`typescript-eslint@8`, which this repo uses for type-aware linting) still declares `typescript: >=4.8.4 <6.1.0`. Running the newest TypeScript would mean bypassing peer checks and shipping a dependency graph that is known not to be supported yet.

---

## Repository layout

```
.
├─ apps/
│  ├─ api/                  Express + Apollo Server + Mongoose + socket.io
│  │  ├─ src/
│  │  │  ├─ config/         environment parsing
│  │  │  ├─ db/             Mongo connection
│  │  │  ├─ graphql/        context, resolvers, mappers, error codes, identity
│  │  │  ├─ generated/      GraphQL Codegen output (committed, do not edit)
│  │  │  ├─ lib/            markdown parser, quote snapshots, unread derivation
│  │  │  ├─ models/         Mongoose models
│  │  │  ├─ realtime/       socket.io wiring and payload builders
│  │  │  └─ scripts/        seed script
│  │  └─ codegen.ts
│  └─ web/                  React + Vite + Tailwind + Apollo Client
│     ├─ src/
│     │  ├─ apollo/         client factory and cache policies
│     │  ├─ components/     presentational components
│     │  ├─ features/       feature containers (conversations, messages, composer, realtime)
│     │  ├─ gql/            GraphQL Codegen output (committed, do not edit)
│     │  ├─ graphql.ts      every operation, in one module
│     │  ├─ identity/       fake-login state
│     │  ├─ lib/            cache writes
│     │  ├─ realtime/       socket.io client hook
│     │  └─ shell/          top bar and nav rail
│     └─ codegen.ts
├─ packages/
│  └─ shared/               the contract between the two apps
│     ├─ schema/*.graphql   ← single source of truth for the GraphQL SDL
│     └─ src/realtime.ts    ← shared socket.io event names and payload types
└─ docs/
   ├─ DECISIONS.md          architecture decision log
   └─ plans/                the messaging feature plan, frozen at design time
```

### Why a shared package

`packages/shared` exists for exactly two reasons, and both are contracts rather than code:

1. **The GraphQL SDL.** Schema-first means the schema has to live somewhere both sides can read: the API compiles it at boot, both codegen configs read it from disk.
2. **The socket.io event names and payload types.** Without this, `'socket:ready'` would become a string literal copy-pasted into two applications.

Everything generated stays inside the app that consumes it — shared code is the _source_, not the _output_.

**Import from the entry point that matches your runtime.** The SDL reader touches `node:fs`, so the package exposes them separately:

```ts
// apps/web — browser-safe: event names and payload types only
import { SOCKET_EVENTS } from '@pulsechat/shared/realtime'

// apps/api — reads the .graphql files off disk
import { readTypeDefs } from '@pulsechat/shared/schema'
```

The root barrel (`@pulsechat/shared`) re-exports both and is therefore server-only. Vite will happily bundle it anyway, externalising `node:fs` with nothing more than a warning.

---

## Prerequisites

- **Node.js >= 20.19** (developed on 22.22)
- **pnpm >= 11** (`corepack enable && corepack prepare pnpm@11.8.0 --activate`)
- **MongoDB 8** reachable from your machine

### Running MongoDB

The default connection string is `mongodb://127.0.0.1:27017/pulsechat`.

Local install is the smoothest path. If you would rather use Docker:

```bash
docker run --name pulsechat-mongo -p 27017:27017 -d mongo:8
```

Any MongoDB-compatible host works — point `MONGODB_URI` at it.

---

## Getting started

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Configuration (defaults are fine for a local setup)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 3. Create the sample data — prints the user ids for the identity switcher
pnpm seed

# 4. Run the API and the web app together
pnpm dev
```

- Web app: <http://localhost:4173>
- GraphQL endpoint, with the Apollo landing page in development: <http://localhost:4000/graphql>
- Health check: <http://localhost:4000/health>

The web app deliberately uses **4173 rather than Vite's default 5173**, which every other Vite project on a developer's machine also claims. `strictPort` is on, so a collision fails loudly instead of silently moving to the next port and contradicting the API's `CORS_ORIGIN`. To use a different port, set `WEB_PORT` in `apps/web/.env` and `CORS_ORIGIN` in `apps/api/.env` to match.

Identity is stored in **`sessionStorage`**, so it is per tab. Pick a user, and their conversations appear.

**To see the realtime path, open two tabs.** Pick a different user in each — the seed's DMs pair them up — and send a message from one. The other tab receives it over the socket and updates its list, badge and stream without a refetch. The panel in the conversation header counts the events it has seen, so "was that socket.io or a refetch?" is answerable by looking.

`pnpm dev` builds `packages/shared` once, then runs all three packages in parallel. Before `pnpm seed`, there is nothing to show — the seed prints the ids it created.

To build for production instead, `pnpm build` emits the API to `apps/api/dist` and the web app to `apps/web/dist`.

### The seed's shape

11 users, 8 conversations (5 channels, 3 DMs), 26 messages. Two rows carry unread badges, one message carries a quote, one carries a mention, and the channel conversations have several members each — so the mention dropdown has something to filter and the avatar collage has something to overlap.

Timestamps are backdated through `MessageModel.collection.updateOne` rather than set on the documents, because Mongoose stamps its own `updatedAt` on any write it performs (see D19).

---

## Scripts

Run from the repository root:

| Command                             | What it does                                                   |
| ----------------------------------- | -------------------------------------------------------------- |
| `pnpm dev`                          | Builds `shared`, then runs API + web in watch mode             |
| `pnpm build`                        | Builds every package (topological order)                       |
| `pnpm typecheck`                    | Builds `shared`, runs codegen, then type-checks every package  |
| `pnpm codegen`                      | Regenerates the API and web GraphQL artefacts                  |
| `pnpm lint` / `pnpm lint:fix`       | ESLint across the repo                                         |
| `pnpm format` / `pnpm format:check` | Prettier across the repo                                       |
| `pnpm test`                         | Vitest in every package                                        |
| `pnpm seed`                         | Resets and repopulates the sample data                         |
| `pnpm verify`                       | `typecheck` + `lint` + `format:check` + `test` — the full gate |

---

## Architecture notes

### GraphQL writes, socket.io pushes

Every write goes through a GraphQL mutation. socket.io only carries server-to-client notifications. Both live on **the same process and the same `http.Server`**, sharing one authentication path and one database connection.

This means validation, authorisation and persistence exist in exactly one place. `sendMessage` is one resolver, and that resolver is the only thing that emits a realtime event. Nothing in the socket layer can write.

### Realtime: two rooms, two jobs

| Event                   | Room                   | Why there                                                                |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------ |
| `message:created`       | `conversation:<id>`    | Everyone looking at the conversation, including the sender               |
| `message:deleted`       | `conversation:<id>`    | Same                                                                     |
| `conversation:activity` | `user:<id>` per member | The badge and preview must update when you are looking at something else |

Three consequences that shape the client, each of which is also an assertion in the socket test suite:

1. **The sender receives their own `message:created`.** Fan-out is room-based, so the client merges by message id rather than appending — otherwise every sent message renders twice.
2. **`unreadCount` is computed by the server**, per recipient, at emit time. A client-side `+1` drifts across tabs, reconnects and deletes.
3. **`markConversationRead` emits `conversation:activity` to your own user room**, so a second tab's badge clears too. The unread count is a derived value, not a stored counter: it is `messages after your read cursor, from someone else, not deleted`.

### Socket events write the cache directly

On receiving an event the client writes the Apollo normalised cache (`cache.updateQuery` / `modify`) and **does not refetch**. A refetch here would make socket.io functionally decorative — it would be a notification bell for a polling loop.

All of those writes live in one file, `apps/web/src/lib/write.ts`, which is why they are testable without a socket. The conversation list is _also_ sorted on read by `lastActivityAt`, so a missed event degrades to a stale order rather than a wrong one.

### Identity

There is no password flow. A user id travels in the `x-user-id` header (HTTP) and in `auth.userId` (socket handshake), and is resolved into `context.currentUser` before any resolver runs.

`context.currentUser` is nullable on purpose: resolvers state their own requirement via `requireUser()`. Replacing the fake login with real JWTs means rewriting `apps/api/src/graphql/identity.ts` and its two call sites — no resolver, model or component changes.

The client keeps it in `sessionStorage`, not `localStorage`. `localStorage` is shared per origin, so two tabs can never be two different users — and without a second user, the receiving half of a chat demo cannot be demonstrated on one machine at all.

### Markdown without `innerHTML`

Message bodies are a **subset** of markdown: `**bold**`, `*italic*`, `~~strikethrough~~`, ordered and bullet lists, links, and mentions. The parser produces an AST, and the renderer turns that AST into React nodes.

`dangerouslySetInnerHTML` appears nowhere in the path, and neither does a sanitiser — not because sanitising is hard, but because a parser that only ever emits known-safe node types has no injection surface to sanitise. The link rule is the concrete case: a destination that is not `http(s)://` or `mention:` is not a link at all, it stays literal text. So there is no `javascript:` URL to escape, and no `data:` URL to reason about.

The tokenizer is deliberately bounded. An early version could fail to advance inside an unmatched inline marker and spin forever — the fix clamps every substring to the source length and requires a non-empty span before a marker counts as closed. There are termination tests with a hard timeout for exactly that class of bug.

### Quotes are frozen snapshots

`replyTo` stores `{ messageId, senderId, senderDisplayName, bodyExcerpt, createdAt }` — a copy, not a foreign key. The read path does zero joins, and the quoted card survives the quoted message being deleted. The snapshot never nests a `replyTo`, so quote depth is fixed at 1 by construction rather than by a depth check.

### Soft delete

Deleting a message sets `deletedAt` and keeps the row: the message id stays resolvable and the deleted placeholder is rendered in place, which is what the design shows.

It does **not** make the unread count monotonic — the count is derived, so deleting an unread message lowers it just as a hard delete would. What it costs is filter discipline: every message read must exclude deleted rows, and forgetting it once resurrects them. That filter has exactly one choke point — a Mongoose `pre(/^find/)` hook — with an explicit `INCLUDE_DELETED` opt-out for the rare read that needs them.

### Error codes

GraphQL errors carry a `SCREAMING_SNAKE` code in `extensions.code` (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_USER_INPUT`). Clients branch on the code, never on the message. See `apps/api/src/graphql/errors.ts`.

`requireMembership` returns `NOT_FOUND` rather than `FORBIDDEN` for a non-member, so the API is not an enumeration oracle for "does this conversation id exist". `FORBIDDEN` is reserved for "you are a member, but not the sender" on delete — where saying so leaks nothing.

In production, that code is all the client gets: stack traces and schema introspection are development-only affordances, both set explicitly in `apps/api/src/graphql/apollo.ts` rather than inherited from a default. Verified by running the server with `NODE_ENV=production` — the response carries `extensions: { code }` and nothing else.

### Generated code

`apps/api/src/generated/` and `apps/web/src/gql/` are produced by GraphQL Codegen and **committed**, so a fresh clone runs without an extra build step. They are excluded from ESLint and Prettier. Never edit them by hand — run `pnpm codegen`.

The server uses `mappers`, which decouples the GraphQL object types from the Mongoose documents and lets `Conversation.lastMessage` be served by a field resolver instead of being attached to every conversation.

### Testing

`pnpm test` runs Vitest in both apps — **212 tests**: 93 in the API (12 unit, 7 integration, plus the socket contract) and 119 in the web app.

Unit tests (identity parsing, DTO mapping, error codes, the markdown parser, mention round trips, quote snapshots, unread derivation, cache writes, row naming) need no database. Anything that needs MongoDB lives in a `*.integration.test.ts` file and **skips itself with a printed reason** when the database is unreachable, so a clone without MongoDB still gives a green run — with the skipped count visible, never silently passing:

```
[api] SKIPPING integration tests: no MongoDB reachable at mongodb://127.0.0.1:27017/pulsechat_test.
```

The socket contract is verified against **a real HTTP server and a real `socket.io-client`**, not a mock — the payload shape, room isolation, the sender's own echo, and the per-recipient `unreadCount` are all assertions. A mocked socket would only ever confirm that the mock agrees with itself.

Three harness details that are easy to trip over:

- `globals` is **off**, so Testing Library does not register its own auto-cleanup. `apps/web/src/test/setup.ts` calls `cleanup()` explicitly in `afterEach`. Without it, the first test passes and every later one fails on duplicate elements — which reads as a component bug rather than a harness one.
- Integration tests use their own database (`pulsechat_test`), so `pnpm seed` data is never touched.
- The web app's generated types arrive **fragment-masked** (the codegen `client` preset), so a query result is `{ ' $fragmentRefs'?: {...} }` until unwrapped with `getFragmentData`. The cache holds unmasked data, which is why `lib/write.ts` is typed against the fragment types.

---

## Deliberate omissions

These are choices, not gaps. Each one is in the design and out of the assignment's requirement list:

- **Threads** — `thread` and `icon/threads` exist in the design's component library but were never placed into any frame.
- **Attachments / upload** — the `file` and `image` toolbar buttons are **not rendered**. A dead button is worse than an absent one; the seeded previews keep literal `[File] Design Guideline.pdf` / `[Photo]` text, which is data and needs no capability.
- **Search** — both search boxes render statically as part of the shell.
- **Pagination** — messages load as the most recent N. A cursor would drag `Query.merge` ordering and socket-insertion invariants in for no requirement.
- **Reactions, message edit, presence, typing indicator** — not in the requirement, and the design's frames show no UI for them.
- **Theme switching** — the design is dark-only.
- **No Turborepo.** pnpm workspaces cover three packages; a task runner would add a layer of concepts without paying for itself at this size.
- **No Dockerfile.** The README documents local run and production build instead.
- **No bundler on the server.** `tsc` emits plain ESM. The only build tooling the API needs is a compiler.
- **No `mongodb-memory-server`.** It would download a second MongoDB binary for tests when a local one is already required to run the app.
- **No React Router.** There is one screen. A router would add a dependency and a concept to express "the selected conversation".

---

## Further reading

- [`docs/DECISIONS.md`](./docs/DECISIONS.md) — why each choice was made, and what was rejected
- [`docs/plans/chat-features.md`](./docs/plans/chat-features.md) — the messaging plan, its milestones, and the design inventory taken from Figma
- [`AGENTS.md`](./AGENTS.md) — conventions for working in this repository
