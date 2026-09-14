"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getToken } from "next-auth/jwt";
import { signOut } from "./config";
import { logtoLogoutUrl } from "./logto";

export async function logoutAction() {
  // Read only this session's encrypted cookie, never a token supplied as input.
  const incoming = await headers();
  const token = await getToken({ req: { headers: new Headers({ cookie: incoming.get("cookie") || "" }) }, secret: process.env.AUTH_SECRET, secureCookie: process.env.AUTH_URL?.startsWith("https://") });
  let destination = "/login";
  if (token?.loginProvider === "logto" && token.logtoIdToken && process.env.AUTH_URL) destination = logtoLogoutUrl(token.logtoIdToken, process.env.AUTH_URL);
  await signOut({ redirect: false });
  redirect(destination);
}
