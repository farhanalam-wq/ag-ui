export type ArticleSection = {
  heading: string;
  paragraphs: string[];
};

export type Article = {
  slug: string;
  title: string;
  category: string;
  date: string;
  readingTime: string;
  summary: string;
  image: string;
  imageAlt: string;
  introduction: string;
  sections: ArticleSection[];
};

export const articles: Article[] = [
  {
    slug: "turning-strategy-into-everyday-decisions",
    title: "Turning strategy into everyday decisions",
    category: "Strategy",
    date: "October 8, 2026",
    readingTime: "6 min read",
    summary: "A strategy creates value when people can use it to make better choices in the work already in front of them.",
    image: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1400&q=85",
    imageAlt: "Colleagues working through plans together around a table",
    introduction: "Many organizations invest careful thought in their strategy, then struggle to connect it to the thousands of decisions made across the business each week. The issue is rarely a lack of ambition. More often, teams have not been given a practical way to translate priorities into choices.",
    sections: [
      {
        heading: "Make the choices explicit",
        paragraphs: [
          "A strategy is useful when it helps someone decide what to do next. Start by describing the trade-offs the organization is prepared to make. If customer response time matters more than a short-term reduction in operating cost, teams should be able to recognize what that means in a real decision.",
          "Clear choices make priorities easier to remember and easier to question. They also reveal where a strategy is asking teams to work against the incentives or processes they have today.",
        ],
      },
      {
        heading: "Connect priorities to real work",
        paragraphs: [
          "Translate broad priorities into a small number of observable changes in day-to-day work. That might mean changing how a team handles an exception, how a manager allocates capacity, or which customer problems receive attention first.",
          "The goal is not to turn strategy into a long instruction manual. It is to make the connection between a priority and the next practical action clear enough for people to use without a special meeting.",
        ],
      },
      {
        heading: "Learn from the decisions being made",
        paragraphs: [
          "Implementation should create a feedback loop. Ask teams which choices have become easier, where the guidance is unclear, and what new constraints have appeared. Treat those observations as information about the strategy in practice, not as resistance to it.",
          "When leaders review this evidence regularly, they can adjust assumptions early and reinforce the decisions that are moving the organization in the intended direction.",
        ],
      },
      {
        heading: "A practical starting point",
        paragraphs: [
          "Choose one priority and examine a recent decision that affected it. Reconstruct what information was available, which trade-offs were understood, and what made the decision hard. Use that example to improve the guidance before expanding the approach.",
          "Strategy becomes more durable when it helps people act with confidence in ordinary moments, not only when it appears in a presentation.",
        ],
      },
    ],
  },
  {
    slug: "a-practical-guide-to-digital-transformation",
    title: "A practical guide to digital transformation",
    category: "Transformation",
    date: "September 17, 2026",
    readingTime: "7 min read",
    summary: "Digital change works best when it begins with a clearer experience for the people doing and receiving the work.",
    image: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1400&q=85",
    imageAlt: "A team collaborating in a bright, modern workspace",
    introduction: "Digital transformation can quickly become a catalogue of platforms, integrations, and delivery milestones. Those elements matter, but they are not the outcome. The outcome is a better way to serve customers and support the people responsible for the work.",
    sections: [
      {
        heading: "Start with the work, not the tool",
        paragraphs: [
          "Map how an important task moves from the first request to a useful result. Include the handoffs, decisions, exceptions, and workarounds people rely on. This gives the team a shared view of where delay and uncertainty actually enter the process.",
          "The map need not describe everything. A focused view of one meaningful customer or employee journey is often enough to identify a worthwhile first improvement.",
        ],
      },
      {
        heading: "Design around the people involved",
        paragraphs: [
          "Different groups experience the same process differently. A new system might simplify reporting for one team while adding steps for another. Bring those perspectives into the design early, especially where work changes hands.",
          "Prototypes, short working sessions, and observation of real tasks can expose assumptions before they become expensive commitments.",
        ],
      },
      {
        heading: "Change the operating model alongside the technology",
        paragraphs: [
          "New capabilities often alter responsibilities, decision rights, and support needs. Make those changes part of the delivery plan rather than leaving them for a later adoption phase.",
          "Leaders should be able to explain what will change, what will remain stable, and how employees can raise issues as the new way of working takes shape.",
        ],
      },
      {
        heading: "Measure the result that matters",
        paragraphs: [
          "Choose a small set of measures tied to the experience or operational issue the work is intended to improve. Establish how those measures will be observed and who can act when results differ from expectations.",
          "A useful transformation plan treats learning as part of delivery. Teams can then refine the service as evidence arrives instead of assuming that launch marks the end of the work.",
        ],
      },
    ],
  },
  {
    slug: "building-customer-experiences-across-channels",
    title: "Building customer experiences across channels",
    category: "Customer experience",
    date: "August 26, 2026",
    readingTime: "5 min read",
    summary: "A connected experience depends less on using the same channel everywhere and more on helping customers continue without starting over.",
    image: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=1400&q=85",
    imageAlt: "A service team discussing customer needs in a meeting",
    introduction: "Customers move between websites, service teams, apps, and in-person interactions as their needs change. They do not experience these as separate channels. They experience one organization, and they notice when context disappears between one interaction and the next.",
    sections: [
      {
        heading: "Understand the handoffs",
        paragraphs: [
          "Begin by tracing a few common journeys across channels. Pay particular attention to moments when a customer has to repeat information, wait without knowing what happens next, or change their approach because the original route did not work.",
          "These handoffs often reveal more about the quality of an experience than any individual screen or service conversation.",
        ],
      },
      {
        heading: "Create continuity with clear ownership",
        paragraphs: [
          "Continuity does not require every channel to look or behave exactly alike. It does require clear responsibility for the next step and a reliable way to carry relevant context forward.",
          "Teams can define what information must accompany a handoff, how customers are kept informed, and what happens when the intended next step is delayed.",
        ],
      },
      {
        heading: "Make exceptions part of the design",
        paragraphs: [
          "Journeys rarely follow a perfect sequence. Customers may change their minds, miss a step, or need help from a person. Designing these exceptions deliberately prevents edge cases from becoming dead ends.",
          "Review the experience with people who understand both the service rules and the day-to-day work. Their combined perspective can help make a journey clear without making it rigid.",
        ],
      },
      {
        heading: "Improve the experience over time",
        paragraphs: [
          "Use customer feedback and operational observations together. Feedback shows how the experience feels; operational evidence helps explain which parts of the process are creating friction.",
          "A manageable improvement cycle gives teams a way to test changes, understand their effect, and keep the journey useful as customer expectations and business needs evolve.",
        ],
      },
    ],
  },
];

export const services = [
  {
    number: "01",
    title: "Business strategy",
    description: "Clarify the direction, choices, and priorities that help teams focus on the outcomes that matter.",
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
    description: "Shape technology-enabled change around real needs, workable processes, and lasting adoption.",
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
    description: "Make it easier for customers to get the help, information, and continuity they need.",
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
    description: "Turn fragmented information and complex processes into clearer, more useful ways of working.",
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
    description: "Improve service journeys, clarify complex operating processes, and coordinate change across regulated, customer-facing teams.",
    focus: "Service and operating-model design",
  },
  {
    title: "Healthcare and life sciences",
    description: "Connect patient, provider, and operational perspectives to make essential services easier to navigate and support.",
    focus: "Connected care experiences",
  },
  {
    title: "Manufacturing and supply chains",
    description: "Help teams work across planning, operations, and service boundaries with better visibility into decisions and dependencies.",
    focus: "Operational coordination",
  },
  {
    title: "Public and social services",
    description: "Design clearer service pathways and practical change approaches for organizations with diverse community needs.",
    focus: "Accessible service delivery",
  },
  {
    title: "Technology and business services",
    description: "Align product, customer, and internal operations as offerings and ways of working evolve.",
    focus: "Growth and service evolution",
  },
  {
    title: "Consumer and retail",
    description: "Bring digital and human interactions together so customers can move between discovery, purchase, and support more easily.",
    focus: "End-to-end customer journeys",
  },
];
