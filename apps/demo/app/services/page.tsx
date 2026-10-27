import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { services } from "@/lib/content";

export const metadata: Metadata = {
  title: "Products & services",
  description: "Explore Alderwick Advisory's business strategy, digital transformation, customer experience, and data and operations services.",
};

export default function ServicesPage() {
  return (
    <main id="main-content">
      <PageIntro
        title="Products & services"
        description="A connected set of capabilities for organizations working through strategic choices, service needs, and operational change."
        image="https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1100&q=85"
        imageAlt="A collaborative planning session with a team"
      />
      <section className="section services-detail-section">
        <div className="container">
          <div className="section-heading"><h2>Work on the challenge, not just the workstream.</h2><p>Our services meet organizations at different points in their change journey. They can be engaged independently or brought together around a shared outcome.</p></div>
          <div className="services-detail-list">
            {services.map((service) => (
              <article className="service-detail" key={service.number}>
                <div className="service-detail-image" role="img" aria-label={service.alt} style={{ backgroundImage: `url("${service.image}")` }} />
                <div className="service-detail-copy">
                  <span className="service-number">{service.number}</span>
                  <h3>{service.title}</h3>
                  <p>{service.description}</p>
                  <h4>Areas of focus</h4>
                  <ul>{service.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="use-case-section">
        <div className="container use-case-grid">
          <div><p className="eyebrow">Where we help</p><h2>From a hard question to a workable next move.</h2></div>
          <div className="use-case-copy">
            <p>Organizations may seek Alderwick Advisory's perspective when priorities compete, customer journeys feel fragmented, or a technology change is moving faster than the surrounding ways of working.</p>
            <p>We help define the problem, bring the right people into the conversation, and shape a response that accounts for business goals as well as practical constraints.</p>
            <Link className="text-link" href="/industries">See how this applies across industries <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>
      <section className="closing-cta">
        <div className="container closing-cta-inner"><div><p className="eyebrow">Let’s explore the challenge</p><h2>Bring us the question you are working through.</h2></div><Link className="button button-light" href="/contact">Talk with us <span aria-hidden="true">↗</span></Link></div>
      </section>
    </main>
  );
}
