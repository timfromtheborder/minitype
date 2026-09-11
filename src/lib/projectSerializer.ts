import { SessionRecord } from '@/types';

export const SESSION_DELIMITER_REGEX = /<!--\s*minitype:session\s+([^>]+)-->/gi;

export function countWords(text: string): number {
  if (!text) return 0;
  const tokens = text.trim().split(/\s+/);
  return tokens.filter((t) => t.length > 0).length;
}

export function formatSessionDelimiter(session: SessionRecord): string {
  const completedAttr = session.completedAt ? ` completed="${session.completedAt}"` : '';
  return `\n\n<!-- minitype:session id="${session.id}" number="${session.sessionNumber}" started="${session.startedAt}"${completedAttr} words="${session.wordCount}" -->\n\n`;
}

/**
 * Serializes an array of sessions into a combined project file format with session markers.
 */
export function serializeProjectFile(sessions: SessionRecord[]): string {
  if (!sessions || sessions.length === 0) return '';
  return sessions
    .map((session, idx) => {
      const body = session.text || '';
      if (idx === 0) {
        return body;
      }
      return `${formatSessionDelimiter(session)}${body}`;
    })
    .join('');
}

/**
 * Strips all session markers to produce clean text or markdown for standard export.
 */
export function stripSessionMarkers(rawText: string): string {
  if (!rawText) return '';
  return rawText
    .replace(/<!--\s*minitype:session\s+[^>]*-->/gi, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Parses raw project text into SessionRecord[].
 * If delimiter tags exist, chunks text into separate historical sessions.
 * If no delimiter tags exist (plain text or markdown file), encapsulates all text into Session 1.
 */
export function parseProjectFile(rawText: string, projectId: string): SessionRecord[] {
  if (!rawText || rawText.trim().length === 0) {
    return [
      {
        id: `${projectId}-session-1`,
        projectId,
        sessionNumber: 1,
        startedAt: new Date().toISOString(),
        completedAt: null,
        text: '',
        wordCount: 0,
      },
    ];
  }

  const delimiterRegex = /<!--\s*minitype:session\s+([^>]+)-->/gi;
  const matches: { index: number; length: number; attrs: Record<string, string> }[] = [];
  let match: RegExpExecArray | null;

  while ((match = delimiterRegex.exec(rawText)) !== null) {
    const rawAttrs = match[1];
    const attrs: Record<string, string> = {};
    const attrRegex = /(\w+)="([^"]*)"/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
      attrs[attrMatch[1]] = attrMatch[2];
    }
    matches.push({ index: match.index, length: match[0].length, attrs });
  }

  // If no session markers found, treat entire content as Session 1
  if (matches.length === 0) {
    const cleanText = rawText.trim();
    return [
      {
        id: `${projectId}-session-1`,
        projectId,
        sessionNumber: 1,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        text: cleanText,
        wordCount: countWords(cleanText),
      },
    ];
  }

  const sessions: SessionRecord[] = [];

  // Session 1: Text before the first delimiter
  const firstChunk = rawText.slice(0, matches[0].index).trim();
  sessions.push({
    id: `${projectId}-session-1`,
    projectId,
    sessionNumber: 1,
    startedAt: matches[0].attrs.started || new Date().toISOString(),
    completedAt: matches[0].attrs.started || new Date().toISOString(),
    text: firstChunk,
    wordCount: countWords(firstChunk),
  });

  // Subsequent sessions defined by delimiters
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const nextStart = i + 1 < matches.length ? matches[i + 1].index : rawText.length;
    const sessionBody = rawText.slice(current.index + current.length, nextStart).trim();
    const sessionNum = Number(current.attrs.number) || i + 2;

    sessions.push({
      id: current.attrs.id || `${projectId}-session-${sessionNum}`,
      projectId,
      sessionNumber: sessionNum,
      startedAt: current.attrs.started || new Date().toISOString(),
      completedAt: current.attrs.completed || null,
      text: sessionBody,
      wordCount: countWords(sessionBody),
    });
  }

  return sessions;
}
