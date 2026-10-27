import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";

export const metadata: Metadata = {
  title: "About us",
  description: "Learn about Alderwick Advisory's mission, vision, values, and practical approach to business transformation.",
};

const values = [
  { title: "Start with understanding", body: "Listen carefully to the people closest to the work before settling on the problem or the answer." },
  { title: "Make it useful", body: "Translate analysis into decisions and next steps that teams can apply in their day-to-day work." },
  { title: "Work in the open", body: "Share assumptions, trade-offs, and progress early so people can shape the work as it develops." },
  { title: "Learn as we go", body: "Treat feedback and new evidence as essential inputs, not as exceptions to a fixed plan." },
];

export default function AboutPage() {
  return (
    <main id="main-content">
      <PageIntro
        title="About Alderwick Advisory"
        description="We help organizations find a clearer path through complex change, then work alongside their teams to make that path real."
        image="https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1100&q=85"
        imageAlt="A small group working through a project together"
      />
      <section className="section story-section">
        <div className="container story-grid">
          <p className="eyebrow">Our background</p>
          <div className="prose">
            <h2>Built around a simple belief: progress should make sense to the people doing the work.</h2>
            <p>Alderwick Advisory is a business transformation practice focused on connecting strategic priorities with the services, operations, and decisions that shape everyday work. Our approach brings those perspectives together so organizations can see where change is needed and identify practical ways to move forward.</p>
            <p>Our work is presented as a connected practice. We look at the direction an organization sets, the services people experience, and the operations that support them. That wider view helps teams see where change is needed and where a practical next step can make a difference.</p>
            <p>We value clear thinking, honest collaboration, and recommendations grounded in the realities of each organization. We do not assume one approach fits every business.</p>
          </div>
        </div>
      </section>
      <section className="purpose-section">
        <div className="container purpose-grid">
          <div><span className="purpose-label">Our mission</span><h2>Make complex change easier to understand and act on.</h2></div>
          <div><span className="purpose-label">Our vision</span><h2>Organizations where good ideas turn into better everyday experiences.</h2></div>
        </div>
      </section>
      <section className="section values-section">
        <div className="container">
          <div className="section-heading"><h2>How we choose to work.</h2><p>These principles shape how Alderwick Advisory approaches problems, works with teams, and measures useful progress.</p></div>
          <div className="values-grid">
            {values.map((value, index) => (
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
            <p>Innovation starts by noticing where an existing way of working no longer fits. We explore options with the people affected, test assumptions at a useful scale, and keep what proves valuable.</p>
            <p>That can mean a new service, a more effective process, a different use of information, or a decision that gives teams room to act. The answer depends on the challenge.</p>
            <Link className="text-link" href="/services">Explore our capabilities <span aria-hidden="true">→</span></Link>
          </div>
          <div className="approach-visual" role="img" aria-label="A collaborative design workshop in progress" />
        </div>
      </section>
      <section className="closing-cta">
        <div className="container closing-cta-inner">
          <div><p className="eyebrow">Work with Alderwick</p><h2>Let’s make your next step clearer.</h2></div>
          <Link className="button button-light" href="/contact">Talk with us <span aria-hidden="true">↗</span></Link>
        </div>
      </section>
    </main>
  );
}
