export type DetailGuide = {
  situations: string[];
  approach: string[];
  example: string;
  considerations: string;
};

export const serviceGuides: Record<string, DetailGuide> = {
  "business-strategy": {
    situations: [
      "Several priorities compete for the same people, time, or investment.",
      "A strategy exists but does not help teams decide what to do next.",
      "Leaders need to clarify what to continue, change, defer, or stop.",
    ],
    approach: [
      "Frame the decision, desired outcomes, constraints, and people affected.",
      "Compare options and trade-offs against customer needs and organizational direction.",
      "Translate choices into ownership, decision criteria, and a review cadence.",
    ],
    example:
      "Illustrative scenario: a leadership group with multiple proposals could agree on shared decision criteria, compare proposals against available capacity, and explain which work is prioritized and why. This is an example, not a client engagement.",
    considerations:
      "Strategy work supports informed choices; it cannot guarantee commercial results or replace leadership accountability. Priorities may need review when conditions or evidence change.",
  },
  "digital-transformation": {
    situations: [
      "A technology change affects several teams or customer touchpoints.",
      "Existing processes do not fit the intended digital service.",
      "Adoption, operational readiness, and governance need to be planned with delivery.",
    ],
    approach: [
      "Define the user or operational need before selecting a technical response.",
      "Map the process, information, system dependencies, risks, and ownership.",
      "Sequence delivery with adoption support, decision points, and learning loops.",
    ],
    example:
      "Illustrative scenario: before replacing a case-management tool, a team could map how requests move today, identify what the new system must enable, and test a representative workflow. This is not a report of a real project.",
    considerations:
      "Advisory work does not itself provide, host, or certify software. Security, privacy, accessibility, legal, and regulatory requirements need appropriate specialist review.",
  },
  "customer-experience": {
    situations: [
      "Customers repeat information or receive inconsistent guidance.",
      "The hand-off between digital and human support is unclear.",
      "Teams need to understand an end-to-end journey instead of optimizing one channel.",
    ],
    approach: [
      "Select a customer need and trace the steps, channels, and service hand-offs involved.",
      "Bring customer feedback together with the operational view of the teams delivering the service.",
      "Prioritize a change and decide how to review the whole journey for unintended effects.",
    ],
    example:
      "Illustrative scenario: a service team could trace an inquiry from first contact to resolution, identify where ownership becomes unclear, and test a clearer hand-off. This is not a client case.",
    considerations:
      "Journey maps are working models, not substitutes for direct customer research or formal accessibility and compliance reviews where those are required.",
  },
  "data-and-operations": {
    situations: [
      "Routine work includes avoidable steps, rework, or unclear ownership.",
      "Teams use measures that do not help them make decisions.",
      "Managers need a clearer view of where a process is delayed or blocked.",
    ],
    approach: [
      "Define a process or decision to examine with the people who do the work.",
      "Map steps, hand-offs, information inputs, responsibilities, and existing measures.",
      "Identify practical changes and clarify how teams will recognize and respond to results.",
    ],
    example:
      "Illustrative scenario: a team could compare its recurring reports with the decisions those reports are meant to support, then simplify the information and clarify who acts on it. This is not a verified organizational example.",
    considerations:
      "Simplification should not remove necessary controls, context, or professional judgment. Data quality, privacy, and access constraints must be considered before changing how information is used.",
  },
};

export const industryGuides: Record<string, DetailGuide> = {
  "financial-services": {
    situations: [
      "Customer requests move between onboarding, service, operations, and review teams.",
      "People need clearer status updates while required controls remain in place.",
    ],
    approach: [
      "Map a defined service journey, including exception and escalation routes.",
      "Clarify decision ownership and information needs at each hand-off.",
      "Assess proposed changes with the relevant risk, operational, and service owners.",
    ],
    example:
      "Illustrative scenario: a provider could review how an application moves from submission through assessment, then identify where a status update or clearer owner might reduce uncertainty. This is not a client engagement.",
    considerations:
      "Any change must be assessed against the organization’s actual regulatory, privacy, security, and control obligations.",
  },
  "healthcare-and-life-sciences": {
    situations: [
      "Patients, providers, researchers, and administrative teams coordinate across multiple steps.",
      "Information or responsibility can become unclear during referral, scheduling, or follow-up.",
    ],
    approach: [
      "Choose a defined administrative or service pathway and understand each role involved.",
      "Map information flows and hand-offs with the appropriate clinical or operational owners.",
      "Test potential improvements with privacy, safety, accessibility, and service needs in view.",
    ],
    example:
      "Illustrative scenario: a care organization could examine the administrative steps around a referral and explore how the next action is explained. This is not a claim about a real provider.",
    considerations:
      "This content is not clinical, legal, or regulatory advice. Clinical judgment, patient safety, confidentiality, and local governance remain with qualified accountable teams.",
  },
  "manufacturing-and-supply-chains": {
    situations: [
      "A change in demand or materials affects planning, production, logistics, and service.",
      "Teams need to see dependencies and exceptions across operational boundaries.",
    ],
    approach: [
      "Trace a defined order, product, or exception through the connected operating steps.",
      "Identify decision owners, information dependencies, and escalation paths.",
      "Assess improvement options against safety, quality, capacity, and physical constraints.",
    ],
    example:
      "Illustrative scenario: a manufacturer could map how a specification change reaches downstream planning and clarify which teams need to review it. This is not an account of a client project.",
    considerations:
      "Operational changes must be evaluated by qualified local owners for safety, quality, contractual, and production requirements.",
  },
  "public-and-social-services": {
    situations: [
      "People have different routes, access needs, and circumstances when seeking support.",
      "Eligibility, referral, or partner-service hand-offs can make next steps difficult to follow.",
    ],
    approach: [
      "Review a defined pathway with the people who use and deliver the service.",
      "Identify points where eligibility, accessibility, ownership, or next steps are unclear.",
      "Develop changes service owners can assess against accountability and delivery constraints.",
    ],
    example:
      "Illustrative scenario: a service team could test a clearer explanation of what happens after an initial request, including where a person can ask for help. This is not a real service outcome.",
    considerations:
      "Public duties, statutory requirements, accessibility, safeguarding, and available capacity should shape any proposed changes.",
  },
  "technology-and-business-services": {
    situations: [
      "A service offering changes faster than its delivery and support processes.",
      "Customer commitments pass through product, sales, delivery, and support teams.",
    ],
    approach: [
      "Trace a defined offering from the customer commitment through delivery and support.",
      "Clarify roles, information, decision rights, and exception handling between teams.",
      "Review whether the operating approach remains aligned as the offering evolves.",
    ],
    example:
      "Illustrative scenario: a provider could map hand-offs for a new offering and identify where delivery teams need clearer scope information. This is not a client case.",
    considerations:
      "Proposed operating changes should be checked against actual contracts, service commitments, security needs, and the organization’s capabilities.",
  },
  "consumer-and-retail": {
    situations: [
      "Customers move between discovery, purchase, fulfilment, returns, and support.",
      "Availability, delivery, or returns information differs between channels.",
    ],
    approach: [
      "Trace a defined customer journey across digital and in-person touchpoints.",
      "Review how operational exceptions are communicated to customers and frontline teams.",
      "Prioritize improvements against fulfilment capacity, accessibility, and service needs.",
    ],
    example:
      "Illustrative scenario: a retailer could review how customers move from online product information to store availability and subsequent support. This is not a statement of actual retailer experience.",
    considerations:
      "Changes should account for real inventory, fulfilment, consumer-protection, accessibility, and seasonal operating constraints.",
  },
};
