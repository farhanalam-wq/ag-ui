import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { industries } from "@/lib/content";

export const metadata: Metadata = {
  title: "Industries",
  description: "See how Alderwick Advisory's business transformation capabilities apply across a range of complex industries.",
};

export default function IndustriesPage() {
  return (
    <main id="main-content">
      <PageIntro
        title="Industries"
        description="Every sector has its own pressures, language, and operating context. Our starting point is to understand what makes yours distinct."
        image="https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1100&q=85"
        imageAlt="People from different teams working together in a meeting"
      />
      <section className="section industries-section">
        <div className="container">
          <div className="section-heading"><h2>Experience shaped by context.</h2><p>We bring a practical transformation lens to the customer, operational, and organizational questions that arise in different industries.</p></div>
          <div className="industry-grid">
            {industries.map((industry, index) => (
              <article className={`industry-item industry-item-${index + 1}`} key={industry.title}>
                <span className="industry-index">0{index + 1}</span>
                <h3>{industry.title}</h3>
                <p>{industry.description}</p>
                <div className="industry-focus"><span>Example focus</span><strong>{industry.focus}</strong></div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="industry-context">
        <div className="container industry-context-grid">
          <div className="industry-context-image" role="img" aria-label="A team exploring service improvements" />
          <div><p className="eyebrow">A grounded approach</p><h2>Start by learning how the work really happens.</h2><p>Industry context matters, but so do the specific customers, teams, systems, and constraints inside each organization. We bring structure to the discovery process without assuming that familiar sector patterns explain every challenge.</p><p>That lets the work stay relevant to the organization and the people it serves.</p><Link className="text-link" href="/about">How we work <span aria-hidden="true">→</span></Link></div>
        </div>
      </section>
      <section className="closing-cta">
        <div className="container closing-cta-inner"><div><p className="eyebrow">Your context matters</p><h2>Tell us what your organization is navigating.</h2></div><Link className="button button-light" href="/contact">Talk with us <span aria-hidden="true">↗</span></Link></div>
      </section>
    </main>
  );
}
