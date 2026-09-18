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

### Errors

GraphQL errors use `SCREAMING_SNAKE` codes in `extensions.code`, created with `graphQLError()` from `apps/api/src/graphql/errors.ts`. Never surface a raw driver or internal message to the client.

### Models

- Declare `createdAt` / `updatedAt` in the schema so `InferSchemaType` keeps the keys, but **never with `required: true`**: Mongoose runs validators before the timestamps plugin writes the values, so every insert fails with "Path `createdAt` is required". See D19 in `docs/DECISIONS.md`.
- When a timestamp needs a value other than "now" — the seed aligning a conversation with its last message — go through `Model.collection` (`updateOne`), because Mongoose stamps its own `updatedAt` on any update it performs.

### Realtime

- Every write goes through GraphQL. socket.io is server-to-client push only.
- Never hard-code an event name. Import it from `SOCKET_EVENTS` in `@pulsechat/shared/realtime`, and add new events to the interfaces in `packages/shared/src/realtime.ts` — the `satisfies` clause makes the build fail if a constant and an interface drift apart.
- Authorise before joining any room.

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
