export const ALLOWED_LOGIN_DOMAIN = "fromthisisland.com";

export function isAllowedLoginEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0) return false;
  return normalized.slice(at + 1) === ALLOWED_LOGIN_DOMAIN;
}
