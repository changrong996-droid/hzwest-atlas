'use strict';
// 解析 Markdown 管道表格（认领板各文件用的是同一套「列与标题保持原样」约定）。
// 支持：单元格内 \| 转义；## 小节归属；表头分隔行识别。
// 输出：[{ section, header, rows: [{ line, cells }] }]，line 为 1 起始的源文件行号，供审计。
function splitRow(line) {
  // 去掉首尾的管道符后切分；\| 还原为字面 |。
  // 未转义的 | 只有当两侧邻居都是「空白 / 行首尾 / 相邻管道」时才算列分隔符——
  // 贴着文字的竖线（如行文里的数学记号 |z| < 14 m）是内容，不是分隔符。
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  const edge = (c) => c === '' || /\s/.test(c) || c === '|';
  const cells = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (c === '|' && edge(s[i - 1]) && edge(s[i + 1])) { cells.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

function parseTables(text) {
  const lines = text.split('\n');
  const tables = [];
  let section = '';
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) { section = h[1].trim(); i++; continue; }
    const isRow = /^\s*\|.*\|\s*$/.test(line);
    const isSep = i + 1 < lines.length && /^\s*\|[\s:|\-]+\|\s*$/.test(lines[i + 1]);
    if (isRow && isSep) {
      const header = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        rows.push({ line: i + 1, cells: splitRow(lines[i]) });
        i++;
      }
      tables.push({ section, header, rows });
      continue;
    }
    i++;
  }
  return tables;
}

module.exports = { parseTables, splitRow };
