import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";

export const metadata: Metadata = {
  title: "About us",
  description: "Learn about Alderwick Advisory's mission, vision, values, and practical approach to business transformation.",
};

const values = [
  { title: "Start with understanding", body: "Listen to the people closest to the work and look at the context around it before settling on a problem or an answer. What leaders intend, what customers experience, and what teams can deliver may look different; understanding those perspectives helps frame the right question." },
  { title: "Make it useful", body: "Translate analysis into decisions, options, and next steps that teams can apply in their day-to-day work. A recommendation should account for real constraints and make clear what people can do with it." },
  { title: "Work in the open", body: "Share assumptions, trade-offs, and progress early so people can question the framing and shape the work as it develops. Clear communication makes it easier to address uncertainty before it becomes a late surprise." },
  { title: "Learn as we go", body: "Treat feedback and new evidence as essential inputs, not exceptions to a fixed plan. Check what is working, identify what needs adjustment, and use those observations to guide the next step." },
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
          <p className="eyebrow">What guides our work</p>
          <div className="prose">
            <h2>Built around a simple belief: progress should make sense to the people doing the work.</h2>
            <p>Alderwick Advisory is a business transformation practice focused on connecting strategic priorities with the services, operations, and decisions that shape everyday work. We help organizations examine how these parts affect one another, clarify what is getting in the way, and identify practical options for moving forward.</p>
            <p>Our capabilities center on clarifying priorities, understanding how services and work move across teams, examining the decisions and dependencies that shape delivery, and translating what we learn into practical next steps. This is the expertise we bring to a challenge—not a claim about a particular client, project, or organizational history.</p>
            <p>That connected view matters because a change in one area can create new demands elsewhere. A redesigned customer service, for instance, may depend on clearer information, different team handoffs, or adjustments to supporting processes. This is an illustrative situation, not a client example; it shows why we consider the experience and the operating conditions together.</p>
            <p>We value clear thinking, honest collaboration, and recommendations grounded in each organization’s circumstances. We make assumptions and trade-offs visible, involve the people affected, and leave room to learn as plans meet day-to-day reality. We do not assume one approach fits every business.</p>
            <p>Our role is to help make the challenge easier to understand and the next decision easier to take—not to prescribe change for its own sake. The work begins with the outcomes that matter, the constraints that are real, and the questions that still need answering.</p>
          </div>
        </div>
      </section>
      <section className="purpose-section">
        <div className="container purpose-grid">
          <div><span className="purpose-label">Our mission</span><h2>Make complex change easier to understand and act on.</h2><p>We connect the reason for change to the decisions, services, and everyday practices that can bring it to life.</p></div>
          <div><span className="purpose-label">Our vision</span><h2>Organizations where good ideas turn into better everyday experiences.</h2><p>That means progress people can recognize in how work is done and how services are experienced, shaped with the people closest to both.</p></div>
        </div>
      </section>
      <section className="section values-section">
        <div className="container">
          <div className="section-heading"><h2>How we choose to work.</h2><p>These principles shape how Alderwick Advisory frames problems, works with teams, and recognizes useful progress. They guide the process without assuming every organization needs the same answer.</p></div>
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
          <div><p className="eyebrow">Work with Alderwick</p><h2>Let’s make your next step clearer.</h2><p>Share the challenge, the outcome you are working toward, or the decision that feels difficult to make.</p></div>
          <Link className="button button-light" href="/contact">Talk with us <span aria-hidden="true">↗</span></Link>
        </div>
      </section>
    </main>
  );
}
