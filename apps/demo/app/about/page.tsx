import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { companyProfile } from "@/lib/company-profile";

export const metadata: Metadata = {
  title: "About us",
  description: companyProfile.overview,
};

export default function AboutPage() {
  return (
    <main id="main-content">
      <PageIntro
        title={`About ${companyProfile.name}`}
        description={companyProfile.overview}
        image="https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1100&q=85"
        imageAlt="A small group working through a project together"
      />
      <section className="section story-section">
        <div className="container story-grid">
          <p className="eyebrow">What guides our work</p>
          <div className="prose">
            <h2>Built around a simple belief: progress should make sense to the people doing the work.</h2>
            <p>{companyProfile.overview}</p>
            <p>We look at how strategic priorities connect with customer experiences, operating decisions, and everyday work. Understanding those relationships helps clarify the challenge and shape practical next steps for each organization.</p>
          </div>
        </div>
      </section>
      <section className="purpose-section">
        <div className="container purpose-grid">
          <div><span className="purpose-label">Our mission</span><h2>{companyProfile.mission}</h2></div>
          <div><span className="purpose-label">Our vision</span><h2>{companyProfile.vision}</h2></div>
        </div>
      </section>
      <section className="section story-section" id="leadership">
        <div className="container story-grid">
          <p className="eyebrow">Leadership</p>
          <div className="prose">
            <h2>{companyProfile.leadershipApproach.heading}</h2>
            <p>{companyProfile.leadershipApproach.introduction}</p>
            <ul>
              {companyProfile.leadershipApproach.practices.map((practice) => (
                <li key={practice}>{practice}</li>
              ))}
            </ul>
            <h3>A shared point of view</h3>
            <blockquote><p>{companyProfile.leadershipApproach.message}</p></blockquote>
          </div>
        </div>
      </section>
      <section className="section values-section">
        <div className="container">
          <div className="section-heading"><h2>How we choose to work.</h2><p>These principles guide how {companyProfile.name} approaches its work.</p></div>
          <div className="values-grid">
            {companyProfile.values.map((value, index) => (
              <article className="value-item" key={value.title}>
                <span className="value-index">0{index + 1}</span>
                <h3>{value.title}</h3>
                <p>{value.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="approach-section">
        <div className="container approach-grid">
          <div className="approach-copy">
            <h2>Curious about what could work better.</h2>
            <p>We begin by understanding the intended outcome, the people affected, and how work happens today. Together, we frame the challenge and make assumptions, dependencies, and unanswered questions visible before settling on a response.</p>
            <p>Next, we shape and compare options against the evidence, constraints, and effort involved. Where it is useful and appropriate, a team can try a change at a limited scale, gather feedback from day-to-day use, and decide what to refine, extend, or leave behind. For example, an illustrative process improvement might start by tracing a handoff, locating where information or ownership becomes unclear, and testing a focused adjustment before considering a wider change.</p>
            <p>Explore the areas of work where we can help, or get in touch to discuss the question your organization is working through.</p>
            <Link className="text-link" href="/services">Explore our capabilities <span aria-hidden="true">→</span></Link>
          </div>
          <div className="approach-visual" role="img" aria-label="A collaborative design workshop in progress" />
        </div>
      </section>
      <section className="closing-cta">
        <div className="container closing-cta-inner">
          <div><p className="eyebrow">Work with {companyProfile.name}</p><h2>Let’s make your next step clearer.</h2><p>Share the challenge, the outcome you are working toward, or the decision that feels difficult to make.</p></div>
          <Link className="button button-light" href="/contact">Talk with us <span aria-hidden="true">↗</span></Link>
        </div>
      </section>
    </main>
  );
}
