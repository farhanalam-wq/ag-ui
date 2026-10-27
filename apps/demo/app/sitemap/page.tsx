import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { articles } from "@/lib/content";

export const metadata: Metadata = {
  title: "Sitemap",
  description: "Browse all public pages and articles on the Alderwick Advisory website.",
};

const pageGroups = [
  {
    title: "Company",
    pages: [
      { href: "/", label: "Home", description: "An introduction to Alderwick Advisory and its work." },
      { href: "/about", label: "About us", description: "Our background, purpose, values, and approach." },
      { href: "/services", label: "Products & services", description: "A detailed overview of Alderwick Advisory's capabilities." },
      { href: "/industries", label: "Industries", description: "Industry contexts where our approach can apply." },
      { href: "/contact", label: "Contact us", description: "Contact information and a sample inquiry form." },
    ],
  },
  {
    title: "Information",
    pages: [
      { href: "/insights", label: "Blog & insights", description: "Articles about strategy and practical change." },
      { href: "/privacy", label: "Privacy policy", description: "Sample privacy terms for review." },
      { href: "/terms", label: "Terms of use", description: "Sample website terms for review." },
    ],
  },
];

export default function SitemapPage() {
  return (
    <main id="main-content">
      <PageIntro title="Sitemap" description="A simple guide to the public pages and articles available across the Alderwick Advisory website." />
      <section className="section sitemap-section">
        <div className="container sitemap-grid">
          {pageGroups.map((group) => (
            <section className="sitemap-group" key={group.title}>
              <h2>{group.title}</h2>
              <ul>{group.pages.map((page) => <li key={page.href}><div><Link href={page.href}>{page.label}</Link><p>{page.description}</p></div><span aria-hidden="true">↗</span></li>)}</ul>
            </section>
          ))}
          <section className="sitemap-group sitemap-articles">
            <h2>Articles</h2>
            <ul>{articles.map((article) => <li key={article.slug}><div><Link href={`/insights/${article.slug}`}>{article.title}</Link><p>{article.category} · {article.date}</p></div><span aria-hidden="true">↗</span></li>)}</ul>
          </section>
        </div>
      </section>
    </main>
  );
}
