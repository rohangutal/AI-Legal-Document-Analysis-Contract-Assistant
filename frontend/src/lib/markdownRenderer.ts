/**
 * markdownRenderer.ts
 * Robust TypeScript markdown renderer and legal citation parser for Lexora AI Assistant.
 * Built with zero external dependencies and safe against string truncation.
 */

export interface ParsedCitation {
  index: number;
  key: string;
  docName: string;
  page: string | null;
  section: string | null;
}

export interface ParsedMessage {
  cleanHtml: string;
  rawCleanText: string;
  citations: ParsedCitation[];
}

// Regex to match "Chunk <uuid>" or " - Chunk <uuid>" anywhere in text
const RAW_CHUNK_ID_RE = /(?:\s*[\u2014\u2013\-]\s*)?Chunk\s+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// Inline citation format: [DocName — Page X, Section Y — Chunk UUID] or variations
const INLINE_CITATION_RE = /\[([^\]\n]+?)(?:[\u2014\u2013\-,]\s*Page\s*([0-9]+(?:[\s,&]+[0-9]+)*))?(?:[\u2014\u2013\-,]\s*Section\s+([^\]\n]+?))?(?:[\u2014\u2013\-]\s*Chunk\s+[0-9a-f-]+)?\]/gi;

function makeKey(doc: string, page: string | null, section: string | null): string {
  return `${(doc || '').trim().toLowerCase()}||${(page || '').trim()}||${(section || '').trim().toLowerCase()}`;
}

export function parseAndRenderMessage(raw: string): ParsedMessage {
  const citationMap = new Map<string, ParsedCitation>();
  let citCounter = 0;
  let text = (raw || '').trim();

  // 1. Check for a dedicated "Sources:" block at the VERY END of the message
  // Look for "### Sources" or "**Sources**" or "Sources:" in the last 20% or trailing portion
  const sourcesHeaderIdx = Math.max(
    text.lastIndexOf('\n### Sources'),
    text.lastIndexOf('\n### SOURCES'),
    text.lastIndexOf('\n## Sources'),
    text.lastIndexOf('\n## SOURCES'),
    text.lastIndexOf('\n**Sources**'),
    text.lastIndexOf('\nSources:')
  );

  if (sourcesHeaderIdx !== -1 && sourcesHeaderIdx > text.length * 0.4) {
    const trailingSources = text.slice(sourcesHeaderIdx);
    // Parse individual source lines from the trailing block
    const lines = trailingSources.split('\n');
    for (const line of lines) {
      const match = line.match(/(?:[\*\-]\s*)?\[?([^\]\u2014\n]{3,60}?)\s*[\u2014\u2013\-]\s*Page\s*([0-9]+[^\]\u2014\n]*?)(?:\s*[\u2014\u2013\-]\s*Section\s+([^\]\u2014\nChunk]+?))?(?:\s*[\u2014\u2013\-]\s*Chunk\s+[0-9a-f-]+)?\]?/i);
      if (match) {
        const docName = match[1]?.trim();
        const page = match[2]?.trim() || null;
        const section = match[3]?.trim() || null;
        if (docName && docName.length >= 2 && !docName.toLowerCase().startsWith('source')) {
          const key = makeKey(docName, page, section);
          if (!citationMap.has(key)) {
            citCounter++;
            citationMap.set(key, { index: citCounter, key, docName, page, section });
          }
        }
      }
    }
    // Remove the trailing Sources section from main readable body
    text = text.slice(0, sourcesHeaderIdx).trimEnd();
  }

  // 2. Parse and replace inline citations: [DocName — Page X, Section Y ...] with [N]
  INLINE_CITATION_RE.lastIndex = 0;
  text = text.replace(INLINE_CITATION_RE, (fullMatch, docGroup, pageGroup, secGroup) => {
    const docName = (docGroup || '').replace(/[\u2014\u2013\-]\s*Page.*$/i, '').trim();
    if (!docName || docName.length < 2 || docName.toLowerCase() === 'sources') {
      return '';
    }

    // Extract page if inside docGroup
    let page = pageGroup ? pageGroup.trim() : null;
    let section = secGroup ? secGroup.replace(RAW_CHUNK_ID_RE, '').trim() : null;

    if (!page) {
      const pageMatch = fullMatch.match(/Page\s*([0-9]+(?:[\s,&]+[0-9]+)*)/i);
      if (pageMatch) page = pageMatch[1].trim();
    }
    if (!section) {
      const secMatch = fullMatch.match(/Section\s+([^\]\u2014\nChunk]+)/i);
      if (secMatch) section = secMatch[1].replace(RAW_CHUNK_ID_RE, '').trim();
    }

    const key = makeKey(docName, page, section);
    let cit = citationMap.get(key);
    if (!cit) {
      citCounter++;
      cit = { index: citCounter, key, docName, page, section };
      citationMap.set(key, cit);
    }

    const titleStr = `${docName}${page ? ` \u2014 Page ${page}` : ''}${section ? ` \u2014 ${section}` : ''}`;
    return `<sup class="cite-ref" data-cite="${cit.index}" title="${titleStr}">[${cit.index}]</sup>`;
  });

  // 3. Strip any isolated Chunk UUIDs that might remain in text without deleting lines!
  text = text.replace(RAW_CHUNK_ID_RE, '');

  // 4. Clean plain text for copying
  const rawCleanText = text.replace(/<[^>]+>/g, '').trim();

  // 5. Render markdown to clean HTML
  const cleanHtml = renderMarkdown(text);

  // 6. Return ordered citations
  const citations = Array.from(citationMap.values()).sort((a, b) => a.index - b.index);

  return { cleanHtml, rawCleanText, citations };
}

/**
 * Standard, safe markdown to HTML parser.
 */
export function renderMarkdown(md: string): string {
  const lines = (md || '').split('\n');
  const blocks: string[] = [];
  let current: string[] = [];

  const flush = () => {
    const b = current.join('\n').trim();
    if (b) blocks.push(b);
    current = [];
  };

  for (const line of lines) {
    if (line.trim() === '') {
      flush();
    } else {
      current.push(line);
    }
  }
  flush();

  const html: string[] = [];

  for (const block of blocks) {
    const bLines = block.split('\n');

    // Headings: #, ##, ###, ####
    const hMatch = bLines[0].match(/^(#{1,5})\s+(.+)$/);
    if (hMatch && bLines.length === 1) {
      const level = Math.min(hMatch[1].length + 1, 5); // h2–h5
      html.push(`<h${level} class="md-h${level}">${inlineFormat(hMatch[2])}</h${level}>`);
      continue;
    }

    // Horizontal Rule: ---, ***, ___
    if (/^[-*_]{3,}\s*$/.test(bLines[0]) && bLines.length === 1) {
      html.push('<hr class="md-hr" />');
      continue;
    }

    // Blockquote
    if (bLines.every((l) => l.startsWith('> '))) {
      const inner = bLines.map((l) => l.replace(/^>\s?/, '')).join('\n');
      html.push(`<blockquote class="md-blockquote">${renderMarkdown(inner)}</blockquote>`);
      continue;
    }

    // Table
    if (bLines.length >= 2 && bLines[0].includes('|') && bLines[1].match(/^[\|\s\-:]+$/)) {
      const headerCells = splitTableRow(bLines[0]);
      const bodyRows = bLines.slice(2).map((row) => {
        const cells = splitTableRow(row);
        return `<tr>${cells.map((c) => `<td>${inlineFormat(c)}</td>`).join('')}</tr>`;
      });
      const headerHtml = `<tr>${headerCells.map((c) => `<th>${inlineFormat(c)}</th>`).join('')}</tr>`;
      html.push(`<div class="md-table-wrap"><table class="md-table"><thead>${headerHtml}</thead><tbody>${bodyRows.join('')}</tbody></table></div>`);
      continue;
    }

    // LLMs often omit blank lines between headings, numbered findings, and
    // bullets. Render those mixed blocks line-by-line so markdown markers
    // never leak into the visible response.
    if (bLines.length > 1 && bLines.some((line) => /^(#{1,5})\s+|^[\-\*\+]\s+|^\d+[\.\)]\s+/.test(line.trimStart()))) {
      html.push(renderMixedBlock(bLines));
      continue;
    }

    // Bullet list: -, *, +
    if (bLines.every((l) => /^[\-\*\+]\s/.test(l.trimStart()))) {
      const items = bLines.map((l) => `<li>${inlineFormat(l.replace(/^[\-\*\+]\s/, '').trimStart())}</li>`).join('');
      html.push(`<ul class="md-ul">${items}</ul>`);
      continue;
    }

    // Numbered list: 1., 2., etc.
    if (bLines.every((l) => /^\d+[\.\)]\s/.test(l.trimStart()))) {
      const items = bLines.map((l) => `<li>${inlineFormat(l.replace(/^\d+[\.\)]\s/, '').trimStart())}</li>`).join('');
      html.push(`<ol class="md-ol">${items}</ol>`);
      continue;
    }

    // Standalone bold line acting like a sub-heading: **Title:**
    if (bLines.length === 1 && /^\*\*[^*]+\*\*[:]?\s*$/.test(bLines[0].trim())) {
      html.push(`<h4 class="md-h4">${inlineFormat(bLines[0].trim())}</h4>`);
      continue;
    }

    // Regular paragraph
    const para = bLines.map((l) => inlineFormat(l)).join('<br />');
    html.push(`<p class="md-p">${para}</p>`);
  }

  return html.join('\n');
}

function inlineFormat(text: string): string {
  // Protect existing HTML tags (such as <sup class="cite-ref">...</sup>)
  const tokens: string[] = [];
  const tokenized = text.replace(/<[^>]+>/g, (tag) => {
    tokens.push(tag);
    return `\x00${tokens.length - 1}\x00`;
  });

  let res = tokenized;
  // Bold + Italic: ***text***
  res = res.replace(/\*\*\*([^*]+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold: **text**
  res = res.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  // Italic: *text*
  res = res.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
  // Inline code: `text`
  res = res.replace(/`([^`]+?)`/g, '<code class="md-code">$1</code>');

  // Restore HTML tags
  res = res.replace(/\x00(\d+)\x00/g, (_, i) => tokens[parseInt(i, 10)]);
  return res;
}

function renderMixedBlock(lines: string[]): string {
  const output: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let listItems: string[] = [];

  const flushList = () => {
    if (listType && listItems.length) output.push(`<${listType} class="md-${listType}">${listItems.join('')}</${listType}>`);
    listType = null;
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = line.match(/^(#{1,5})\s+(.+)$/);
    const bullet = line.match(/^[\-\*\+]\s+(.+)$/);
    const numbered = line.match(/^\d+[\.\)]\s+(.+)$/);

    if (heading) {
      flushList();
      const level = Math.min(heading[1].length + 1, 5);
      output.push(`<h${level} class="md-h${level}">${inlineFormat(heading[2])}</h${level}>`);
    } else if (bullet || numbered) {
      const nextType = bullet ? 'ul' : 'ol';
      if (listType !== nextType) flushList();
      listType = nextType;
      listItems.push(`<li>${inlineFormat((bullet || numbered)![1])}</li>`);
    } else {
      flushList();
      output.push(`<p class="md-p">${inlineFormat(line)}</p>`);
    }
  }
  flushList();
  return output.join('');
}

function splitTableRow(row: string): string[] {
  return row
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}
