import type { TreeNode } from '../types.js';

const xmlEscape = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const renderNode = (node: TreeNode): string => {
  const childrenXml = node.children.map(renderNode).join('');
  return `<node ID="${xmlEscape(node.id)}" TEXT="${xmlEscape(node.text)}">${childrenXml}</node>`;
};

export const toFreemindXml = (root: TreeNode): string => {
  const body = renderNode(root);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<map version="1.0.1">${body}</map>\n`;
};

const normalizeMarkdownText = (value: string): string =>
  value
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const markdownHeading = (value: string): string => normalizeMarkdownText(value).replace(/^#+\s*/, '');

const renderMarkdownBullet = (node: TreeNode, depth: number): string => {
  const indent = '  '.repeat(depth);
  const line = `${indent}- ${normalizeMarkdownText(node.text)}`.trimEnd();
  const children = node.children.map((child) => renderMarkdownBullet(child, depth + 1)).join('\n');
  return children ? `${line}\n${children}` : line;
};

export const toNotionMarkdown = (root: TreeNode, title?: string): string => {
  const heading = markdownHeading(title || root.text || 'Mind Map');
  const topLevel = root.children.length > 0 ? root.children : [root];
  const body = topLevel.map((node) => renderMarkdownBullet(node, 0)).join('\n');
  return `# ${heading}\n\n${body}\n`;
};
