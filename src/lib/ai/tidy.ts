/** Strip markdown the reading card doesn't render (bold, italics, code fences); normalise headings and bullets. */
export function tidyReading(text: string): string {
  return text
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\s)\*(\S.+?)\*(?=\s|$)/g, "$1$2")
    .replace(/^#{3,}\s*/gm, "## ")
    .replace(/^#\s+/gm, "## ")
    .replace(/^\s*[*•]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
