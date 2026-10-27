import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageIntro } from "@/components/page-intro";
import { serviceGuides } from "@/lib/content-details";
import { services } from "@/lib/content";
import { companyProfile } from "@/lib/company-profile";
import { routeSlug } from "@/lib/route-slug";

type ServiceDetailProps = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return services.map((service) => ({ slug: routeSlug(service.title) }));
}

export async function generateMetadata({
  params,
}: ServiceDetailProps): Promise<Metadata> {
  const { slug } = await params;
  const service = services.find((item) => routeSlug(item.title) === slug);

  return service
    ? {
        title: service.title,
        description: service.description,
      }
    : { title: `Service not found | ${companyProfile.name}` };
}

export default async function ServiceDetailPage({ params }: ServiceDetailProps) {
  const { slug } = await params;
  const service = services.find((item) => routeSlug(item.title) === slug);

  if (!service) notFound();

  const guide = serviceGuides[slug];

  return (
    <main id="main-content">
      <PageIntro
        title={service.title}
        description={service.description}
        image={service.image}
        imageAlt={service.alt}
      />
      <section className="section">
        <div className="container prose">
          <h2>What this work can include</h2>
          <p>
            {companyProfile.name} approaches this capability by clarifying the
            question to address, the people affected, and the practical
            conditions around the work. The exact scope depends on the
            organization and the decision it needs to make.
          </p>
          <ul>{service.details.map((item) => <li key={item}>{item}</li>)}</ul>

          <h2>When this support may be useful</h2>
          <ul>{guide.situations.map((item) => <li key={item}>{item}</li>)}</ul>

          <h2>A practical workflow</h2>
          <ol>{guide.approach.map((item) => <li key={item}>{item}</li>)}</ol>

          <h2>Illustrative scenario</h2>
          <p>{guide.example}</p>

          <h2>Scope and considerations</h2>
          <p>{guide.considerations}</p>

          <h2>Explore related work</h2>
          <p>
            Services can connect where a challenge spans business direction,
            customer experience, and operations. Browse our{" "}
            <Link href="/services">full services overview</Link>, related{" "}
            <Link href="/industries">industry contexts</Link>, or{" "}
            <Link href="/insights">practical insights</Link>.
          </p>
          <Link className="text-link" href="/contact">
            Discuss a challenge <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
