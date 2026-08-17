export type PortableObjectStorageConfig = {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
};

export function portableObjectStorageConfig(env: NodeJS.ProcessEnv = process.env): PortableObjectStorageConfig | null {
  const endpoint = env.S3_ENDPOINT?.trim();
  const bucket = env.S3_BUCKET?.trim();
  const accessKeyId = env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.S3_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, bucket, accessKeyId, secretAccessKey, region: env.S3_REGION?.trim() || "auto" };
}

export function portableObjectKey(relativeKey: string) {
  const normalized = relativeKey.replace(/^\/+/, "");
  if (!normalized || normalized.includes("..")) throw new Error("Invalid object-storage key.");
  return normalized;
}
