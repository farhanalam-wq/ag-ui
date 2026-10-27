import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { articles, industries, services } from "@/lib/content";
import { articleCategories, sitePageGroups } from "@/lib/site-map";
import { routeSlug } from "@/lib/route-slug";

export const metadata: Metadata = {
  title: "Sitemap",
  description: "Find Alderwick Advisory pages and articles, with a short guide to what each covers and links to every listed destination.",
};

export default function SitemapPage() {
  return (
    <main id="main-content">
      <PageIntro title="Sitemap" description="Use this guide to find company information, service and sector overviews, site policies, and every article currently listed. Each title links to its page." />
      <section className="section sitemap-section">
        <div className="container sitemap-grid">
          {sitePageGroups.map((group) => (
            <section className="sitemap-group" key={group.title}>
              <h2>{group.title}</h2>
              <ul>{group.pages.map((page) => <li key={page.href}><div><Link href={page.href}>{page.label}</Link><p>{page.description}</p></div><span aria-hidden="true">↗</span></li>)}</ul>
            </section>
          ))}
          <section className="sitemap-group">
            <h2>Services</h2>
            <ul>{services.map((service) => <li key={service.number}><div><Link href={`/services/${routeSlug(service.title)}`}>{service.title}</Link><p>{service.description}</p></div><span aria-hidden="true">↗</span></li>)}</ul>
          </section>
          <section className="sitemap-group">
            <h2>Industries</h2>
            <ul>{industries.map((industry) => <li key={industry.title}><div><Link href={`/industries/${routeSlug(industry.title)}`}>{industry.title}</Link><p>{industry.description}</p></div><span aria-hidden="true">↗</span></li>)}</ul>
          </section>
          {articleCategories.map((category) => (
            <section className="sitemap-group sitemap-articles" key={category}>
              <h2><Link href={`/insights/category/${routeSlug(category)}`}>{category}</Link></h2>
              <ul>{articles.filter((article) => article.category === category).map((article) => <li key={article.slug}><div><Link href={`/insights/${article.slug}`}>{article.title}</Link><p>{article.summary}</p><small>{article.date} · {article.readingTime}</small></div><span aria-hidden="true">↗</span></li>)}</ul>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
