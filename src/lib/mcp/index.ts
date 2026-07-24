import { auth, defineMcp } from "@lovable.dev/mcp-js";
import echoTool from "./tools/echo";
import getMyProfile from "./tools/get-my-profile";
import listMyMeetups from "./tools/list-my-meetups";

// Direct Supabase issuer host — never the .lovable.cloud proxy — so the OAuth
// discovery document's `issuer` matches this value exactly.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "bondoo-mcp",
  title: "Bondoo",
  version: "0.1.0",
  instructions:
    "Bondoo MCP server. Tools act as the signed-in Bondoo user. Use `echo` to verify connectivity, `get_my_profile` to read the current user's profile, and `list_my_meetups` to list their meetups.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [echoTool, getMyProfile, listMyMeetups],
});