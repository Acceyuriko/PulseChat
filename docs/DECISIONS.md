# Architecture decisions

Why this project is put together the way it is. Each entry records the decision, the reason, and — often more usefully — what was rejected and why.

Format: `D<n>` = decision, `R<n>` = version landmine to respect.

---

## Decisions

### D1 — Built in stages, not in one pass

This stage delivers a complete scaffold plus **one vertical slice**: a user's conversations, read from MongoDB through GraphQL and rendered by the web app. Message sending, unread counts, quote replies and mentions come next, one at a time.

Sending messages was deliberately _not_ sketched in ahead of time — no placeholder `replyTo` / `mentions` fields on the models. Pre-placing schema for features that do not exist yet is how scaffolds turn into guesses.

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

Mongoose 9. The features immediately after this stage — unread counts, quote replies, mentions — are all about relations and subdocuments. With the raw driver, validation, population and relations would all be hand-written, which is a net loss on a deadline.

MongoDB Atlas was rejected as the default: a network dependency between the app and the database is a bad first-run experience for anyone evaluating the repository. Local MongoDB is the documented path, with a one-line `docker run` alternative in the README.

### D9 — Scaffold plus one vertical slice

Standing up a directory tree and a set of config files proves nothing. This stage therefore ends with a working round trip: seeded documents in MongoDB → GraphQL query → authorisation by identity → rendered list in the browser.

### D10 — Header-based fake login

No password flow. A user id travels in the `x-user-id` header and in the socket handshake's `auth.userId`, resolved into `context.currentUser` before any resolver runs.

The point is that the _shape_ is real: `currentUser` is nullable, resolvers declare their own requirement through `requireUser()`, and the socket handshake authenticates before any handler runs. Replacing this with JWTs means rewriting one module and its two call sites.

Real registration was rejected as scope the project does not need yet; no identity at all was rejected because unread counts and mentions are impossible without it.

### D11 — Apollo Client 4 with the codegen `client` preset

Matching the server's ecosystem keeps the vocabulary consistent, and Apollo's normalised cache is what will make incremental updates work well once message broadcasts arrive — `cache.modify` on a `message:created` event is far less code than hand-managed cache invalidation.

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
