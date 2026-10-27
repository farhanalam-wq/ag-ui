import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { services } from "@/lib/content";

const serviceGuidance = {
  "Business strategy": {
    involves: "Business strategy connects an organization’s ambitions to the choices it is willing to make: where to focus, what to prioritize, and how leaders will make trade-offs.",
    when: "It may help when priorities compete, plans are difficult to translate into decisions, or teams need a shared view of what should happen first.",
    example: "Illustrative example: a leadership team with several growth ideas could compare them against customer needs, available capacity, and long-term direction before choosing a sequence of work.",
    benefit: "The aim is a clearer set of priorities, decision criteria, and ownership that teams can use when new requests or constraints arise.",
    question: "How is strategy different from a plan?",
    answer: "Strategy sets direction and makes choices; a plan organizes the actions, timing, and responsibilities needed to pursue those choices.",
  },
  "Digital transformation": {
    involves: "Digital transformation is the coordinated change to technology, services, processes, and working practices—not simply the installation of a new system.",
    when: "It may help when a technology initiative affects several teams, existing processes do not fit the intended service, or adoption needs to be considered alongside delivery.",
    example: "Illustrative example: before introducing a new case-management tool, a team could map how requests move today, identify hand-offs that cause delay, and plan training around the redesigned process.",
    benefit: "A joined-up approach can make dependencies, decisions, and adoption needs visible early, helping teams connect technical delivery with the work people need to do.",
    question: "Does digital transformation always require new technology?",
    answer: "No. The right change may involve improving an existing tool, simplifying a process, changing responsibilities, or combining these steps with new technology.",
  },
  "Customer experience": {
    involves: "Customer experience looks at the full sequence of interactions people have with an organization, including the information, support, and hand-offs they encounter along the way.",
    when: "It may help when customers repeat information, are unsure what to do next, or receive different answers across channels or teams.",
    example: "Illustrative example: a service team could trace a customer’s route from an initial question to resolution, then identify where clearer instructions or a better hand-off would remove avoidable effort.",
    benefit: "A shared view of the journey helps teams prioritize improvements from the customer’s perspective and choose practical ways to learn whether those changes help.",
    question: "What is needed to understand a customer journey?",
    answer: "Useful inputs can include customer feedback, service data, and the perspectives of employees who support each step; the right mix depends on the question being explored.",
  },
  "Data and operations": {
    involves: "Data and operations brings together the information people rely on and the processes through which work gets done, so that decisions are easier to make and act on.",
    when: "It may help when teams use conflicting measures, routine work involves unnecessary steps, or managers cannot readily see where a process is getting stuck.",
    example: "Illustrative example: a team could compare its current performance measures with the decisions it needs to make, then simplify reporting and clarify who acts when a threshold is reached.",
    benefit: "The work can make process ownership and decision signals clearer, while focusing measurement on information that supports action rather than reporting alone.",
    question: "Do we need a new data platform to improve operations?",
    answer: "Not necessarily. First clarify the decisions and workflows that need support; existing data and tools may be sufficient, or they may reveal a specific gap to address.",
  },
} as const;

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
                  <p>{serviceGuidance[service.title as keyof typeof serviceGuidance].involves}</p>
                  <h4>When it may help</h4>
                  <p>{serviceGuidance[service.title as keyof typeof serviceGuidance].when}</p>
                  <h4>Areas of focus</h4>
                  <ul>{service.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
                  <h4>Illustrative example</h4>
                  <p>{serviceGuidance[service.title as keyof typeof serviceGuidance].example}</p>
                  <h4>What useful progress can look like</h4>
                  <p>{serviceGuidance[service.title as keyof typeof serviceGuidance].benefit}</p>
                  <h4>Common question: {serviceGuidance[service.title as keyof typeof serviceGuidance].question}</h4>
                  <p>{serviceGuidance[service.title as keyof typeof serviceGuidance].answer}</p>
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
