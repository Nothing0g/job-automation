import { portableAuthEnabled } from "./config";

export function portableRawResumeFilesAllowed(env: NodeJS.ProcessEnv = process.env) {
  return !portableAuthEnabled(env);
}

export function portableResumeTextRequired(env: NodeJS.ProcessEnv = process.env) {
  return portableAuthEnabled(env);
}
