# Coding standards

These rules apply to every line of production and test code in this repository.

## Architecture

- **Ports and adapters.** `packages/core` owns the domain types, the ports (interfaces) and the use cases. It never imports Node built-ins, SDKs or databases; Biome enforces this for `core`, `segmenter` and `contracts`.
- **Depend on ports, not adapters (DIP).** Use cases receive their collaborators through constructor or function parameters. `apps/api/src/compose-local.ts` and `compose-hosted.ts` are the only places that instantiate adapters.
- **Open for extension (OCP).** A new LLM provider is a new class implementing `TranslationProvider`, plus one registry entry. A new target language is one entry in `packages/contracts/src/languages.ts`. Neither change touches a use case.
- **One responsibility per file (SRP).** Split by responsibility, not by technical layer. A file that needs "and" to describe it should be two files.
- **Small interfaces (ISP).** Ports expose only what their consumers call. For example, the renderer and the exporter are separate ports even though one adapter package implements both.
- **Substitutable implementations (LSP).** Every adapter must pass the same behavioural tests as its fake.
- **`apps/web` imports only `@et/contracts`.** Every server type the UI sees is a zod schema in contracts.

## Code

- **Comments explain why, never what.** Default to none.
- **Inject what varies:** clocks, id generators, sleep, fetch and storage. Use no hidden globals or module-level singletons.
- **Errors are typed** (`class XError extends Error`) and mapped to HTTP statuses at one boundary (`apps/api/src/http/errors.ts`).
- **Provider results are values, not exceptions.** `SegmentBatchResult` is a discriminated union that the caller must switch on exhaustively.
- **Never log secrets or book text.** Log ids, counts and statuses only.
- **No `any`.** Prefer `unknown` plus a zod parse at trust boundaries: HTTP bodies, LLM output, SSE payloads.

## Tests

- **Test first.** A test you never saw fail proves nothing.
- **Name tests for behaviour**, for example `resume skips done segments`.
- **Prefer fakes over mocks.** The in-memory store, `FakeProvider` and the fixture EPUB builder are the shared fakes.
- **Never commit real books.** Fixtures are generated in code (`packages/epub/test/fixtures/build-fixture.ts`).

## Git

- **Commit messages:** Conventional Commits, `type(scope): summary`. Scopes are `core`, `contracts`, `segmenter`, `epub`, `providers`, `store`, `api`, `web`, `plan`, `docs`.
