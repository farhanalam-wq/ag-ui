import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "Sample terms of use for the Alderwick Advisory website. Review and adapt before publication.",
};

export default function TermsPage() {
  return (
    <main id="main-content">
      <PageIntro title="Terms of use" description="Sample terms for a company website, provided to illustrate an organized and readable legal page." />
      <section className="legal-section section">
        <div className="container legal-layout">
          <aside className="legal-notice"><strong>Sample content for review</strong><p>These terms are not legal advice and have not been reviewed for a real organization or jurisdiction. Have qualified counsel adapt them before publication.</p></aside>
          <article className="prose legal-copy">
            <p className="legal-updated">Sample terms date: October 2026</p>
            <p>These sample terms describe general conditions that a website operator might use to explain access to and use of its public website. They are not a contract prepared for an operating business.</p>
            <h2>Using this website</h2>
            <p>Visitors should use an operating website lawfully and in a way that does not interfere with other people’s access or the website’s normal operation. A real organization should adapt this section to the services it actually provides.</p>
            <h2>Website content</h2>
            <p>Unless otherwise stated, website text, design, and other content may be protected by intellectual property laws. A published version should identify the correct rights holder and accurately describe the permissions available for reuse.</p>
            <h2>Information and examples</h2>
            <p>General information on a company website is not necessarily professional advice or a promise that a particular result will be achieved. This sample site describes a fictional showcase company, and its materials should not be treated as representations about a real provider.</p>
            <h2>Third-party services and links</h2>
            <p>A website may link to third-party sites or services for convenience. The operator should explain whether it controls those services and should avoid implying responsibility for third-party content it does not manage.</p>
            <h2>Availability and changes</h2>
            <p>Website content and features may change over time. A real organization should describe any service commitments separately and should not use this section to replace obligations it has expressly agreed to elsewhere.</p>
            <h2>Disclaimers and liability</h2>
            <p>Any disclaimer or limitation of liability must be accurate, fair, and enforceable under the laws that apply. The wording in this sample is intentionally general and must not be published without appropriate legal review.</p>
            <h2>Updates to these terms</h2>
            <p>An organization should state how it communicates updates and when revised terms take effect. Replace this sample date with the actual date of adoption and keep a record of material changes.</p>
            <h2>Questions</h2>
            <p>Before publication, add the correct contact details for questions about website use and confirm that the relevant team can respond.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
