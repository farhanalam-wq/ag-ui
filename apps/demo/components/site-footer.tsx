import Link from "next/link";

const footerGroups = [
  {
    title: "Company",
    links: [
      { href: "/about", label: "About Alderwick Advisory" },
      { href: "/services", label: "Products & services" },
      { href: "/industries", label: "Industries" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Ideas",
    links: [{ href: "/insights", label: "Blog & insights" }],
  },
  {
    title: "Information",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms of use" },
      { href: "/sitemap", label: "Sitemap" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-main">
          <div className="footer-intro">
            <Link className="brand brand-footer" href="/">
              <span className="brand-mark" aria-hidden="true">A</span>
              <span>Alderwick Advisory</span>
            </Link>
            <p>Clear direction. Practical progress.</p>
            <Link className="footer-contact" href="/contact">Start a conversation <span aria-hidden="true">↗</span></Link>
          </div>
          {footerGroups.map((group) => (
            <div className="footer-group" key={group.title}>
              <h2>{group.title}</h2>
              <ul>
                {group.links.map((link) => (
                  <li key={link.href}><Link href={link.href}>{link.label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Alderwick Advisory</span>
          <span>Illustrative company profile. Sample contact and legal details require review before use.</span>
        </div>
      </div>
    </footer>
  );
}
