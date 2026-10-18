import { webcrypto } from "node:crypto";

export const KDF_ITERATIONS = 600000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const MIN_PASSWORD_LENGTH = 16;

const toBase64 = bytes => Buffer.from(bytes).toString("base64");

async function keyFrom(password, salt) {
  const material = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return webcrypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: KDF_ITERATIONS, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );
}

export async function seal(data, password) {
  if (!password || password.length < MIN_PASSWORD_LENGTH) throw new Error(`Пароль короче ${MIN_PASSWORD_LENGTH} символов`);
  const salt = webcrypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = webcrypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await keyFrom(password, salt);
  const plain = new TextEncoder().encode(JSON.stringify(data));
  const cipher = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return { v: 1, kdf: "PBKDF2-SHA256", iterations: KDF_ITERATIONS, salt: toBase64(salt), iv: toBase64(iv), data: toBase64(new Uint8Array(cipher)) };
}
