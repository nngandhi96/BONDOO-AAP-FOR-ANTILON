import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { supabaseForCaller } from "../supabase-user-client";

export default defineTool({
  name: "list_my_meetups",
  title: "List my meetups",
  description: "List meetups the signed-in Bondoo user is a participant in, with status, place, and time.",
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
      .from("meetups")
      .select("*")
      .or(`proposer_id.eq.${uid},recipient_id.eq.${uid}`)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { meetups: data ?? [] },
    };
  },
});