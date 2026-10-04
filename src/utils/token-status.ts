import { Color } from "@raycast/api";
import type { JWTPayload } from "jose";

export const TIMESTAMP_CLAIMS = new Set(["iat", "exp", "nbf", "auth_time", "updated_at"]);

// Largest value a JS Date can represent, in seconds
const MAX_TIMESTAMP = 8.64e12;

const UNITS: [string, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1],
];

export interface TokenStatus {
  label: string;
  detail?: string;
  color: Color;
}

export function isTimestamp(key: string, value: unknown): value is number {
  return (
    TIMESTAMP_CLAIMS.has(key) && typeof value === "number" && Number.isFinite(value) && Math.abs(value) < MAX_TIMESTAMP
  );
}

export function formatDuration(seconds: number): string {
  const abs = Math.abs(seconds);
  const [unit, size] = UNITS.find(([, unitSize]) => abs >= unitSize) ?? UNITS[UNITS.length - 1];
  const count = Math.floor(abs / size);
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

export function formatRelative(timestamp: number, now: number): string {
  const diff = timestamp - now;
  return diff >= 0 ? `in ${formatDuration(diff)}` : `${formatDuration(diff)} ago`;
}

export function getTokenStatus(payload: JWTPayload, now: number): TokenStatus {
  const { exp, nbf } = payload;

  if (isTimestamp("exp", exp) && exp <= now) {
    return { label: "Expired", detail: formatRelative(exp, now), color: Color.Red };
  }
  if (isTimestamp("nbf", nbf) && nbf > now) {
    return { label: "Not valid yet", detail: `active ${formatRelative(nbf, now)}`, color: Color.Orange };
  }
  if (isTimestamp("exp", exp)) {
    return { label: "Valid", detail: `expires ${formatRelative(exp, now)}`, color: Color.Green };
  }
  return { label: "No expiration", color: Color.SecondaryText };
}

export function getTimestampColor(key: string, value: number, now: number): Color {
  if (key === "exp") return value <= now ? Color.Red : Color.Green;
  if (key === "nbf") return value > now ? Color.Orange : Color.Green;
  return Color.Blue;
}
