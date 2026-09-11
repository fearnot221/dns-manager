export function applicationOrigin(request: Request) {
  return new URL(process.env.AUTH_URL || process.env.NEXTAUTH_URL || request.url).origin;
}
export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).origin === applicationOrigin(request); } catch { return false; }
}
