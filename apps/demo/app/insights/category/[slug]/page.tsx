import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageIntro } from "@/components/page-intro";
import { articles } from "@/lib/content";
import { companyProfile } from "@/lib/company-profile";
import { routeSlug } from "@/lib/route-slug";

type CategoryPageProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return [...new Set(articles.map((article) => article.category))].map(
    (category) => ({ slug: routeSlug(category) }),
  );
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = articles.find((item) => routeSlug(item.category) === slug)
    ?.category;

  return category
    ? {
        title: `${category} insights`,
        description: `Articles from ${companyProfile.name} about ${category.toLowerCase()}.`,
      }
    : { title: `Category not found | ${companyProfile.name}` };
}

export default async function ArticleCategoryPage({
  params,
}: CategoryPageProps) {
  const { slug } = await params;
  const category = articles.find((item) => routeSlug(item.category) === slug)
    ?.category;

  if (!category) notFound();

  const categoryArticles = articles.filter(
    (article) => article.category === category,
  );

  return (
    <main id="main-content">
      <PageIntro
        title={`${category} insights`}
        description={`Browse practical articles from ${companyProfile.name} about ${category.toLowerCase()}, with ideas to help teams frame decisions and make change useful in practice.`}
      />
      <section className="section">
        <div className="container article-preview-grid">
          {categoryArticles.map((article) => (
            <article className="article-preview" key={article.slug}>
              <div className="article-meta">
                <span>{article.category}</span>
                <time dateTime={article.datePublished}>{article.date}</time>
                <span>{article.readingTime}</span>
                <span>{article.author}</span>
              </div>
              <h2>
                <Link href={`/insights/${article.slug}`}>{article.title}</Link>
              </h2>
              <p>{article.summary}</p>
              <Link className="text-link" href={`/insights/${article.slug}`}>
                Read article <span aria-hidden="true">→</span>
              </Link>
            </article>
          ))}
        </div>
        <div className="container">
          <Link className="text-link" href="/insights">
            All insights <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
