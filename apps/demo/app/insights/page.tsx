import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { companyProfile } from "@/lib/company-profile";
import { articles } from "@/lib/content";
import { articleCategories } from "@/lib/site-map";
import { routeSlug } from "@/lib/route-slug";

export const metadata: Metadata = {
  title: `Insights | ${companyProfile.name}`,
  description: `Practical perspectives from ${companyProfile.name} on connecting business direction to the services, operations, and decisions people rely on.`,
};

export default function InsightsPage() {
  const [featured, ...moreArticles] = articles;

  return (
    <main id="main-content">
      <PageIntro
        title="Ideas for making change practical"
        description={`${companyProfile.name} shares perspectives on connecting business direction to the services, operations, and decisions people rely on.`}
      />
      <section className="section insights-listing">
        <div className="container">
          <article className="featured-article">
            <Link className="featured-article-image" href={`/insights/${featured.slug}`} aria-label={`Read ${featured.title}`}>
              <span role="img" aria-label={featured.imageAlt} style={{ backgroundImage: `url("${featured.image}")` }} />
            </Link>
            <div className="featured-article-copy">
              <div className="article-meta"><span>{featured.category}</span><time dateTime={featured.datePublished}>{featured.date}</time><span>{featured.readingTime}</span><span>{featured.author}</span></div>
              <h2><Link href={`/insights/${featured.slug}`}>{featured.title}</Link></h2>
              <p>{featured.summary}</p>
              <Link className="text-link" href={`/insights/${featured.slug}`}>Read the article <span aria-hidden="true">→</span></Link>
            </div>
          </article>
          <div className="article-list-heading"><h2>More perspectives</h2><p>Considered ideas for the work ahead.</p></div>
          <div className="article-preview-grid">
            {moreArticles.map((article) => (
              <article className="article-preview" key={article.slug}>
                <Link className="article-image" href={`/insights/${article.slug}`} aria-label={`Read ${article.title}`}>
                  <span role="img" aria-label={article.imageAlt} style={{ backgroundImage: `url("${article.image}")` }} />
                </Link>
                <div className="article-meta"><span>{article.category}</span><time dateTime={article.datePublished}>{article.date}</time><span>{article.readingTime}</span><span>{article.author}</span></div>
                <h3><Link href={`/insights/${article.slug}`}>{article.title}</Link></h3>
                <p>{article.summary}</p>
                <Link className="text-link" href={`/insights/${article.slug}`}>Read article <span aria-hidden="true">→</span></Link>
              </article>
            ))}
          </div>
          <nav className="article-categories" aria-label="Insight categories">
            <p>Browse by topic</p>
            {articleCategories.map((category) => (
              <Link
                className="text-link"
                href={`/insights/category/${routeSlug(category)}`}
                key={category}
              >
                {category} <span aria-hidden="true">→</span>
              </Link>
            ))}
          </nav>
        </div>
      </section>
      <section className="closing-cta">
        <div className="container closing-cta-inner"><div><p className="eyebrow">A question of your own?</p><h2>Let’s talk about what your team is learning.</h2></div><Link className="button button-light" href="/contact">Talk with us <span aria-hidden="true">↗</span></Link></div>
      </section>
    </main>
  );
}
