import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { ApiError, apiError, readJson } from "@/lib/api";

export const dynamic = "force-dynamic";

export function sessionToken(key: string): string {
  return createHmac("sha256", key).update("rto-autopsy-session").digest("hex");
}

export async function POST(req: Request) {
  try {
    const configured = process.env.APP_ACCESS_KEY;
    if (!configured) return Response.json({ ok: true, open: true });
    const { key } = z.object({ key: z.string().max(200) }).parse(await readJson(req));
    const a = Buffer.from(sessionToken(key));
    const b = Buffer.from(sessionToken(configured));
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ApiError(401, "INVALID_KEY", "Incorrect access key.");
    (await cookies()).set("rto_auth", sessionToken(configured), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 12, secure: process.env.NODE_ENV === "production" && process.env.COOKIE_INSECURE !== "1" });
    return Response.json({ ok: true });
  } catch (e) {
    return apiError(e);
  }
}
