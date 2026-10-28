import type {
  ChapterRenderer,
  EpubAssets,
  EpubExporter,
  EpubParser,
  IdentityVerifier,
  ParsedBook,
  VerifiedIdentity,
} from "@et/core";
import type { StorageBucketApi, StorageClient } from "../src/infra/storage-client.ts";

interface StoredObject {
  bytes: Uint8Array;
  contentType: string;
  createdAt: string;
}

export class FakeStorage implements StorageClient {
  readonly buckets = new Map<string, Map<string, StoredObject>>();
  readonly downloads: string[] = [];
  now = () => new Date().toISOString();

  objects(bucket: string): Map<string, StoredObject> {
    let map = this.buckets.get(bucket);
    if (!map) {
      map = new Map();
      this.buckets.set(bucket, map);
    }
    return map;
  }

  seed(bucket: string, path: string, bytes: Uint8Array, createdAt = this.now()): void {
    this.objects(bucket).set(path, { bytes, contentType: "application/octet-stream", createdAt });
  }

  from(bucket: string): StorageBucketApi {
    const store = this.objects(bucket);
    const ok = { error: null };
    return {
      upload: async (path, body, options) => {
        store.set(path, { bytes: body, contentType: options.contentType, createdAt: this.now() });
        return ok;
      },
      download: async (path) => {
        this.downloads.push(`${bucket}/${path}`);
        const found = store.get(path);
        return found
          ? { data: new Blob([new Uint8Array(found.bytes)]), error: null }
          : { data: null, error: { message: "not found" } };
      },
      remove: async (paths) => {
        for (const p of paths) store.delete(p);
        return ok;
      },
      move: async (from, to) => {
        const found = store.get(from);
        if (!found) return { error: { message: "not found" } };
        if (store.has(to)) return { error: { message: "The resource already exists" } };
        store.delete(from);
        store.set(to, found);
        return ok;
      },
      createSignedUploadUrl: async (path) => ({
        data: { path, token: `upload-token-${path}` },
        error: null,
      }),
      createSignedUrl: async (path, expiresIn, options) => ({
        data: {
          signedUrl: `https://x.supabase.co/storage/v1/object/sign/${bucket}/${path}?token=t&exp=${expiresIn}&download=${encodeURIComponent(options.download)}`,
        },
        error: null,
      }),
      list: async (folder) => ({
        data: [...store]
          .filter(([path]) => path.startsWith(`${folder}/`))
          .map(([path, o]) => ({ name: path.slice(folder.length + 1), created_at: o.createdAt })),
        error: null,
      }),
    };
  }
}

export class FakeVerifier implements IdentityVerifier {
  readonly tokens = new Map<string, VerifiedIdentity>();
  async verify(token: string) {
    return this.tokens.get(token) ?? null;
  }
}

export const parsed: ParsedBook = {
  title: "本",
  author: "著者",
  sourceLang: "ja",
  coverHref: "image/cover.jpg",
  chapters: [{ id: "ch-0", index: 0, title: "一", docHrefs: ["a.xhtml"] }],
  segments: [{ id: "a.xhtml#0", chapterId: "ch-0", ordinal: 0, sourceText: "一二" }],
};

export const parser: EpubParser = { parse: async () => parsed };
export const assets: EpubAssets = {
  read: async (_bytes, href) =>
    href === "image/cover.jpg" ? { bytes: new Uint8Array([7]), mediaType: "image/jpeg" } : null,
};
export const renderer: ChapterRenderer = {
  render: async (_b, _book, chapterId) => ({
    chapterId,
    index: 0,
    title: "",
    prevChapterId: null,
    nextChapterId: null,
    blocks: [],
  }),
};

export const BIG_EXPORT = new Uint8Array(5 * 1024 * 1024).fill(1);
export const exporter: EpubExporter = { export: async () => BIG_EXPORT };

export const HOSTED_ENV = {
  AUTH_MODE: "supabase",
  SUPABASE_URL: "https://x.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
  SUPABASE_SECRET_KEY: "sb_secret_x",
  DATABASE_URL: "postgres://unused",
  ADMIN_EMAILS: "admin@example.com",
  ALLOWED_HOSTS: "app.example.com",
  APP_URL: "https://app.example.com",
};
