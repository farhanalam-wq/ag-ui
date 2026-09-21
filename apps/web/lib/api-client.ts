/**
 * Centralised API Client for ag-ui (Company AI)
 * All network calls to the backend Elysia API must route through this client.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export interface CompanySummary {
  id: string;
  name: string;
  domain: string;
  url: string;
  docCount?: number;
  chunkCount?: number;
  factCount?: number;
  status?: string;
  createdAt: string;
  updatedAt?: string;
  latestSnapshot?: {
    id: string;
    version: number;
    status: string;
    pageCount: number;
  } | null;
  brand?: {
    logoUrl: string | null;
    tokens: any;
  } | null;
}

export interface DiscoveredPageItem {
  url: string;
  category: "pricing" | "product" | "docs" | "blog" | "general" | "about";
  priority: number;
  source: "llms.txt" | "sitemap" | "homepage" | "root";
  depth: number;
}

export interface DiscoveryResponse {
  success: boolean;
  domain: string;
  origin: string;
  pages: DiscoveredPageItem[];
  info: {
    domain: string;
    totalUrls: number;
    durationMs: number;
    hasLlmsTxt: boolean;
    hasLlmsFull: boolean;
    robotsSitemaps: number;
    sitemapsFollowed: string[];
    byCategory: Record<string, number>;
    bySource: Record<string, number>;
  };
}

export interface IngestStreamCallbacks {
  onPhase?: (phase: string, message?: string) => void;
  onJob?: (data: { jobId: string; companyId: string; snapshotId: string }) => void;
  onProgress?: (data: {
    stage: string;
    jobId?: string;
    companyId?: string;
    snapshotId?: string;
    crawled?: number;
    totalSelected?: number;
    docs?: number;
    failed?: number;
    skippedThin?: number;
    chunks?: number;
    facts?: number;
    message?: string;
  }) => void;
  onDone?: (result: any) => void;
  onError?: (error: { message: string }) => void;
}

export interface CompanyDetailResponse {
  company: CompanySummary;
  latestSnapshot?: {
    id: string;
    version: number;
    status: "QUEUED" | "CRAWLING" | "PARSING" | "INDEXING" | "READY" | "FAILED";
    totalPages: number;
    totalChunks: number;
    totalFacts: number;
    completedAt?: string;
  };
  snapshots: any[];
  brand?: {
    id: string;
    companyId: string;
    logoUrl: string | null;
    tokens: {
      style?: string;
      colors?: {
        primary?: string;
        secondary?: string;
        background?: string;
        foreground?: string;
      };
      radius?: string;
      typography?: Record<string, any>;
    };
  };
}

export interface ChatStreamPayload {
  message: string;
  conversationId?: string;
}

export interface ChatStreamEvent {
  event: "status" | "brand" | "evidence" | "delta" | "visual" | "done" | "error";
  data: any;
}

export interface ChatStreamCallbacks {
  onStatus?: (data: { stage: "retrieving" | "synthesizing"; message: string }) => void;
  onBrand?: (brand: any) => void;
  onEvidence?: (evidence: any[]) => void;
  onDelta?: (delta: { text: string }) => void;
  onVisual?: (spec: any) => void;
  onDone?: (summary: { conversationId?: string; messageId?: string }) => void;
  onError?: (error: { message: string }) => void;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  /**
   * Health check endpoint
   */
  async health(): Promise<{ status: string; service: string }> {
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) {
      throw new Error(`Health check failed: HTTP ${res.status}`);
    }
    return res.json();
  }

  /**
   * Companies endpoints
   */
  companies = {
    list: async (): Promise<CompanySummary[]> => {
      const res = await fetch(`${this.baseUrl}/api/companies`);
      if (!res.ok) {
        throw new Error(`Failed to list companies: HTTP ${res.status}`);
      }
      const data = await res.json();
      return data.companies || [];
    },

    get: async (id: string): Promise<CompanyDetailResponse> => {
      const res = await fetch(`${this.baseUrl}/api/companies/${id}`);
      if (!res.ok) {
        throw new Error(`Failed to get company ${id}: HTTP ${res.status}`);
      }
      return res.json();
    },

    create: async (
      url: string
    ): Promise<{
      success?: boolean;
      companyId: string;
      version: number;
      domain?: string;
      status?: string;
      snapshotId?: string;
    }> => {
      const res = await fetch(`${this.baseUrl}/api/companies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Failed to create company: HTTP ${res.status} - ${errText}`);
      }
      return res.json();
    },

    getFacts: async (id: string): Promise<any[]> => {
      const res = await fetch(`${this.baseUrl}/api/companies/${id}/facts`);
      if (!res.ok) {
        throw new Error(`Failed to get company facts: HTTP ${res.status}`);
      }
      const data = await res.json();
      return data.facts || [];
    },

    getChunks: async (id: string): Promise<any[]> => {
      const res = await fetch(`${this.baseUrl}/api/companies/${id}/chunks`);
      if (!res.ok) {
        throw new Error(`Failed to get company chunks: HTTP ${res.status}`);
      }
      const data = await res.json();
      return data.chunks || [];
    },
  };

  /**
   * Streaming Chat SSE endpoint
   */
  chat = {
    stream: async (
      companyId: string,
      payload: ChatStreamPayload,
      callbacks: ChatStreamCallbacks,
      signal?: AbortSignal
    ): Promise<void> => {
      const res = await fetch(`${this.baseUrl}/api/companies/${companyId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Chat API failed (${res.status}): ${errText}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error("Response body is not a readable stream");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split("\n\n");
        buffer = blocks.pop() || "";

        for (const block of blocks) {
          const trimmed = block.trim();
          if (!trimmed) continue;

          let eventType = "message";
          let eventDataString = "";

          const lines = trimmed.split("\n");
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventType = line.replace("event:", "").trim();
            } else if (line.startsWith("data:")) {
              eventDataString = line.replace("data:", "").trim();
            }
          }

          if (!eventDataString) continue;

          try {
            const parsed = JSON.parse(eventDataString);
            let actualEvent = eventType;
            let actualData = parsed;

            // Support Elysia generator envelope: { event: "...", data: ... }
            if (parsed && typeof parsed === "object" && "event" in parsed && "data" in parsed) {
              actualEvent = parsed.event;
              actualData = parsed.data;
            }

            if (actualEvent === "status") {
              callbacks.onStatus?.(actualData);
            } else if (actualEvent === "brand") {
              callbacks.onBrand?.(actualData);
            } else if (actualEvent === "evidence") {
              callbacks.onEvidence?.(Array.isArray(actualData) ? actualData : []);
            } else if (actualEvent === "delta") {
              callbacks.onDelta?.(actualData);
            } else if (actualEvent === "visual") {
              callbacks.onVisual?.(actualData);
            } else if (actualEvent === "done") {
              callbacks.onDone?.(actualData);
            } else if (actualEvent === "error") {
              callbacks.onError?.(actualData);
            }
          } catch {
            // Ignore malformed partial chunks
          }
        }
      }
    },
  };

  /**
   * Crawler endpoints (Discovery & SSE Streaming Ingestion)
   */
  crawler = {
    discover: async (
      url: string,
      options?: { maxSitemaps?: number; maxSitemapUrls?: number }
    ): Promise<DiscoveryResponse> => {
      const res = await fetch(`${this.baseUrl}/api/crawler/discover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, ...options }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || err.details || `Discovery failed: HTTP ${res.status}`);
      }
      return res.json();
    },

    getJobStatus: async (
      jobId: string
    ): Promise<{
      job: {
        id: string;
        companyId: string;
        snapshotId: string;
        status: string;
        selected: number;
        crawled: number;
        docs: number;
        failed: number;
        errorSample?: any[];
      };
      snapshot?: {
        id: string;
        version: number;
        status: string;
        pageCount: number;
      } | null;
    }> => {
      const res = await fetch(`${this.baseUrl}/api/crawler/jobs/${jobId}`);
      if (!res.ok) {
        throw new Error(`Failed to get crawl job ${jobId}: HTTP ${res.status}`);
      }
      return res.json();
    },

    getLatestStatus: async (
      domain: string
    ): Promise<{
      company: CompanySummary;
      job?: {
        id: string;
        companyId: string;
        snapshotId: string;
        status: string;
        selected: number;
        crawled: number;
        docs: number;
        failed: number;
        errorSample?: any[];
      } | null;
      snapshot?: {
        id: string;
        version: number;
        status: string;
        pageCount: number;
      } | null;
      brand?: {
        logoUrl: string | null;
        tokens: any;
      } | null;
    }> => {
      const res = await fetch(`${this.baseUrl}/api/crawler/status/${encodeURIComponent(domain)}`);
      if (!res.ok) {
        throw new Error(`Failed to get status for domain ${domain}: HTTP ${res.status}`);
      }
      return res.json();
    },

    ingestStream: async (
      payload: {
        url: string;
        selectedUrls?: string[];
        select?: string;
        fetchConcurrency?: number;
        parseConcurrency?: number;
        embedConcurrency?: number;
        hostGapMs?: number;
      },
      callbacks: IngestStreamCallbacks,
      signal?: AbortSignal
    ): Promise<void> => {
      const res = await fetch(`${this.baseUrl}/api/crawler/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(payload),
        signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(`Ingestion request failed: HTTP ${res.status} - ${errorText}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No readable response stream received");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (!part.trim()) continue;

          const lines = part.split("\n");
          let eventType = "message";
          let eventDataString = "";

          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventType = line.replace("event:", "").trim();
            } else if (line.startsWith("data:")) {
              eventDataString = line.replace("data:", "").trim();
            }
          }

          if (!eventDataString) continue;

          try {
            const parsed = JSON.parse(eventDataString);
            let actualEvent = eventType;
            let actualData = parsed;

            if (parsed && typeof parsed === "object" && "event" in parsed && "data" in parsed) {
              actualEvent = parsed.event;
              actualData = parsed.data;
            }

            if (actualEvent === "ping") {
              // Heartbeat keep-alive ping - connection is healthy
            } else if (actualEvent === "phase") {
              callbacks.onPhase?.(actualData.phase, actualData.message);
            } else if (actualEvent === "job") {
              callbacks.onJob?.(actualData);
            } else if (actualEvent === "progress") {
              callbacks.onProgress?.(actualData);
            } else if (actualEvent === "done") {
              callbacks.onDone?.(actualData);
            } else if (actualEvent === "error") {
              callbacks.onError?.(actualData);
            }
          } catch {
            // Ignore malformed chunks
          }
        }
      }
    },
  };
}

export const apiClient = new ApiClient();
