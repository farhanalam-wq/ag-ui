import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/contact-form";
import { PageIntro } from "@/components/page-intro";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Get in touch with Alderwick Advisory to talk through a business, customer experience, or transformation challenge.",
};

export default function ContactPage() {
  return (
    <main id="main-content">
      <PageIntro
        title="Contact Alderwick Advisory"
        description="Explore the right next step for a business, customer experience, or transformation challenge. The contact details and form on this page are illustrative, not live."
      />
      <section className="section contact-section">
        <div className="container contact-grid">
          <div className="contact-copy">
            <p className="eyebrow">Start with the challenge</p>
            <h2>A useful first conversation begins with what needs to change.</h2>
            <p>Describe the decision, service, or way of working you are exploring, and what a better outcome could look like. You do not need a finished brief: a few points about the context and the people affected are enough to frame the question.</p>
            <div className="contact-detail">
              <span>Illustrative contact detail</span>
              <a href="mailto:hello@alderwick.example">hello@alderwick.example</a>
              <small>This reserved example address is not a working inbox and does not reach Alderwick Advisory.</small>
            </div>
            <div className="contact-detail">
              <span>Helpful context</span>
              <p>A concise outline is enough: the outcome you want, who is affected, what you have tried, and any timing or practical constraints. You can also note whether you are exploring an idea or have a defined initiative. Do not include confidential, sensitive, or personal information, internal documents, or information about another person.</p>
            </div>
            <div className="contact-detail">
              <span>Choosing a topic</span>
              <p>Select the closest area in the form: business strategy, digital transformation, customer experience, data and operations, or something else. If several areas overlap, choose one and briefly describe the connection in your own words.</p>
            </div>
            <h3>Questions before you get in touch?</h3>
            <details>
              <summary>What kinds of challenges can I raise?</summary>
              <p>Topics may include <Link href="/services">business strategy, digital transformation, customer experience, data, and operations</Link>. You can also describe a related question in your own words.</p>
            </details>
            <details>
              <summary>What should I prepare?</summary>
              <p>Think about the decision or change in front of you, the people it affects, what a useful outcome would be, and any known constraints. A detailed brief, budget, or project plan is not needed for this form.</p>
            </details>
            <details>
              <summary>Is this form connected to a team?</summary>
              <p>No. This is an illustrative form only. Submitting it displays an on-page confirmation; the form does not transmit or store your entries, and it cannot arrange a response. The entries remain in your browser page until you leave or refresh it; browser features such as autofill are controlled separately.</p>
            </details>
            <details>
              <summary>What if I entered something by mistake?</summary>
              <p>No message is sent when you submit. You can clear the fields or leave or refresh the page; this form does not provide a way to retrieve or send an entry. Please do not use it to share sensitive or confidential details.</p>
            </details>
            <details>
              <summary>Where can I learn more first?</summary>
              <p>Read about our <Link href="/about">approach</Link>, explore the <Link href="/industries">industry contexts</Link> represented here, or browse the <Link href="/insights">articles and perspectives</Link>.</p>
            </details>
          </div>
          <ContactForm />
        </div>
      </section>
      <section className="contact-next">
        <div className="container contact-next-inner"><div><h2>Still exploring?</h2><p>Learn how Alderwick Advisory approaches change, see the capabilities represented here, or browse practical perspectives.</p></div><Link href="/about" className="text-link">About Alderwick Advisory <span aria-hidden="true">→</span></Link><Link href="/services" className="text-link">Explore services <span aria-hidden="true">→</span></Link><Link href="/insights" className="text-link">Browse insights <span aria-hidden="true">→</span></Link></div>
      </section>
    </main>
  );
}
