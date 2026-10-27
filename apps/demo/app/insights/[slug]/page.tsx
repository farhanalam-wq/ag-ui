import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { articles } from "@/lib/content";

type ArticlePageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  const article = articles.find((item) => item.slug === slug);

  return article
    ? { title: article.title, description: article.summary }
    : { title: "Article not found" };
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  const article = articles.find((item) => item.slug === slug);

  if (!article) notFound();

  return (
    <main id="main-content">
      <article className="article-page">
        <header className="article-header container">
          <Link className="back-link" href="/insights"><span aria-hidden="true">←</span> All insights</Link>
          <div className="article-meta"><span>{article.category}</span><time>{article.date}</time><span>{article.readingTime}</span></div>
          <h1>{article.title}</h1>
          <p className="article-deck">{article.summary}</p>
          <p className="article-author">By Alderwick Editorial Team</p>
        </header>
        <div className="article-hero-image" role="img" aria-label={article.imageAlt} style={{ backgroundImage: `url("${article.image}")` }} />
        <div className="article-body prose">
          <p className="article-lead">{article.introduction}</p>
          {article.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </section>
          ))}
          <div className="article-endnote">
            <p>Good change starts with a useful conversation.</p>
            <Link className="text-link" href="/contact">Talk with us <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </article>
      <section className="related-articles section">
        <div className="container"><div className="section-heading"><h2>Continue exploring</h2><p>More perspectives from Alderwick Advisory on making change practical.</p></div>
          <div className="related-links">{articles.filter((item) => item.slug !== article.slug).map((item) => <Link href={`/insights/${item.slug}`} key={item.slug}><span>{item.category} · {item.readingTime}</span><strong>{item.title}</strong><span>{item.summary}</span><span aria-hidden="true">↗</span></Link>)}</div>
        </div>
      </section>
    </main>
  );
}
