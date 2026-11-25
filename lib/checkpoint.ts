import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import type { PrivateSession } from "@/types";
import { checkpointLimit } from "@/lib/schema";

const CONTEXT = Buffer.from("stepwise-session-v1");
let cachedKey: Buffer | undefined;

function validateKey(value: Buffer) {
  if (value.length !== 32) throw new Error("STEPWISE_SESSION_KEY must decode to 32 bytes.");
  return value;
}

export function sessionKey() {
  if (cachedKey) return cachedKey;
  const configured = process.env.STEPWISE_SESSION_KEY?.trim();
  if (configured) return (cachedKey = validateKey(Buffer.from(configured, "base64url")));

  const directory = join(/* turbopackIgnore: true */ process.cwd(), ".stepwise");
  const path = join(directory, "session.key");
  try {
    return (cachedKey = validateKey(readFileSync(path)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const generated = randomBytes(32);
  try {
    writeFileSync(path, generated, { flag: "wx", mode: 0o600 });
    return (cachedKey = generated);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return (cachedKey = validateKey(readFileSync(path)));
}

export function sealCheckpoint(session: PrivateSession, key = sessionKey()) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(CONTEXT);
  const compressed = deflateRawSync(JSON.stringify(session));
  const encrypted = Buffer.concat([cipher.update(compressed), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), encrypted]).toString("base64url");
}

export function openCheckpoint(token: string, key = sessionKey()): PrivateSession | undefined {
  if (token.length > checkpointLimit || !/^[A-Za-z0-9_-]+$/.test(token)) return;
  try {
    const bytes = Buffer.from(token, "base64url");
    if (bytes.length < 29 || bytes.toString("base64url") !== token) return;
    const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    decipher.setAAD(CONTEXT);
    decipher.setAuthTag(bytes.subarray(12, 28));
    const payload = Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
    return JSON.parse(inflateRawSync(payload, { maxOutputLength: 4_000_000 }).toString("utf8")) as PrivateSession;
  } catch {
    return undefined;
  }
}
