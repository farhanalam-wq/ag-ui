"use client";

import * as React from "react";
import Link from "next/link";
import { Renderer } from "@openuidev/react-lang";
import { openuiLibrary, ThemeProvider, defaultDarkTheme } from "@openuidev/react-ui";
import "@openuidev/react-ui/defaults.css";
import "@openuidev/react-ui/components.css";
import {
  Sparkle,
  ArrowLeft,
  Play,
  ArrowCounterClockwise,
  ChartBar,
  CreditCard,
  Rows,
  Lightning,
  CheckCircle,
} from "@phosphor-icons/react";

const PRESET_EXAMPLES = [
  {
    id: "pricing",
    name: "Pricing Tiers",
    icon: CreditCard,
    code: `root = Stack([title, subtitle, plans])
title = TextContent("Resend Pricing Plans", "large-heavy")
subtitle = TextContent("Transparent pricing built for fast-growing engineering teams.", "medium")
plans = Table([Col("Plan", names), Col("Price", prices), Col("Monthly Emails", limits), Col("Dedicated IP", dedicated)])
names = ["Free Hobby", "Pro Developer", "Business Scale", "Enterprise"]
prices = ["$0 / mo", "$20 / mo", "$100 / mo", "Custom"]
limits = ["3,000 emails", "50,000 emails", "250,000 emails", "Unlimited"]
dedicated = ["Shared Pool", "Addon $30/mo", "Included (1 IP)", "Multi-Region Included"]`,
  },
  {
    id: "metrics",
    name: "Deliverability Analytics",
    icon: ChartBar,
    code: `root = Stack([title, chart, note])
title = TextContent("Monthly Email Volume & Delivery Rate", "large-heavy")
chart = BarChart(months, [delivered, bounced], "grouped")
months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"]
delivered = Series("Delivered (k)", [450, 680, 890, 1200, 1650, 2100])
bounced = Series("Bounced (k)", [2, 3, 4, 5, 6, 7])
note = Callout("success", "99.8% Inbox Placement", "Delivery rates remain industry-leading across major webmail providers (Gmail, Microsoft 365, Apple Mail).")`,
  },
  {
    id: "features",
    name: "Feature Comparison Tabs",
    icon: Rows,
    code: `root = Stack([title, tabs])
title = TextContent("Architecture & Protocol Support", "large-heavy")
tabs = Tabs([tabSmtp, tabHttp, tabWebhooks])
tabSmtp = TabItem("smtp", "SMTP Relay", smtpContent)
tabHttp = TabItem("http", "REST API", httpContent)
tabWebhooks = TabItem("webhooks", "Real-Time Webhooks", webhooksContent)
smtpContent = [TextContent("Drop-in SMTP relay compatible with any standard client or framework. Port 465/587 TLS supported."), Callout("info", "TLS Required", "All outbound traffic is encrypted in transit via TLS 1.3.")]
httpContent = [TextContent("Ultra-low latency HTTP API with native SDKs for Node.js, Python, Go, Ruby, and Elixir."), Callout("success", "Batch Sending", "Send up to 100 individualized emails in a single HTTP request.")]
webhooksContent = [TextContent("Real-time event webhooks with Svix cryptographic signature verification for delivered, opened, clicked, and bounced events.")]`,
  },
];

export default function OpenUIPreviewPage() {
  const [selectedExample, setSelectedExample] = React.useState(PRESET_EXAMPLES[0]);
  const [code, setCode] = React.useState(PRESET_EXAMPLES[0].code);
  const [isSimulatingStream, setIsSimulatingStream] = React.useState(false);
  const [streamedCode, setStreamedCode] = React.useState(PRESET_EXAMPLES[0].code);

  // Handle preset selection
  const handleSelectPreset = (ex: (typeof PRESET_EXAMPLES)[0]) => {
    setSelectedExample(ex);
    setCode(ex.code);
    setStreamedCode(ex.code);
    setIsSimulatingStream(false);
  };

  // Simulate token-by-token progressive streaming
  const handleSimulateStream = () => {
    setIsSimulatingStream(true);
    setStreamedCode("");
    const lines = code.split("\n");
    let current = "";
    let lineIdx = 0;

    const interval = setInterval(() => {
      if (lineIdx < lines.length) {
        current += (lineIdx === 0 ? "" : "\n") + lines[lineIdx];
        setStreamedCode(current);
        lineIdx++;
      } else {
        clearInterval(interval);
        setIsSimulatingStream(false);
      }
    }, 350);
  };

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100 antialiased p-4 sm:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Navigation & Breadcrumbs */}
        <header className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-zinc-900">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              <ArrowLeft className="size-3.5" />
              <span>Back to Chat</span>
            </Link>
            <div className="h-4 w-px bg-zinc-800" />
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs font-mono">
              <Sparkle className="size-3.5 animate-pulse" />
              <span>OpenUI v0.13 Engine Active</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSimulateStream}
              disabled={isSimulatingStream}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium transition-colors shadow-lg shadow-blue-500/20"
            >
              <Play className="size-3.5" />
              <span>{isSimulatingStream ? "Streaming Tokens..." : "Simulate Live Stream"}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setStreamedCode(code);
                setIsSimulatingStream(false);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Reset view"
            >
              <ArrowCounterClockwise className="size-3.5" />
            </button>
          </div>
        </header>

        {/* Hero Section */}
        <div className="space-y-1.5">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100 flex items-center gap-2.5">
            <span>OpenUI Generative UI Showcase</span>
            <span className="text-xs px-2 py-0.5 rounded border border-zinc-800 bg-zinc-900 text-zinc-400 font-mono font-normal">
              MIT Open Source
            </span>
          </h1>
          <p className="text-sm text-zinc-400 max-w-3xl leading-relaxed">
            Testing progressive OpenUI Lang token execution with built-in streaming components under our dark zinc theme.
            Observe how child nodes mount progressively without buffering large JSON payloads.
          </p>
        </div>

        {/* Preset Selector */}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <span className="text-xs text-zinc-500 font-mono mr-1">Select Preset:</span>
          {PRESET_EXAMPLES.map((ex) => {
            const Icon = ex.icon;
            const isSelected = selectedExample.id === ex.id;
            return (
              <button
                key={ex.id}
                type="button"
                onClick={() => handleSelectPreset(ex)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isSelected
                    ? "border border-blue-500/60 bg-blue-500/10 text-blue-400 shadow-sm"
                    : "border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Icon className="size-3.5" />
                <span>{ex.name}</span>
                {isSelected && <CheckCircle className="size-3 text-blue-400 ml-1" />}
              </button>
            );
          })}
        </div>

        {/* Dual Panel Workspace: Code Editor vs Live Progressive Renderer */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
          {/* Left Panel: OpenUI Lang Code Input */}
          <div className="lg:col-span-5 flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-mono text-zinc-300">
                <Lightning className="size-3.5 text-amber-400" />
                <span>OpenUI Lang Source</span>
              </div>
              <span className="text-[11px] font-mono text-zinc-500">
                {code.split("\n").length} lines &bull; ~67% fewer tokens than JSON
              </span>
            </div>

            <textarea
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setStreamedCode(e.target.value);
              }}
              rows={16}
              className="w-full flex-1 rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 text-xs font-mono text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 resize-none leading-relaxed selection:bg-blue-500/30"
              spellCheck={false}
            />

            <div className="text-[11px] text-zinc-500 space-y-1 font-mono">
              <p>&bull; Line syntax: <code className="text-zinc-400">identifier = Component(...)</code></p>
              <p>&bull; Root declaration: <code className="text-zinc-400">root = Stack([child1, child2])</code></p>
            </div>
          </div>

          {/* Right Panel: Live Generative UI Canvas */}
          <div className="lg:col-span-7 flex flex-col rounded-2xl border border-zinc-800 bg-zinc-900/20 p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
              <div className="flex items-center gap-2 text-xs font-mono text-zinc-300">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Live Progressive Canvas</span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
                <span>Theme: <span className="text-zinc-300">Dark Zinc</span></span>
              </div>
            </div>

            {/* Themed OpenUI Renderer Container */}
            <div className="flex-1 rounded-xl border border-zinc-800/80 bg-zinc-950 p-6 min-h-[380px] overflow-auto">
              <ThemeProvider mode="dark" darkTheme={defaultDarkTheme}>
                <Renderer
                  response={streamedCode}
                  library={openuiLibrary}
                  isStreaming={isSimulatingStream}
                  onError={(err) => console.warn("[OpenUI Render Error]", err)}
                />
              </ThemeProvider>
            </div>

            {/* Live Streaming Indicator Bar */}
            {isSimulatingStream && (
              <div className="flex items-center gap-2 text-xs font-mono text-blue-400 bg-blue-500/10 border border-blue-500/30 px-3 py-2 rounded-lg animate-pulse">
                <Sparkle className="size-3.5" />
                <span>Streaming tokens progressively into DOM...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
