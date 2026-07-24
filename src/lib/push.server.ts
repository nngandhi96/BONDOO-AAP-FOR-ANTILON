// Server-only Web Push (RFC 8291 aes128gcm + RFC 8292 VAPID).
// Runs on Cloudflare Workers via Web Crypto — no `web-push` npm dep.

import type { SupabaseClient } from "@supabase/supabase-js";

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 2 ? "==" : s.length % 4 === 3 ? "=" : "";
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

/** Encode a raw uncompressed P-256 public key (65 bytes, 0x04||X||Y) to JWK. */
function rawP256PubToJwk(raw: Uint8Array): JsonWebKey {
  if (raw.length !== 65 || raw[0] !== 0x04) {
    throw new Error("Invalid P-256 public key");
  }
  return {
    kty: "EC",
    crv: "P-256",
    x: bytesToB64url(raw.slice(1, 33)),
    y: bytesToB64url(raw.slice(33, 65)),
    ext: true,
  };
}

async function importVapidPrivateKey(privB64url: string, pubB64url: string): Promise<CryptoKey> {
  const pubRaw = b64urlToBytes(pubB64url);
  const jwk: JsonWebKey = {
    ...rawP256PubToJwk(pubRaw),
    d: privB64url,
    key_ops: ["sign"],
  };
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

async function signVapidJwt(audience: string, subject: string): Promise<{ jwt: string; k: string }> {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) throw new Error("VAPID keys not configured");
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
    sub: subject,
  };
  const enc = new TextEncoder();
  const h = bytesToB64url(enc.encode(JSON.stringify(header)));
  const p = bytesToB64url(enc.encode(JSON.stringify(payload)));
  const signingInput = `${h}.${p}`;
  const key = await importVapidPrivateKey(priv, pub);
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(signingInput)),
  );
  return { jwt: `${signingInput}.${bytesToB64url(sig)}`, k: pub };
}

// HKDF via Web Crypto.
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const baseKey = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource },
    baseKey,
    len * 8,
  );
  return new Uint8Array(bits);
}

/**
 * Encrypt payload for a single subscription using RFC 8291 aes128gcm.
 * Returns the full encrypted body (header block + ciphertext).
 */
async function encryptPayload(
  ua_pub_raw: Uint8Array,
  ua_auth: Uint8Array,
  plaintext: Uint8Array,
): Promise<{ body: Uint8Array; as_pub_raw: Uint8Array }> {
  // Ephemeral ES key pair.
  const asKeypair = (await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  )) as CryptoKeyPair;
  const as_pub_jwk = await crypto.subtle.exportKey("jwk", asKeypair.publicKey);
  const as_pub_raw = concat(
    new Uint8Array([0x04]),
    b64urlToBytes(as_pub_jwk.x!),
    b64urlToBytes(as_pub_jwk.y!),
  );

  // Import UA public key for ECDH.
  const ua_pub_key = await crypto.subtle.importKey(
    "jwk",
    rawP256PubToJwk(ua_pub_raw),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: ua_pub_key },
    asKeypair.privateKey,
    256,
  );
  const shared = new Uint8Array(sharedBits);

  const enc = new TextEncoder();
  // IKM per RFC 8291 §3.4
  const infoIkm = concat(
    enc.encode("WebPush: info\0"),
    ua_pub_raw,
    as_pub_raw,
  );
  const IKM = await hkdf(ua_auth, shared, infoIkm, 32);

  // Salt for the aes128gcm block.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const CEK = await hkdf(salt, IKM, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const NONCE = await hkdf(salt, IKM, enc.encode("Content-Encoding: nonce\0"), 12);

  // Padded plaintext: append 0x02 (last record delimiter). No extra padding.
  const padded = concat(plaintext, new Uint8Array([0x02]));

  const cekKey = await crypto.subtle.importKey("raw", CEK, { name: "AES-GCM" }, false, ["encrypt"]);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: NONCE as BufferSource }, cekKey, padded as BufferSource),
  );

  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1 + as_pub_raw.length);
  header.set(salt, 0);
  // rs (uint32 big-endian)
  new DataView(header.buffer).setUint32(16, rs, false);
  header[20] = as_pub_raw.length;
  header.set(as_pub_raw, 21);

  return { body: concat(header, ct), as_pub_raw };
}

export type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
};

type Subscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

async function sendOne(sub: Subscription, payload: PushPayload): Promise<{ ok: boolean; status: number }> {
  const audience = new URL(sub.endpoint).origin;
  const subject = process.env.VAPID_SUBJECT || "mailto:hello@bondoo.app";
  const { jwt, k } = await signVapidJwt(audience, subject);

  const bodyBytes = new TextEncoder().encode(JSON.stringify(payload));
  const { body } = await encryptPayload(
    b64urlToBytes(sub.p256dh),
    b64urlToBytes(sub.auth),
    bodyBytes,
  );

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt}, k=${k}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "60",
    },
    body: body as BodyInit,
  });
  return { ok: res.ok, status: res.status };
}

/**
 * Send a push to every registered device of `userId`. Uses the admin client to
 * read subscriptions across users; safe because the caller has been verified
 * by the surrounding server function. Silently prunes expired endpoints.
 */
export async function sendPushToUser(
  admin: SupabaseClient,
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (error || !subs || subs.length === 0) return;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        const { status } = await sendOne(sub as Subscription, payload);
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", sub.id);
        }
      } catch {
        // swallow — push failures never block the caller
      }
    }),
  );
}

/** Convenience wrapper that resolves the admin client lazily inside a handler. */
export async function notify(userId: string, payload: PushPayload) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await sendPushToUser(supabaseAdmin, userId, payload);
  } catch {
    // never let push errors surface
  }
}