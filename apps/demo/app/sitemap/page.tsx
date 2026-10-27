import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { articles } from "@/lib/content";

export const metadata: Metadata = {
  title: "Sitemap",
  description: "Find Alderwick Advisory pages and articles, with a short guide to what each covers and links to every listed destination.",
};

const pageGroups = [
  {
    title: "Company",
    pages: [
      { href: "/", label: "Home", description: "An overview of Alderwick Advisory, its transformation focus, and featured services and perspectives." },
      { href: "/about", label: "About us", description: "The practice’s purpose, working principles, and approach to helping organizations navigate change." },
      { href: "/services", label: "Products & services", description: "Areas of work covering business strategy, digital transformation, customer experience, and data and operations." },
      { href: "/industries", label: "Industries", description: "Example sector contexts and the customer, operational, and organizational questions that can arise in them." },
      { href: "/contact", label: "Contact us", description: "Guidance on framing an inquiry and an explicitly illustrative contact detail and form that do not reach a live team." },
    ],
  },
  {
    title: "Information",
    pages: [
      { href: "/insights", label: "Blog & insights", description: "Practical articles on strategy, digital transformation, and connected customer experiences." },
      { href: "/privacy", label: "Privacy policy", description: "Illustrative privacy-notice topics and drafting guidance; not a complete or adopted policy." },
      { href: "/terms", label: "Terms of use", description: "Illustrative website-terms topics and drafting guidance; not operative terms or legal advice." },
    ],
  },
];

export default function SitemapPage() {
  return (
    <main id="main-content">
      <PageIntro title="Sitemap" description="Use this guide to find company information, service and sector overviews, site policies, and every article currently listed. Each title links to its page." />
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
            <ul>{articles.map((article) => <li key={article.slug}><div><Link href={`/insights/${article.slug}`}>{article.title}</Link><p>{article.summary}</p><small>{article.category} · {article.date} · {article.readingTime}</small></div><span aria-hidden="true">↗</span></li>)}</ul>
          </section>
        </div>
      </section>
    </main>
  );
}
