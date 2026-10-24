import type { Metadata } from "next";
import { Landing } from "@/components/landing";

export const metadata: Metadata = {
  title: "ag-ui — Company AI",
  description:
    "Multimodal company intelligence and generative UI. Crawl, index and chat with your company's knowledge base, and watch every conversation land in your analytics.",
};

/**
 * Public landing page (A8). CTA goes to the auth pages; a signed-in visitor
 * sees "Open the studio" → /overview via the session-aware client CTA.
 */
export default function LandingPage() {
  return <Landing />;
}
