/**
 * PBKDF2-HMAC-SHA256, in pure JavaScript.
 *
 * ## Why this exists
 *
 * `crypto.subtle` is only defined in a **secure context** — HTTPS, or `localhost`
 * specifically. Open the dev server on its LAN address to try the app on a phone
 * (`http://192.168.x.x:3000`) and `crypto.subtle` is `undefined`, so the sign-in
 * screen dies with "Cannot read properties of undefined (reading 'importKey')".
 * Testing the mobile layout on a real phone is exactly when you want this to
 * work, so the KDF cannot depend on the secure-context API.
 *
 * ## The constraint that shapes it
 *
 * This must produce **byte-identical output to WebCrypto** for the same inputs.
 * An account created on localhost (WebCrypto path) has to unlock over the LAN
 * address (this path) — a fallback that derives a different key is worse than no
 * fallback, because it fails as "wrong password" on a correct password. The test
 * harness asserts equality against `crypto.subtle` rather than against a fixture,
 * so drift is impossible to miss.
 *
 * Parameters are therefore fixed at the call site, never varied per path: same
 * salt, same iteration count, same output length regardless of which
 * implementation runs.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INIT = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
]);

/** Scratch buffers, allocated once — this runs 420,000 times per derivation. */
const w = new Uint32Array(64);

/**
 * One SHA-256 compression over a 64-byte block, updating `h` in place.
 *
 * Taking the state as a parameter lets PBKDF2 precompute the ipad/opad
 * midstates once and reuse them across every iteration, which is where most of
 * the saving in this implementation comes from.
 */
function compress(h: Uint32Array, block: Uint8Array, offset: number): void {
  for (let i = 0; i < 16; i++) {
    const j = offset + i * 4;
    w[i] =
      ((block[j]! << 24) |
        (block[j + 1]! << 16) |
        (block[j + 2]! << 8) |
        block[j + 3]!) >>>
      0;
  }

  for (let i = 16; i < 64; i++) {
    const a = w[i - 15]!;
    const b = w[i - 2]!;
    const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
    const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
    w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
  }

  let a = h[0]!;
  let b = h[1]!;
  let c = h[2]!;
  let d = h[3]!;
  let e = h[4]!;
  let f = h[5]!;
  let g = h[6]!;
  let hh = h[7]!;

  for (let i = 0; i < 64; i++) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + maj) >>> 0;

    hh = g;
    g = f;
    f = e;
    e = (d + t1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) >>> 0;
  }

  h[0] = (h[0]! + a) >>> 0;
  h[1] = (h[1]! + b) >>> 0;
  h[2] = (h[2]! + c) >>> 0;
  h[3] = (h[3]! + d) >>> 0;
  h[4] = (h[4]! + e) >>> 0;
  h[5] = (h[5]! + f) >>> 0;
  h[6] = (h[6]! + g) >>> 0;
  h[7] = (h[7]! + hh) >>> 0;
}

function sha256(data: Uint8Array): Uint8Array {
  const bitLength = data.length * 8;
  // Message + 0x80 + zero padding + 8-byte big-endian bit length, to a multiple of 64.
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;

  // Lengths here never approach 2^32 bits, so the high word is always zero.
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLength >>> 0, false);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000), false);

  const h = INIT.slice();
  for (let offset = 0; offset < padded.length; offset += 64) {
    compress(h, padded, offset);
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]!, false);
  return out;
}

/** Digest of a padded key block followed by 32 bytes — the shape HMAC needs here. */
function digestFromMidstate(midstate: Uint32Array, tail: Uint8Array): Uint8Array {
  // Total message is 64 (the padded key) + tail.length bytes.
  const bitLength = (64 + tail.length) * 8;
  const padded = new Uint8Array(((tail.length + 9 + 63) >> 6) << 6);
  padded.set(tail);
  padded[tail.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, bitLength >>> 0, false);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000), false);

  const h = midstate.slice();
  for (let offset = 0; offset < padded.length; offset += 64) {
    compress(h, padded, offset);
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) outView.setUint32(i * 4, h[i]!, false);
  return out;
}

/**
 * PBKDF2-HMAC-SHA256 producing exactly 32 bytes.
 *
 * 32 bytes is one SHA-256 output, so only block T_1 is needed and the outer
 * concatenation loop disappears.
 */
export function pbkdf2Sha256(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
): Uint8Array {
  // HMAC key preparation: hash if longer than the block size, then zero-pad.
  const key = new Uint8Array(64);
  key.set(password.length > 64 ? sha256(password) : password);

  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    ipad[i] = key[i]! ^ 0x36;
    opad[i] = key[i]! ^ 0x5c;
  }

  // Precompute both midstates once rather than re-hashing the padded key on
  // every one of the 210,000 iterations.
  const innerMid = INIT.slice();
  compress(innerMid, ipad, 0);
  const outerMid = INIT.slice();
  compress(outerMid, opad, 0);

  const hmac = (message: Uint8Array) =>
    digestFromMidstate(outerMid, digestFromMidstate(innerMid, message));

  // U_1 = PRF(password, salt || INT_32_BE(1))
  const first = new Uint8Array(salt.length + 4);
  first.set(salt);
  first[salt.length + 3] = 1;

  let u = hmac(first);
  const result = u.slice();

  for (let i = 1; i < iterations; i++) {
    u = hmac(u);
    for (let j = 0; j < 32; j++) result[j]! ^= u[j]!;
  }

  return result;
}

/** True when the secure-context WebCrypto path is usable. */
export function hasSubtleCrypto(): boolean {
  return (
    typeof crypto !== "undefined" &&
    typeof crypto.subtle !== "undefined" &&
    typeof crypto.subtle.importKey === "function"
  );
}
