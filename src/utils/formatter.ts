export function buildExcerpt(
  content: string,
  query: string,
  maxLength = 300,
): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 2);

  for (const term of terms) {
    const index = normalized.toLowerCase().indexOf(term);
    if (index >= 0) {
      const start = Math.max(0, index - 80);
      const end = Math.min(normalized.length, start + maxLength);
      let excerpt = normalized.slice(start, end);
      if (start > 0) {
        excerpt = `...${excerpt}`;
      }
      if (end < normalized.length) {
        excerpt = `${excerpt}...`;
      }
      return excerpt;
    }
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}...`;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function providerLabel(provider: string): string {
  switch (provider) {
    case "notion":
      return "Notion";
    case "confluence":
      return "Confluence";
    case "drive":
      return "Google Drive";
    default:
      return provider;
  }
}
