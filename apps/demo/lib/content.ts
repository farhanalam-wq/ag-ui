export type ArticleSection = {
  heading: string;
  paragraphs: string[];
  steps?: string[];
};

export type ArticleFaq = {
  question: string;
  answer: string;
};

export type Article = {
  slug: string;
  title: string;
  category: string;
  date: string;
  datePublished: string;
  author: string;
  readingTime: string;
  summary: string;
  image: string;
  imageAlt: string;
  introduction: string;
  sections: ArticleSection[];
  takeaways: string[];
  faqs: ArticleFaq[];
};

export const articles: Article[] = [
  {
    slug: "turning-strategy-into-everyday-decisions",
    title: "Turning strategy into everyday decisions",
    category: "Strategy",
    date: "October 8, 2026",
    datePublished: "2026-10-08",
    author: "Alderwick Editorial Team",
    readingTime: "5 min read",
    summary: "A strategy becomes actionable when priorities clarify everyday choices, shape resource decisions, and give teams a practical way to learn from results.",
    image: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1400&q=85",
    imageAlt: "Colleagues working through plans together around a table",
    introduction: "A strategy earns its place not only through the quality of its ambition, but through the decisions it helps people make after the planning sessions end. Yet priorities can lose their meaning as they travel through layers of teams, budgets, customer needs, and operational constraints. Connecting direction to everyday work requires making choices explicit, giving people useful decision guidance, and treating implementation as a source of learning.",
    sections: [
      {
        heading: "Turn priorities into choices",
        paragraphs: [
          "A priority such as improving customer trust is not yet a decision rule. Ask what it changes when a team is balancing speed against completeness, investing in prevention against responding to complaints, or choosing which work receives limited capacity. Describe the trade-off in plain language and state what should guide a decision when the two goals conflict.",
          "Be candid about what the organization is not prioritizing. A strategy that promises everything equally offers little help when a deadline, budget, or customer need forces a choice. Explicit trade-offs also expose friction: an incentive, approval step, or reporting measure may be rewarding behavior that the strategy is meant to change.",
        ],
      },
      {
        heading: "Translate direction into daily work",
        paragraphs: [
          "For each priority, identify the few recurring moments where a different choice would make a meaningful difference. These may include how a manager allocates capacity, how a service team handles an exception, or which customer problem is addressed first. Define the expected behavior and the conditions under which people should escalate or adapt it.",
          "Keep the guidance light enough to use. A short set of decision principles, examples, and boundaries is often more practical than a long manual that attempts to anticipate every case. Pair it with changes to the routines that govern work—such as planning meetings, investment reviews, or team check-ins—so the priority appears where choices are actually made.",
        ],
      },
      {
        heading: "Align measures, ownership, and resources",
        paragraphs: [
          "People notice quickly when strategy language and operating signals disagree. Review whether goals, incentives, governance, and resource allocation support the behavior being requested. If a team is asked to improve reliability but is assessed only on short-term volume, the tension should be addressed openly rather than left for employees to resolve alone.",
          "Assign an owner to each important outcome, while making clear which decisions belong with teams and which need broader agreement. Measures should help people understand progress and prompt useful questions; they should not pretend to capture every dimension of a complex outcome. Combine quantitative indicators with direct review of the work and the experience it creates.",
        ],
      },
      {
        heading: "A five-step working session for one priority",
        paragraphs: [
          "Bring together the people closest to one recurring decision affected by the priority. Capture the resulting guidance where people already do the work, rather than creating a parallel strategy document.",
          "Hypothetical example: a regional service team must choose between resolving straightforward requests quickly and reserving capacity for complex cases. Leaders could clarify how to identify complexity, set a threshold for escalation, and review whether the rule leaves customers waiting unnecessarily. This is an illustration, not a report of a particular organization's experience.",
        ],
        steps: [
          "Name the decision and the outcome it should support.",
          "Review a recent, ordinary example.",
          "Identify the information, authority, and constraints that shaped it.",
          "Agree on one small change to guidance, process, or ownership.",
          "Set a date to review a few comparable decisions.",
        ],
      },
      {
        heading: "Know what decision rules cannot solve",
        paragraphs: [
          "A clear priority will not remove every conflict or substitute for information, capacity, or expertise that a team does not have. If the same decision keeps escalating, investigate whether authority is unclear, the policy is incomplete, or the team needs a resource decision. Do not frame a structural constraint as an individual failure to follow the strategy.",
          "Rules can also become stale as customer needs and operating conditions change. Treat them as a useful starting point, not a script: state when judgment is expected, how exceptions are raised, and who can revise the guidance. A short review cycle helps keep the direction steady while allowing the method to improve.",
        ],
      },
    ],
    takeaways: [
      "Start with a real decision rather than another strategy summary.",
      "Make the intended trade-off understandable, give teams enough authority and context to act, and remove operating signals that pull in the opposite direction.",
      "Keep a regular learning loop: ask where guidance helped, where it created an unintended consequence, and what should change.",
    ],
    faqs: [
      {
        question: "How many priorities should guide everyday decisions?",
        answer: "There is no universal number. Start with the small set leaders can explain and resource consistently, then test whether teams can use them to make real choices. If priorities routinely compete without a way to resolve the conflict, clarify the trade-off rather than adding another slogan.",
      },
      {
        question: "How can leaders tell whether a strategy is changing work?",
        answer: "Look at recurring decisions and the conditions around them: what work gets capacity, which exceptions are handled differently, and whether teams can explain why. Use measures as prompts for inquiry, alongside examples from the work; no single indicator proves that a strategy is taking hold.",
      },
    ],
  },
  {
    slug: "a-practical-guide-to-digital-transformation",
    title: "A practical guide to digital transformation",
    category: "Transformation",
    date: "September 17, 2026",
    datePublished: "2026-09-17",
    author: "Alderwick Editorial Team",
    readingTime: "5 min read",
    summary: "A practical transformation starts with a service or operational need, then aligns technology, process, ownership, and learning around a better outcome.",
    image: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1400&q=85",
    imageAlt: "A team collaborating in a bright, modern workspace",
    introduction: "Digital transformation is often described through platforms, integrations, and delivery milestones. Those are important means, but they do not by themselves define success. A useful transformation improves a service or makes essential work more reliable, understandable, or manageable. Reaching that outcome calls for attention to the whole system: people, processes, technology, decision rights, and the support that sustains a new way of working.",
    sections: [
      {
        heading: "Define the problem before selecting a solution",
        paragraphs: [
          "Begin with a specific need, such as helping a customer complete a request or enabling an employee to find a dependable answer. Trace how that work moves from the initial need to a satisfactory result. Include handoffs, decisions, exceptions, rework, and informal workarounds, because these often explain why a process feels harder than its formal description suggests.",
          "Keep the investigation proportionate. A focused view of one important journey or operational task can reveal where delay, duplication, or uncertainty originates. Speak with people who do and receive the work, and distinguish confirmed problems from assumptions that still need to be tested.",
        ],
      },
      {
        heading: "Design the service and technology together",
        paragraphs: [
          "A new tool can make one step easier while shifting effort elsewhere. Consider the end-to-end experience for customers, frontline staff, managers, and support teams. Decide which parts should be self-service, where human judgment is important, what information needs to travel between steps, and how people recover when something goes wrong.",
          "Use sketches, prototypes, sample workflows, or short trials to test the riskiest assumptions before making large commitments. Include security, accessibility, data quality, and integration needs in those conversations. Early testing can slow an individual decision, but it may prevent teams from scaling a design that does not fit the real work.",
        ],
      },
      {
        heading: "Plan for trade-offs and operational change",
        paragraphs: [
          "New capabilities can change who makes decisions, which roles handle exceptions, what skills are needed, and how support is provided. Make those consequences part of the design and delivery plan. Set out what will change, what will stay stable, who owns the service after launch, and how employees can raise issues and receive answers.",
          "Be explicit about trade-offs. Automation may reduce repetitive effort but require stronger exception handling; a common platform may improve consistency but limit some local flexibility. The right balance depends on the service need and constraints. Document the reasoning so that affected teams understand the choice and can identify when it no longer works.",
        ],
      },
      {
        heading: "Deliver in learnable steps, not just milestones",
        paragraphs: [
          "Break delivery into steps that produce something people can use and assess. Each step should test a meaningful question: does the change solve the stated need, can the team operate it, and are important risks controlled? Keep a route to pause or adjust if results or new information do not support the original plan.",
          "Hypothetical example: an organization is considering a digital appointment-request process. A limited trial with a defined group could test whether instructions are understandable, how staff handle incomplete requests, and whether the existing scheduling process can absorb the work. The example is illustrative, not a claim about a real organization.",
        ],
      },
      {
        heading: "A five-step path from need to sustained service",
        paragraphs: [
          "Use this sequence to keep the effort grounded. Record the decision at each step so new information can change the plan.",
          "The sequence is a guide, not a promise that delivery will be linear. Legal, security, accessibility, procurement, integration, or policy constraints may require additional review or a different order. Bring the relevant specialists in early enough to shape options, while keeping the core question—whether the service need is being met—visible throughout.",
        ],
        steps: [
          "Describe the user or operational need and how it is currently met.",
          "Map the journey, including exceptions and handoffs.",
          "Identify the riskiest assumptions and test them with the people affected.",
          "Deliver a bounded change with named operational owners and support.",
          "Review outcomes and unintended effects before deciding whether to adapt, extend, or stop.",
        ],
      },
      {
        heading: "Measure outcomes and sustain ownership",
        paragraphs: [
          "Choose a small set of measures connected to the problem the transformation is meant to address. Pair indicators of service quality or effort with operational measures that help explain what is happening. Establish a baseline where practical, define who reviews the information, and agree what would trigger investigation or a change in direction.",
          "Launch is a transition, not the finish line. Make ongoing ownership, maintenance, training, and feedback part of the operating model. A regular review gives teams a way to resolve friction and improve the service as needs, policy, and technology change.",
        ],
      },
      {
        heading: "Balance ambition with delivery limits",
        paragraphs: [
          "A pilot can expose usability and process issues, but it may not represent every user, operating condition, or integration challenge. State what the trial can and cannot tell you, who was included, and what evidence is still needed before a broader rollout. Avoid treating a successful demonstration as proof of long-term reliability or adoption.",
          "There are real trade-offs in sequencing. A tightly controlled release can reduce exposure but delay benefits; a shared platform can support consistency but demand difficult migration and change work. Compare options against the original need, ongoing support capacity, and the cost of reversibility—not novelty alone.",
        ],
      },
    ],
    takeaways: [
      "Write down the user or operational need in concrete terms before committing to a technology answer.",
      "Map the work around it, test consequential assumptions early, and make responsibilities and trade-offs visible to the people affected.",
      "Deliver in steps that create evidence, not just activity; a service needs clear ownership after launch.",
    ],
    faqs: [
      {
        question: "Should an organization select technology before mapping the service?",
        answer: "Usually, first understand the need and the work around it. A known platform or policy constraint may narrow the options, but mapping handoffs and exceptions helps distinguish a genuine capability gap from a process problem that software alone would not resolve.",
      },
      {
        question: "What should a transformation pilot prove?",
        answer: "A pilot should answer a defined set of questions about the intended outcome, usability, operational support, and important risks. It cannot prove every future condition; document its scope and limits, then decide what further testing or safeguards are needed before expanding.",
      },
    ],
  },
  {
    slug: "building-customer-experiences-across-channels",
    title: "Building customer experiences across channels",
    category: "Customer experience",
    date: "August 26, 2026",
    datePublished: "2026-08-26",
    author: "Alderwick Editorial Team",
    readingTime: "5 min read",
    summary: "Connected service depends on preserving context, clarifying ownership, and making handoffs work across digital and human channels.",
    image: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1400&q=85",
    imageAlt: "A service team discussing customer needs in a meeting",
    introduction: "Customers may begin a task online, ask a person for help, and return later through another channel. Their need remains the same even as the route changes. A coherent experience does not require every channel to behave identically; it requires people to understand what happens next, relevant context to be available, and a clear way to get help when the expected route fails.",
    sections: [
      {
        heading: "Map journeys around customer needs",
        paragraphs: [
          "Choose a few important customer needs and trace the steps people take to address them, including the channels they move between. Pay attention to repeated questions, uncertain waits, conflicting instructions, and moments when a person must switch routes because the original one did not work. Include the operational steps behind the visible interactions, since a confusing handoff may begin with an unclear internal process.",
          "Do not assume the preferred journey is the only journey. People may need a phone call, an accessible alternative, or help from a staff member. A useful map records both the intended path and the exceptions people encounter, without treating every variation as a design failure.",
        ],
      },
      {
        heading: "Make continuity practical at each handoff",
        paragraphs: [
          "Continuity depends on clear ownership for the next step and a dependable way to carry relevant context forward. Define what information is necessary for a handoff, who can access it, and how the customer will know that the request has moved. Collect only information that serves a clear purpose, and handle it in line with applicable privacy and access requirements.",
          "Set expectations in plain language: what will happen next, who is responsible, and when the customer should act or expect an update. If a handoff is delayed, provide a recovery route rather than leaving the person to guess. These small agreements help channels feel connected even when their tools and teams differ.",
        ],
      },
      {
        heading: "A five-step review of a cross-channel journey",
        paragraphs: [
          "Choose one customer need and walk through the journey as a person would. Invite staff who handle exceptions as well as those who design the standard process.",
          "Hypothetical example: someone begins a change-of-address request online but cannot verify one detail. A connected service might preserve the completed information, explain why a staff check is needed, and let the next colleague see what remains unresolved. This illustrates a design principle; it does not describe an actual service or its results.",
        ],
        steps: [
          "Identify the starting point and the successful outcome.",
          "List each channel, team, and decision involved.",
          "Mark where context, ownership, or expectations change.",
          "Agree on the smallest useful improvement and who will deliver it.",
          "Follow the whole journey after the change, including the route for people who need assistance.",
        ],
      },
      {
        heading: "Balance consistency with judgment",
        paragraphs: [
          "A common process can make a service easier to understand, but rigid standardization can fail people whose circumstances do not fit the default. Decide which information and outcomes must be consistent, and where staff need discretion to respond to context. Make escalation paths clear so that flexibility does not depend on knowing the right person.",
          "Continuity has limits: not every channel can share every detail, and more data is not automatically better. Collect and transfer only information needed for the next step, define access and retention appropriately, and explain when a customer will need to repeat information. Where systems cannot connect, clear staff guidance and an honest explanation can still make the handoff more understandable.",
        ],
      },
      {
        heading: "Use feedback to improve the whole journey",
        paragraphs: [
          "Bring customer feedback together with observations from the teams delivering the service. Feedback can show where instructions are unclear or confidence is lost; operational evidence can help locate the underlying handoff, policy, or process issue. Neither perspective is complete on its own.",
          "Choose one point of friction, agree on a change small enough to evaluate, and check its effect on the entire journey—not just the channel where it was introduced. A digital shortcut that increases calls elsewhere may have moved the problem rather than solved it. Review unintended effects and make adjustments openly.",
        ],
      },
      {
        heading: "Check for unintended effects before scaling",
        paragraphs: [
          "Improving one channel can shift effort to another. A shorter online form might create more follow-up calls; stricter consistency might make an exception harder to resolve. Before extending a change, review customer feedback and operational signals across the journey, and ask who may have found the new route less accessible or less clear.",
          "Use feedback carefully. A small number of comments can reveal a problem worth investigating, but they do not establish how common it is. Pair individual accounts with service observations and available operational information, and be transparent about what remains uncertain.",
        ],
      },
    ],
    takeaways: [
      "Start with a customer need and follow it across channels; clarify handoff ownership and what context should travel.",
      "Make a clear recovery route available when a step does not go as planned.",
      "Keep the experience consistent where it matters, leave room for judgment and accessible alternatives, and learn from customer and operational feedback.",
    ],
    faqs: [
      {
        question: "Does a connected experience mean every channel should work the same way?",
        answer: "No. Channels can have different strengths and constraints. The goal is to make the outcome, next step, ownership, and essential information coherent, while preserving appropriate choices and human support where they are needed.",
      },
      {
        question: "How should teams prioritize journey improvements?",
        answer: "Start where customers or staff repeatedly encounter uncertainty, repeated effort, or a failed handoff. Confirm the issue with more than one perspective, consider accessibility and privacy implications, and choose a change that can be assessed across the full journey rather than within one channel alone.",
      },
    ],
  },
];

export const services = [
  {
    number: "01",
    title: "Business strategy",
    description: "Clarify strategic direction by making the choices, trade-offs, and priorities explicit. Connect those priorities to resource decisions and everyday team routines so people can act with confidence and leaders can learn where the strategy needs to adapt.",
    details: [
      "Strategy development and refinement",
      "Operating-model and portfolio reviews",
      "Leadership alignment and decision design",
    ],
    image: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1000&q=85",
    alt: "Team reviewing a business plan together",
  },
  {
    number: "02",
    title: "Digital transformation",
    description: "Shape technology-enabled change around a defined customer or operational need. Bring service design, processes, technology, governance, and adoption together, then deliver in learnable steps with clear ownership for outcomes and ongoing improvement.",
    details: [
      "Transformation roadmaps and governance",
      "Service and process redesign",
      "Change planning and adoption support",
    ],
    image: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1000&q=85",
    alt: "Colleagues collaborating around a laptop",
  },
  {
    number: "03",
    title: "Customer experience",
    description: "Understand customer needs across the complete journey, then improve the moments where information, ownership, or support breaks down. Balance coherent digital and human interactions with accessibility, operational realities, and a practical way to measure and refine the service.",
    details: [
      "Customer journey research and mapping",
      "Service design and experience improvement",
      "Measurement frameworks and feedback loops",
    ],
    image: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1000&q=85",
    alt: "Service team planning improvements to customer support",
  },
  {
    number: "04",
    title: "Data and operations",
    description: "Make decisions and operations easier to understand by clarifying process steps, responsibilities, and the information people need. Simplify work where it creates avoidable effort, and establish useful performance signals that help teams act without losing important context.",
    details: [
      "Decision and performance frameworks",
      "Process analysis and simplification",
      "Data-informed operating practices",
    ],
    image: "https://images.unsplash.com/photo-1551836022-d5d88e9218df?auto=format&fit=crop&w=1000&q=85",
    alt: "Analysts discussing information on a shared screen",
  },
];

export const industries = [
  {
    title: "Financial services",
    description: "Financial services teams often need to balance clear customer experiences with controls, operational responsibilities, and complex handoffs. Work can focus on mapping service journeys, clarifying ownership across teams, and making change practical within the relevant governance and risk constraints.",
    focus: "Service and operating-model design",
  },
  {
    title: "Healthcare and life sciences",
    description: "Healthcare and life-sciences services involve connected patient, provider, and operational needs. A thoughtful improvement effort can examine how people navigate a service, where information or responsibilities become unclear, and how teams can coordinate changes while respecting the clinical, privacy, and regulatory context.",
    focus: "Connected care experiences",
  },
  {
    title: "Manufacturing and supply chains",
    description: "Manufacturing and supply-chain work depends on decisions made across planning, production, logistics, and service. Making dependencies, exceptions, and decision ownership more visible can help teams coordinate changes and respond to disruption without treating each function as an isolated process.",
    focus: "Operational coordination",
  },
  {
    title: "Public and social services",
    description: "Public and social services support people with varied circumstances, access needs, and routes to assistance. Improvement can start by making service pathways easier to understand, involving the people who deliver and use them, and planning change around accessibility, accountability, and practical delivery constraints.",
    focus: "Accessible service delivery",
  },
  {
    title: "Technology and business services",
    description: "As technology and business-service offerings change, product decisions, customer expectations, and internal operations need to remain connected. Teams can clarify how work moves across those boundaries, identify where service commitments and delivery processes diverge, and adapt operating practices as needs evolve.",
    focus: "Growth and service evolution",
  },
  {
    title: "Consumer and retail",
    description: "Consumer and retail journeys can cross discovery, purchase, fulfilment, and support in quick succession. Reviewing how digital and human channels share context, set expectations, and handle exceptions can reveal practical ways to reduce friction while keeping service operations workable.",
    focus: "End-to-end customer journeys",
  },
];
