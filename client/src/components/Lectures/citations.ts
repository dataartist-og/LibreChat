import type { LectureAskResponse } from 'librechat-data-provider';

export function formatCitations(
  answer: string,
  citations: LectureAskResponse['citations'],
): string {
  const links = new Map<string, string>();
  citations.forEach((citation, index) => {
    try {
      const url = new URL(citation.url);
      if (!['https:', 'http:'].includes(url.protocol)) {
        return;
      }
      const rendered = `[${index + 1}](<${url.href}>)`;
      const anchor = decodeURIComponent(url.hash.slice(1));
      if (anchor) {
        links.set(`${citation.sourceId}#${anchor}`, rendered);
      }
      if (!links.has(citation.sourceId)) {
        links.set(citation.sourceId, rendered);
      }
    } catch {
      return;
    }
  });
  return answer.replace(
    /\[([^\]\n]+)\](?!\()/g,
    (original: string, key: string) => links.get(key) ?? original,
  );
}
