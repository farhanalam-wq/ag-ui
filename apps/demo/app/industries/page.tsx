import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { industries } from "@/lib/content";

type IndustryGuidance = {
  challenges: string;
  applications: string[];
  scenario: string;
  outcomes: string[];
  question: string;
};

const industryGuidance: Record<string, IndustryGuidance> = {
  "Financial services": {
    challenges: "Customer journeys can span onboarding, servicing, operations, and digital channels, with reviews or control checks adding hand-offs. Improving clarity means understanding who owns each decision and what information can be shared at each step.",
    applications: [
      "Map an application or account-servicing journey, including status updates and exception routes.",
      "Clarify ownership between customer-facing, operational, and control teams.",
      "Review how policy or process changes are communicated across channels.",
    ],
    scenario: "Illustrative scenario: a provider could map how a customer moves from an initial application through review and ongoing support, then identify where status updates or clearer ownership would reduce uncertainty.",
    outcomes: [
      "A clearer view of where customers need information or support during a service journey.",
      "More explicit hand-offs, decision points, and escalation ownership for teams to assess.",
    ],
    question: "Where do customers or employees lose visibility as a request moves between teams?",
  },
  "Healthcare and life sciences": {
    challenges: "Care and life-sciences operations involve different professional roles, sensitive information, and dependencies between people and processes. Improvements need to consider privacy, safety, evidence requirements, and local clinical or operational responsibilities.",
    applications: [
      "Trace administrative steps around referrals, appointments, or follow-up communication.",
      "Clarify how information and responsibility move between care or research operations teams.",
      "Review service navigation and support information from the perspective of patients or participants.",
    ],
    scenario: "Illustrative scenario: a care organization could trace the administrative steps around a referral, identify where information or ownership changes hands, and explore ways to make the next step clearer to the people involved.",
    outcomes: [
      "A shared picture of coordination gaps and information needs across a defined pathway.",
      "Practical improvement options that can be assessed with appropriate clinical, privacy, and operational owners.",
    ],
    question: "Which hand-offs create the most uncertainty for patients, providers, or support teams?",
  },
  "Manufacturing and supply chains": {
    challenges: "Plans depend on linked decisions across procurement, production, logistics, and service. Changes to demand, materials, capacity, or product specifications can affect downstream work, while safety, quality, and physical constraints limit what can change quickly.",
    applications: [
      "Map how a demand or engineering change moves from planning through production and fulfilment.",
      "Clarify how supplier or inventory exceptions are escalated and communicated.",
      "Review decision ownership and information needs across production and after-sales service.",
    ],
    scenario: "Illustrative scenario: a manufacturer could follow how a change to an order affects planning and downstream operations, then clarify which teams need to know about the change and when.",
    outcomes: [
      "A more visible view of dependencies, exception routes, and decision owners.",
      "Improvement options that account for operational constraints and can be evaluated by local teams.",
    ],
    question: "What information would help teams anticipate the downstream effects of a change?",
  },
  "Public and social services": {
    challenges: "People may have different access needs and routes to support, while services must work within eligibility rules, statutory responsibilities, budgets, and capacity. A pathway that is clear to one group may still create barriers or gaps for another.",
    applications: [
      "Review how people find, understand, and request a service across channels.",
      "Map referral and case hand-offs between teams or partner services.",
      "Test whether eligibility information and next steps are understandable and accessible.",
    ],
    scenario: "Illustrative scenario: a service team could review the steps a resident takes to request support, ask where eligibility or next steps are unclear, and test a simpler way to explain the process.",
    outcomes: [
      "A clearer account of barriers, hand-offs, and communication needs in a defined service pathway.",
      "Prioritized changes that service owners can assess against accessibility, accountability, and delivery constraints.",
    ],
    question: "Can people understand the next step, including when they need support through another service?",
  },
  "Technology and business services": {
    challenges: "Offers and delivery models can change faster than the processes that support them. Product, sales, delivery, customer success, and support teams need a shared view of commitments, ownership, service dependencies, and the point at which a request falls outside the standard offer.",
    applications: [
      "Map a new or changing service from customer commitment through delivery and ongoing support.",
      "Clarify hand-offs, escalation paths, and ownership for non-standard requests.",
      "Align service descriptions and internal delivery steps as an offering evolves.",
    ],
    scenario: "Illustrative scenario: a service provider could map a new offering from initial commitment through delivery and support, then resolve gaps in ownership or information between teams.",
    outcomes: [
      "A more explicit connection between customer commitments and the processes intended to deliver them.",
      "Clearer roles and decision points for teams reviewing how an offer should evolve.",
    ],
    question: "Does the path from customer commitment to delivery have clear owners and hand-offs?",
  },
  "Consumer and retail": {
    challenges: "Customers often move between discovery, purchase, fulfilment, returns, and support across online and in-person channels. Product availability, delivery expectations, seasonal demand, and exception handling all affect whether information stays consistent.",
    applications: [
      "Trace a purchase journey across product information, availability, fulfilment, and support.",
      "Review how stock or delivery exceptions are communicated across customer and store channels.",
      "Map returns or post-purchase support to find repeated effort and unclear ownership.",
    ],
    scenario: "Illustrative scenario: a retailer could examine how a customer moves from online product information to store availability and a later support request, then look for gaps that create repeated effort.",
    outcomes: [
      "A connected view of customer-facing information and operational hand-offs across channels.",
      "Specific opportunities for teams to evaluate against fulfilment capacity and customer-service needs.",
    ],
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
          <div className="section-heading"><h2>Experience shaped by context.</h2><p>We bring a practical transformation lens to the customer, operational, and organizational questions that arise in different industries. The applications and scenarios below are illustrative; they do not describe past or current sector client engagements.</p></div>
          <div className="industry-grid">
            {industries.map((industry, index) => {
              const guidance = industryGuidance[industry.title];
              if (!guidance) {
                throw new Error(`Missing industry guidance for "${industry.title}"`);
              }

              const sectionId = industry.title.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

              return (
                <article className={`industry-item industry-item-${index + 1}`} id={sectionId} key={industry.title}>
                  <span className="industry-index">0{index + 1}</span>
                  <h3>{industry.title}</h3>
                  <p>{industry.description}</p>
                  <div className="industry-focus"><span>Example focus</span><strong>{industry.focus}</strong></div>
                  <h4>Sector-specific challenges</h4>
                  <p>{guidance.challenges}</p>
                  <h4>Practical applications</h4>
                  <ul>{guidance.applications.map((application) => <li key={application}>{application}</li>)}</ul>
                  <h4>Illustrative scenario</h4>
                  <p>{guidance.scenario}</p>
                  <h4>Potential outcomes</h4>
                  <ul>{guidance.outcomes.map((outcome) => <li key={outcome}>{outcome}</li>)}</ul>
                  <h4>Question to explore</h4>
                  <p>{guidance.question}</p>
                </article>
              );
            })}
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
