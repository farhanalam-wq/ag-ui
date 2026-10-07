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
 * - groups redeliveries by (speaker, segment) — same speaker + same
 *   `lk.segment_id` merge into one entry, preferring the final-marked
 *   copy, else the longest text (final resends carry the full utterance)
 * - trims, drops groups with no text (empty final-marker streams only
 *   contribute their final flag to their segment group)
 * - collapses consecutive same-speaker entries with identical normalized
 *   text (LiveKit/VoiceKit can redeliver the same final segment under
 *   different stream/segment ids).
 * Never drops one speaker's lines because another speaker has a final.
 */
export function coalesceVoiceLines(lines: VoiceLine[]): VoiceLine[] {
  const groups = new Map<string, { firstIndex: number; lines: VoiceLine[] }>();
  lines.forEach((line, index) => {
    const key = `${line.speaker}|${line.segmentId ?? line.id}`;
    const group = groups.get(key);
    if (group) group.lines.push(line);
    else groups.set(key, { firstIndex: index, lines: [line] });
  });

  const merged = [...groups.values()]
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .map((group) => {
      // Prefer the longest text (final resends carry the full utterance;
      // empty final-marker streams contribute only their flag). Ties go to
      // the final-marked copy.
      let best = group.lines[0];
      for (const line of group.lines) {
        const len = line.text.trim().length;
        const bestLen = best.text.trim().length;
        if (len > bestLen || (len === bestLen && line.final === true && best.final !== true)) {
          best = line;
        }
      }
      return { ...best, text: best.text.trim() };
    })
    .filter((l) => l.text.length > 0);

  const out: VoiceLine[] = [];
  for (const line of merged) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.speaker === line.speaker &&
      normalizeVoiceText(prev.text) === normalizeVoiceText(line.text)
    ) {
      continue;
    }
    out.push({ ...line });
  }
  return out;
}
