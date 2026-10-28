import type { Metadata } from "next";
import Link from "next/link";
import { articles, services } from "@/lib/content";
import { companyProfile } from "@/lib/company-profile";

export const metadata: Metadata = {
  title: `Clear direction for complex work | ${companyProfile.name}`,
  description: companyProfile.overview,
};

export default function HomePage() {
  return (
    <main id="main-content">
      <section className="home-hero">
        <div className="container home-hero-grid">
          <div className="home-hero-copy">
            <p className="eyebrow">{companyProfile.descriptor}, made practical</p>
            <h1>Make complex work feel <span>clear.</span></h1>
            <p className="hero-description">
              {companyProfile.overview} We help make the connections visible: what the organization is trying to achieve, what customers and employees experience, and what needs to change in the work itself.
            </p>
            <div className="hero-actions">
              <Link className="button" href="/contact">Talk with us <span aria-hidden="true">↗</span></Link>
              <Link className="text-link" href="/services">Explore our services <span aria-hidden="true">→</span></Link>
            </div>
          </div>
          <div
            className="hero-image"
            role="img"
            aria-label="Colleagues sharing ideas around a table in a light-filled studio"
            style={{ backgroundImage: 'linear-gradient(180deg, rgba(15, 43, 38, .02), rgba(15, 43, 38, .1)), url("https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1400&q=85")' }}
          >
            <div className="hero-image-caption">
              <span className="caption-rule" />
              <span>Good change starts with a shared view of the work.</span>
            </div>
          </div>
        </div>
      </section>

      <section className="intro-band">
        <div className="container intro-band-inner">
          <p className="eyebrow">The Alderwick approach</p>
          <div>
            <h2>We connect business direction to the work people experience every day.</h2>
            <p>
              {companyProfile.mission} That means looking beyond a stated goal to understand the services, operating choices, and decisions around it. We listen to people closest to the work, make assumptions and trade-offs visible, and shape next steps around real constraints.
            </p>
            <p>
              For example, a team exploring a customer-service issue could map the customer journey alongside the information and handoffs employees rely on. If the view points to an internal process as a source of friction, the team can compare options—such as clearer guidance, a changed handoff, or both—against available evidence and operating constraints before choosing what to try.
            </p>
          </div>
          <Link className="arrow-link" href="/about" aria-label="Learn more about Alderwick Advisory">↗</Link>
        </div>
      </section>

      <section className="section services-preview">
        <div className="container">
          <div className="section-heading">
            <h2>Support for the moments that shape what comes next.</h2>
            <p>Organizations can lose momentum when priorities compete, a service crosses disconnected steps, or a plan meets the realities of day-to-day operations. Our work connects strategy, customer experience, and operations so teams can frame the challenge, compare practical options, and decide how to move from intention to action. Explore the areas below to see where that support may be useful.</p>
          </div>
          <div className="service-preview-grid">
            {services.slice(0, 3).map((service) => (
              <Link className="service-preview" href="/services" key={service.number}>
                <span className="service-number">{service.number}</span>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
                <span className="inline-arrow" aria-hidden="true">↗</span>
              </Link>
            ))}
          </div>
          <Link className="text-link section-link" href="/services">See all our services <span aria-hidden="true">→</span></Link>
        </div>
      </section>

      <section className="difference-section">
        <div className="container difference-grid">
          <div className="difference-image" role="img" aria-label="A project team working through a shared plan" />
          <div className="difference-copy">
            <p className="eyebrow">How we work</p>
            <h2>Progress that respects the realities of your business.</h2>
            <p>
              Change can become difficult to act on when ownership is unclear, systems and processes pull in different directions, or a plan assumes capacity people do not have. We bring those realities into the work early, weighing options against decision rights, dependencies, and the conditions teams will face when putting them into practice.
            </p>
            <p>
              A practical response might begin by mapping where work changes hands, which tools and decisions each handoff depends on, and where people encounter friction. The team can then compare a targeted adjustment with a broader redesign, choose a manageable next step, and decide what feedback would help determine whether to adapt or extend it.
            </p>
            <ul className="check-list">
              <li>Understand the outcomes people need and what progress would look like in practice</li>
              <li>Make assumptions, dependencies, and trade-offs visible while options are still open</li>
              <li>Give teams a clear next decision and a way to learn from the work as it unfolds</li>
            </ul>
            <Link className="text-link" href="/about#leadership">Our leadership approach <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>

      <section className="benefit-section">
        <div className="container benefit-layout">
          <div className="benefit-heading">
            <h2>Make room for clearer decisions and better everyday experiences.</h2>
            <p>{companyProfile.vision} Our value is in helping teams see the choices in front of them, understand what those choices depend on, and take a practical next step—without promising that complex change will be instant or effortless.</p>
          </div>
          <div className="benefit-list">
            <div><span>01</span><div><h3>Decisions with direction</h3>            <p>When priorities compete, make intended outcomes, dependencies, and constraints explicit. Teams can distinguish what needs a decision now from what can wait, then sequence work around the capacity they actually have.</p></div></div>
            <div><span>02</span><div><h3>Services that make sense</h3>            <p>When a service feels fragmented, look across customer steps and the information and handoffs behind them. That view can help teams address a source of friction rather than improve one step while leaving the wider experience unclear.</p></div></div>
            <div><span>03</span><div><h3>Change people can sustain</h3>            <p>When a plan risks stalling after agreement, clarify who owns the next decisions and how feedback will shape them. Teams can test a change in real working conditions, learn what needs adjustment, and decide whether to extend it.</p></div></div>
          </div>
        </div>
      </section>

      <section className="section insights-preview">
        <div className="container">
          <div className="section-heading section-heading-row">
            <div><p className="eyebrow">Ideas for moving forward</p><h2>Useful perspectives on meaningful change.</h2><p>Explore practical ways to frame a challenge, ask better questions, and connect good intentions to work people can act on.</p></div>
            <Link className="text-link" href="/insights">All insights <span aria-hidden="true">→</span></Link>
          </div>
          <div className="article-preview-grid">
            {articles.slice(0, 2).map((article) => (
              <article className="article-preview" key={article.slug}>
                <Link className="article-image" href={`/insights/${article.slug}`} aria-label={`Read ${article.title}`}>
                  <span role="img" aria-label={article.imageAlt} style={{ backgroundImage: `url("${article.image}")` }} />
                </Link>
                <div className="article-meta"><span>{article.category}</span><time>{article.date}</time><span>{companyProfile.name} Editorial Team</span></div>
                <h3><Link href={`/insights/${article.slug}`}>{article.title}</Link></h3>
                <p>{article.summary}</p>
                <Link className="text-link" href={`/insights/${article.slug}`}>Read article <span aria-hidden="true">→</span></Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="closing-cta">
        <div className="container closing-cta-inner">
          <div>
            <p className="eyebrow">Start a conversation</p>
            <h2>Have a challenge worth making clearer?</h2>
            <p>Start with the question that feels most pressing. A conversation can help clarify what you know, what still needs to be learned, and what a useful next step would need to account for.</p>
          </div>
          <Link className="button button-light" href="/contact">Talk with us <span aria-hidden="true">↗</span></Link>
        </div>
      </section>
    </main>
  );
}
