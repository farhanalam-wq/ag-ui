"use client";

import React, { useState } from "react";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputTools,
  PromptInputBadge,
  PromptInputSubmit,
} from "@/components/ai-elements/prompt-input";
import {
  Building2,
  Layers,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Search,
  Zap,
  Globe,
  DollarSign,
  MapPin,
  Code2,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";


// Demo Indexed Companies Data


interface CompanyTarget {
  id: string;
  name: string;
  domain: string;
  description: string;
  brandColor: string;
  badge: string;
  suggestedQueries: string[];
}

const INDEXED_COMPANIES: CompanyTarget[] = [
  {
    id: "resend",
    name: "Resend",
    domain: "resend.com",
    description: "Email API for developers. Modern delivery platform built for speed and reliability.",
    brandColor: "#3b82f6",
    badge: "17 Chunks • Indexed",
    suggestedQueries: [
      "What are the pricing tiers and sending limits?",
      "What SDKs and programming languages are supported?",
      "How does Resend handle domain verification and DNS records?",
      "What are the contact options and enterprise support SLA?",
    ],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    domain: "anthropic.com",
    description: "AI research and safety company behind Claude, dedicated to building reliable AI systems.",
    brandColor: "#d97706",
    badge: "66 Chunks • Indexed",
    suggestedQueries: [
      "What are Claude 3.5 Sonnet's core capabilities and context limits?",
      "Where are Anthropic's headquarters and research offices located?",
      "What are the enterprise security and safety guidelines?",
      "What are the API pricing rates per million tokens?",
    ],
  },
  {
    id: "redhat",
    name: "Red Hat",
    domain: "redhat.com",
    description: "Enterprise open source solutions, Linux platforms, and hybrid cloud infrastructure.",
    brandColor: "#ef4444",
    badge: "44 Chunks • Indexed",
    suggestedQueries: [
      "What are the main enterprise products and platforms?",
      "Where is Red Hat headquarters located?",
      "What open source community projects does Red Hat sponsor?",
      "How does Red Hat OpenShift pricing and licensing work?",
    ],
  },
  {
    id: "stripe",
    name: "Stripe",
    domain: "stripe.com",
    description: "Financial infrastructure for the internet. Payments, billing, and commerce APIs.",
    brandColor: "#6366f1",
    badge: "Verified • Indexed",
    suggestedQueries: [
      "What are the processing fees for card transactions and billing?",
      "What APIs and SDKs are available for subscription management?",
      "Where are Stripe's dual headquarters located?",
      "What compliance certifications and fraud protection features exist?",
    ],
  },
];

export default function Home() {
  const [selectedCompany, setSelectedCompany] = useState<CompanyTarget>(INDEXED_COMPANIES[0]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"idle" | "ready">("idle");

  const handleSelectCompany = (company: CompanyTarget) => {
    setSelectedCompany(company);
    setQuery("");
  };

  const handleQuerySubmit = (submittedText: string) => {
    setStatus("ready");
    // Static layout verification handler
    console.log(`[ag-ui static] Query submitted for ${selectedCompany.domain}: "${submittedText}"`);
  };

  return (
    <div
      className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col antialiased selection:bg-zinc-800 selection:text-zinc-100"
      style={
        {
          "--brand-primary": selectedCompany.brandColor,
        } as React.CSSProperties
      }
    >
      {/* Background ambient glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 w-[720px] h-[360px] opacity-15 blur-[120px] transition-colors duration-700"
          style={{ backgroundColor: selectedCompany.brandColor }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.1),rgba(255,255,255,0))]" />
      </div>

      {/* Top Navbar */}
      <header className="border-b border-zinc-900/80 bg-zinc-950/70 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-100 font-bold text-sm tracking-tight shadow-inner">
              ag
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm tracking-tight text-zinc-100">ag-ui</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border border-zinc-800 bg-zinc-900 text-zinc-400">
                  Engine
                </span>
              </div>
              <span className="text-[11px] text-zinc-500 font-mono">Company Intelligence</span>
            </div>
          </div>

          {/* Right Status */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-zinc-800 bg-zinc-900/60 text-xs text-zinc-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>pgvector active</span>
            </div>
            <a
              href="http://localhost:3001/health"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors border border-zinc-800 rounded-lg px-2.5 py-1"
            >
              <span>API :3001</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 pt-12 pb-20 flex flex-col items-center">
        {/* Hero Section */}
        <div className="text-center max-w-2xl mx-auto mb-8 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-zinc-800 bg-zinc-900/80 text-xs font-medium text-zinc-400 mb-2">
            <Layers className="w-3.5 h-3.5 text-zinc-400" />
            <span>Hybrid Retrieval &bull; Fact Extraction &bull; Generative UI</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-zinc-100">
            Universal Company Intelligence
          </h1>

          <p className="text-sm sm:text-base text-zinc-400 max-w-xl mx-auto leading-relaxed">
            Instant technical facts, pricing models, developer APIs, and brand-tailored interfaces queried from live indexed vector knowledge.
          </p>
        </div>

        {/* Company Context Selector Pills */}
        <div className="w-full mb-6">
          <div className="flex items-center justify-between mb-2.5 px-1">
            <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 font-mono">
              Select Company Scope
            </span>
            <span className="text-xs text-zinc-500">
              Active: <span className="text-zinc-200 font-mono">{selectedCompany.domain}</span>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {INDEXED_COMPANIES.map((company) => {
              const isSelected = selectedCompany.id === company.id;
              return (
                <button
                  key={company.id}
                  onClick={() => handleSelectCompany(company)}
                  type="button"
                  className={`group relative flex flex-col items-start p-3 rounded-xl border text-left transition-all ${isSelected
                      ? "border-zinc-700 bg-zinc-900/90 shadow-lg shadow-black/40"
                      : "border-zinc-800/80 bg-zinc-950/60 hover:border-zinc-700/80 hover:bg-zinc-900/40 text-zinc-400"
                    }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span
                      className={`font-semibold text-sm ${isSelected ? "text-zinc-100" : "text-zinc-300"
                        }`}
                    >
                      {company.name}
                    </span>
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: company.brandColor }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-zinc-500 group-hover:text-zinc-400 truncate w-full">
                    {company.domain}
                  </span>
                  <span className="text-[10px] mt-2 px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800/80 text-zinc-400">
                    {company.badge}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Prompt Input Centerpiece */}
        <div className="w-full space-y-4">
          <PromptInput
            value={query}
            onValueChange={setQuery}
            onSubmit={handleQuerySubmit}
            className="w-full border-zinc-800 bg-zinc-950/90 shadow-2xl backdrop-blur-2xl"
          >
            <PromptInputBody>
              <PromptInputTextarea
                placeholder={`Ask anything about ${selectedCompany.name} (e.g. pricing tiers, API limits, HQ location)...`}
                className="text-base text-zinc-100 placeholder-zinc-500 py-1"
                minHeight={64}
              />
            </PromptInputBody>

            <PromptInputFooter>
              {/* Left Tools & Badges (Irrelevant upload/media options hidden) */}
              <PromptInputTools>
                <PromptInputBadge
                  icon={Building2}
                  label={selectedCompany.domain}
                  className="bg-zinc-900/90 border-zinc-800 text-zinc-300"
                />
                <PromptInputBadge
                  icon={Layers}
                  label="Hybrid pgvector"
                  className="hidden sm:inline-flex bg-zinc-900/50 border-zinc-800/80 text-zinc-400"
                />
              </PromptInputTools>

              {/* Right Controls */}
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline-block text-[11px] text-zinc-500 font-mono">
                  Return to search
                </span>
                <PromptInputSubmit
                  className="bg-zinc-100 hover:bg-white text-zinc-950"
                  aria-label="Submit prompt"
                />
              </div>
            </PromptInputFooter>
          </PromptInput>

          {/* Suggested Prompt Chips */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-mono">
              <Sparkles className="w-3.5 h-3.5 text-zinc-500" />
              <span>Suggested Inquiries for {selectedCompany.name}:</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {selectedCompany.suggestedQueries.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setQuery(item)}
                  className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-zinc-800/80 bg-zinc-900/60 hover:bg-zinc-800/80 hover:border-zinc-700 text-zinc-300 px-3 py-1.5 transition-all text-left"
                >
                  <span>{item}</span>
                  <ArrowRight className="w-3 h-3 text-zinc-500 opacity-60 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Feature Capability Highlights (Static Architecture Overview) */}
        <div className="w-full mt-16 pt-10 border-t border-zinc-900">
          <div className="text-left mb-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 font-mono">
              Engine Pipeline Architecture
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-zinc-800/70 bg-zinc-900/30 space-y-2">
              <div className="flex items-center gap-2.5 text-zinc-200 font-medium text-sm">
                <div className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700/60 text-zinc-300">
                  <Search className="w-4 h-4" />
                </div>
                <span>Hybrid Vector & Fact Retrieval</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                OpenAI 1536-dimensional HNSW cosine index combined with deterministic fact extraction for zero-hallucination accuracy.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-zinc-800/70 bg-zinc-900/30 space-y-2">
              <div className="flex items-center gap-2.5 text-zinc-200 font-medium text-sm">
                <div className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700/60 text-zinc-300">
                  <Code2 className="w-4 h-4" />
                </div>
                <span>Brand-Adaptive Generative UI</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Automatic extraction of brand hex palettes, typography, and logos, dynamically rendering native interactive React cards.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-zinc-800/70 bg-zinc-900/30 space-y-2">
              <div className="flex items-center gap-2.5 text-zinc-200 font-medium text-sm">
                <div className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700/60 text-zinc-300">
                  <Zap className="w-4 h-4" />
                </div>
                <span>Real-Time SSE Streaming</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Sub-100ms first token latency streaming structured text, tool invocation payloads, and source chunk attribution.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-zinc-800/70 bg-zinc-900/30 space-y-2">
              <div className="flex items-center gap-2.5 text-zinc-200 font-medium text-sm">
                <div className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700/60 text-zinc-300">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <span>Verified Source Attribution</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Every factual claim is cross-verified against indexed page snapshots with clickable source URLs and chunk indices.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900/80 py-6 text-center text-xs text-zinc-600 font-mono">
        ag-ui &bull; Multimodal Company Intelligence Platform &bull; Bun Workspace
      </footer>
    </div>
  );
}
