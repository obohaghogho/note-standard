import React from 'react';

/**
 * Parses inline formatting tokens (*bold*, _italic_, ~strikethrough~, `code`)
 * safely returning React elements. This avoids dangerouslySetInnerHTML.
 */
export function parseInline(text: string): React.ReactNode {
  if (!text) return null;

  // Tokenize string by matching delimiters: *, _, ~, `
  // Ensuring we match non-empty values inside delimiters
  const tokenRegex = /(\*[^*]+\*|_[^_]+_|~[^~]+~|`[^`]+`)/g;

  const parts = text.split(tokenRegex);
  return parts.map((part, index) => {
    if (part.startsWith('*') && part.endsWith('*')) {
      return <strong key={index}>{parseInline(part.slice(1, -1))}</strong>;
    }
    if (part.startsWith('_') && part.endsWith('_')) {
      return <em key={index}>{parseInline(part.slice(1, -1))}</em>;
    }
    if (part.startsWith('~') && part.endsWith('~')) {
      return <span key={index} style={{ textDecoration: 'line-through' }}>{parseInline(part.slice(1, -1))}</span>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index} className="inline-code">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

interface ListState {
  type: 'ul' | 'ol';
  items: string[];
}

/**
 * Parses block-level formatting (quotes, lists, empty lines) and returns React structure.
 */
export function parseFormattedText(text: string): React.ReactNode {
  if (!text) return null;

  // Normalize message text
  const lines = text.split('\n');
  const blocks: React.ReactNode[] = [];
  let currentList: ListState | null = null;

  const flushList = () => {
    if (currentList) {
      if (currentList.type === 'ul') {
        blocks.push(
          <ul key={`list-${blocks.length}`} className="formatted-ul">
            {currentList.items.map((item, i) => <li key={i}>{parseInline(item)}</li>)}
          </ul>
        );
      } else {
        blocks.push(
          <ol key={`list-${blocks.length}`} className="formatted-ol">
            {currentList.items.map((item, i) => <li key={i}>{parseInline(item)}</li>)}
          </ol>
        );
      }
      currentList = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Blockquote check
    if (line.startsWith('>') || line.startsWith('> ')) {
      flushList();
      const content = line.startsWith('> ') ? line.slice(2) : line.slice(1);
      blocks.push(
        <blockquote key={i} className="formatted-blockquote">
          {parseInline(content)}
        </blockquote>
      );
      continue;
    }

    // Bullet List Check
    const bulletMatch = line.match(/^[*+-]\s+(.*)/);
    if (bulletMatch) {
      const itemContent = bulletMatch[1];
      if (currentList && currentList.type === 'ul') {
        currentList.items.push(itemContent);
      } else {
        flushList();
        currentList = { type: 'ul', items: [itemContent] };
      }
      continue;
    }

    // Numbered List Check
    const numberMatch = line.match(/^\d+\.\s+(.*)/);
    if (numberMatch) {
      const itemContent = numberMatch[1];
      if (currentList && currentList.type === 'ol') {
        currentList.items.push(itemContent);
      } else {
        flushList();
        currentList = { type: 'ol', items: [itemContent] };
      }
      continue;
    }

    // Paragraph Line
    flushList();
    if (line.trim() === '') {
      blocks.push(<div key={i} className="formatted-line-gap" />);
    } else {
      blocks.push(
        <div key={i} className="formatted-p">
          {parseInline(line)}
        </div>
      );
    }
  }

  flushList();
  return <div className="formatted-message-wrapper">{blocks}</div>;
}
