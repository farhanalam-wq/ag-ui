/**
 * Tier 2 Image Resolver: Resolves high-resolution stock imagery for capabilities and domains
 * via Pixabay API with LRU caching, curated high-quality fallbacks, and safe graceful degradation to Tier 3.
 */

interface PixabayHit {
  id: number;
  webformatURL: string;
  largeImageURL: string;
  tags: string;
}

interface PixabayResponse {
  totalHits: number;
  hits: PixabayHit[];
}

// In-memory cache for resolved keywords to prevent redundant network hits
const imageCache = new Map<string, string | null>();

// Curated high-res tech & business image map for instant zero-latency loading & offline resiliency
const CURATED_TECH_IMAGES: Record<string, string> = {
  cloud: "https://images.unsplash.com/photo-1544197150-b99a580bb7a8?q=80&w=800&auto=format&fit=crop",
  server: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=800&auto=format&fit=crop",
  data: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=800&auto=format&fit=crop",
  ai: "https://images.unsplash.com/photo-1677442136019-21780ecad995?q=80&w=800&auto=format&fit=crop",
  security: "https://images.unsplash.com/photo-1563986768609-322da13575f3?q=80&w=800&auto=format&fit=crop",
  mobile: "https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?q=80&w=800&auto=format&fit=crop",
  design: "https://images.unsplash.com/photo-1581291518857-4e27b48ff24e?q=80&w=800&auto=format&fit=crop",
  devops: "https://images.unsplash.com/photo-1618401471353-b98aedd04e11?q=80&w=800&auto=format&fit=crop",
  enterprise: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=800&auto=format&fit=crop",
  engineering: "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?q=80&w=800&auto=format&fit=crop",
  iot: "https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=800&auto=format&fit=crop",
  consulting: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?q=80&w=800&auto=format&fit=crop",
};

/**
 * Resolves an imagery URL for a category, service title, or keyword.
 * Order of resolution:
 * 1. Cache hit
 * 2. Pixabay API (if PIXABAY_API_KEY is configured)
 * 3. Curated keyword match
 * 4. Graceful null (signals UI to render Tier 3 GraphicBanner)
 */
export async function resolveStockImage(query: string): Promise<string | null> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;

  if (imageCache.has(normalized)) {
    return imageCache.get(normalized) ?? null;
  }

  const apiKey = process.env.PIXABAY_API_KEY || process.env.NEXT_PUBLIC_PIXABAY_API_KEY;

  if (apiKey) {
    try {
      const endpoint = `https://pixabay.com/api/?key=${encodeURIComponent(
        apiKey
      )}&q=${encodeURIComponent(
        normalized
      )}&image_type=photo&orientation=horizontal&category=computer&safesearch=true&per_page=3`;

      const response = await fetch(endpoint, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(3500),
      });

      if (response.ok) {
        const data = (await response.json()) as PixabayResponse;
        if (data.hits && data.hits.length > 0) {
          const matched = data.hits[0].webformatURL;
          imageCache.set(normalized, matched);
          return matched;
        }
      }
    } catch {
      // Graceful fallback on network timeout or quota
    }
  }

  // Check curated keyword triggers
  for (const [key, url] of Object.entries(CURATED_TECH_IMAGES)) {
    if (normalized.includes(key)) {
      imageCache.set(normalized, url);
      return url;
    }
  }

  // Fallback: null lets the component render Tier 3 GraphicBanner seamlessly
  imageCache.set(normalized, null);
  return null;
}
