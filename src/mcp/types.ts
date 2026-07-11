import type { WikiProvider } from "../config/workspace.js";

export interface DocChunk {
  title: string;
  content: string;
  excerpt: string;
  url: string;
  date: string;
  docId: string;
  provider: WikiProvider;
  authorName?: string;
  authorEmail?: string;
}

export interface WikiSearchOptions {
  query: string;
  limit?: number;
}

export interface DocUpdatePatch {
  before: string;
  after: string;
}
