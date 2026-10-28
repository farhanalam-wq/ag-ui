import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { companyProfile } from "@/lib/company-profile";
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
    ? { title: `${article.title} | ${companyProfile.name}`, description: article.summary }
    : { title: `Article not found | ${companyProfile.name}` };
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
          <div className="article-meta"><span>{article.category}</span><time dateTime={article.datePublished}>{article.date}</time><span>{article.readingTime}</span></div>
          <h1>{article.title}</h1>
          <p className="article-deck">{article.summary}</p>
          <p className="article-author">By {article.author}</p>
        </header>
        <div className="article-hero-image" role="img" aria-label={article.imageAlt} style={{ backgroundImage: `url("${article.image}")` }} />
        <div className="article-body prose">
          <p className="article-lead">{article.introduction}</p>
          {article.sections.map((section) => (
            <section key={section.heading}>
              <h2>{section.heading}</h2>
              {section.steps ? (
                <>
                  <p>{section.paragraphs[0]}</p>
                  <ol>
                    {section.steps.map((step) => <li key={step}>{step}</li>)}
                  </ol>
                  {section.paragraphs.slice(1).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </>
              ) : (
                section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)
              )}
            </section>
          ))}
          <section>
            <h2>Takeaways</h2>
            <ul>
              {article.takeaways.map((takeaway) => <li key={takeaway}>{takeaway}</li>)}
            </ul>
          </section>
          <section>
            <h2>Frequently asked questions</h2>
            {article.faqs.map((faq) => (
              <section key={faq.question}>
                <h3>{faq.question}</h3>
                <p>{faq.answer}</p>
              </section>
            ))}
          </section>
          <div className="article-endnote">
            <p>Good change starts with a useful conversation.</p>
            <Link className="text-link" href="/contact">Talk with us <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </article>
      <section className="related-articles section">
        <div className="container"><div className="section-heading"><h2>Continue exploring</h2><p>More perspectives from {companyProfile.name} on making complex change easier to understand and act on.</p></div>
          <div className="related-links">{articles.filter((item) => item.slug !== article.slug).map((item) => <Link href={`/insights/${item.slug}`} key={item.slug}><span>{item.category} · {item.readingTime}</span><strong>{item.title}</strong><span>{item.summary}</span><span aria-hidden="true">↗</span></Link>)}</div>
        </div>
      </section>
    </main>
  );
}
