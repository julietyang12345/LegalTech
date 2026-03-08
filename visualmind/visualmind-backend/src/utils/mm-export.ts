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
