import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAttachmentUrl } from "@/lib/chat.functions";

type Props = {
  path: string;
  type: string | null;
  name: string | null;
  mine: boolean;
};

export function ChatAttachment({ path, type, name, mine }: Props) {
  const getUrl = useServerFn(getAttachmentUrl);
  const { data: url, isLoading } = useQuery({
    queryKey: ["chat-attachment", path],
    queryFn: async () => {
      const res = await getUrl({ data: { path } });
      return res.url;
    },
    staleTime: 55 * 60 * 1000,
    retry: 1,
  });

  const isImage = (type ?? "").startsWith("image/");

  if (isImage) {
    return (
      <div className="mb-1 -mx-1">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            <img
              src={url}
              alt={name ?? "Photo"}
              className="rounded-xl max-h-64 w-auto object-cover"
              draggable={false}
            />
          </a>
        ) : (
          <div className="h-40 w-56 rounded-xl bg-black/10 animate-pulse" />
        )}
      </div>
    );
  }

  return (
    <a
      href={url ?? "#"}
      target="_blank"
      rel="noreferrer"
      className={`flex items-center gap-2 rounded-xl px-3 py-2 mb-1 border ${
        mine ? "border-background/30 bg-background/10" : "border-border bg-surface"
      }`}
    >
      <span className="text-lg">📎</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium truncate">
          {name ?? "Attachment"}
        </span>
        <span
          className={`block text-[10px] uppercase tracking-wider ${
            mine ? "text-background/60" : "text-muted-foreground"
          }`}
        >
          {isLoading ? "Preparing…" : "Tap to open"}
        </span>
      </span>
    </a>
  );
}