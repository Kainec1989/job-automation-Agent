function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineFormat(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>');
}

export function markdownCvToHtml(markdown: string): string {
  const lines = markdown.split('\n');
  let html = '';
  let listDepth = 0;

  const closeLists = (targetDepth: number): void => {
    while (listDepth > targetDepth) {
      html += '</ul>';
      listDepth -= 1;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      closeLists(0);
      continue;
    }

    if (line.startsWith('# ')) {
      closeLists(0);
      html += `<h1>${inlineFormat(line.slice(2))}</h1>`;
      continue;
    }

    if (line.startsWith('## ')) {
      closeLists(0);
      html += `<h2>${inlineFormat(line.slice(3))}</h2>`;
      continue;
    }

    if (line.trim() === '---') {
      closeLists(0);
      html += '<hr>';
      continue;
    }

    const listMatch = line.match(/^(\s*)\* (.+)$/);
    if (listMatch) {
      const depth = Math.floor(listMatch[1].length / 2) + 1;

      if (listDepth === 0) {
        html += '<ul>';
        listDepth = 1;
      }

      while (listDepth < depth) {
        html += '<ul>';
        listDepth += 1;
      }

      while (listDepth > depth) {
        html += '</ul>';
        listDepth -= 1;
      }

      html += `<li>${inlineFormat(listMatch[2])}</li>`;
      continue;
    }

    closeLists(0);
    html += `<p>${inlineFormat(line)}</p>`;
  }

  closeLists(0);
  return html;
}

const CV_STYLES = `
  @page { size: A4; margin: 18mm; }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.45;
    color: #1a1a1a;
    margin: 0;
    padding: 0;
  }
  h1 {
    font-size: 17pt;
    text-align: center;
    margin: 0 0 14px;
    padding-bottom: 8px;
    border-bottom: 2px solid #2c3e50;
    letter-spacing: 1px;
  }
  h2 {
    font-size: 11pt;
    margin: 16px 0 8px;
    padding-bottom: 3px;
    border-bottom: 1px solid #bdc3c7;
    color: #2c3e50;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }
  ul {
    margin: 4px 0 10px;
    padding-left: 20px;
  }
  li { margin-bottom: 4px; }
  li > ul { margin-top: 4px; margin-bottom: 4px; }
  hr { display: none; }
  strong { font-weight: 600; }
  em { font-style: italic; color: #444; }
  p { margin: 4px 0; }
`;

export function buildCvDocument(markdown: string): string {
  const body = markdownCvToHtml(markdown);

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <title>Lebenslauf</title>
  <style>${CV_STYLES}</style>
</head>
<body>${body}</body>
</html>`;
}
