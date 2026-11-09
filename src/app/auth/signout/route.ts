import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { redirectTo } from "@/server/http";

async function signOut() {
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  return redirectTo("/login");
}

export const GET = signOut;
export const POST = signOut;
