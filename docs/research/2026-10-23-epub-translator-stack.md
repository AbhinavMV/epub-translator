# EPUB translator: format, translation strategy, stack and UI

Date: 2026-10-23. Scope: a local-first monorepo app (web UI plus API) that takes an uploaded EPUB, translates it chapter by chapter into English (more target languages later) through a pluggable LLM provider (Claude, Gemini, OpenAI), writes the translation back into a valid EPUB by editing the XHTML content documents in place, and falls back to a translated reader in the UI.

All facts come from primary sources: W3C and WHATWG specs, vendor API docs, package registries, and project source read at a pinned commit (cloned 2026-10-23). Versions were checked on the date above. **UNVERIFIED** marks anything not confirmed from a primary source. Sentences that begin "Recommendation" or "Design" are this document's judgement, not sourced fact.

---

## Summary of decision-relevant findings

1. **Rewriting the EPUB in place is feasible.** EPUB 3.3 has been a W3C Recommendation since 13 January 2026 ([REC-epub-33-20260113](https://www.w3.org/TR/2026/REC-epub-33-20260113/)). EPUB 3.4 is only a Candidate Recommendation Draft (22 October 2026) ([epub-34](https://www.w3.org/TR/epub-34/)). Only a handful of things must change: the `dc:language` order, `lang`/`xml:lang` on content documents, nav labels, `dcterms:modified`, and, for RTL targets, `page-progression-direction`. Every other entry can be copied through byte for byte.
2. **Repacking the ZIP is the main trap for validity.** The `mimetype` entry must come first, be stored uncompressed, and carry no extra field ([§4.3.3](https://www.w3.org/TR/epub-33/#sec-zip-container-mime)). Two common writers add an extra field by default: yazl ≥3.3.0 writes a "UT" mtime field unless `forceDosTimestamp: true` ([yazl README](https://github.com/thejoshwolfe/yazl)), and Go's `archive/zip` always emits an extended timestamp when `Modified` is set ([pkg.go.dev](https://pkg.go.dev/archive/zip)).
3. **EPUBCheck v5.4.0 (2026-09-15) is the validator.** It is a Java tool with a JSON report and targets EPUB 3.4. v5.3.0 targets EPUB 3.3 ([releases](https://github.com/w3c/epubcheck/releases)).
4. **The prior art loses inline markup.** bilingual_book_maker writes the translation with `new_p.string = text`, which flattens `<em>`, `<a>` and the like. It now protects only atomic inline nodes with `⟦code1⟧` markers ([helper.py L458](https://github.com/yihong0618/bilingual_book_maker/blob/e1027a4823e98f668ef950740b6f805ec30bd3b2/book_maker/loader/helper.py#L458), [markers.py](https://github.com/yihong0618/bilingual_book_maker/blob/e1027a4823e98f668ef950740b6f805ec30bd3b2/book_maker/loader/markers.py#L1-L30)). The calibre plugin sends `itertext()` plain text and turns `img/code/br/sub/sup/...` into `{{id_00000}}` placeholders ([element.py L220-L239, L685-L691](https://github.com/bookfere/Ebook-Translator-Calibre-Plugin/blob/96d1d789dd2265cbf71faef905d3c1db08596524/lib/element.py#L220-L239)). The Dusk Translate reader shows the result: italics came back as literal `*it*` (§6.1).
5. **Recommendation: translate block by block with paired inline placeholders**, using structured JSON output, and validate that the placeholders come back intact before writing.
6. **TypeScript is the only backend language with official SDKs from all three providers, and so is Go.** Anthropic has official SDKs in Python, TypeScript, C#, Go, Java, PHP and Ruby ([SDKs](https://platform.claude.com/docs/en/api/client-sdks)). Google Gen AI has Python, JS/TS, Go, Java and C# ([libraries](https://ai.google.dev/gemini-api/docs/libraries)). OpenAI has JS/TS, Python, .NET, Java (beta), Go (beta) and Ruby ([libraries](https://developers.openai.com/api/docs/libraries)). None of the three has an official Rust SDK.
7. **Go's `encoding/xml` cannot round-trip namespace prefixes** (issue [#9519](https://github.com/golang/go/issues/9519), still open). EPUB XHTML depends on prefixed attributes such as `epub:type`, so a Go backend would need a third-party XML stack for the core feature.
8. **Recommendation: a single TypeScript monorepo** (pnpm workspaces plus Turborepo, Node 24 LTS, Hono, SQLite). The work is I/O-bound on LLM calls, and one language lets the domain types and schemas be shared with the web app.
9. **Every provider offers a batch API at 50% off.** Anthropic allows 100k requests or 256 MB per batch, finishes within 24 h, and keeps results 29 d ([batch](https://platform.claude.com/docs/en/build-with-claude/batch-processing)). OpenAI allows 50k requests or a 200 MB file in a 24 h window ([batch](https://developers.openai.com/api/docs/guides/batch)). Gemini targets 24 h and expires jobs at 48 h ([batch](https://ai.google.dev/gemini-api/docs/batch-mode)). This is worth exposing as an "economy" job mode.
10. **The Claude model IDs are verified:** `claude-opus-5-5` ($4/$20 per MTok), `claude-sonnet-5-5` ($2/$10) and `claude-haiku-5-5` (from $0.10/$0.50). All have 1M context and 128K max output ([models overview](https://platform.claude.com/docs/en/about-claude/models/overview)).
11. **Use your own renderer for the reader, not epub.js.** epub.js last shipped to npm as 0.3.93 on 2022-02-16 and has 517 open issues ([npm](https://registry.npmjs.org/epubjs), [GitHub API](https://api.github.com/repos/futurepress/epub.js)). foliate-js is maintained (MIT, last push 2026-05-01) but says it is "not stable" ([README](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/README.md)). A side-by-side bilingual view needs segment alignment, which neither library provides. Recommendation: render your own sanitized XHTML in a sandboxed iframe for the bilingual reader, and keep foliate-js as an optional paginated viewer for the exported EPUB.

---

## 1. EPUB format: what changes when translating

### 1.1 Structure (EPUB 3.3)

| Piece | Rule | Source |
|---|---|---|
| ZIP entries | Stored or Deflate only; ZIP64 allowed only when needed; ZIP encryption forbidden | [§4.3.2](https://www.w3.org/TR/epub-33/#sec-zip-container-zipreqs) |
| `mimetype` | First entry; content `application/epub+zip` (US-ASCII, no BOM or whitespace); not compressed or encrypted; no extra field in its header | [§4.3.3](https://www.w3.org/TR/epub-33/#sec-zip-container-mime) |
| `META-INF/container.xml` | Required; `rootfile@full-path` points to the OPF; `media-type="application/oebps-package+xml"` | [§4.2.6.3.1](https://www.w3.org/TR/epub-33/#sec-container.xml-rootfile-elem) |
| File names | ≤255 bytes, paths ≤65535 bytes, unique after case folding and normalization | [§4.2.3](https://www.w3.org/TR/epub-33/#sec-container-filenames) |
| Package metadata | `dc:identifier`, `dc:title` and `dc:language` required; `dc:language` repeatable, and reading systems treat the **first** one as primary | [§5.5.3.1](https://www.w3.org/TR/epub-33/#sec-opf-dcmes-required-hd) |
| `dcterms:modified` | Exactly one, `YYYY-MM-DDThh:mm:ssZ` in UTC | [§5.5.5](https://www.w3.org/TR/epub-33/#sec-metadata-last-modified) |
| `package@dir` | `ltr`, `rtl` or `auto` (default `auto`) | [§5.4](https://www.w3.org/TR/epub-33/#attrdef-dir) |
| Spine | `page-progression-direction` is `ltr`, `rtl` or `default` | [§5.7.1](https://www.w3.org/TR/epub-33/#sec-spine-elem) |
| Nav document | Exactly one manifest item with `properties="nav"`; exactly one `toc nav`; each `a` or `span` needs a non-empty text label | [§5.6.2.1](https://www.w3.org/TR/epub-33/#sec-pkg-manifest), [§7.2–7.3](https://www.w3.org/TR/epub-33/#sec-nav) |
| NCX | Legacy, kept only for EPUB 2 reading systems | [§5.9.5](https://www.w3.org/TR/epub-33/#sec-opf2-ncx) |
| XHTML content documents | Must be HTML in the **XML syntax** | [§6.1.2](https://www.w3.org/TR/epub-33/#sec-xhtml-req) |
| XML constraints | XML 1.0; no external entities declared in the internal DTD subset; no XInclude; UTF-8 or UTF-16 | [§3.9](https://www.w3.org/TR/epub-33/#sec-xml-constraints) |
| `lang` / `xml:lang` | `xml:lang` takes precedence; when both are present they must be equal (ASCII case-insensitive) | [WHATWG §3.2.6.2](https://html.spec.whatwg.org/multipage/dom.html#the-lang-and-xml:lang-attributes) |

### 1.2 Edits per translation

1. **OPF `dc:language`.** For a translation-only output, put the target language first, because the first entry is primary. A bilingual output can keep the source language as a second `dc:language` ([§5.5.3.1.3](https://www.w3.org/TR/epub-33/#sec-opf-dclanguage)). Also set `xml:lang` on `<package>`.
2. **`dcterms:modified`** is rewritten to the export time; the spec requires exactly one.
3. **`dc:identifier`.** Design: issue a new UUID for the translated edition so that reading systems don't treat it as the original. That reading systems dedupe on this field is **UNVERIFIED**. Add a `dc:title` translation, or keep the original title and add a `<meta refines>` alternate-script entry; the spec forbids the same language tag on an `alternate-script` and the property it refines ([App. D.3.1](https://www.w3.org/TR/epub-33/#sec-alternate-script)).
4. **Each content document:** set `<html lang="en" xml:lang="en">` to identical values. For a bilingual output, keep the root in the source language and put `lang`/`xml:lang` on each inserted translation block. Readest and the calibre plugin both stamp `lang` (and `dir`) on the translated node ([readest useTextTranslation.ts L49-L72](https://github.com/readest/readest/blob/854fb74d9cfc555a1df6341b71d295878714fc23/apps/readest-app/src/app/reader/hooks/useTextTranslation.ts#L49-L72), [calibre element.py L248-L269](https://github.com/bookfere/Ebook-Translator-Calibre-Plugin/blob/96d1d789dd2265cbf71faef905d3c1db08596524/lib/element.py#L248-L269)).
5. **Nav document and NCX.** Translate the `toc nav` labels. If an NCX exists, translate its `navLabel/text` as well, so that EPUB 2 readers match. bilingual_book_maker found that inserting a sibling inside nav `li`, `figure` or `figcaption` breaks EPUBCheck because of their restricted content models, so it appends inline in those places instead ([helper.py L96-L101, L303](https://github.com/yihong0618/bilingual_book_maker/blob/e1027a4823e98f668ef950740b6f805ec30bd3b2/book_maker/loader/helper.py#L303)).
6. **Duplicate IDs.** A bilingual copy of a block must have its `id` attributes stripped, or EPUBCheck fails with RSC-005 and links land on the wrong copy ([helper.py L353, L459-L467](https://github.com/yihong0618/bilingual_book_maker/blob/e1027a4823e98f668ef950740b6f805ec30bd3b2/book_maker/loader/helper.py#L353)).
7. **RTL targets (future).** Set `spine@page-progression-direction="rtl"` and `package@dir="rtl"`, plus `dir="rtl"` on translated blocks. Vertical writing and CSS `writing-mode` changes are out of scope.
8. **Out of scope for v1:** images containing text, SVG `<text>`, and MathML. The calibre plugin reserves `svg`, `math`, `img`, `code`, `kbd`, `var`, `abbr` and similar elements by default ([element.py L685-L691](https://github.com/bookfere/Ebook-Translator-Calibre-Plugin/blob/96d1d789dd2265cbf71faef905d3c1db08596524/lib/element.py#L685-L691)).

### 1.3 Repacking

Design: stream the source ZIP and copy every untouched entry as raw compressed bytes; regenerate only the changed XHTML, the OPF, nav and NCX. Write `mimetype` first with the stored method and no extra field (no UT timestamp, no ZIP64). Keep the original entry order after it. Obfuscated fonts (`META-INF/encryption.xml`) must be copied unchanged, because the IDPF obfuscation key is derived from the unique identifier. **UNVERIFIED** here; bilingual_book_maker carries a whole `font_obfuscation.py` and re-obfuscates on write, which suggests the key really does depend on it ([epub_loader.py `_reobfuscate_written`](https://github.com/yihong0618/bilingual_book_maker/blob/e1027a4823e98f668ef950740b6f805ec30bd3b2/book_maker/loader/epub_loader.py)). **Implication:** if you change `dc:identifier` (item 3 above), you must re-obfuscate the fonts.

### 1.4 Validation

- EPUBCheck v5.4.0 (2026-09-15) checks against EPUB 3.4 CR. v5.3.0 (2025-09-01) checks EPUB 3.3. Both offer a JSON report, are published on Maven Central as `org.w3c:epubcheck`, and are compatible with Java 21 ([releases](https://github.com/w3c/epubcheck/releases)).
- Recommendation: run EPUBCheck over the **source** EPUB at upload and over the **output** at export, and diff the two message sets. Many retail EPUBs fail EPUBCheck already, so only *new* errors are attributable to us. That retail EPUBs commonly fail is **UNVERIFIED**. EPUBCheck needs a JRE in the API container or on the dev machine (open decision D3).

---

## 2. Translation granularity

### 2.1 Options

| Option | How it works | Pros | Cons |
|---|---|---|---|
| (a) Whole-chapter HTML | Send the XHTML, get XHTML back | Full context, simplest prompt | Output tokens ≈ input tokens including markup. The model may drop, re-nest or invent tags, and nothing can be verified per block. A failure costs the whole chapter. Resume works only per chapter. 128K max output ([models](https://platform.claude.com/docs/en/about-claude/models/overview)) caps chapter size. |
| (b) Block segmentation with inline placeholders | Split into block units (`p`, `h1–6`, `li`, `td`, `th`, `dt`, `dd`, `blockquote` leaf, `figcaption`). Replace inline tags with paired tokens (`<1>…</1>`) and atomic ones with `<x2/>`. Send N blocks per request as a JSON array. | Markup is preserved and verifiable per block; caching and resume work per segment; batches size to a token budget | Placeholder fidelity varies by provider; tags may need to move to new positions (word order) |
| (c) Text nodes only | Translate each DOM text node separately | Markup trivially preserved | Sentences split across `<em>` boundaries are translated blind. Word order across languages can't be mapped onto fixed node positions. Yields the worst quality. |

**Recommendation: (b).** Details:
- **Atomic inline elements** become self-closing tokens and are restored by cloning the original node: `img`, `br`, `code`, `kbd`, `sup` and `sub` note references, `ruby` (strip `rt`/`rp` first, as the calibre plugin does at [element.py L681-L683](https://github.com/bookfere/Ebook-Translator-Calibre-Plugin/blob/96d1d789dd2265cbf71faef905d3c1db08596524/lib/element.py#L681-L683)), and `svg`/`math`.
- **Paired inline elements** (`em`, `strong`, `i`, `b`, `span`, `a`, `small`, `cite`, `q`) become paired tokens so the model can move them to the matching target words. Readest does this only for providers it has verified against the live API (the `preservesMarkup` flag, [types.ts L9-L18](https://github.com/readest/readest/blob/854fb74d9cfc555a1df6341b71d295878714fc23/apps/readest-app/src/services/translators/types.ts#L9-L18)).
- **Validate** that the multiset of tokens in equals the multiset out, with correct nesting. On a mismatch, retry once with the error fed back; then fall back to plain text with the atomic nodes appended (bilingual_book_maker's "lenient" policy, [markers.py L28-L31](https://github.com/yihong0618/bilingual_book_maker/blob/e1027a4823e98f668ef950740b6f805ec30bd3b2/book_maker/loader/markers.py#L28-L31)), and flag the segment for review in the UI.
- **Use structured output.** A request returns `{"segments":[{"id":"s12","text":"…"}]}`, so alignment comes from IDs rather than separator counting. The calibre plugin's merge mode joins paragraphs with `\n\n` and then repairs misalignment heuristically ([cache.py L46-L69](https://github.com/bookfere/Ebook-Translator-Calibre-Plugin/blob/96d1d789dd2265cbf71faef905d3c1db08596524/lib/cache.py#L46-L69)), which is the failure mode IDs avoid.

### 2.2 How existing tools do it, and their pitfalls

**bilingual_book_maker** (MIT, 9.9k★, last push 2026-09-30, pinned at `e1027a4`):
- **Units:** `translate_tags="p"` by default, with `sup,code` excluded ([epub_loader.py L345-L346](https://github.com/yihong0618/bilingual_book_maker/blob/e1027a4823e98f668ef950740b6f805ec30bd3b2/book_maker/loader/epub_loader.py#L345-L346)). Excluded tags are *extracted* from the source before translation (L964-L972).
- **Write-back:** copies the `<p>`, sets `.string = text` (which drops all inline markup), strips duplicate IDs, stamps `lang` and inserts the copy after the original ([helper.py L445-L475](https://github.com/yihong0618/bilingual_book_maker/blob/e1027a4823e98f668ef950740b6f805ec30bd3b2/book_maker/loader/helper.py#L445-L475)).
- **Batching:** `--accumulated_num` is a token budget for grouping paragraphs per request ([cli.py L746](https://github.com/yihong0618/bilingual_book_maker/blob/e1027a4823e98f668ef950740b6f805ec30bd3b2/book_maker/cli.py#L746)).
- **Context carry-over:** `--use_context` re-sends the last few paragraphs ("window"), and "session" mode keeps a growing history with compaction ([cli.py L669, L837](https://github.com/yihong0618/bilingual_book_maker/blob/e1027a4823e98f668ef950740b6f805ec30bd3b2/book_maker/cli.py#L669)).
- **Glossary:** `--glossary` injects **only the terms that occur in the unit**, so that the request prefix stays byte-stable for prompt caching ([glossary.py L1-L19](https://github.com/yihong0618/bilingual_book_maker/blob/e1027a4823e98f668ef950740b6f805ec30bd3b2/book_maker/glossary.py#L1-L19)). Adopt this.
- **Retries:** tenacity with exponential backoff, *no* attempt cap, failing fast only on fatal errors such as a bad key or unknown model ([helper.py L477-L505](https://github.com/yihong0618/bilingual_book_maker/blob/e1027a4823e98f668ef950740b6f805ec30bd3b2/book_maker/loader/helper.py#L477-L505)).
- **Resume:** pickles the translated paragraphs to `.{stem}.temp.bin` next to the book, keyed by plan and run fingerprints (epub_loader.py L497-L510, L1381-L1400).
- **Pitfall:** its own CLI refuses `--batch` on EPUB because "queueing lives on a path the epub loader never takes", so the book gets translated live at full price ([cli.py L1150-L1160](https://github.com/yihong0618/bilingual_book_maker/blob/e1027a4823e98f668ef950740b6f805ec30bd3b2/book_maker/cli.py#L1150-L1160)). Batch mode has to be designed into the job model from the start.
- **Pitfall:** parallel workers combined with grouping record no progress, so `--resume` has nothing to continue (cli.py L1167-L1173). Persist results per segment, not per run.

**Ebook-Translator-Calibre-Plugin** (GPL-3.0, so read the ideas but don't copy code; 2.7k★, last push 2026-10-22, pinned at `96d1d78`):
- **Extraction:** walks the body recursively and treats any element with direct text or only inline children as one unit (`extract_elements`, [element.py L588-L618](https://github.com/bookfere/Ebook-Translator-Calibre-Plugin/blob/96d1d789dd2265cbf71faef905d3c1db08596524/lib/element.py#L588-L618)).
- **Content sent:** `itertext()` (plain), with reserved elements replaced by `{{id_NNNNN}}`. The restore regex tolerates spacing the model has mangled (`({{\s*)+id\s*_\s*…`, [engines/base.py L36](https://github.com/bookfere/Ebook-Translator-Calibre-Plugin/blob/96d1d789dd2265cbf71faef905d3c1db08596524/engines/base.py#L36)).
- **Cache:** a SQLite table `cache(id, md5, raw, original, ignored, …, translation, …)` per book identity, with md5 over (ordinal + content) ([cache.py L129-L139](https://github.com/bookfere/Ebook-Translator-Calibre-Plugin/blob/96d1d789dd2265cbf71faef905d3c1db08596524/lib/cache.py#L129-L139), [element.py L712](https://github.com/bookfere/Ebook-Translator-Calibre-Plugin/blob/96d1d789dd2265cbf71faef905d3c1db08596524/lib/element.py#L712)). Recommendation: also put model, prompt version and target language in the key.
- **Glossary:** pre-substitutes source terms with placeholders and restores the target term afterwards ([translation.py L22-L53](https://github.com/bookfere/Ebook-Translator-Calibre-Plugin/blob/96d1d789dd2265cbf71faef905d3c1db08596524/lib/translation.py#L22-L53)). This guarantees consistency but costs the model the meaning of the term (gender, inflection). Prefer prompt-level glossary hints as in bilingual_book_maker, and verify afterwards.
- **Retries:** a fixed attempt count with the interval growing by 5 s each time (`translate_text`, translation.py L117-L157).
- **Pitfall:** Anthropic `max_tokens` is hard-coded to 4096 ([engines/anthropic.py L125](https://github.com/bookfere/Ebook-Translator-Calibre-Plugin/blob/96d1d789dd2265cbf71faef905d3c1db08596524/engines/anthropic.py#L125)), so merged chunks can truncate. Size `max_tokens` from the input and check `stop_reason`.

**Readest** (AGPL-3.0, 25.5k★) translates in the reader, not into the file:
- It wraps each translation in a `<font class="translation-target" lang dir>` placed after the source block, and can hide the source for a translation-only view ([useTextTranslation.ts L49-L84](https://github.com/readest/readest/blob/854fb74d9cfc555a1df6341b71d295878714fc23/apps/readest-app/src/app/reader/hooks/useTextTranslation.ts#L49-L84)).
- Its cache key folds in the model and the rendered prompt (`getCacheKey`, [types.ts L33-L38](https://github.com/readest/readest/blob/854fb74d9cfc555a1df6341b71d295878714fc23/apps/readest-app/src/services/translators/types.ts#L33-L38)).

**Design rules taken from the above:**
1. Make the segment the unit of persistence, caching and retry.
2. Carry chapter context as the previous k translated segments plus a rolling "story so far / names" note, kept in a cache-stable prefix. That the note improves consistency is **UNVERIFIED** (no eval found).
3. Run a glossary pass first: one LLM call per book that extracts names and terms into a user-editable table.
4. Retry without limit on 429/5xx, honouring `retry-after` ([Anthropic rate limits](https://platform.claude.com/docs/en/api/rate-limits)), and fail fast on 4xx auth and model errors.
5. Check every structured response for `stop_reason`/`max_tokens` and refusal ([Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs), [OpenAI](https://developers.openai.com/api/docs/guides/structured-outputs)).

---

## 3. Backend language

| Criterion | Rust | Go | TypeScript/Node | Python |
|---|---|---|---|---|
| Official Anthropic SDK | No | Yes (`anthropic-sdk-go/v2` 2.2.0) | Yes (`@anthropic-ai/sdk` 1.2.0) | Yes (2.2.0) |
| Official OpenAI SDK | No (community `async-openai` only) | Yes (beta) | Yes (`openai` 7.43.0) | Yes |
| Official Google Gen AI SDK | No | Yes (`google.golang.org/genai`) | Yes (`@google/genai` 2.31.0) | Yes |
| ZIP | `zip` 9.0.5 | stdlib `archive/zip` (Store via `CreateHeader`; insecure-path check only behind `GODEBUG`) | `yauzl` 3.4.0 (validates sizes and paths) + `yazl` 3.3.1 | stdlib `zipfile` |
| Namespace-preserving XML round-trip | `quick-xml` 0.42 event reader and writer (pass-through example; byte identity not claimed) | stdlib `encoding/xml` **loses prefixes** ([#9519](https://github.com/golang/go/issues/9519)) | `@xmldom/xmldom` 0.9.12 (DOM plus `XMLSerializer`; prefix round-trip not documented, so **UNVERIFIED**, needs a test) | `lxml` (mature; XXE off by default since 5.x, [FAQ](https://lxml.de/FAQ.html)) |
| Concurrency for I/O-bound calls | tokio | goroutines | event loop plus a promise pool | asyncio |
| SSE | axum | stdlib | Hono `streamSSE` ([docs](https://hono.dev/docs/helpers/streaming)) | FastAPI/Starlette |
| Shares types with the web app | No | No | **Yes** | No |

Sources for the SDK rows: [Anthropic](https://platform.claude.com/docs/en/api/client-sdks), [OpenAI](https://developers.openai.com/api/docs/libraries), [Google](https://ai.google.dev/gemini-api/docs/libraries). Versions come from [npm](https://registry.npmjs.org/) and [crates.io](https://crates.io/) on 2026-10-23.

**Recommendation: TypeScript on Node 24 LTS.**
- Node v24.22.1 "Krypton" is the latest LTS; v26 is Current ([nodejs.org dist index](https://nodejs.org/dist/index.json)). When v26 enters LTS is **UNVERIFIED**.
- Throughput is bounded by provider rate limits, for example the Anthropic Start tier at 1,000 RPM and 2M ITPM for Sonnet 5.5 ([rate limits](https://platform.claude.com/docs/en/api/rate-limits)), not by CPU.
- Parsing and serializing one book's XHTML is a small CPU cost next to minutes of LLM latency. That this cost is small is an estimate, not measured: **UNVERIFIED**.
- Rust's speed buys nothing here and costs three hand-written provider clients.
- Go's XML namespace bug sits squarely on the core path.
- A **shared TypeScript monorepo is the better overall trade-off**: one toolchain, and zod schemas for the job, segment and SSE event types shared by `apps/web` and `apps/api`.
- Python with `lxml` is the strongest XML option. Revisit it only if the xmldom round-trip tests (D2) fail. A fallback is a small Python `epub-io` worker behind the same port.

---

## 4. LLM provider abstraction

### 4.1 Provider features

| Feature | Anthropic | OpenAI | Google Gemini |
|---|---|---|---|
| Current models (verified) | `claude-opus-5-5` $4/$20, `claude-sonnet-5-5` $2/$10, `claude-haiku-5-5` from $0.10/$0.50 per MTok; 1M context; 128K max output (300K on Batches with the `output-300k-2026-03-24` beta) ([models](https://platform.claude.com/docs/en/about-claude/models/overview)) | `gpt-6-astra` $10/$50, `gpt-6.1-sol` $2/$10, `gpt-6-luna` $0.10/$0.50 ([models](https://developers.openai.com/api/docs/models)) | Stable: `gemini-4-argon`, `gemini-3.8-flash`, `gemini-3.5-flash-lite`, … ([models](https://ai.google.dev/gemini-api/docs/models)); prices not fetched (**UNVERIFIED**) |
| Structured output | `output_config.format: {type:"json_schema", schema}`, GA; no recursive schemas, `additionalProperties:false` required; `stop_reason:"refusal"`/`"max_tokens"` can break the schema ([docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)) | Responses `text.format: {type:"json_schema", name, schema, strict:true}`; `json_object` is the weaker JSON mode ([docs](https://developers.openai.com/api/docs/guides/structured-outputs)) | `response_format: {type:"text", mime_type:"application/json", schema}` (Interactions API) ([docs](https://ai.google.dev/gemini-api/docs/structured-output)) |
| Batch | 50% off; ≤100k requests or 256 MB; done within 24 h; results kept 29 d; stacks with caching (30–98% hit rate, best effort) ([docs](https://platform.claude.com/docs/en/build-with-claude/batch-processing)) | 50% off; ≤50k requests, 200 MB file; 24 h window; separate rate-limit pool; output deleted after 30 d ([docs](https://developers.openai.com/api/docs/guides/batch)) | 50% off; inline <20 MB or JSONL ≤2 GB; 24 h target; expires at 48 h; supports caching and structured output ([docs](https://ai.google.dev/gemini-api/docs/batch-mode)) |
| Prompt caching | `cache_control` breakpoints or one top-level automatic one. Writes cost 1.25× (5 m TTL) or 2× (1 h); reads 0.1×, or 0.05× on Opus and Sonnet 5.5. Minimum 512 tokens on 5.5 models. Cache reads don't count toward ITPM. ([docs](https://platform.claude.com/docs/en/build-with-claude/prompt-caching), [rate limits](https://platform.claude.com/docs/en/api/rate-limits)) | Automatic. On GPT-5.6+, ≥1,024-token prefix, reads 0.1×, writes 1.25× (30 m) or 2.5× (12 h) ([docs](https://developers.openai.com/api/docs/guides/prompt-caching)) | Implicit caching on by default for 2.5+, minimum 4,096 tokens on 3.x/4; no explicit caching on Gemini 4 Argon ([docs](https://ai.google.dev/gemini-api/docs/caching)) |
| Rate limits | Per model class: RPM, ITPM, OTPM; token bucket; `retry-after` on 429; a spend-cap 429 has no `retry-after` and carries `error_code: enforced_spend_limit_reached` ([docs](https://platform.claude.com/docs/en/api/rate-limits)) | Batch pool is separate ([docs](https://developers.openai.com/api/docs/guides/batch)) | Not fetched (**UNVERIFIED**) |

**Implication for prompts:** keep a byte-stable prefix (system prompt, glossary hits, book style notes) of at least 512 tokens for Claude and 4,096 for Gemini, so caching engages. Put the variable segments last.

**Cost example (estimate).** Anthropic quotes 1M tokens ≈ 555k words on the current tokenizer ([models](https://platform.claude.com/docs/en/about-claude/models/overview)). A 100k-word novel is therefore about 180k source tokens in and a similar amount out. On Sonnet 5.5 that comes to roughly $0.36 in and $1.80 out, or about $1.10 on Batch, before prompt overhead. Output length varies by language pair, so the figure is **UNVERIFIED**.

### 4.2 Port sketch (in `packages/core`)

```ts
export interface TranslationProvider {
  readonly id: ProviderId;
  capabilities(): ProviderCapabilities; // structuredOutput, batch, promptCache, maxOutputTokens
  translateSegments(req: SegmentBatchRequest, signal: AbortSignal): Promise<SegmentBatchResult>;
  submitBatch?(reqs: SegmentBatchRequest[]): Promise<BatchHandle>;
  pollBatch?(handle: BatchHandle): Promise<BatchPoll>; // yields per-request results as they finish
}

export interface SegmentBatchRequest {
  requestId: string;           // stable: hash(segments, model, promptVersion, targetLang)
  model: string;
  sourceLang: string | null;
  targetLang: string;          // BCP 47
  stablePrefix: PromptPart[];  // cacheable: instructions, style notes, glossary hits
  context: PriorSegment[];     // previous k translated segments
  segments: { id: string; text: string }[]; // text carries <1>…</1>, <x2/> tokens
  maxOutputTokens: number;
}

export type SegmentBatchResult =
  | { kind: "ok"; segments: { id: string; text: string }[]; usage: Usage }
  | { kind: "truncated" | "refused"; usage: Usage }
  | { kind: "retryable"; retryAfterMs?: number; cause: string }
  | { kind: "fatal"; cause: string }; // bad key, unknown model, spend cap
```

Adapters (`packages/provider-anthropic`, `-openai`, `-gemini`) wrap the official SDKs and map each vendor error to `retryable` or `fatal`. Domain code depends only on the port (DIP). The capabilities object lets the scheduler choose live or batch mode without branching on vendor (OCP).

---

## 5. Job architecture

**Recommendation:** an in-process job runner over **SQLite in WAL mode**, with Postgres as a later adapter behind the same `JobStore` port.
- WAL lets readers run alongside a single writer, but it is same-host only and does not work on network filesystems ([sqlite.org/wal](https://www.sqlite.org/wal.html)). That fits a local-first, single-user app.
- Use `better-sqlite3` 13.0.3. `node:sqlite` became Release Candidate only in v25.7.0 ([Node docs](https://nodejs.org/api/sqlite.html)), so its status on the Node 24 LTS line is **UNVERIFIED** as stable.
- Redis queues (BullMQ) and Postgres queues (pg-boss 12.38, graphile-worker 0.18) bring a server dependency that a personal app does not need.

**Schema sketch:**
- `books(id, sha256, original_path, opf_meta_json, source_lang, created_at)`
- `chapters(id, book_id, spine_idx, href, title, status)`
- `segments(id, chapter_id, ordinal, xpath, source_markup, source_text_tokens, hash)`
- `jobs(id, book_id, target_lang, provider, model, prompt_version, mode{live|batch}, status, created_at)`
- `translations(job_id, segment_id, text, status{pending|done|flagged|failed}, attempts, usage_json, provider_request_id)` with primary key `(job_id, segment_id)`
- `glossary(book_id, target_lang, source_term, target_term, note)`
- `provider_batches(id, job_id, vendor_batch_id, status, submitted_at)`

**Behaviour:**
- Resumability comes free: on start, the runner selects pending segments.
- The cache key is `hash(segment.source_markup, target_lang, model, prompt_version, glossary_hits)`, so an identical retranslation is free.
- Concurrency uses a per-provider token-bucket limiter fed by the `anthropic-ratelimit-*` headers ([rate limits](https://platform.claude.com/docs/en/api/rate-limits)).
- Chapters run in parallel and segments within a chapter run in order. Design: in-order is needed only when context carry-over is on.
- In batch mode, the runner submits a chapter (or the whole book) as one vendor batch, records the vendor ID, and polls it. A restart resumes polling.

**Progress:**
- SSE at `GET /jobs/:id/events` with `id:` set to a monotonically increasing event sequence, so a reconnecting `EventSource` can send `Last-Event-ID`. The resume mechanism is from the WHATWG SSE spec; the specific link was not fetched (**UNVERIFIED**).
- Events: `segment.done`, `chapter.progress {done,total}`, `job.status`, `usage`. SSE suffices because commands such as pause, resume and cancel are plain REST.

**Storage:**
- Originals are stored as files under `data/books/<sha256>.epub`, unpacked lazily.
- Translated segments live in SQLite.
- Exported EPUBs are rendered on demand from the original plus the translations, so the export is a pure function.

---

## 6. UI

### 6.1 Reference: Dusk Translate shared reader (checked in Chrome, desktop width, 2026-10-23)

Observed at the `/reader?share=…` URL the user supplied (a JS SPA; WebFetch saw only "Loading"):

- **Layout:** a light, warm off-white card with three regions:
  - A header with "← Library", the eyebrow "EPUB READER · SHARED TRANSLATED EDITION", the book title in Japanese, "Open another EPUB", and `A−` / `Reset` / `A+` with a px readout (default 20 px; A+ moved it to 22 px).
  - A left "Contents" rail listing spine sections ("00 CONTENTS", "01 Chapter 1: …", … "06 Epilogue"), with the active item highlighted.
  - The main column with a mono eyebrow "SECTION 01 OF 7" and a status chip "READY TO READ".
- **Typography:**
  - The body is a serif text face at about 20 px with generous line height.
  - Headings are a large serif display face.
  - Chapters open with a terracotta drop-cap.
  - UI chrome uses a small sans and mono for metadata.
- **Theme:** a "Switch color theme" button sits in the site header, outside the reader card. Clicking it made no visible change to the reader.
- **Translation presentation:** translation only. There was no original/bilingual toggle and no per-paragraph source reveal (accessibility tree: the only controls are Library, Open another EPUB, three size buttons, the section list and the theme toggle).
- **Problems to avoid:**
  1. Markdown leaks into the output (`Charlotte and I still hadn't done *it* since Christmas`): emphasis was lost in extraction and the model emitted markdown, which was rendered literally (the case for §2's placeholders).
  2. The chapter title is duplicated: the TOC label is rendered as an `h1` above the book's own heading.
  3. The measure is too wide: lines run to the card's right edge at about 100+ characters.
  4. The long title overflows and is clipped rather than wrapped or truncated.
  5. There is no previous/next chapter control at the end of a section, and no reading-progress indicator.
  6. There are no font-family, line-height, margin or theme controls inside the reader.
- **Worth keeping:** the calm, paper-like palette; the section counter and status chip; the persistent TOC rail; the serif reading face with a drop-cap; and the "use locally without an account" positioning seen on its landing page.

### 6.2 Other references

- **Readest** (Next 16, React 19, Tailwind 4, daisyUI 5, Tauri 2; vendors its own foliate-js fork as a submodule) ([package.json](https://github.com/readest/readest/blob/854fb74d9cfc555a1df6341b71d295878714fc23/apps/readest-app/package.json), [.gitmodules](https://github.com/readest/readest/blob/854fb74d9cfc555a1df6341b71d295878714fc23/.gitmodules)). It offers interleaved per-paragraph translation with a source-hide toggle, plus fonts, margins and line spacing and light/dark/sepia themes ([readest.com](https://readest.com/)).
- **Immersive Translate** offers a side-by-side layout and an interleaved hover-to-reveal mode, and its bilingual output styles are customizable ([immersivetranslate.com](https://immersivetranslate.com/)).
- **DeepL document API** takes an upload, then polls status, then downloads, and supports HTML/XML but **not EPUB** ([DeepL docs](https://developers.deepl.com/api-reference/document)). Its "upload → status → download" shape is the flow to copy.
- **Apple Books and Kindle:** not researched from primary sources (**UNVERIFIED**).

### 6.3 Rendering library

| Option | Status | Fit |
|---|---|---|
| epub.js | BSD-2-Clause; last npm release 0.3.93 on 2022-02-16; last commit 2026-03-23; 517 open issues ([npm](https://registry.npmjs.org/epubjs), [repo](https://github.com/futurepress/epub.js)) | Effectively unmaintained. Avoid. |
| foliate-js | MIT; last push 2026-05-01; README: "not stable … no release yet", so include it as a git submodule. It does not support scripted content and requires a CSP, because its iframes need `allow-same-origin allow-scripts` (WebKit bug 218086) ([README §Security](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/README.md#security), [paginator.js L244](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/paginator.js#L244)). The npm `foliate-js` 1.0.1 package's provenance is **UNVERIFIED**. | Good paginated reader for the *exported* EPUB; used by Foliate and Readest |
| Own renderer | n/a | Needed for an aligned side-by-side view. We already hold segment pairs; render chapter XHTML sanitized with DOMPurify (`PARSER_MEDIA_TYPE: 'application/xhtml+xml'`, [DOMPurify](https://github.com/cure53/DOMPurify)) inside an `<iframe sandbox>` without `allow-scripts`, plus book CSS rewritten through our asset route |

**Recommendation:**
- Use your own scrolled renderer for v1, with three modes:
  - **Translation:** the translated XHTML only.
  - **Interleaved:** source block, then translation block, with the source muted.
  - **Side-by-side:** a two-column grid with one row per segment, so rows stay aligned regardless of length. Rows stack on narrow screens.
- Add foliate-js later as an "open exported EPUB" paginated viewer.

### 6.4 Screens

1. **Library / upload.** Drag-and-drop an `.epub`, then an immediate preflight panel: title, author, detected source language, chapter count, word and token estimate, a cost estimate per model and mode (live vs batch at −50%), and EPUBCheck findings on the source.
2. **New job.** Provider and model picker filtered by configured keys; target language; mode (live/batch); output (translation-only or bilingual EPUB); a glossary step to review and edit names and terms extracted in one cheap pass.
3. **Job dashboard.**
   - A row per chapter with a segment progress bar, state (queued/running/done/flagged/failed), tokens and cost so far, and a retry-chapter action.
   - A job header with pause, resume and cancel, ETA, and a live SSE log.
   - A flagged-segment queue (placeholder mismatch, refusal, truncation) with inline edit.
4. **Reader.**
   - **Header:** TOC rail (collapsible), section counter, and a progress bar.
   - **Controls:** view-mode segmented control (Translation / Interleaved / Side-by-side), plus a settings popover for font family (serif/sans/system/book), size, line height, measure (narrow/medium/wide, default about 65ch), margins, and theme (light/sepia/dark/system).
   - **Navigation:** previous/next chapter at the end of each section and on ←/→ keys.
   - **Segment actions:** click any segment to show its source and retranslate or edit it.
   - Unlike Dusk, the TOC label is shown in the rail only, never duplicated as an `h1`.
5. **Export.** Download the EPUB together with the EPUBCheck delta report.

### 6.5 Frontend stack

- **Recommendation:** React 19.3 + Vite 8 as a client SPA, with TanStack Router 1.170 and TanStack Query 5.104, Tailwind 4.3, and shadcn/ui. shadcn/ui is copy-in components rather than a dependency and supports Vite ([shadcn/ui docs](https://ui.shadcn.com/docs), [installation](https://ui.shadcn.com/docs/installation)).
- No SSR is needed for a local app. Versions are from [npm](https://registry.npmjs.org/) on 2026-10-23.
- Dark mode comes from CSS variables on `:root` with a `data-theme` override; the reader iframe receives the same tokens.

---

## 7. Monorepo tooling and layout

- **Recommendation:** pnpm workspaces (`pnpm-workspace.yaml` globs plus the `workspace:` protocol, [pnpm docs](https://pnpm.io/workspaces)) with Turborepo 2.11 for task ordering and caching ([turborepo.dev](https://turborepo.dev/docs)).
- Nx 24 is heavier than a few packages need. A Cargo workspace is moot without Rust.
- Supporting tools: Biome 2.6 for lint and format, Vitest 5 for tests, TypeScript 7.0.

```
epub-translator/
  apps/
    web/                 React SPA (reader, dashboard, upload)
    api/                 Hono HTTP + SSE; composition root wires adapters to ports
  packages/
    core/                domain: Book, Chapter, Segment, Job, Glossary; use cases
                         (ImportBook, PlanJob, RunJob, ExportEpub); ports:
                         EpubReader, EpubWriter, TranslationProvider, JobStore,
                         BlobStore, Clock, Validator. No I/O imports.
    segmenter/           pure XHTML DOM → segments + placeholder encode/decode/validate
    epub-io/             adapter: yauzl/yazl + @xmldom/xmldom; OPF/nav/NCX edits; repack
    provider-anthropic/  adapter over @anthropic-ai/sdk
    provider-openai/     adapter over openai
    provider-gemini/     adapter over @google/genai
    store-sqlite/        adapter: better-sqlite3 + migrations (JobStore, cache)
    validator-epubcheck/ adapter: spawns EPUBCheck, parses JSON report
    contracts/           zod schemas for HTTP + SSE payloads shared by web and api
    ui/                  shared shadcn components and design tokens
  fixtures/epubs/        golden EPUBs (EN, JA, RTL, footnotes, ruby, nav+NCX, obfuscated font)
  docs/
```

Dependency rule: `core` ← `segmenter`, and `core` ← every adapter. `apps/api` is the only place that imports adapters. `apps/web` imports only `contracts` and `ui`. Golden round-trip tests take each fixture through parse → segment → identity-translate → repack and assert byte-identical XHTML (modulo the edits) plus an unchanged EPUBCheck result.

---

## 8. Security

| Threat | Mitigation | Source |
|---|---|---|
| Zip bomb | Trust `uncompressedSize` only with yauzl's `validateEntrySizes` (on by default). Cap total and per-entry uncompressed size and entry count, and abort past the cap. yauzl leaves the heuristics to the caller. | [yauzl](https://github.com/thejoshwolfe/yauzl) |
| Path traversal (zip slip) | yauzl's `validateFileName` rejects absolute, drive-letter and `..` names and backslashes (needs `decodeStrings` true). Never extract to disk by entry name; key blobs by hash. | [yauzl](https://github.com/thejoshwolfe/yauzl) |
| XXE / billion laughs | Disable DTD processing and entity expansion; EPUB itself forbids external entities in the internal subset. Reject any document with a `<!DOCTYPE … [` internal subset or `<!ENTITY`, as a pre-parse check, because xmldom's entity behaviour is not documented (**UNVERIFIED**). | [OWASP XXE](https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html), [EPUB §3.9](https://www.w3.org/TR/epub-33/#sec-xml-constraints) |
| Scripted content in the reader | Strip `script`, event handlers and `javascript:` URLs with DOMPurify in XHTML mode. Render in `<iframe sandbox="allow-same-origin">` (no `allow-scripts`) under a CSP of `script-src 'self'` and `connect-src 'self'`, with no remote resources. EPUB treats network-accessing scripts as a threat and wants a unique origin per publication. | [EPUB §11](https://www.w3.org/TR/epub-33/#sec-security-privacy), [foliate-js §Security](https://github.com/johnfactotum/foliate-js/blob/78914aef4466eb960965702401634c2cb348e9b1/README.md#security), [DOMPurify](https://github.com/cure53/DOMPurify) |
| Prompt injection via book text | Book text is data: it goes only in the user-message segment payload, and the JSON schema output means the model cannot trigger actions. Flag segments where the output length ratio is anomalous. | Design |
| API keys | Keys are server-side only, read from env or a local `0600` config file and never sent to the browser. The UI shows only "configured / not configured" and the last 4 characters. Never log request bodies with keys. Bind the API to `127.0.0.1` by default. | Design |

---

## Recommended stack

| Concern | Choice |
|---|---|
| Language/runtime | TypeScript, Node 24 LTS |
| Monorepo | pnpm workspaces + Turborepo; Biome; Vitest |
| API | Hono (REST + `streamSSE`) |
| EPUB IO | yauzl (read) + yazl (write, `mimetype` with `compress:false, forceDosTimestamp:true`) + @xmldom/xmldom; EPUBCheck 5.x for validation |
| Segmentation | Block units, paired inline placeholders, ID-keyed JSON structured output, validate-then-fallback |
| LLM | `TranslationProvider` port; adapters over the official Anthropic, OpenAI and Gemini SDKs; live and batch (−50%) modes; cache-stable prompt prefix |
| Default model | `claude-sonnet-5-5` (quality per cost), `claude-haiku-5-5` for the glossary pass. Design choice; no translation eval run. |
| Jobs/storage | In-process runner; SQLite (WAL, better-sqlite3); per-segment status and cache; originals as files |
| Progress | SSE with `Last-Event-ID` resume |
| Web | React 19 + Vite 8 SPA, TanStack Router/Query, Tailwind 4, shadcn/ui |
| Reader | Own sanitized-XHTML renderer (Translation / Interleaved / Side-by-side); foliate-js later for paginated export preview |
| Security | Size caps, path validation, DTD rejection, DOMPurify + sandboxed iframe + CSP, server-side keys |

## Open decisions

- **D1.** Default output: translation-only EPUB, bilingual EPUB, or both? This drives the `dc:language` order and whether the root `lang` is source or target.
- **D2.** Accept @xmldom/xmldom after a round-trip test over the fixture corpus, or switch `epub-io` to Python and lxml?
- **D3.** Bundle a JRE and EPUBCheck in the API, or run validation only in CI and dev?
- **D4.** New `dc:identifier` for translated editions? Yes means re-obfuscating embedded fonts.
- **D5.** Batch mode in v1, or live only? Batch gives −50% cost but up to 24 h latency (48 h expiry on Gemini).
- **D6.** Context strategy: previous-k segments only, or also a rolling summary and names note? The note costs extra tokens per request.
- **D7.** Glossary: prompt-level hints (keep inflection) or hard placeholder substitution (guaranteed consistency)?
- **D8.** Single-user local only (bind 127.0.0.1, no auth), or a hosted multi-user mode later (then Postgres, auth and per-user key vaulting)?
- **D9.** Which source languages to put in the fixture corpus first (JA/ZH/KO need ruby and vertical-text cases)?

## Verification notes

| Claim | Status | Source |
|---|---|---|
| Claude 5.5 model IDs `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5` | CONFIRMED (also `claude-fable-5-1` exists) | [models overview](https://platform.claude.com/docs/en/about-claude/models/overview) |
| No official Rust SDK from Anthropic, OpenAI or Google | CONFIRMED (not listed on any of the three official pages) | see §3 |
| Go `encoding/xml` prefix round-trip broken | CONFIRMED open issue; whether 2023–24 commits fixed it is unanswered in the thread | [#9519](https://github.com/golang/go/issues/9519) |
| xmldom preserves prefixes and ignores external entities | UNVERIFIED; must be tested | [xmldom README](https://github.com/xmldom/xmldom) |
| Font obfuscation key derives from the unique identifier | UNVERIFIED here (OCF §4.2.6.3.2 not read) | [EPUB §4.2.6.3.2](https://www.w3.org/TR/epub-33/#sec-container-metainf-encryption.xml) |
| Gemini model pricing and rate limits | UNVERIFIED (not fetched) | — |
| Apple Books and Kindle UI patterns | UNVERIFIED (not researched) | — |
| Dusk Translate observations | Observed in a live browser session at desktop width on 2026-10-23; site content may change | user-supplied share URL |
