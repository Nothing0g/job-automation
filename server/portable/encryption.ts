import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function keyFromBase64(value: string) {
  const key = Buffer.from(value, "base64");
  if (key.byteLength !== 32) throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  return key;
}

export function encryptPortableSecret(plaintext: string, base64Key: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromBase64(base64Key), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

export function decryptPortableSecret(payload: string, base64Key: string) {
  const source = Buffer.from(payload, "base64url");
  if (source.byteLength <= 28) throw new Error("Encrypted token payload is invalid.");
  const iv = source.subarray(0, 12);
  const tag = source.subarray(12, 28);
  const ciphertext = source.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", keyFromBase64(base64Key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
