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
            <p>Describe the specific categories of personal information actually handled, whether it comes directly from a person, a device, another organization, or another source, and which features require it. Depending on the real service, categories might include identifiers and contact details, inquiry or account content, transaction or preference information, device and usage data, or information supplied by a business contact. Distinguish information entered by a person from technical logs, cookies, public sources, and information received through a service provider. State which fields are required or optional and include only categories verified for the organization.</p>
            <h2>Purposes and legal grounds</h2>
            <p>For each relevant use, explain the specific purpose and the applicable legal basis where required, linking each purpose to the categories of information used. Depending on the facts and jurisdiction, possible grounds may include consent, steps requested before entering a contract, performance of a contract, compliance with a legal obligation, protection of vital interests, or legitimate interests balanced against people’s rights. These are drafting prompts, not claims about the practices on this site. Explain whether providing information is optional or required and the practical consequence of not providing it. Where consent is relied upon, explain how to withdraw it without suggesting that withdrawal makes earlier processing unlawful.</p>
            <h2>Cookies and similar technologies</h2>
            <p>Inventory cookies, pixels, local storage, analytics, embedded media, and similar technologies used by the real site, including those set by third parties. For each category, explain its purpose, duration, provider, and whether it is essential or optional where applicable. Describe consent choices, how to change them, and browser controls; browser blocking may affect site functionality and may not replace a consent mechanism required by local law. Do not state that tracking is or is not used until the site, its code, and its dependencies have been checked.</p>
            <h2>Recipients, service providers, and transfers</h2>
            <p>Explain when and why information may be disclosed, identifying recipient categories such as hosting or technology providers, analytics or communications vendors, professional advisers, business partners, public authorities, or parties involved in a corporate transaction only where those categories match actual practice. Distinguish service providers acting on instructions from recipients that determine their own purposes, and describe relevant contractual or other safeguards. Identify countries or regions involved when required. For international transfers, specify the applicable transfer mechanism and how a person can obtain information about safeguards; do not imply that a transfer is protected merely because a vendor has published privacy terms. Confirm vendor roles, locations, and agreements before publication.</p>
            <h2>Retention and protection</h2>
            <p>Set out realistic retention periods for each major category or clear criteria for determining them, based on the actual business need, system capabilities, limitation periods, and legal obligations. Explain when information is deleted, anonymized, or archived and how backups or legal holds are handled where relevant. Describe security measures only at a level that is accurate and safe to publish; do not imply that any measure eliminates risk. Confirm how people will be notified if a legally reportable incident occurs.</p>
            <h2>Individual choices and rights</h2>
            <p>Explain the rights and choices available in each relevant jurisdiction and any conditions or exceptions. Depending on applicable law, these may include access, correction, deletion, restriction, objection, portability, withdrawal of consent, or review of certain automated decisions. Describe how to submit a request, how identity or authority may be verified proportionately, how authorized representatives are handled, and the response timeframe required by law. Explain any right to complain to a relevant regulator. Provide a contact route that the organization has confirmed is monitored and able to handle requests; do not publish an unverified address or promise a response time that has not been operationally confirmed.</p>
            <h2>Automated decisions and profiling</h2>
            <p>Determine whether personal information is used for profiling or decisions made solely by automated means, especially decisions with legal or similarly significant effects. If so, explain the logic at a meaningful level, the information and likely effects involved, and any rights or human-review options required by law. If no such processing occurs, state that only after verifying the systems and vendors in scope.</p>
            <h2>Children’s information and sensitive data</h2>
            <p>State the intended audience and explain whether the service is directed to children or knowingly handles children’s information. Address sensitive or special-category information only if it is actually collected or inferred, and explain the additional legal condition and safeguards where required. Confirm age thresholds, consent rules, and deletion or escalation processes with qualified counsel rather than relying on generic wording.</p>
            <h2>Changes and privacy questions</h2>
            <p>Describe how material updates will be communicated, when they take effect, and show the actual effective date and review history. Explain whether people will be notified directly when a change materially affects their rights or choices, where required. Before publication, replace this guidance with the organization’s confirmed details for privacy inquiries and requests. The <Link href="/contact">contact page</Link> contains an illustrative address and a form that does not transmit or store entries, so neither should be used to make a real privacy request.</p>
            <p>For the companion illustrative website-terms material, see <Link href="/terms">Terms of use</Link>; use the <Link href="/sitemap">sitemap</Link> to find the other public pages.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
