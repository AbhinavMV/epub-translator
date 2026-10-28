# EPUB Translator

[![CI](https://github.com/AbhinavMV/epub-translator/actions/workflows/ci.yml/badge.svg)](https://github.com/AbhinavMV/epub-translator/actions/workflows/ci.yml)

A local web app that takes an EPUB and translates it chapter by chapter into English (or another of 13 target languages) with an LLM (Claude, OpenAI or Gemini). You can read the result side by side with the original, and export it as a valid translated EPUB or as plain text.

- **Formatting is preserved.** Inline formatting (`<em>`, `<span class="tcy">`, links and so on) survives translation as numbered placeholders, which are checked before anything is written.
- **Japanese books work.** Vertical (`vertical-rl`), right-to-left books come out horizontal and left-to-right. Ruby readings (furigana) are never sent to the model.
- **Interruptions are safe.** Every paragraph is stored as it finishes, so an interrupted chapter resumes where it stopped.
- **Prompt caching** (Anthropic) is on, so repeated requests reuse the cached system prompt.

## Setup

Requirements: Node 24 (`nvm use`) and pnpm 10.

```bash
pnpm install
cp apps/api/.env.example apps/api/.env   # add ANTHROPIC_API_KEY (and/or OPENAI_API_KEY, GEMINI_API_KEY)
pnpm dev                                 # api on 127.0.0.1:8787, web on http://localhost:5173
```

Keys stay in `apps/api/.env` on your machine. The browser only sees whether a provider is configured. Data (the SQLite database and uploaded books) lives in `apps/api/data/`.

**Without a key:** set `ENABLE_FAKE_PROVIDER=1` in `apps/api/.env` to get "Offline test (no translation)", which echoes the source with a `[en]` prefix so you can try the whole flow for free.

## Using it

1. **Library:** drop an `.epub` file.
2. **Editor:**
   - **Choosing how to translate:**
     - Pick a provider and model, and choose **Live** or **Batch**. Batch uses the provider's batch API: it costs 50% less and returns results within 24 h.
     - **Glossary → Suggest from book** proposes names and terms using a cheap model. Review the suggestions, then save. **Edit prompt** adds style notes.
   - **Translating:**
     - **Translate chapter** translates the current chapter. **Translate all** does every chapter, starting with **Title & contents** (book title, author, publisher, TOC labels), so translated titles appear early. **Translate title & contents** does just that part.
     - The button changes as a chapter progresses: **Translated**, **Continue**, **Retry N failed** (re-sends only failed passages) or **Try again**.
   - **When something fails:**
     - A failed passage says why, for example that the model declined it and under which policy category.
     - Errors that stop a chapter (bad key, rate limits) appear in a banner with a fix hint. A fatal error also stops the rest of that job's queue.
3. **Reader:**
   - Views: Translation, Interleaved or Side-by-side.
   - Layouts: **Scroll** or **Paged** (←/→, Space, tap or swipe).
   - Settings: font, size, width and theme.
4. **Export:**
   - **Export EPUB** (translation only or **Bilingual**) downloads the book with translated metadata. The originals are kept as `alternate-script` entries.
   - **Export TXT** gives plain text.
   - Untranslated chapters stay in the source language.

## Hosted mode

The same app can run invite-only on Vercel Hobby with Supabase Free: private library per user, translation in the browser with each user's own provider keys, EPUBs and exports through signed Storage URLs. See [docs/deploy-vercel-supabase.md](docs/deploy-vercel-supabase.md).

## Architecture

```mermaid
%%{init: {"themeVariables": {"edgeLabelBackground": "#f7f3ec"}}}%%
flowchart LR
  web["apps/web<br/>React SPA"]:::app
  api["apps/api<br/>Hono REST + SSE"]:::app
  contracts["packages/contracts<br/>zod schemas"]:::pure
  core["packages/core<br/>domain, ports, use cases"]:::pure
  seg["packages/segmenter<br/>DOM ⇄ placeholder text"]:::pure
  epub["packages/epub<br/>zip, OPF, render, export"]:::adapter
  prov["packages/providers<br/>Claude, OpenAI, Gemini, fake"]:::adapter
  store["packages/store-sqlite<br/>repositories"]:::adapter

  web -- "HTTP / SSE" --> api
  web --> contracts
  api --> core
  api --> epub
  api --> prov
  api --> store
  core --> contracts
  epub --> core
  epub --> seg
  prov --> core
  store --> core

  linkStyle 0 color:#2b2620
  classDef app fill:#b4532a,stroke:#7a3519,color:#ffffff
  classDef pure fill:#2b2620,stroke:#16140f,color:#f7f3ec
  classDef adapter fill:#efe4cf,stroke:#8a7a5c,color:#2b2620
```

- **`core` is pure.** It holds the domain types, the ports (`EpubParser`, `ChapterRenderer`, `EpubExporter`, `TranslationProvider`, repositories) and the use cases (import, workspace, `JobRunner`, render, export). It has no I/O, and Biome enforces that.
- **Adapters implement the ports.** `apps/api/src/services.ts` is the only place they are wired together.
- **`apps/web` talks to the API only through `@et/contracts`.**

See `docs/CODING-STANDARDS.md` for the rules, `docs/research/` for the design research and `docs/plan/` for the implementation plan.

## Extending

- **Another target language:** add an entry to `TARGET_LANGUAGES` in `packages/contracts/src/languages.ts` (code, name, `dir`, `writingMode`). The prompt, export metadata and spine direction follow from it.
- **Another LLM provider:**
  1. Implement `TranslationProvider` in `packages/providers/src/<name>.ts`: `listModels()`, plus `translateSegments()` returning a `SegmentBatchResult`.
  2. Add it to `buildProviderRegistry`, and add its id to `ProviderIdSchema`.
  3. Use cases need no changes.

## Development

```bash
pnpm test        # vitest across all packages
pnpm typecheck
pnpm lint        # biome (pnpm format to fix)
```

To run a live provider smoke test, set `LIVE=1` plus the provider's key and run `pnpm --filter @et/providers test`. It spends a few hundred tokens.
