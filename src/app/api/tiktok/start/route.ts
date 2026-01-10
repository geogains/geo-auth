import { NextRequest, NextResponse } from "next/server";

function randomState(len = 32) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function GET(req: NextRequest) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY!;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI!;
  const fallbackReturn = process.env.POST_AUTH_REDIRECT!;

  // Optional: allow upload.html to send a custom return URL
  const returnUrl = req.nextUrl.searchParams.get("return") || fallbackReturn;

  const state = randomState();

  // TikTok authorize endpoint (Login Kit)
  const authUrl = new URL("https://www.tiktok.com/v2/auth/authorize?");
  authUrl.searchParams.set("client_key", clientKey);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "user.info.basic");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("disable_auto_auth", "1");

  const res = NextResponse.redirect(authUrl.toString());

  // Store state + returnUrl in httpOnly cookies for callback verification
  res.cookies.set("tt_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  res.cookies.set("tt_return", returnUrl, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  return res;
}
