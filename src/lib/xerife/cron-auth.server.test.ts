import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  decodedByteLength,
  isStrongSecret,
  timingSafeEqual,
  requireXerifeCronAuth,
} from "./cron-auth.server";

const HEX32 = "0".repeat(0) + "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://app.test/api/public/hooks/xerife-engine", {
    method: "POST",
    headers,
  });
}

const original = process.env.XERIFE_SECRET;
beforeEach(() => {
  process.env.XERIFE_SECRET = HEX32;
});
afterEach(() => {
  if (original === undefined) delete process.env.XERIFE_SECRET;
  else process.env.XERIFE_SECRET = original;
});

describe("força do segredo", () => {
  it("hex de 64 chars vale 32 bytes", () => {
    expect(decodedByteLength(HEX32)).toBe(32);
    expect(isStrongSecret(HEX32)).toBe(true);
  });
  it("rejeita curto, vazio e repetitivo", () => {
    expect(isStrongSecret("abc")).toBe(false);
    expect(isStrongSecret("")).toBe(false);
    expect(isStrongSecret(undefined)).toBe(false);
    expect(isStrongSecret("a".repeat(64))).toBe(false);
  });
});

describe("timingSafeEqual", () => {
  it("compara corretamente", async () => {
    expect(await timingSafeEqual("abc", "abc")).toBe(true);
    expect(await timingSafeEqual("abc", "abd")).toBe(false);
    expect(await timingSafeEqual("abc", "")).toBe(false);
  });
});

describe("requireXerifeCronAuth", () => {
  it("503 quando o segredo do servidor está ausente", async () => {
    delete process.env.XERIFE_SECRET;
    const r = await requireXerifeCronAuth(req({ "x-xerife-secret": HEX32 }));
    expect(r?.status).toBe(503);
  });

  it("503 quando o segredo do servidor é fraco", async () => {
    process.env.XERIFE_SECRET = "curto";
    const r = await requireXerifeCronAuth(req({ "x-xerife-secret": "curto" }));
    expect(r?.status).toBe(503);
  });

  it("401 sem header", async () => {
    expect((await requireXerifeCronAuth(req()))?.status).toBe(401);
  });

  it("401 com segredo errado", async () => {
    const r = await requireXerifeCronAuth(req({ "x-xerife-secret": "b".repeat(64) }));
    expect(r?.status).toBe(401);
  });

  it("401 quando manda apikey publishable em vez do header", async () => {
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_teste";
    const r = await requireXerifeCronAuth(req({ apikey: "sb_publishable_teste" }));
    expect(r?.status).toBe(401);
  });

  it("401 quando o segredo vem por query string", async () => {
    const r = await requireXerifeCronAuth(
      new Request(`https://app.test/api/public/hooks/xerife?secret=${HEX32}`, { method: "POST" }),
    );
    expect(r?.status).toBe(401);
  });

  it("null (autorizado) com o segredo correto", async () => {
    expect(await requireXerifeCronAuth(req({ "x-xerife-secret": HEX32 }))).toBeNull();
  });

  it("respostas de erro não vazam o segredo", async () => {
    const r = await requireXerifeCronAuth(req({ "x-xerife-secret": "b".repeat(64) }));
    const body = await r!.text();
    expect(body).not.toContain(HEX32);
    expect(JSON.parse(body)).toEqual({ ok: false, error: "unauthorized" });
  });
});
