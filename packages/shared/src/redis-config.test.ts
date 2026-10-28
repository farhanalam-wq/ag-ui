import { describe, expect, test } from "bun:test";
import { redisConnectionOptions } from "./redis-config";

describe("redisConnectionOptions", () => {
  test("REDIS_URL with auth + non-default db parses fully", () => {
    const prev = { ...process.env };
    process.env.REDIS_URL = "redis://default:secret@redis-host.example:6380/2";
    try {
      expect(redisConnectionOptions()).toEqual({
        host: "redis-host.example",
        port: 6380,
        password: "secret",
        db: 2,
      });
    } finally {
      process.env = prev;
    }
  });

  test("non-default username is passed (ACL servers)", () => {
    const prev = { ...process.env };
    process.env.REDIS_URL = "redis://svc:pw@h:6379";
    try {
      expect(redisConnectionOptions()).toMatchObject({
        host: "h",
        port: 6379,
        username: "svc",
        password: "pw",
      });
    } finally {
      process.env = prev;
    }
  });

  test("rediss:// enables TLS", () => {
    const prev = { ...process.env };
    process.env.REDIS_URL = "rediss://default:pw@h:6380";
    try {
      expect(redisConnectionOptions()).toMatchObject({
        host: "h",
        port: 6380,
        password: "pw",
        tls: {},
      });
    } finally {
      process.env = prev;
    }
  });

  test("unset URL → legacy REDIS_HOST/REDIS_PORT, then 127.0.0.1 defaults", () => {
    const prev = { ...process.env };
    delete process.env.REDIS_URL;
    try {
      expect(redisConnectionOptions()).toEqual({ host: "127.0.0.1", port: 6379 });
      process.env.REDIS_HOST = "10.0.0.5";
      process.env.REDIS_PORT = "6399";
      expect(redisConnectionOptions()).toEqual({ host: "10.0.0.5", port: 6399 });
    } finally {
      process.env = prev;
    }
  });

  test("malformed URL falls back to the legacy pair instead of crashing", () => {
    const prev = { ...process.env };
    process.env.REDIS_URL = "not a url ::";
    try {
      expect(redisConnectionOptions()).toEqual({ host: "127.0.0.1", port: 6379 });
    } finally {
      process.env = prev;
    }
  });
});
