export type ExtractedCategory = "about" | "pricing" | "product" | "docs" | "blog" | "general";

export interface ExtractedDocument {
  title: string;
  text: string;
  wordCount: number;
  headings: string[];
  category?: ExtractedCategory;
}

/** Discriminated extraction outcome: a document, or a URL list for crawling. */
export type ExtractionResult =
  | { kind: "document"; document: ExtractedDocument }
  | { kind: "url-list"; urls: string[] };

export class ExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractError";
  }
}
