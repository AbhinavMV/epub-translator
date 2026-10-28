import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const root = fileURLToPath(new URL("../../../", import.meta.url));

const Header = z.object({ key: z.string(), value: z.string() });
const VercelConfig = z.object({
  services: z.record(
    z.string(),
    z.object({
      root: z.string(),
      framework: z.string().optional(),
      entrypoint: z.string().optional(),
      outputDirectory: z.string().optional(),
    }),
  ),
  regions: z.array(z.string()).length(1),
  rewrites: z.array(
    z.object({ source: z.string(), destination: z.object({ service: z.string() }) }),
  ),
  headers: z.array(z.object({ source: z.string(), headers: z.array(Header) })),
});

const config = VercelConfig.parse(JSON.parse(readFileSync(`${root}vercel.json`, "utf8")));

function header(source: string, key: string): string | undefined {
  return config.headers
    .filter((h) => h.source === source)
    .flatMap((h) => h.headers)
    .find((h) => h.key === key)?.value;
}

describe("vercel.json", () => {
  it("declares a web and an api service whose roots exist", () => {
    expect(Object.keys(config.services).toSorted()).toEqual(["api", "web"]);
    for (const service of Object.values(config.services)) {
      expect(existsSync(`${root}${service.root}`)).toBe(true);
    }
    expect(
      existsSync(`${root}${config.services.api?.root}/${config.services.api?.entrypoint}`),
    ).toBe(true);
    expect(config.services.web?.outputDirectory).toBe("dist");
  });

  it("routes /api to the api service first and everything else to web", () => {
    expect(config.rewrites.map((r) => [r.source, r.destination.service])).toEqual([
      ["/api/(.*)", "api"],
      ["/(.*)", "web"],
    ]);
  });

  it("deploys functions to Mumbai", () => {
    expect(config.regions).toEqual(["bom1"]);
  });

  it("sends the security headers on every response", () => {
    expect(header("/(.*)", "Referrer-Policy")).toBe("no-referrer");
    expect(header("/(.*)", "X-Content-Type-Options")).toBe("nosniff");
    expect(header("/(.*)", "Permissions-Policy")).toContain("camera=()");
  });

  it("locks the page down with a CSP that still allows the provider and storage origins", () => {
    const csp = header("/((?!api/).*)", "Content-Security-Policy") ?? "";
    const directives = new Map(
      csp.split(";").map((d) => {
        const [name, ...values] = d.trim().split(/\s+/);
        return [name, values];
      }),
    );
    expect(directives.get("default-src")).toEqual(["'self'"]);
    expect(directives.get("script-src")).toEqual(["'self'"]);
    expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
    expect(directives.get("base-uri")).toEqual(["'none'"]);
    expect(directives.get("form-action")).toEqual(["'self'"]);
    expect(directives.get("connect-src")).toEqual([
      "'self'",
      "https://*.supabase.co",
      "https://api.anthropic.com",
      "https://api.openai.com",
      "https://generativelanguage.googleapis.com",
    ]);
    expect(directives.get("img-src")).toEqual([
      "'self'",
      "blob:",
      "data:",
      "https://*.supabase.co",
    ]);
    expect(csp).not.toContain("unsafe-eval");
  });

  it("does not override the per-response CSP of api asset routes", () => {
    const sources = config.headers
      .filter((h) => h.headers.some((x) => x.key === "Content-Security-Policy"))
      .map((h) => h.source);
    expect(sources).toEqual(["/((?!api/).*)"]);
  });

  it("marks api responses uncacheable except covers and assets", () => {
    const rule = config.headers.find((h) => h.headers.some((x) => x.key === "Cache-Control"));
    expect(rule?.headers[0]?.value).toBe("no-store");
    const re = new RegExp(`^${rule?.source.replace(/^\//, "\\/")}$`);
    expect(re.test("/api/books")).toBe(true);
    expect(re.test("/api/jobs/j1/export")).toBe(true);
    expect(re.test("/api/books/b1/cover")).toBe(false);
    expect(re.test("/api/books/b1/assets/img/a.png")).toBe(false);
  });
});
