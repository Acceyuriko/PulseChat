# PulseChat

A pnpm monorepo scaffold for a realtime chat application: **React + GraphQL + MongoDB + socket.io**, end to end, with linting, formatting, code generation, git hooks and tests already wired up.

This is the **first stage** of an incremental build. The plumbing is complete and one vertical slice is live (a user's conversations, read from MongoDB through GraphQL). The messaging features themselves are deliberately left for the next stages — see [Roadmap](#roadmap).

---

## What works today

| Area                     | State                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------- |
| GraphQL API (`/graphql`) | Working — Apollo Server 5, SDL schema-first, typed resolvers                                         |
| MongoDB persistence      | Working — Mongoose models for `User` / `Conversation` / `Message`, plus a seed script                |
| Identity                 | Working — header-based fake login, so the realtime handshake has a "who am I" from day one           |
| Realtime channel         | Wired — socket.io on the same HTTP server, handshake authentication, `socket:ready`, room membership |
| Frontend                 | Working — identity switcher, live socket status, conversation list rendered from the database        |
| Tooling                  | Working — ESLint (type-aware), Prettier, GraphQL Codegen, husky + lint-staged + commitlint, Vitest   |
| Sending messages         | **Not yet** — the next stage                                                                         |

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
│  │  │  ├─ graphql/        context, resolvers, mappers, error codes
│  │  │  ├─ generated/      GraphQL Codegen output (committed, do not edit)
│  │  │  ├─ models/         Mongoose models
│  │  │  ├─ realtime/       socket.io wiring
│  │  │  └─ scripts/        seed script
│  │  └─ codegen.ts
│  └─ web/                  React + Vite + Tailwind + Apollo Client
│     ├─ src/
│     │  ├─ apollo/         client factory
│     │  ├─ components/     presentational components
│     │  ├─ features/       feature containers (identity, conversations)
│     │  ├─ gql/            GraphQL Codegen output (committed, do not edit)
│     │  ├─ identity/       fake-login state
│     │  └─ realtime/       socket.io client hook
│     └─ codegen.ts
├─ packages/
│  └─ shared/               the contract between the two apps
│     ├─ schema/*.graphql   ← single source of truth for the GraphQL SDL
│     └─ src/realtime.ts    ← shared socket.io event names and payload types
└─ docs/DECISIONS.md        architecture decision log
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

- Web app: <http://localhost:5173>
- GraphQL endpoint, with the Apollo landing page in development: <http://localhost:4000/graphql>
- Health check: <http://localhost:4000/health>

Pick one of the seeded users in the header, and their conversations appear. The badge next to it reports the live socket connection.

`pnpm dev` builds `packages/shared` once, then runs all three packages in parallel.

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

This means validation, authorisation and persistence exist in exactly one place. When message sending arrives, `sendMessage` becomes one resolver, and that resolver is the only thing that emits a realtime event.

Scaling out later is a matter of attaching `@socket.io/redis-adapter` — the process topology does not have to change.

### Identity

There is no password flow. A user id travels in the `x-user-id` header (HTTP) and in `auth.userId` (socket handshake), and is resolved into `context.currentUser` before any resolver runs.

`context.currentUser` is nullable on purpose: resolvers state their own requirement via `requireUser()`. Replacing the fake login with real JWTs means rewriting `apps/api/src/graphql/identity.ts` and its two call sites — no resolver, model or component changes.

### Error codes

GraphQL errors carry a `SCREAMING_SNAKE` code in `extensions.code` (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_USER_INPUT`). Clients branch on the code, never on the message. See `apps/api/src/graphql/errors.ts`.

### Generated code

`apps/api/src/generated/` and `apps/web/src/gql/` are produced by GraphQL Codegen and **committed**, so a fresh clone runs without an extra build step. They are excluded from ESLint and Prettier. Never edit them by hand — run `pnpm codegen`.

The server uses `mappers`, which decouples the GraphQL object types from the Mongoose documents and lets `Conversation.lastMessage` be served by a field resolver instead of being attached to every conversation.

### Testing

`pnpm test` runs Vitest in both apps.

Unit tests (identity parsing, DTO mapping, error codes) need no database. Anything that needs MongoDB lives in a `*.integration.test.ts` file and **skips itself with a printed reason** when the database is unreachable, so a clone without MongoDB still gives a green run — with the skipped count visible, never silently passing:

```
[api] SKIPPING integration tests: no MongoDB reachable at mongodb://127.0.0.1:27017/pulsechat_test.
```

Two harness details that are easy to trip over:

- `globals` is **off**, so Testing Library does not register its own auto-cleanup. `apps/web/src/test/setup.ts` calls `cleanup()` explicitly in `afterEach`. Without it, the first test passes and every later one fails on duplicate elements.
- Integration tests use their own database (`pulsechat_test`), so `pnpm seed` data is never touched.

---

## Roadmap

In the order they are planned:

1. **Send messages** — a `sendMessage` mutation plus a `message:created` broadcast to the conversation and user rooms. This is the point where the socket contract starts carrying payloads.
2. **Unread counts** — a per-participant read cursor on `Conversation`, and an `unread:changed` event.
3. **Quote replies** — a `replyTo` reference on `Message` and the expected UI affordance.
4. **Mentions** — a `mentions` list on `Message`, validated against the conversation's participants.
5. **More tests** — 20 cases exist today (16 that run without a database: identity parsing, DTO mapping, error codes, the identity switcher; plus 4 integration cases). Each feature above lands with its own, rather than adding a test pass at the end.

---

## Deliberate omissions

These are choices, not gaps:

- **No Turborepo.** pnpm workspaces cover three packages; a task runner would add a layer of concepts without paying for itself at this size.
- **No Dockerfile.** The README documents local run and production build instead, which is all this stage needs.
- **No bundler on the server.** `tsc` emits plain ESM. The only build tooling the API needs is a compiler.
- **No `mongodb-memory-server`.** It would download a second MongoDB binary for tests when a local one is already required to run the app.
