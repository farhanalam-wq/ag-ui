import Link from "next/link";

const navigation = [
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/industries", label: "Industries" },
  { href: "/insights", label: "Insights" },
];

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href="/" aria-label="Alderwick Advisory home">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span>Alderwick Advisory</span>
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <Link href={item.href} key={item.href}>{item.label}</Link>
          ))}
          <Link className="button button-small" href="/contact">Talk with us <span aria-hidden="true">↗</span></Link>
        </nav>
        <details className="mobile-menu">
          <summary aria-label="Open navigation"><span /><span /></summary>
          <nav aria-label="Mobile navigation">
            {navigation.map((item) => (
              <Link href={item.href} key={item.href}>{item.label}</Link>
            ))}
            <Link href="/contact">Contact Alderwick Advisory</Link>
            <Link href="/sitemap">Sitemap</Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
