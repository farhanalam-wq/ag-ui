import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "Illustrative privacy-notice draft covering information, purposes, choices, and other topics to adapt and review before publication.",
};

export default function PrivacyPage() {
  return (
    <main id="main-content">
      <PageIntro title="Privacy policy" description="Illustrative draft material explaining common topics a privacy notice may need to address. It is not a statement of an operating organization’s data practices." />
      <section className="legal-section section">
        <div className="container legal-layout">
          <aside className="legal-notice"><strong>Illustrative draft — qualified review required</strong><p>This material is for explanation and drafting support only. It is not a complete privacy policy, legal advice, or a description of verified business practices. Adapt it to the actual organization, data flows, jurisdictions, and applicable requirements, and have qualified privacy and legal professionals review it before use.</p></aside>
          <article className="prose legal-copy">
            <p className="legal-updated">Draft status: illustrative material; publication date and review history must be confirmed by the adopting organization.</p>
            <p>This page outlines subjects that a privacy notice may need to explain. It is not an adopted policy and makes no claim about how Alderwick Advisory or any other organization collects, uses, shares, or protects personal information. Before adapting the material, map the real site, forms, vendors, and data flows; then tailor every statement to evidence and applicable law.</p>
            <p>On this page, the illustrative inquiry form only displays an on-screen confirmation when submitted. It does not transmit or persist the entered content. That description applies to this page’s current form behavior only, not to another site or any separate service.</p>
            <h2>Who and what the notice covers</h2>
            <p>Identify the legal entity responsible for the relevant processing, the website or services covered, and any important limits to the notice’s scope. Explain key terms in plain language and identify where a different notice or contract may apply.</p>
            <h2>Information collected and its source</h2>
            <p>Describe the specific categories of personal information actually handled, whether it comes directly from a person, a device, another organization, or another source, and which features require it. A real notice might need to distinguish information entered into a form from technical logs or information received through a service provider; include only categories verified for the organization.</p>
            <h2>Purposes and legal grounds</h2>
            <p>For each relevant use, explain the purpose and the applicable legal basis where required. Possible purposes can include answering a request or operating a requested service, but these are examples, not claims about the practices on this site. Explain whether providing information is optional or required and what happens if it is not provided, where that is relevant.</p>
            <h2>Cookies and similar technologies</h2>
            <p>Inventory cookies, pixels, local storage, analytics, embedded media, and similar technologies that the real site uses. Explain their purposes, controls, and any consent choices required in the relevant locations. Do not state that tracking is or is not used until the site and its dependencies have been checked.</p>
            <h2>Recipients, service providers, and transfers</h2>
            <p>Explain when information may be disclosed, the recipient categories and reasons, and any safeguards for international transfers that apply. If vendors host the site, provide analytics, or support communications, confirm their roles and the organization’s agreements before describing them.</p>
            <h2>Retention and protection</h2>
            <p>Set out realistic retention periods or the criteria used to determine them, based on the organization’s actual systems and legal obligations. Describe security measures only at a level that is accurate and safe to publish; do not imply that any measure eliminates risk.</p>
            <h2>Individual choices and rights</h2>
            <p>Explain the rights and choices available in each relevant jurisdiction, any limits or exceptions, how to submit a request, what information is needed to verify it, and how to complain to a relevant regulator when applicable. Provide a contact route that the organization has confirmed is monitored and able to handle these requests.</p>
            <h2>Children’s information and sensitive data</h2>
            <p>State the intended audience and explain how the organization handles information about children or sensitive categories if relevant. Confirm applicable age thresholds, consent rules, and safeguards with qualified counsel rather than relying on generic wording.</p>
            <h2>Changes and privacy questions</h2>
            <p>Describe how material updates will be communicated and show the actual effective date and review history. Before publication, replace this guidance with the organization’s confirmed details for privacy inquiries and requests. The <Link href="/contact">contact page</Link> currently contains an illustrative address and a form that does not send messages, so neither should be used to make a real privacy request.</p>
            <p>For the companion illustrative website-terms material, see <Link href="/terms">Terms of use</Link>; use the <Link href="/sitemap">sitemap</Link> to find the other public pages.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
