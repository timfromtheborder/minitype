import { SessionRecord } from '@/types';

export const SESSION_DELIMITER_REGEX = /<!--\s*minitype:session\s+([^>]+)-->/gi;

export function countWords(text: string): number {
  if (!text) return 0;
  const tokens = text.trim().split(/\s+/);
  return tokens.filter((t) => t.length > 0 && /\w/i.test(t)).length;
}

export function getActiveSessionText(fullText: string, priorSessions: SessionRecord[]): string {
  if (!fullText) return '';
  if (!priorSessions || priorSessions.length === 0) return fullText.trim();

  const totalDocWords = countWords(fullText);
  const priorWords = priorSessions.reduce((acc, s) => acc + (s.wordCount || 0), 0);

  // If prior completed sessions already account for the entirety of the document words,
  // the active session has no text or words yet.
  if (priorWords >= totalDocWords) {
    return '';
  }

  let searchIndex = 0;
  let allMatched = true;
  for (const s of priorSessions) {
    const sessionText = (s.text || '').trim();
    if (!sessionText) {
      allMatched = false;
      continue;
    }
    const foundIdx = fullText.indexOf(sessionText, searchIndex);
    if (foundIdx !== -1) {
      searchIndex = foundIdx + sessionText.length;
    } else {
      allMatched = false;
    }
  }

  if (allMatched && searchIndex > 0) {
    return fullText.slice(searchIndex).trim();
  }

  // If searchIndex advanced partially and the remainder matches the word budget:
  if (searchIndex > 0) {
    const candidate = fullText.slice(searchIndex).trim();
    if (countWords(candidate) === totalDocWords - priorWords) {
      return candidate;
    }
  }

  // Token-based fallback: extract the trailing words belonging to the active session
  const tokens = fullText.trim().split(/\s+/);
  const wordIndices: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].length > 0 && /\w/i.test(tokens[i])) {
      wordIndices.push(i);
    }
  }

  if (wordIndices.length > priorWords) {
    const startTokenIdx = wordIndices[priorWords];
    return tokens.slice(startTokenIdx).join(' ').trim();
  }

  return '';
}

export function reconcileSessionsWithText(
  sessions: SessionRecord[],
  fullText: string
): SessionRecord[] {
  if (!sessions || sessions.length === 0) return [];
  const trimmedFull = (fullText || '').trim();
  const totalDocWords = countWords(trimmedFull);

  if (totalDocWords === 0) {
    return sessions.map((s) => ({
      ...s,
      text: '',
      wordCount: 0,
    }));
  }

  let cumulativeWords = 0;
  let searchIndex = 0;

  return sessions.map((s, idx) => {
    const isCompleted = !!s.completedAt;
    const existingWords = s.wordCount || 0;
    const candidate = (s.text || '').trim();

    let matchedText = '';
    let matchedWords = 0;

    if (candidate) {
      const foundIdx = fullText.indexOf(candidate, searchIndex);
      if (foundIdx !== -1) {
        searchIndex = foundIdx + candidate.length;
        matchedText = candidate;
        matchedWords = countWords(candidate);
      }
    }

    if (isCompleted) {
      // If the document has already run out of words for ghost sessions beyond fullText:
      if (cumulativeWords >= totalDocWords) {
        return {
          ...s,
          text: '',
          wordCount: 0,
        };
      }

      const finalWords =
        matchedWords > 0
          ? matchedWords
          : existingWords > 0
          ? existingWords
          : countWords(candidate);

      const clampedWords = Math.min(finalWords, Math.max(0, totalDocWords - cumulativeWords));
      cumulativeWords += clampedWords;

      return {
        ...s,
        text: matchedText || candidate,
        wordCount: clampedWords,
      };
    }

    // Active / uncompleted session
    if (cumulativeWords >= totalDocWords) {
      return {
        ...s,
        text: '',
        wordCount: 0,
      };
    }

    const priorSessions = sessions.slice(0, idx);
    const activeText = getActiveSessionText(fullText, priorSessions);
    const activeWords = Math.min(countWords(activeText), Math.max(0, totalDocWords - cumulativeWords));
    cumulativeWords += activeWords;

    return {
      ...s,
      text: activeText,
      wordCount: activeWords,
    };
  });
}

export function formatSessionDelimiter(session: SessionRecord): string {
  const completedAttr = session.completedAt ? ` completed="${session.completedAt}"` : '';
  const importedAttr = session.isImported ? ` imported="${session.importedAt || session.startedAt}"` : '';
  return `\n\n<!-- minitype:session id="${session.id}" number="${session.sessionNumber}" started="${session.startedAt}"${completedAttr}${importedAttr} words="${session.wordCount}" -->\n\n`;
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
  const firstImported = matches[0].attrs.imported;
  sessions.push({
    id: `${projectId}-session-1`,
    projectId,
    sessionNumber: 1,
    startedAt: matches[0].attrs.started || new Date().toISOString(),
    completedAt: matches[0].attrs.started || new Date().toISOString(),
    text: firstChunk,
    wordCount: countWords(firstChunk),
    ...(firstImported ? { isImported: true, importedAt: firstImported } : {}),
  });

  // Subsequent sessions defined by delimiters
  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    const nextStart = i + 1 < matches.length ? matches[i + 1].index : rawText.length;
    const sessionBody = rawText.slice(current.index + current.length, nextStart).trim();
    const sessionNum = Number(current.attrs.number) || i + 2;
    const imported = current.attrs.imported;

    sessions.push({
      id: current.attrs.id || `${projectId}-session-${sessionNum}`,
      projectId,
      sessionNumber: sessionNum,
      startedAt: current.attrs.started || new Date().toISOString(),
      completedAt: current.attrs.completed || null,
      text: sessionBody,
      wordCount: countWords(sessionBody),
      ...(imported ? { isImported: true, importedAt: imported } : {}),
    });
  }

  return sessions;
}
