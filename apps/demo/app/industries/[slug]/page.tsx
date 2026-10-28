import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageIntro } from "@/components/page-intro";
import { industryGuides } from "@/lib/content-details";
import { industries } from "@/lib/content";
import { companyProfile } from "@/lib/company-profile";
import { routeSlug } from "@/lib/route-slug";

type IndustryDetailProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return industries.map((industry) => ({ slug: routeSlug(industry.title) }));
}

export async function generateMetadata({
  params,
}: IndustryDetailProps): Promise<Metadata> {
  const { slug } = await params;
  const industry = industries.find((item) => routeSlug(item.title) === slug);

  return industry
    ? {
        title: industry.title,
        description: industry.description,
      }
    : { title: `Industry not found | ${companyProfile.name}` };
}

export default async function IndustryDetailPage({
  params,
}: IndustryDetailProps) {
  const { slug } = await params;
  const industry = industries.find((item) => routeSlug(item.title) === slug);

  if (!industry) notFound();

  const guide = industryGuides[slug];

  return (
    <main id="main-content">
      <PageIntro title={industry.title} description={industry.description} />
      <section className="section">
        <div className="container prose">
          <p className="eyebrow">Example focus: {industry.focus}</p>
          <h2>Questions that can shape the work</h2>
          <p>
            {companyProfile.name} starts with the organization’s specific
            customers, operating context, and constraints rather than assuming
            that every organization in a sector faces the same situation.
          </p>
          <ul>{guide.situations.map((item) => <li key={item}>{item}</li>)}</ul>

          <h2>Possible applications</h2>
          <ol>{guide.approach.map((item) => <li key={item}>{item}</li>)}</ol>

          <h2>Illustrative scenario</h2>
          <p>{guide.example}</p>

          <h2>Important considerations</h2>
          <p>{guide.considerations}</p>

          <h2>Related information</h2>
          <p>
            Explore relevant <Link href="/services">services</Link>, read our{" "}
            <Link href="/insights">insights</Link>, or{" "}
            <Link href="/contact">share a question</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
