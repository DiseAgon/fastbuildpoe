/**
 * Drives the shipped inflate cap and in-process limiter.
 * Run: node --experimental-strip-types --no-warnings scripts/check-hardening.mts
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { decodePobCode, MAX_POB_XML_BYTES } from "../src/lib/pob/decode.ts";
import { rateLimit } from "../src/lib/rateLimit.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function encodePob(xml: string): string {
  return deflateSync(Buffer.from(xml, "utf8"))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function assert(cond: unknown, message: string): void {
  if (!cond) throw new Error(message);
}

const smallXml = "<PathOfBuilding></PathOfBuilding>";
const decoded = decodePobCode(encodePob(smallXml));
assert(decoded.includes("<PathOfBuilding"), `small payload should decode, got: ${decoded.slice(0, 80)}`);
console.log("ok: small PoB payload decodes");

const oversizeXml = `<PathOfBuilding>${"x".repeat(MAX_POB_XML_BYTES)}</PathOfBuilding>`;
let threw = false;
try {
  decodePobCode(encodePob(oversizeXml));
} catch {
  threw = true;
}
assert(threw, "oversize inflate must throw");
console.log("ok: oversize inflate fails closed");

const key = `check:${Date.now()}:${Math.random()}`;
const max = 3;
assert(rateLimit(key, max) === true, "hit 1 should pass");
assert(rateLimit(key, max) === true, "hit 2 should pass");
assert(rateLimit(key, max) === true, "hit 3 should pass");
assert(rateLimit(key, max) === false, "hit 4 should reject");
console.log("ok: limiter returns false after maxPerMinute hits");

const feedbackSrc = readFileSync(join(root, "src/app/api/feedback/route.ts"), "utf8");
const linkSrc = readFileSync(join(root, "src/app/api/trade/link/route.ts"), "utf8");
assert(/rateLimit\(/.test(feedbackSrc) && /status:\s*429/.test(feedbackSrc), "feedback POST must call rateLimit and return 429");
assert(/rateLimit\(/.test(linkSrc) && /status:\s*429/.test(linkSrc), "trade/link POST must call rateLimit and return 429");
console.log("ok: feedback and trade/link POST handlers invoke the limiter");
