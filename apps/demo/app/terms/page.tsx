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
            <p>Explain any eligibility conditions, account requirements, and permitted uses that genuinely apply. Set clear, proportionate restrictions on unlawful use, impersonation, infringement, harassment, attempts to disrupt or gain unauthorized access to systems, and misuse of forms or accounts. Address automated access, security testing, and user-generated material only as needed for the real service. If access can be restricted or suspended, state the grounds, notice, review, and restoration process accurately and consistently with applicable law; do not reserve unlimited discretion without explaining its limits.</p>
            <h2>Content and intellectual property</h2>
            <p>Identify the actual rights holders and distinguish operator-owned text, images, branding, software, and other material from user submissions and third-party material. Explain the limited permission visitors receive to access and use the site, including any restrictions on copying, adapting, distributing, or commercial reuse; note that exceptions under applicable copyright law remain unaffected. State how permissions or attribution work for material specifically offered for reuse. Do not claim rights the operator does not hold or imply that viewing content transfers ownership.</p>
            <p>If visitors can submit content, specify what rights the operator needs to host, display, or otherwise use it, the scope and duration of any license, and whether that license is revocable. Explain the visitor’s responsibility to have permission to submit it and the process for reporting alleged infringement, including any required counter-notice procedure. Avoid demanding a broader license than the service needs.</p>
            <h2>Information, services, and outcomes</h2>
            <p>Explain the intended scope, source, and limits of website information, including whether it may become outdated and how corrections are handled. Distinguish general editorial content from professional advice, contracted services, or individualized recommendations; make clear that a visitor should not rely on general material as a substitute for advice suited to their circumstances. Avoid guarantees or claims about accuracy, completeness, suitability, or results unless the organization can substantiate and honor them. Any disclaimer must be consistent with mandatory consumer rights and other non-waivable protections.</p>
            <h2>Submissions and privacy</h2>
            <p>If the site accepts messages or other content, specify whether submission creates an account, contract, or confidentiality obligation; what happens next; what response, if any, is offered; and any rules for content provided by visitors. Avoid implying that an unsolicited message is confidential or creates a professional relationship unless that is intended and supported. Explain how the <Link href="/privacy">privacy notice</Link> applies and ensure the form’s behavior matches it. This page’s illustrative <Link href="/contact">contact form</Link> does not transmit or store entries and does not generate a reply.</p>
            <h2>Third-party links and services</h2>
            <p>Identify material third-party links, embeds, integrations, or services and explain the operator’s relationship to them without implying control, sponsorship, or endorsement that does not exist. State that third parties may operate under their own terms and privacy notices, and link to them where appropriate. Explain that availability, accuracy, security, and content of external services are managed by their operators, while avoiding a disclaimer broader than applicable law permits. Review links and integrations regularly and remove or update broken or misleading references.</p>
            <h2>Availability and changes</h2>
            <p>Describe any real commitments about availability, maintenance, support, or technical compatibility. Explain whether access may be interrupted, features changed, or the site discontinued, and any notice or transition process the operator commits to provide. Do not imply that uninterrupted access, backup, or a service-level commitment exists unless one has been agreed and can be met. Explain how material updates to the terms will be communicated, when they take effect, and what happens if a visitor does not accept them.</p>
            <h2>Warranties, liability, and remedies</h2>
            <p>Any warranty exclusion, liability limit, indemnity, or remedy should be tailored to the actual service, clearly defined, and tested against mandatory consumer, privacy, accessibility, and other protections. Address the types of loss covered, any applicable caps or exclusions, exceptions that cannot lawfully be limited, and the remedies available to each party. These provisions are especially jurisdiction-dependent; generic wording is not a substitute for legal review and should not suggest that statutory rights are waived.</p>
            <h2>Governing law and disputes</h2>
            <p>If applicable, specify the governing law, dispute-resolution process, and competent forum only after qualified counsel confirms the choices are permitted and appropriate for the users and places involved. Explain available complaint or escalation routes and preserve any mandatory right to bring a claim before a competent court or regulator.</p>
            <h2>Updates and contact details</h2>
            <p>Replace this guidance with the operator’s identity, actual adoption and effective dates, amendment process, and a verified contact route for terms questions. Explain how notices are delivered and how an earlier version can be reviewed if needed. The address and form currently shown on the <Link href="/contact">contact page</Link> are illustrative and cannot receive inquiries. The <Link href="/sitemap">sitemap</Link> lists the other public pages.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
