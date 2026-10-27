"use client";

import { FormEvent, useState } from "react";

export function ContactForm() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit}>
      <p className="form-showcase-note">
        This sample form is for presentation purposes only. Submissions are not sent or stored.
      </p>
      <div className="form-grid">
        <label>
          Your name
          <input autoComplete="name" name="name" required />
        </label>
        <label>
          Work email
          <input autoComplete="email" name="email" type="email" required />
        </label>
      </div>
      <label>
        What would you like to discuss?
        <select defaultValue="" name="topic" required>
          <option disabled value="">Choose a topic</option>
          <option>Business strategy</option>
          <option>Digital transformation</option>
          <option>Customer experience</option>
          <option>Data and operations</option>
          <option>Something else</option>
        </select>
      </label>
      <label>
        A little about your needs
        <textarea name="message" rows={5} required />
      </label>
      <div className="form-submit-row">
        <button className="button" type="submit">Send inquiry <span aria-hidden="true">↗</span></button>
        <span className="form-privacy">No backend is connected to this sample form.</span>
      </div>
      {submitted ? (
        <p className="form-confirmation" role="status">
          Thank you for your interest. This sample form does not send or save your information.
        </p>
      ) : null}
    </form>
  );
}
