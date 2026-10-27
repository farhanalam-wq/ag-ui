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
        Illustrative form only: all four fields are required to display the confirmation. Use placeholder text, not real contact details or confidential or sensitive information; entries are not transmitted or stored by this form.
      </p>
      <div className="form-grid">
        <label>
          Your name <span>(required)</span>
          <input autoComplete="name" name="name" required />
        </label>
        <label>
          Work email <span>(required)</span>
          <input autoComplete="email" name="email" type="email" required />
        </label>
      </div>
      <label>
        What would you like to discuss? <span>(required)</span>
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
        A little about your needs <span>(required)</span>
        <textarea name="message" rows={5} required />
      </label>
      <div className="form-submit-row">
        <button className="button" type="submit">Preview inquiry <span aria-hidden="true">↗</span></button>
        <span className="form-privacy">This form does not transmit or store entries. Browser autofill, if enabled, is managed by your browser.</span>
      </div>
      {submitted ? (
        <p className="form-confirmation" role="status">
          The on-page confirmation is shown. No information has been sent or saved by this form, and no reply will be generated.
        </p>
      ) : null}
    </form>
  );
}
