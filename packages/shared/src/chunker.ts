export interface ChunkOptions {
  maxChunkSize?: number;     // in characters (default 1800 ~ 450 tokens)
  overlapSize?: number;      // in characters (default 250 ~ 60 tokens)
  docTitle?: string;
  url?: string;
}

export interface DocumentChunk {
  content: string;
  chunkIndex: number;
  metadata: {
    docTitle?: string;
    url?: string;
    heading?: string;
    characterCount: number;
    estimatedTokens: number;
  };
}

/**
 * Splits markdown text into semantic chunks respecting heading boundaries and token limits.
 */
export function chunkMarkdown(
  text: string,
  options?: ChunkOptions
): DocumentChunk[] {
  const maxChunkSize = options?.maxChunkSize || 1800;
  const overlapSize = options?.overlapSize || 250;
  const docTitle = options?.docTitle || "Untitled Document";
  const url = options?.url;

  if (!text || text.trim().length === 0) {
    return [];
  }

  // 1. Break text into logical sections based on markdown headings
  const lines = text.split("\n");
  interface Section {
    heading: string;
    content: string[];
  }

  const sections: Section[] = [];
  let currentHeading = "Introduction";
  let currentLines: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      if (currentLines.length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentLines,
        });
        currentLines = [];
      }
      currentHeading = headingMatch[2].trim();
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    sections.push({
      heading: currentHeading,
      content: currentLines,
    });
  }

  // 2. Generate chunks from sections with breadcrumb prefix
  const chunks: DocumentChunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const sectionText = section.content.join("\n").trim();
    if (!sectionText) continue;

    const breadcrumb = `[Document: ${docTitle} | Section: ${section.heading}]\n\n`;

    // If section fits in a single chunk
    if (sectionText.length + breadcrumb.length <= maxChunkSize) {
      const fullText = `${breadcrumb}${sectionText}`;
      chunks.push({
        content: fullText,
        chunkIndex: chunkIndex++,
        metadata: {
          docTitle,
          url,
          heading: section.heading,
          characterCount: fullText.length,
          estimatedTokens: Math.ceil(fullText.length / 4),
        },
      });
      continue;
    }

    // Otherwise split section with sliding overlap
    const paragraphs = sectionText.split(/\n\s*\n/);
    let currentChunkBuffer = "";

    for (const para of paragraphs) {
      const trimmedPara = para.trim();
      if (!trimmedPara) continue;

      if ((currentChunkBuffer + "\n\n" + trimmedPara).length <= maxChunkSize - breadcrumb.length) {
        currentChunkBuffer = currentChunkBuffer ? `${currentChunkBuffer}\n\n${trimmedPara}` : trimmedPara;
      } else {
        if (currentChunkBuffer) {
          const fullText = `${breadcrumb}${currentChunkBuffer}`;
          chunks.push({
            content: fullText,
            chunkIndex: chunkIndex++,
            metadata: {
              docTitle,
              url,
              heading: section.heading,
              characterCount: fullText.length,
              estimatedTokens: Math.ceil(fullText.length / 4),
            },
          });

          // Carry over overlap text
          const words = currentChunkBuffer.split(/\s+/);
          const overlapWords = words.slice(Math.max(0, words.length - Math.floor(overlapSize / 6))).join(" ");
          currentChunkBuffer = `${overlapWords}\n\n${trimmedPara}`;
        } else {
          // Paragraph itself is larger than maxChunkSize - hard split
          let start = 0;
          while (start < trimmedPara.length) {
            const end = Math.min(start + (maxChunkSize - breadcrumb.length), trimmedPara.length);
            const slice = trimmedPara.slice(start, end);
            const fullText = `${breadcrumb}${slice}`;
            chunks.push({
              content: fullText,
              chunkIndex: chunkIndex++,
              metadata: {
                docTitle,
                url,
                heading: section.heading,
                characterCount: fullText.length,
                estimatedTokens: Math.ceil(fullText.length / 4),
              },
            });
            start += (maxChunkSize - breadcrumb.length) - overlapSize;
          }
          currentChunkBuffer = "";
        }
      }
    }

    if (currentChunkBuffer.trim().length > 0) {
      const fullText = `${breadcrumb}${currentChunkBuffer.trim()}`;
      chunks.push({
        content: fullText,
        chunkIndex: chunkIndex++,
        metadata: {
          docTitle,
          url,
          heading: section.heading,
          characterCount: fullText.length,
          estimatedTokens: Math.ceil(fullText.length / 4),
        },
      });
    }
  }

  return chunks;
}
