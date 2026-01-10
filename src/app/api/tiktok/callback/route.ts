import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type TikTokTokenResponse = {
  access_token?: string;
  open_id?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  const cookieState = req.cookies.get("tt_state")?.value;
  const returnUrl = req.cookies.get("tt_return")?.value || process.env.POST_AUTH_REDIRECT!;

  // helper for redirects back to your upload page with a status
  const bounce = (qs: string) => NextResponse.redirect(`${returnUrl}${returnUrl.includes("?") ? "&" : "?"}${qs}`);

  if (error) return bounce(`connected=0&error=${encodeURIComponent(error)}&desc=${encodeURIComponent(errorDescription || "")}`);
  if (!code || !returnedState) return bounce("connected=0&error=missing_code_or_state");
  if (!cookieState || cookieState !== returnedState) return bounce("connected=0&error=state_mismatch");

  const clientKey = process.env.TIKTOK_CLIENT_KEY!;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET!;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI!;

  // Exchange code -> access token
  const tokenRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });

  const tokenJson = (await tokenRes.json()) as TikTokTokenResponse;

  if (!tokenRes.ok || tokenJson.error) {
    return bounce(`connected=0&error=token_exchange_failed`);
  }

  const accessToken = tokenJson.access_token;
  const openId = tokenJson.open_id;

  if (!accessToken || !openId) {
    return bounce(`connected=0&error=token_missing_fields`);
  }

  // Fetch basic user info
  const userRes = await fetch(
    "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  const userJson = await userRes.json();

  if (!userRes.ok) {
    return bounce(`connected=0&error=userinfo_failed`);
  }

  const user = userJson?.data?.user;
  const username = user?.display_name || "TikTok User";
  const avatarUrl = user?.avatar_url || null;

  // Save to Supabase (service role)
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Upsert player
  await supabase.from("players").upsert(
    {
      platform: "tiktok",
      platform_user_id: openId,
      username,
      avatar_url: avatarUrl,
      verified: true,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "platform,platform_user_id" }
  );

  // Log auth event (optional)
  await supabase.from("auth_events").insert({
    platform: "tiktok",
    platform_user_id: openId,
    event: "signup_success",
    meta: { username },
  });

  const res = bounce("connected=1&platform=tiktok");

  // clear cookies
  res.cookies.set("tt_state", "", { path: "/", maxAge: 0 });
  res.cookies.set("tt_return", "", { path: "/", maxAge: 0 });

  return res;
}
