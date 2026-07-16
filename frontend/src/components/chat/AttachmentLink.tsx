import { Download, FileText } from "lucide-react";
import type { AttachmentMetadata } from "../../types/chat";

type AttachmentLinkProps = {
  attachment: AttachmentMetadata;
};

function formatFileSize(size: number | null) {
  if (size === null) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentLink({ attachment }: AttachmentLinkProps) {
  const formattedSize = formatFileSize(attachment.size);

  return (
    <a
      href={attachment.download_url}
      className="mt-3 flex w-fit max-w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2 text-sm text-white/80 transition hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/70"
    >
      <FileText className="size-4 shrink-0 text-white/55" aria-hidden="true" />
      <span className="min-w-0">
        <span className="block truncate font-medium text-white">{attachment.name}</span>
        {formattedSize ? (
          <span className="mt-0.5 block text-xs text-white/45">{formattedSize}</span>
        ) : null}
      </span>
      <Download className="size-4 shrink-0 text-white/55" aria-hidden="true" />
    </a>
  );
}

export default AttachmentLink;
