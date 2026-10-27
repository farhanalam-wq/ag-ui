import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "Sample privacy policy for the Alderwick Advisory website. Review and adapt before publication.",
};

export default function PrivacyPage() {
  return (
    <main id="main-content">
      <PageIntro title="Privacy policy" description="A sample privacy policy describing how a company website might communicate its approach to personal information." />
      <section className="legal-section section">
        <div className="container legal-layout">
          <aside className="legal-notice"><strong>Sample content for review</strong><p>This policy is illustrative only. It has not been tailored to an operating business, its systems, or applicable legal requirements. Obtain qualified review before publication.</p></aside>
          <article className="prose legal-copy">
            <p className="legal-updated">Sample policy date: October 2026</p>
            <p>This sample policy describes the structure and tone of a website privacy notice. The website shown here is a showcase experience. Its sample inquiry form does not transmit or store submitted information.</p>
            <h2>Information a real website may collect</h2>
            <p>An operating website may receive information that a visitor chooses to provide, such as a name, business email address, and the contents of a message. The information collected depends on the features that the organization actually operates.</p>
            <p>Website operators may also process technical information such as browser type, device details, and pages visited. This sample does not assert that Alderwick Advisory uses analytics, advertising tools, or tracking technologies.</p>
            <h2>How information may be used</h2>
            <p>A real organization should explain its specific purposes, such as responding to an inquiry, delivering a requested service, protecting its website, or meeting a legal obligation. It should not describe uses that are not part of its actual practices.</p>
            <h2>Sharing and service providers</h2>
            <p>Some organizations use service providers to host websites, manage communications, or support business operations. A published policy should identify relevant categories of providers and explain the safeguards and contractual arrangements that apply.</p>
            <h2>Retention and security</h2>
            <p>Personal information should be retained only as long as necessary for documented business or legal purposes. Organizations should describe their retention approach accurately and use appropriate technical and organizational safeguards.</p>
            <h2>Choices and privacy rights</h2>
            <p>Depending on where a person lives, they may have rights to access, correct, delete, or restrict certain uses of their information. A real policy should explain the rights that apply, how to make a request, and how the organization will respond.</p>
            <h2>Children’s information</h2>
            <p>A real organization should state whether its services are intended for children and describe its approach to information relating to children, consistent with applicable law.</p>
            <h2>Changes to this notice</h2>
            <p>If an organization changes its data practices, it should update its policy and explain when the changes take effect. The date and change history should reflect the organization’s actual review process.</p>
            <h2>Contact about privacy</h2>
            <p>Before publication, replace this sample section with the correct contact route for privacy questions and requests. Do not rely on the sample contact information without confirming it is monitored and appropriate.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
