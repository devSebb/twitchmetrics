"use client";

import { useState } from "react";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { CONTACT_TOPICS, type ContactTopic } from "@/lib/constants/contact";

type FormState = "idle" | "submitting" | "success" | "error";

const INPUT_CLASS =
  "w-full rounded-lg border border-[#3F4147] bg-[#1E1F22] px-4 py-2.5 text-sm text-[#DBDEE1] placeholder-[#949BA4] outline-none transition-colors focus:border-[#E32C19]/50";

const LABEL_CLASS = "mb-1 block text-sm font-medium text-[#DBDEE1]";

export function ContactForm() {
  const [state, setState] = useState<FormState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [topic, setTopic] = useState<ContactTopic>(CONTACT_TOPICS[0]);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("submitting");
    setError(null);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, company, topic, message }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Something went wrong. Please try again.");
        setState("error");
        return;
      }

      setState("success");
    } catch {
      setError("Something went wrong. Please try again.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <CheckCircle size={40} weight="fill" className="text-[#22c55e]" />
        <h3 className="text-lg font-semibold text-[#F2F3F5]">Message sent</h3>
        <p className="max-w-sm text-sm leading-relaxed text-[#949BA4]">
          Thanks for reaching out, {name.split(" ")[0] || "there"}. Our team
          reads every message and will get back to you at {email} within one
          business day.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-name" className={LABEL_CLASS}>
            Name
          </label>
          <input
            id="contact-name"
            type="text"
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="contact-email" className={LABEL_CLASS}>
            Email
          </label>
          <input
            id="contact-email"
            type="email"
            required
            maxLength={320}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className={INPUT_CLASS}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="contact-company" className={LABEL_CLASS}>
            Company{" "}
            <span className="font-normal text-[#949BA4]">(optional)</span>
          </label>
          <input
            id="contact-company"
            type="text"
            maxLength={200}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Your company"
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="contact-topic" className={LABEL_CLASS}>
            Topic
          </label>
          <select
            id="contact-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value as ContactTopic)}
            className={INPUT_CLASS}
          >
            {CONTACT_TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="contact-message" className={LABEL_CLASS}>
          Message
        </label>
        <textarea
          id="contact-message"
          required
          rows={5}
          maxLength={4000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us what you need — the more detail, the faster we can help."
          className={`${INPUT_CLASS} resize-y`}
        />
      </div>

      {state === "error" && error && (
        <p role="alert" className="text-sm text-[#ef4444]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={state === "submitting"}
        className="w-full rounded-lg bg-[#E32C19] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#C72615] disabled:opacity-50"
      >
        {state === "submitting" ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
