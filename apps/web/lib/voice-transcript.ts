import type { VoiceLine } from "@/components/voice/voice-context";

/** LiveKit transcription stream attributes (see livekit-client attribute-typings). */
const SEGMENT_ID_KEYS = ["lk.segment_id", "segment_id"];
const FINAL_KEYS = ["lk.transcription_final", "transcription_final", "final"];

export function readSegmentId(attributes?: Record<string, string>): string | undefined {
  if (!attributes) return undefined;
  for (const key of SEGMENT_ID_KEYS) {
    const value = attributes[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

export function readTranscriptionFinal(attributes?: Record<string, string>): boolean | undefined {
  if (!attributes) return undefined;
  for (const key of FINAL_KEYS) {
    const raw = attributes[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "boolean") return raw;
    const value = String(raw).trim().toLowerCase();
    if (value === "true" || value === "1" || value === "yes") return true;
    if (value === "false" || value === "0" || value === "no") return false;
  }
  return undefined;
}

export function normalizeVoiceText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Collapse buffered voice lines to one bubble per utterance:
 * - trims, drops empties
 * - when any line carries final=true, drops non-final interim lines
 * - collapses consecutive same-speaker lines with identical normalized text
 *   (LiveKit/VoiceKit can redeliver the same final segment 2-3x).
 */
export function coalesceVoiceLines(lines: VoiceLine[]): VoiceLine[] {
  const trimmed = lines
    .map((l) => ({ ...l, text: l.text.trim() }))
    .filter((l) => l.text.length > 0);
  if (trimmed.length === 0) return [];

  const hasFinal = trimmed.some((l) => l.final === true);
  const finalsOnly = hasFinal ? trimmed.filter((l) => l.final !== false) : trimmed;

  const out: VoiceLine[] = [];
  for (const line of finalsOnly) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.speaker === line.speaker &&
      normalizeVoiceText(prev.text) === normalizeVoiceText(line.text)
    ) {
      // Prefer the final-marked copy for metadata, keep first position.
      if (line.final === true && prev.final !== true) {
        prev.final = true;
      }
      continue;
    }
    out.push({ ...line });
  }
  return out;
}
