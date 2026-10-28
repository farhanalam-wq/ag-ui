import { articles, industries, services } from "@/lib/content";
import { routeSlug } from "@/lib/route-slug";

export const sitePageGroups = [
  {
    title: "Company",
    pages: [
      { href: "/", label: "Home", description: "An overview of Alderwick Advisory, its transformation focus, and featured services and perspectives." },
      { href: "/about", label: "About us", description: "The practice’s purpose, working principles, and approach to helping organizations navigate change." },
      { href: "/services", label: "Products & services", description: "Areas of work covering business strategy, digital transformation, customer experience, and data and operations." },
      { href: "/industries", label: "Industries", description: "Example sector contexts and the customer, operational, and organizational questions that can arise in them." },
      { href: "/contact", label: "Contact us", description: "Guidance on framing an inquiry and an explicitly illustrative contact detail and form that do not reach a live team." },
    ],
  },
  {
    title: "Information",
    pages: [
      { href: "/insights", label: "Blog & insights", description: "Practical articles on strategy, digital transformation, and connected customer experiences." },
      { href: "/privacy", label: "Privacy policy", description: "Illustrative privacy-notice topics and drafting guidance; not a complete or adopted policy." },
      { href: "/terms", label: "Terms of use", description: "Illustrative website-terms topics and drafting guidance; not operative terms or legal advice." },
      { href: "/sitemap", label: "Sitemap", description: "A categorized guide to public pages, service and industry sections, and published articles." },
    ],
  },
] as const;

export const articleCategories = [
  ...new Set(articles.map((article) => article.category)),
];

export const publicSitePaths = [
  ...sitePageGroups.flatMap((group) => group.pages.map((page) => page.href)),
  ...services.map((service) => `/services/${routeSlug(service.title)}`),
  ...industries.map((industry) => `/industries/${routeSlug(industry.title)}`),
  ...articleCategories.map((category) => `/insights/category/${routeSlug(category)}`),
  ...articles.map((article) => `/insights/${article.slug}`),
];
