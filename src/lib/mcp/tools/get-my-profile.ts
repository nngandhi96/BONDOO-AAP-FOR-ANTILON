import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForCaller } from "../supabase-user-client";

export default defineTool({
  name: "get_my_profile",
  title: "Get my Bondoo profile",
  description: "Return the signed-in Bondoo user's profile: display name, neighbourhood, bio, trust score, and verification flags.",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false },
  handler: async (_input, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForCaller(ctx);
    const uid = ctx.getUserId();
    if (!uid) return { content: [{ type: "text", text: "Missing user id" }], isError: true };
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", uid)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { profile: data },
    };
  },
});