const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "can",
  "what",
  "which",
  "who",
  "whom",
  "whose",
  "where",
  "when",
  "why",
  "how",
  "i",
  "me",
  "my",
  "we",
  "our",
  "you",
  "your",
  "they",
  "their",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "about",
  "any",
  "some",
  "all",
  "no",
  "not",
  "only",
  "just",
  "also",
  "than",
  "then",
  "there",
  "here",
  "into",
  "over",
  "under",
  "again",
  "further",
  "once",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "through",
  "while",
  "during",
  "each",
  "few",
  "more",
  "most",
  "other",
  "such",
  "same",
  "so",
  "too",
  "very",
  "own",
  "tell",
  "give",
  "show",
  "know",
  "get",
  "got",
  "like",
  "want",
  "need",
  "use",
  "using",
  "used",
  "make",
  "made",
  "access",
  "available",
  "sources",
  "source",
  "files",
  "file",
  "documents",
  "document",
  "docs",
  "doc",
]);

export function extractKeywords(text: string): string {
  return text
    .replace(/<@[^>]+>/g, "")
    .replace(/<#[^>|]+(\|[^>]+)?>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractSearchTerms(text: string): string[] {
  const cleaned = extractKeywords(text).toLowerCase();
  const terms = cleaned
    .split(/[^a-z0-9]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term));

  return [...new Set(terms)];
}

export function scoreTextMatch(
  text: string,
  query: string,
  extraTerms: string[] = [],
): number {
  const terms = [
    ...extractSearchTerms(query),
    ...extraTerms.map((term) => term.toLowerCase()),
  ];

  if (terms.length === 0) {
    return 0;
  }

  const haystack = text.toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (haystack.includes(term)) {
      score += term.length > 5 ? 2 : 1;
    }
  }

  return score;
}

export function isExpertiseQuery(text: string): boolean {
  const normalized = extractKeywords(text).toLowerCase();

  const patterns = [
    /\bwho knows\b/,
    /\bwho('?s| is)\b.*\b(expert|best person|right person)\b/,
    /\bwho (worked on|built|wrote|owns|maintains|understands|handles)\b/,
    /\bwho can (help|answer)\b/,
    /\bwho should i (ask|talk to|contact|ping)\b/,
    /\bexpert(s)? (on|in|for)\b/,
  ];

  return patterns.some((pattern) => pattern.test(normalized));
}

const EXPERTISE_TOPIC_PATTERNS: RegExp[] = [
  /^who\s+knows\s+(?:the\s+most\s+)?about\s+(.+)$/i,
  /^who(?:'?s| is)\s+(?:the\s+)?(?:best|right)\s+person\s+(?:to\s+ask\s+about|for|on)\s+(.+)$/i,
  /^who\s+(?:worked on|built|wrote|owns|maintains|understands|handles)\s+(.+)$/i,
  /^who\s+can\s+(?:help|answer)\s+(?:questions\s+)?(?:about|with|on)\s+(.+)$/i,
  /^who\s+should\s+i\s+(?:ask|talk to|contact|ping)\s+about\s+(.+)$/i,
  /^experts?\s+(?:on|in|for)\s+(.+)$/i,
];

function stripLeadingFiller(text: string): string {
  return text.replace(/^(the|our|my|your|this|that)\s+/i, "").trim();
}

export function extractExpertiseTopic(text: string): string {
  const cleaned = extractKeywords(text).replace(/[?.!]+$/, "").trim();

  for (const pattern of EXPERTISE_TOPIC_PATTERNS) {
    const match = cleaned.match(pattern);
    const topic = match?.[1]?.trim();
    if (topic) {
      return stripLeadingFiller(topic);
    }
  }

  return cleaned;
}

export function isUpdateInstructionQuery(text: string): boolean {
  const normalized = extractKeywords(text).toLowerCase().trim();

  const patterns = [
    // any message starting with an imperative verb, e.g. "update timeline",
    // "update this", "please fix the wiki" — but not "update me/us on X",
    // which is asking for information, not instructing an edit.
    /^(please\s+)?(update|edit|change|fix|revise|correct)\b(?!\s+(me|us)\b)/,
    // politely-phrased requests: "can you update...", "could you please fix..."
    /\b(can|could|would)\s+you\s+(please\s+)?(update|edit|change|fix|revise|correct)\b(?!\s+(me|us)\b)/,
    /\b(wiki|doc|docs|documentation)\b[^.?!]{0,40}\b(needs?(\s+to\s+be)?|should be)\s+(updated|changed|fixed|revised)\b/,
  ];

  return patterns.some((pattern) => pattern.test(normalized));
}

const UPDATE_TOPIC_PATTERNS: RegExp[] = [
  /\bupdate\s+(?:the\s+)?(?:wiki|doc|docs|documentation)\s+(?:about|on|for|regarding)\s+(.+)$/i,
  /\bedit\s+(?:the\s+)?(?:wiki|doc|docs|documentation)\s+(?:about|on|for|regarding)\s+(.+)$/i,
];

export function extractUpdateTopic(text: string): string {
  const cleaned = extractKeywords(text).replace(/[?.!]+$/, "").trim();

  for (const pattern of UPDATE_TOPIC_PATTERNS) {
    const match = cleaned.match(pattern);
    const topic = match?.[1]?.trim();
    if (topic) {
      return stripLeadingFiller(topic);
    }
  }

  return "";
}

export function isSourceInventoryQuery(text: string): boolean {
  const normalized = extractKeywords(text).toLowerCase();

  const patterns = [
    /\bwhat (sources|documents|docs|files|pages|data)\b/,
    /\bwhat do you have access to\b/,
    /\bwhat can you (see|access|read)\b/,
    /\bwhich (sources|documents|docs|files|pages)\b/,
    /\blist (your |the |my )?(sources|documents|docs|files|pages)\b/,
    /\bshow (me )?(your |the |my )?(sources|documents|docs|files|pages)\b/,
    /\bwhat are you (watching|monitoring)\b/,
    /\bwhat channels\b.*\b(watch|monitor)\b/,
  ];

  return patterns.some((pattern) => pattern.test(normalized));
}
