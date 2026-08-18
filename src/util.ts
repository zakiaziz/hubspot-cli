export function environmentValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSensitiveKey(key: string): boolean {
  return /token|secret|password|authorization|hapikey|api[-_]?key/i.test(key);
}
