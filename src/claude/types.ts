export interface SourceRef {
  title: string;
  url: string;
  date: string;
}

export interface SlackSourceRef {
  channel: string;
  date: string;
  url: string;
}

export interface AnswerResult {
  mode: "answer" | "conflict" | "insufficient";
  answer?: string;
  wiki_excerpt?: string;
  slack_excerpt?: string;
  wiki_source?: SourceRef;
  slack_source?: SlackSourceRef;
  conflict_summary?: string;
}
