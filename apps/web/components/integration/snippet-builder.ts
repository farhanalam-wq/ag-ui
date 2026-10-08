export type FrameworkId = "html" | "next" | "react" | "webflow" | "shopify" | "wordpress" | "gtm";

export interface SnippetInput {
  webOrigin: string;
  raw: string;
  apiBase: string;
  companyName: string;
  position?: "bottom-right" | "bottom-left";
}

export function defaultApiBase(): string {
  const envBase =
    process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "";
  if (envBase.trim()) return envBase.trim().replace(/\/$/, "");
  if (typeof window !== "undefined") {
    return window.location.origin.replace(":3000", ":3001");
  }
  return "http://localhost:3001";
}

export function buildSnippet(input: SnippetInput): string {
  const apiBase = input.apiBase.trim().replace(/\/$/, "");
  const title = `${input.companyName} Help`;
  const positionAttr =
    input.position === "bottom-left" ? `\n  data-position="bottom-left"` : "";
  // defer is intentionally the LAST attribute.
  return `<script src="${input.webOrigin}/embed.js"\n  data-widget-key="${input.raw}"\n  data-api-base="${apiBase}"\n  data-title="${title}"${positionAttr} defer></script>`;
}

export const FRAMEWORK_NOTES: Record<FrameworkId, { label: string; note: string }> = {
  html: { label: "HTML", note: "Paste before </body> on every page that should show the assistant." },
  next: { label: "Next.js", note: "Paste in app/layout.tsx near </body>, or use next/script with strategy='lazyOnload'." },
  react: { label: "React", note: "Paste in index.html near </body>; same snippet works for Vite and CRA." },
  webflow: { label: "Webflow", note: "Site Settings → Custom Code → Footer Code, then publish." },
  shopify: { label: "Shopify", note: "Paste before </body> in theme.liquid (Online Store → Themes → Edit code)." },
  wordpress: { label: "WordPress", note: "Paste via a header/footer plugin or your child theme footer.php." },
  gtm: { label: "GTM", note: "Custom HTML tag, trigger on All Pages (or your allowlist). Supports HTML injection." },
};

export const FRAMEWORK_IDS: FrameworkId[] = [
  "html",
  "next",
  "react",
  "webflow",
  "shopify",
  "wordpress",
  "gtm",
];
