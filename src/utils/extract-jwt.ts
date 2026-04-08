const JWT_REGEX = /eyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/;

export function extractJwt(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(JWT_REGEX);
  return match ? match[0] : trimmed;
}
