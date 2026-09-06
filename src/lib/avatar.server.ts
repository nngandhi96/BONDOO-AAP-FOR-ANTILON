import { supabaseAdmin } from "@/integrations/supabase/client.server";

// In-memory cache for signed URLs to avoid hitting Supabase Storage on every request.
// URLs are signed for 1 hour (3600s), so caching for 30 minutes (1800s) is safe.
const avatarUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function batchGetSignedAvatarUrls(
  paths: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const now = Date.now();
  const neededPaths: string[] = [];

  for (const raw of paths) {
    if (!raw) continue;
    const path = raw.trim();
    if (!path) continue;

    const cached = avatarUrlCache.get(path);
    if (cached && cached.expiresAt > now) {
      result.set(path, cached.url);
    } else {
      neededPaths.push(path);
    }
  }

  if (neededPaths.length === 0) {
    return result;
  }

  const uniquePaths = Array.from(new Set(neededPaths));
  try {
    const { data: signedList, error } = await supabaseAdmin.storage
      .from("avatars")
      .createSignedUrls(uniquePaths, 3600);

    if (!error && signedList) {
      for (const item of signedList) {
        if (item.path && item.signedUrl && !item.error) {
          result.set(item.path, item.signedUrl);
          avatarUrlCache.set(item.path, {
            url: item.signedUrl,
            expiresAt: now + 30 * 60 * 1000, // 30 minutes
          });
        }
      }
    }
  } catch (err) {
    console.error("[avatar.server] Batch sign error:", err);
  }

  return result;
}

export async function getSingleSignedAvatarUrl(
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null;
  const res = await batchGetSignedAvatarUrls([path]);
  return res.get(path) ?? null;
}
