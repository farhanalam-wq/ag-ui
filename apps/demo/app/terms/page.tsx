import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "Illustrative website-terms draft covering access, content, links, liability, and other topics for qualified review before publication.",
};

export default function TermsPage() {
  return (
    <main id="main-content">
      <PageIntro title="Terms of use" description="Illustrative drafting guidance on common website-terms topics, not a set of adopted or legally complete terms." />
      <section className="legal-section section">
        <div className="container legal-layout">
          <aside className="legal-notice"><strong>Illustrative draft — qualified review required</strong><p>This material is explanatory only; it is not legal advice, a complete set of terms, or an agreement adopted by an organization. Tailor it to the actual operator, site features, users, and jurisdictions, and have qualified counsel review it before publication or reliance.</p></aside>
          <article className="prose legal-copy">
            <p className="legal-updated">Draft status: illustrative material; adoption date and applicable law must be confirmed by the organization.</p>
            <p>This page describes topics a website operator may need to address when preparing website terms. It is not an operative agreement and does not create terms for using this site. Whether terms are needed, how they become binding, and which provisions are valid depend on the actual service and jurisdiction.</p>
            <h2>Operator, scope, and acceptance</h2>
            <p>A published version should identify the correct operating entity, the website and services covered, who may use them, and how any terms are presented and accepted. Counsel should confirm that the proposed acceptance method is appropriate and legally effective.</p>
            <h2>Access and acceptable use</h2>
            <p>Explain any eligibility conditions, account requirements, permitted uses, and prohibited conduct that genuinely apply. If access can be restricted or suspended, state the grounds and process accurately and consistently with applicable law.</p>
            <h2>Content and intellectual property</h2>
            <p>Identify the actual rights holders and distinguish operator-owned material, user submissions, and third-party material. State what visitors may view, share, or reuse and what permissions or attribution are required; do not claim rights the operator does not hold.</p>
            <h2>Information, services, and outcomes</h2>
            <p>Explain the intended scope and limits of website information, and distinguish general editorial content from professional advice, contracted services, or individualized recommendations. Avoid guarantees or claims about results unless the organization can substantiate and honor them.</p>
            <h2>Submissions and privacy</h2>
            <p>If the site accepts messages or other content, specify what happens after submission, any rules for content provided by visitors, and how privacy information applies. This page’s illustrative <Link href="/contact">contact form</Link> does not transmit or save submissions; terms for a real form must describe its actual behavior and link to an accurate <Link href="/privacy">privacy notice</Link>.</p>
            <h2>Third-party links and services</h2>
            <p>Identify relevant third-party features or links and explain the operator’s relationship to them without implying control or endorsement that does not exist. Separate third-party terms and privacy notices may apply, and should be linked where appropriate.</p>
            <h2>Availability and changes</h2>
            <p>Describe any real commitments about site availability, maintenance, or changes. Do not imply that a service-level commitment exists unless one has been agreed; explain how material updates to the terms will be communicated and when they take effect.</p>
            <h2>Warranties, liability, and remedies</h2>
            <p>Any warranty exclusion, liability limit, indemnity, or remedy should be drafted for the actual service and tested against mandatory consumer, privacy, and other protections. These provisions are especially jurisdiction-dependent; generic wording is not a substitute for legal review.</p>
            <h2>Governing law and disputes</h2>
            <p>If applicable, specify the governing law, dispute-resolution process, and competent forum only after qualified counsel confirms the choices are permitted and appropriate for the users and places involved.</p>
            <h2>Updates and contact details</h2>
            <p>Replace this guidance with the actual adoption date, amendment process, and a verified contact route for terms questions. The address and form currently shown on the <Link href="/contact">contact page</Link> are illustrative and cannot receive inquiries. The <Link href="/sitemap">sitemap</Link> lists the other public pages.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
