import type { Metadata } from "next";
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
        description="Tell us what you are working through. A clear description of the challenge is a useful place to begin."
      />
      <section className="section contact-section">
        <div className="container contact-grid">
          <div className="contact-copy">
            <p className="eyebrow">Let’s begin</p>
            <h2>A good conversation starts with the real question.</h2>
            <p>Share a little about the change, decision, or experience you want to improve. This showcase page does not connect to a live inbox, but it gives a clear view of the inquiry experience.</p>
            <div className="contact-detail">
              <span>General inquiries</span>
              <a href="mailto:hello@alderwick.example">hello@alderwick.example</a>
              <small>Sample email address for presentation purposes only</small>
            </div>
            <div className="contact-detail">
              <span>What to include</span>
              <p>A brief outline of the situation, the people involved, and what a better outcome might look like.</p>
            </div>
          </div>
          <ContactForm />
        </div>
      </section>
      <section className="contact-next">
        <div className="container contact-next-inner"><div><h2>Still exploring?</h2><p>Learn how Alderwick Advisory approaches change or browse our latest perspectives.</p></div><a href="/about" className="text-link">About Alderwick Advisory <span aria-hidden="true">→</span></a><a href="/insights" className="text-link">Browse insights <span aria-hidden="true">→</span></a></div>
      </section>
    </main>
  );
}
