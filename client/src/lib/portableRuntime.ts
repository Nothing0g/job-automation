export function portableFileUploadEnabled(value = import.meta.env.VITE_PORTABLE_AUTH_ENABLED) {
  return value !== "true";
}
