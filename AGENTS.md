# AGENTS.md

Conventions for AI agents (and humans) working in this repository.

## Commands

Run everything from the repository root.

| Command                             | Purpose                                                |
| ----------------------------------- | ------------------------------------------------------ |
| `pnpm dev`                          | Build `shared`, then run API + web in watch mode       |
| `pnpm build`                        | Build all packages in topological order                |
| `pnpm typecheck`                    | Build `shared` → run codegen → type-check all packages |
| `pnpm codegen`                      | Regenerate GraphQL artefacts for both apps             |
| `pnpm lint` / `pnpm lint:fix`       | ESLint across the repo                                 |
| `pnpm format` / `pnpm format:check` | Prettier across the repo                               |
| `pnpm test`                         | Vitest in every package                                |
| `pnpm seed`                         | Reset and repopulate sample data                       |
| `pnpm verify`                       | The full gate: typecheck + lint + format check + tests |

`pnpm typecheck` deliberately chains `build:shared` and `codegen` first: the API imports `@pulsechat/shared` from its build output, and both apps import generated types.

## Package boundaries

| Package           | Owns                                                                                      | Must not                                            |
| ----------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `packages/shared` | The GraphQL SDL (`schema/*.graphql`) and the socket.io event contract (`src/realtime.ts`) | Import from `apps/*`, or contain app-specific logic |
| `apps/api`        | Everything server-side: resolvers, models, realtime wiring                                | Import from `apps/web`                              |
| `apps/web`        | Everything client-side: components, hooks, Apollo client                                  | Import from `apps/api`                              |

The two apps talk only through `packages/shared` and the network.
`packages/shared` has two entry points, and picking the right one matters:

| Import                       | Contains                                            | Safe in the browser?         |
| ---------------------------- | --------------------------------------------------- | ---------------------------- |
| `@pulsechat/shared/realtime` | `SOCKET_EVENTS`, the socket.io event interfaces     | Yes — use this in `apps/web` |
| `@pulsechat/shared/schema`   | `readTypeDefs()`, which reads the SDL via `node:fs` | No — server only             |
| `@pulsechat/shared`          | Barrel: both of the above                           | Server only                  |

Importing the barrel (or `/schema`) from `apps/web` drags `node:fs`, `node:path` and `node:url` into the browser bundle. Vite externalises them with a warning rather than failing the build, so it is easy to miss.

## Generated code — never edit by hand

- `apps/api/src/generated/**` — produced by `graphql-codegen` (`typescript` + `typescript-resolvers`)
- `apps/web/src/gql/**` — produced by `graphql-codegen` (`client` preset)

Both are committed so a fresh clone runs immediately. They are excluded from ESLint, Prettier and the repository's own review. Change the schema or the resolver mappers, then run `pnpm codegen`.

**Schema changes start in `packages/shared/schema/*.graphql`** — that is the single source of truth. Adding a new domain means adding a new `.graphql` file there and `extend`ing the root types.

## Conventions

### Module system

The API and `packages/shared` are native ESM with `moduleResolution: NodeNext`, so **relative imports must carry the `.js` extension** (`import { x } from './y.js'`), even though the source file is `.ts`. `tsc` enforces this. The web app uses bundler resolution and therefore omits extensions.

### TypeScript

- `strict` plus `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`.
- TypeScript is pinned to `~6.0.3`. Do not bump it to 7.x — `typescript-eslint@8` does not support it yet.
- Prefer `import type` for type-only imports.

### Frontend

- **Do not write a ref during render, and do not set state from an effect.** ESLint's React Compiler rules reject both (`react-hooks/refs`, `react-hooks/set-state-in-effect`). The replacement is almost always to _derive_ the value during render, or to add the thing to an effect's dependency array. Two passes through this codebase turned up genuine anti-patterns rather than false positives; treat the rule as a finding, not an obstacle.
- **Generated query types are fragment-masked.** A result is `{ ' $fragmentRefs'?: { ... } }` until unwrapped with `getFragmentData`. The normalised cache holds _unmasked_ data, which is why `apps/web/src/lib/write.ts` is typed against the fragment types rather than the query types.
- **`__typename` must be selected explicitly in document text.** The codegen `client` preset defaults to `skipTypename`, so `write.ts` — which hand-writes cache objects — would emit incomplete ones otherwise. Setting the codegen option has no effect.
- Put every operation in `apps/web/src/graphql.ts`. `cache.updateQuery` compares documents by reference, so a component and a cache write must hand over the _same_ object, not two structurally identical ones.
- `react-refresh/only-export-components` means a component file exports components only. Helpers (`initialsOf`, `formatMessageTime`) live in their own modules.
- A component file must not differ from a sibling module only in case (`Markdown.tsx` vs `markdown.ts`). TypeScript rejects it with TS1149, and it genuinely breaks on case-insensitive filesystems.

### Errors

GraphQL errors use `SCREAMING_SNAKE` codes in `extensions.code`, created with `graphQLError()` from `apps/api/src/graphql/errors.ts`. Never surface a raw driver or internal message to the client.

A non-member asking for a conversation gets `NOT_FOUND`, not `FORBIDDEN` — otherwise the API confirms which ids exist. `FORBIDDEN` is for a member whose request is still refused. See D23.

### Models

- Declare `createdAt` / `updatedAt` in the schema so `InferSchemaType` keeps the keys, but **never with `required: true`**: Mongoose runs validators before the timestamps plugin writes the values, so every insert fails with "Path `createdAt` is required". See D19 in `docs/DECISIONS.md`.
- When a timestamp needs a value other than "now" — the seed aligning a conversation with its last message — go through `Model.collection` (`updateOne`), because Mongoose stamps its own `updatedAt` on any update it performs.
- `Message` has a `pre(/^find/)` hook that excludes soft-deleted rows. **Do not add a second filter at the call site** — that is how the two copies drift and one of them is forgotten. When a read genuinely needs deleted rows, opt out explicitly with `INCLUDE_DELETED`.

### Messaging domain

- **The markdown parser must terminate on any input.** It is the one place where a malformed byte can hang a request. Every substring search is clamped to the source length, and a marker only closes a span if that span is non-empty. If you touch `apps/api/src/lib/markdown.ts` or `apps/web/src/features/messages/markdown.ts`, run the termination tests — they carry a hard timeout precisely because a hang passes every ordinary assertion.
- **Never render a message body with `innerHTML` or `dangerouslySetInnerHTML`.** The AST exists so the renderer only ever emits known node types. Adding a sanitiser is not the fix; emitting a safe node is.
- **Mention formatting is `[@Name](mention:<userId>)`,** built with `formatMention()` from `@pulsechat/shared/markdown`. Never hand-write the syntax in a component.
- **Do not store a `mentions` array.** `Message.mentions` is a field resolver over `body`. A parallel array is a second source of truth that can disagree with the text.
- **Unread counts are computed server-side,** per recipient, at emit time. Never `+1` on the client.

### Realtime

- Every write goes through GraphQL. socket.io is server-to-client push only.
- Never hard-code an event name. Import it from `SOCKET_EVENTS` in `@pulsechat/shared/realtime`, and add new events to the interfaces in `packages/shared/src/realtime.ts` — the `satisfies` clause makes the build fail if a constant and an interface drift apart.
- Authorise before joining any room.
- **An identity switch remounts the workspace.** The socket re-subscribes the open conversation on every `connect`, so a `selectedId` that survived a switch is re-sent as the _new_ user and refused with `FORBIDDEN`. See D27.
- **The sender receives their own `message:created`** — fan-out is room-based. Any handler that appends to a list must dedupe by message id first.
- **A socket event never triggers a refetch.** It writes the Apollo cache (`cache.updateQuery` / `cache.modify`). All such writes belong in `apps/web/src/lib/write.ts`, so they stay testable without a socket. See D24.
- **A cache write must use the same variables the reading component does.** Apollo keys an entry by document _and_ variables, so `{ conversationId }` and `{ conversationId, limit: MESSAGES_QUERY_LIMIT }` are two different entries — writing one while a component reads the other is a silent no-op. Use the shared constants in `lib/write.ts`.
- **Mount the Express app before attaching socket.io.** `attachRealtime` snapshots the server's `request` listeners, so an app added afterwards also handles `/socket.io/**` and the polling handshake throws `ERR_HTTP_HEADERS_SENT`, killing the process. A socket client pinned to `transports: ['websocket']` will not catch this; a browser will. See D25.
- Do not sort a list inside `Query.merge`. The component sorts on `lastActivityAt`.

### Tests

- Pure logic gets a unit test with no database.
- Anything that needs MongoDB goes in a `*.integration.test.ts` file and **must skip explicitly** (with a printed reason) when the database is unreachable — never pass silently.
- Test files live next to the code, in `__tests__` folders or as `*.test.ts(x)`.
- Every package's `tsconfig.build.json` excludes tests from the production build.

### Dependencies

Add a dependency to the package that uses it, not to the root. The root `package.json` holds only repository-wide tooling (ESLint, Prettier, husky, commitlint, TypeScript).

## Git

Conventional Commits, enforced by commitlint:

```
feat(api): add sendMessage mutation
fix(web): keep socket connection on identity switch
chore: bump eslint
```

`pre-commit` runs lint-staged (`eslint --fix` + `prettier --write` on staged files).

Never commit `.env`. Never commit to `main` directly — work on a branch and open a PR.
