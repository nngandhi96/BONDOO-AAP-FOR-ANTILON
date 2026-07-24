import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";
import type { Database } from "@/integrations/supabase/types";

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function makeFetch(supabaseKey: string, userToken: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    }
    // Opaque publishable key must not be sent as a bearer JWT.
    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    headers.set("Authorization", `Bearer ${userToken}`);
    return fetch(input, { ...init, headers });
  };
}

/** Supabase client scoped to the MCP caller — RLS runs as that user. */
export function supabaseForCaller(ctx: ToolContext) {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const token = ctx.getToken();
  if (!token) throw new Error("Missing OAuth bearer token");
  return createClient<Database>(url, key, {
    global: { fetch: makeFetch(key, token) },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}