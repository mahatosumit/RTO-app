import { NextResponse, type NextRequest } from "next/server";

/**
 * Optional access-key gate. Active only when APP_ACCESS_KEY is set.
 * Requires an HMAC-signed HttpOnly cookie (set by /api/auth) for all routes except login, auth and health.
 */
async function expectedToken(key: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode("rto-autopsy-session"));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function proxy(req: NextRequest) {
  const key = process.env.APP_ACCESS_KEY;
  if (!key) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/auth" || pathname === "/api/health") return NextResponse.next();
  const token = req.cookies.get("rto_auth")?.value;
  if (token && token === (await expectedToken(key))) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: { code: "UNAUTHENTICATED", message: "Access key required." } }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
