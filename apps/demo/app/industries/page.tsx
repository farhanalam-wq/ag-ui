import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { industries } from "@/lib/content";

const industryGuidance = {
  "Financial services": {
    context: "Work may cross customer-facing teams, operations, risk, and digital channels. The challenge is often to make a journey easier to follow while respecting the controls and hand-offs that apply to the service.",
    scenario: "Illustrative scenario: a provider could map how a customer moves from an initial application through review and ongoing support, then identify where status updates or clearer ownership would reduce uncertainty.",
    value: "A more explicit view of responsibilities and decision points can help teams improve service continuity without treating control requirements as an afterthought.",
    question: "Where do customers or employees lose visibility as a request moves between teams?",
  },
  "Healthcare and life sciences": {
    context: "Services can involve patients, providers, administrative teams, and multiple points of coordination. A useful view considers the experience of people seeking care alongside the processes that support safe, timely service.",
    scenario: "Illustrative scenario: a care organization could trace the administrative steps around a referral, identify where information or ownership changes hands, and explore ways to make the next step clearer to the people involved.",
    value: "Making dependencies and communication points visible can help teams focus improvement on coordination and navigation, while keeping local responsibilities and constraints in view.",
    question: "Which hand-offs create the most uncertainty for patients, providers, or support teams?",
  },
  "Manufacturing and supply chains": {
    context: "Planning, production, procurement, logistics, and after-sales support can depend on decisions made across different teams and time horizons. Visibility into those dependencies matters when conditions or priorities change.",
    scenario: "Illustrative scenario: a manufacturer could follow how a change to an order affects planning and downstream operations, then clarify which teams need to know about the change and when.",
    value: "Clearer decision paths and information needs can help teams coordinate responses and spot process friction before it becomes a recurring operational issue.",
    question: "What information would help teams anticipate the downstream effects of a change?",
  },
  "Public and social services": {
    context: "People may access support through different channels and have different circumstances, while service teams work within defined responsibilities and limited capacity. Clarity, accessibility, and joined-up pathways are important considerations.",
    scenario: "Illustrative scenario: a service team could review the steps a resident takes to request support, ask where eligibility or next steps are unclear, and test a simpler way to explain the process.",
    value: "A clearer pathway can make it easier for people to understand what to expect and help service teams identify where coordination or communication needs attention.",
    question: "Can people understand the next step, including when they need support through another service?",
  },
  "Technology and business services": {
    context: "As offerings evolve, product, sales, delivery, customer success, and support teams may need to adjust how they work together. The operating model should keep pace with what customers are being offered.",
    scenario: "Illustrative scenario: a service provider could map a new offering from initial commitment through delivery and support, then resolve gaps in ownership or information between teams.",
    value: "Connecting the customer promise to the processes that deliver it can help teams make responsibilities clearer and adapt ways of working as services change.",
    question: "Does the path from customer commitment to delivery have clear owners and hand-offs?",
  },
  "Consumer and retail": {
    context: "People may move between digital and in-person interactions as they discover products, make a purchase, receive an order, or seek support. Availability, fulfilment, and service information all shape how connected that journey feels.",
    scenario: "Illustrative scenario: a retailer could examine how a customer moves from online product information to store availability and a later support request, then look for gaps that create repeated effort.",
    value: "A connected view of the journey can help teams prioritize improvements across channels rather than optimizing one interaction in isolation.",
    question: "Where does information or support become inconsistent when customers switch channels?",
  },
} as const;

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
                <h4>What this context can involve</h4>
                <p>{industryGuidance[industry.title as keyof typeof industryGuidance].context}</p>
                <h4>Illustrative scenario</h4>
                <p>{industryGuidance[industry.title as keyof typeof industryGuidance].scenario}</p>
                <h4>Potential value</h4>
                <p>{industryGuidance[industry.title as keyof typeof industryGuidance].value}</p>
                <h4>Question to explore</h4>
                <p>{industryGuidance[industry.title as keyof typeof industryGuidance].question}</p>
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
