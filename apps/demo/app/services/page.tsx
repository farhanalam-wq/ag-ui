import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { services } from "@/lib/content";

type ServiceGuidance = {
  scope: string;
  when: string;
  workflow: string[];
  useCases: string[];
  example: string;
  benefit: string;
  boundaries: string;
  faqs: { question: string; answer: string }[];
};

const serviceGuidance: Record<string, ServiceGuidance> = {
  "Business strategy": {
    scope: "We help leaders turn an ambition into explicit choices: where to focus, what to stop or defer, and how to make trade-offs. The work connects strategic direction to decision criteria, resource choices, and the routines teams use to act.",
    when: "It may help when priorities compete, a plan is not guiding day-to-day decisions, or leaders need to align on what should happen first.",
    workflow: [
      "Agree the strategic question, decision-makers, time horizon, and constraints.",
      "Review the current direction, relevant evidence, options, dependencies, and trade-offs.",
      "Translate agreed choices into priorities, ownership, decision criteria, and a review cadence.",
    ],
    useCases: [
      "Refining a strategy when customer needs or operating conditions have shifted.",
      "Sequencing initiatives when capacity or investment is constrained.",
      "Clarifying how an operating-model or portfolio choice supports the organization’s direction.",
    ],
    example: "Illustrative example: a leadership team with several growth ideas could compare them against customer needs, available capacity, and long-term direction before choosing a sequence of work.",
    benefit: "The intended benefit is a shared basis for prioritization and clearer ownership, so teams can assess new requests against agreed choices rather than treating every opportunity as equally urgent.",
    boundaries: "Strategy work supports decision-making; it does not guarantee commercial performance, replace leaders’ accountability, or remove the need to revisit choices as conditions change.",
    faqs: [
      {
        question: "How is strategy different from a plan?",
        answer: "Strategy sets direction and makes choices; a plan organizes the actions, timing, and responsibilities needed to pursue those choices.",
      },
      {
        question: "What information is useful at the start?",
        answer: "A clear decision to make, current plans, relevant customer or operational evidence, and known constraints are useful. Gaps can be identified and handled as part of the work.",
      },
    ],
  },
  "Digital transformation": {
    scope: "We connect technology-enabled change to the service or operational need it is meant to address. Scope can include service and process design, technology dependencies, governance, sequencing, and the support people need to adopt new ways of working.",
    when: "It may help when a technology initiative spans teams, current processes do not fit the intended service, or adoption and operational readiness need to be planned alongside delivery.",
    workflow: [
      "Define the service or operational need, intended users, constraints, and signs of progress.",
      "Map the current journey and process, including systems, ownership, dependencies, and risks to resolve.",
      "Set out a sequenced change roadmap with decision points, accountable owners, and adoption activities.",
      "Review learning from delivery and adjust the next steps as evidence emerges.",
    ],
    useCases: [
      "Planning a multi-team service or platform change before selecting implementation steps.",
      "Redesigning a process that is being moved into a digital channel.",
      "Coordinating governance, training, and operational readiness around a technology rollout.",
    ],
    example: "Illustrative example: before introducing a new case-management tool, a team could map how requests move today, identify hand-offs that cause delay, and plan training around the redesigned process.",
    benefit: "A joined-up view can make dependencies and adoption needs visible earlier, helping teams coordinate technical delivery with service operations and the people affected by change.",
    boundaries: "This work is not a software product, a promise to implement or host a particular platform, or a substitute for specialist security, legal, or regulatory assurance. Technology is one possible part of the response, not the starting assumption.",
    faqs: [
      {
        question: "Does digital transformation always require new technology?",
        answer: "No. The right change may involve improving an existing tool, simplifying a process, changing responsibilities, or combining these steps with new technology.",
      },
      {
        question: "Can the work begin before a technology supplier is chosen?",
        answer: "Yes. Clarifying user needs, service requirements, process changes, and decision criteria can help an organization make a more informed choice about what to buy or build.",
      },
    ],
  },
  "Customer experience": {
    scope: "We examine the end-to-end journey from the customer’s perspective, including information, channels, service interactions, support, and the internal hand-offs behind them. Work can move from research and journey mapping into service changes and feedback measures.",
    when: "It may help when customers repeat information, are unsure what to do next, encounter inconsistent support, or struggle when moving between channels.",
    workflow: [
      "Agree which customer group, journey, and service question to understand.",
      "Bring together relevant customer feedback, service information, and employee perspectives.",
      "Map key interactions and hand-offs, then prioritize improvements with the teams who deliver them.",
      "Choose practical feedback and service signals to review whether changes address the original need.",
    ],
    useCases: [
      "Investigating avoidable effort in onboarding, applications, or service requests.",
      "Improving transitions between digital self-service and human support.",
      "Aligning customer-facing teams around consistent information and escalation paths.",
    ],
    example: "Illustrative example: a service team could trace a customer’s route from an initial question to resolution, then identify where clearer instructions or a better hand-off would remove avoidable effort.",
    benefit: "A shared journey view can help teams prioritize changes around customer needs and decide how to learn whether those changes are useful in practice.",
    boundaries: "Journey work informs service improvement but is not a guarantee of customer satisfaction or a substitute for formal accessibility, compliance, or consumer-protection reviews where those are required.",
    faqs: [
      {
        question: "What is needed to understand a customer journey?",
        answer: "Useful inputs can include customer feedback, service information, and the perspectives of employees who support each step. The right mix depends on the question and what evidence is available.",
      },
      {
        question: "Does customer experience work focus only on digital channels?",
        answer: "No. It considers the complete journey, including in-person or phone interactions and the internal processes that shape what customers experience.",
      },
    ],
  },
  "Data and operations": {
    scope: "We look at how work flows, who owns each step, and what information supports operational decisions. The focus is on simplifying avoidable effort and making useful performance signals easier to interpret and act on.",
    when: "It may help when teams use conflicting measures, routine work has unnecessary steps, or managers cannot see where a process is getting stuck or why.",
    workflow: [
      "Select a process or decision that matters and agree its boundaries with the people involved.",
      "Map the steps, hand-offs, responsibilities, information inputs, and current measures.",
      "Identify friction and decision gaps, then define practical changes and ownership.",
      "Review a small set of relevant signals and refine the process as teams learn.",
    ],
    useCases: [
      "Reducing repeated work or unclear hand-offs in a frequently used process.",
      "Aligning operational measures with the decisions teams need to make.",
      "Clarifying escalation routes and ownership when work falls outside expected conditions.",
    ],
    example: "Illustrative example: a team could compare its current performance measures with the decisions it needs to make, then simplify reporting and clarify who acts when a threshold is reached.",
    benefit: "Clearer responsibilities and more relevant decision signals can help teams see where action is needed and focus measurement on operational use rather than reporting alone.",
    boundaries: "The work does not by itself validate every source record, replace operational owners, or require a new data platform. Specialist data engineering, system implementation, or assurance may need separate scoping.",
    faqs: [
      {
        question: "Do we need a new data platform to improve operations?",
        answer: "Not necessarily. First clarify the decisions and workflows that need support; existing data and tools may be sufficient, or they may reveal a specific gap to address.",
      },
      {
        question: "How do you choose which measures to keep?",
        answer: "Start with the decisions a measure should inform, who will use it, and how often action is possible. Measures without a clear use can be reviewed rather than carried forward by default.",
      },
    ],
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
            {services.map((service) => {
              const guidance = serviceGuidance[service.title];
              if (!guidance) {
                throw new Error(`Missing service guidance for "${service.title}"`);
              }

              const sectionId = service.title.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

              return (
                <article className="service-detail" id={sectionId} key={service.number}>
                  <div className="service-detail-image" role="img" aria-label={service.alt} style={{ backgroundImage: `url("${service.image}")` }} />
                  <div className="service-detail-copy">
                    <span className="service-number">{service.number}</span>
                    <h3>{service.title}</h3>
                    <p>{service.description}</p>
                    <h4>Scope</h4>
                    <p>{guidance.scope}</p>
                    <h4>When it may help</h4>
                    <p>{guidance.when}</p>
                    <h4>Activities may include</h4>
                    <ul>{service.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
                    <h4>Typical workflow</h4>
                    <ol>{guidance.workflow.map((step) => <li key={step}>{step}</li>)}</ol>
                    <h4>Typical use cases</h4>
                    <ul>{guidance.useCases.map((useCase) => <li key={useCase}>{useCase}</li>)}</ul>
                    <h4>Illustrative example</h4>
                    <p>{guidance.example}</p>
                    <h4>Potential benefit</h4>
                    <p>{guidance.benefit}</p>
                    <h4>Boundaries and limitations</h4>
                    <p>{guidance.boundaries}</p>
                    <h4>Frequently asked questions</h4>
                    {guidance.faqs.map((faq) => (
                      <div key={faq.question}>
                        <h4>{faq.question}</h4>
                        <p>{faq.answer}</p>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
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
