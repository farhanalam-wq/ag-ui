/**
 * Repairs LLM list formatting glitches before markdown render.
 * The model sometimes emits a bare marker on its own line:
 *
 *   1.
 *   Pricing has three tiers.
 *
 * which renders with the number detached from its text. This joins a
 * marker-only line back onto the text that follows it. Fenced code
 * blocks are left untouched.
 */
export function repairListBreaks(markdown: string): string {
  const parts = markdown.split(/(```[\s\S]*?(?:```|$))/g);
  return parts
    .map((part, index) => {
      if (index % 2 === 1) return part;
      return part
        // "1.\ntext" / "1)  \n\ntext" -> "1. text" (ordered markers)
        .replace(/^(\s*\d+[.)])\s*\n+\s*(?=\S)/gm, "$1 ")
        // "- \ntext" / "* \ntext" -> "- text" (unordered markers)
        .replace(/^(\s*[-*+])\s*\n+\s*(?=\S)/gm, "$1 ")
        // collapse 3+ blank lines to a paragraph break
        .replace(/\n{3,}/g, "\n\n");
    })
    .join("");
}
