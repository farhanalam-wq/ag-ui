import type { Metadata } from "next";
import Link from "next/link";
import { articles, services } from "@/lib/content";

export const metadata: Metadata = {
  title: "Clear direction for complex work | Alderwick Advisory",
  description:
    "Alderwick Advisory helps organizations turn complex change into practical progress across strategy, digital transformation, customer experience, and operations.",
};

export default function HomePage() {
  return (
    <main id="main-content">
      <section className="home-hero">
        <div className="container home-hero-grid">
          <div className="home-hero-copy">
            <p className="eyebrow">Business transformation, made practical</p>
            <h1>Make complex work feel <span>clear.</span></h1>
            <p className="hero-description">
              Alderwick Advisory is a business transformation practice helping organizations turn difficult change into focused action people can carry forward. We connect strategy, customer experience, and operations so teams can understand what needs to change, weigh practical options, and decide what to do next.
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
            <h2>Clarity is more than a plan. It is the ability to move forward together.</h2>
            <p>
              We connect business priorities to the customer experiences, operating choices, and everyday decisions that bring them to life. Rather than treating a goal as a plan, we look at how work happens now, where people encounter friction, what constraints shape the choices, and which next step can make a practical difference.
            </p>
            <p>
              Illustrative example: an organization looking to improve a customer service journey could trace the steps customers take alongside the information and handoffs employees rely on. That view might reveal that a confusing customer step is connected to an internal process; the team could then compare options such as clearer guidance, a changed handoff, or both. The useful response depends on what the evidence and operating constraints support.
            </p>
          </div>
          <Link className="arrow-link" href="/about" aria-label="Learn more about Alderwick Advisory">↗</Link>
        </div>
      </section>

      <section className="section services-preview">
        <div className="container">
          <div className="section-heading">
            <h2>Support for the moments that shape what comes next.</h2>
            <p>From setting a direction to changing how work gets done, we help teams make progress on their most important challenges. Explore the areas below to see where a focused conversation could help clarify priorities, uncover options, or connect plans to delivery.</p>
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
              Change is shaped by people, systems, and constraints. We bring those realities into the work early, so recommendations can be weighed against available capacity, decision rights, and the conditions teams will face when putting them into practice.
            </p>
            <p>
              Illustrative example: a team considering a new process might map where a task changes hands, identify which tools and decisions each handoff depends on, and compare a small adjustment with a broader redesign. Making dependencies visible helps the team choose a manageable starting point and see what would need to be learned before expanding the change.
            </p>
            <ul className="check-list">
              <li>Start with the outcomes people need and how they will recognize progress</li>
              <li>Make assumptions, decisions, and trade-offs visible while options are still open</li>
              <li>Build ownership, feedback, and practical next steps into the path forward</li>
            </ul>
            <Link className="text-link" href="/about">Get to know us <span aria-hidden="true">→</span></Link>
          </div>
        </div>
      </section>

      <section className="benefit-section">
        <div className="container benefit-layout">
          <div className="benefit-heading">
            <h2>Better change creates room for better work.</h2>
            <p>When direction and delivery connect, teams can spend less time navigating confusion and more time improving the work itself. The value is not a promise of instant change; it is a clearer basis for making choices, learning, and adjusting as the work progresses.</p>
          </div>
          <div className="benefit-list">
            <div><span>01</span><div><h3>Decisions with direction</h3><p>When priorities compete, make the intended outcomes, dependencies, and constraints explicit. Teams can then distinguish what needs a decision now from what can wait, and sequence work around the capacity they actually have.</p></div></div>
            <div><span>02</span><div><h3>Services that make sense</h3><p>When a service feels fragmented, look across the customer steps as well as the information and handoffs behind them. That fuller view can help teams target the source of friction instead of optimizing one step while leaving the wider experience unclear.</p></div></div>
            <div><span>03</span><div><h3>Change people can sustain</h3><p>When a plan risks stalling after agreement, clarify who owns the next decisions and how feedback will shape them. Teams gain a practical way to test a change in real working conditions, learn what needs adjustment, and decide whether to extend it.</p></div></div>
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
                <div className="article-meta"><span>{article.category}</span><time>{article.date}</time><span>Alderwick Editorial Team</span></div>
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
          </div>
          <Link className="button button-light" href="/contact">Talk with us <span aria-hidden="true">↗</span></Link>
        </div>
      </section>
    </main>
  );
}
