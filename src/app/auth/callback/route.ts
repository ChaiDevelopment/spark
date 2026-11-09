import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/utils";

/**
 * OAuth (Google) and PKCE email-link callback: exchange the one-time code for
 * a session cookie, then continue to a same-origin path only.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }
  const url = new URL("/login", origin);
  url.searchParams.set("error", searchParams.get("error_description") ? "oauth" : "link");
  return NextResponse.redirect(url);
}
