import { Router } from 'express';
import { inflateSync } from 'node:zlib';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { byUserOrIpKey, createRateLimit } from '../middleware/rate-limit.js';
import { getLimitsForPlan } from '../services/plan.service.js';

const webImportSchema = z.object({
  url: z.string().url(),
});

const stripHtmlToText = (html: string): string => {
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  const text = noScript
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
};

const decodePdfText = (raw: string): string => {
  let normalized = raw;
  normalized = normalized
    .replace(/\\\((.*?)\\\)/g, '$1')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, ' ')
    .replace(/\\\\/g, '\\');
  return normalized;
};

const extractPdfText = (buffer: Buffer): string => {
  const binary = buffer.toString('latin1');
  const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const chunks: string[] = [];

  for (const match of binary.matchAll(streamRegex)) {
    const rawStream = match[1] ?? '';
    const streamStart = match.index ?? 0;
    const headerSlice = binary.slice(Math.max(0, streamStart - 220), streamStart);

    let decoded: string | null = null;
    if (/\/FlateDecode/.test(headerSlice)) {
      try {
        decoded = inflateSync(Buffer.from(rawStream, 'latin1')).toString('latin1');
      } catch {
        decoded = null;
      }
    } else {
      decoded = rawStream;
    }

    if (!decoded) continue;

    const tjRegex = /\(([^)]{1,400})\)\s*Tj/g;
    for (const tj of decoded.matchAll(tjRegex)) {
      chunks.push(decodePdfText(tj[1]));
    }

    const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
    for (const tjArr of decoded.matchAll(tjArrayRegex)) {
      const items = [...tjArr[1].matchAll(/\(([^)]*)\)/g)].map((item) => decodePdfText(item[1]));
      if (items.length > 0) {
        chunks.push(items.join(''));
      }
    }
  }

  return chunks
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const importsRouter = Router();

importsRouter.use(requireAuth);

const importRateLimit = createRateLimit({
  name: 'vm-imports',
  windowMs: 60_000,
  max: 20,
  key: byUserOrIpKey,
});

importsRouter.post('/web', importRateLimit, async (req, res) => {
  const limits = getLimitsForPlan(req.user!.plan);
  if (!limits.canImportWeb) {
    res.status(403).json({ message: 'Web import is a Pro feature' });
    return;
  }

  const parsed = webImportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: 'Invalid payload', errors: parsed.error.flatten() });
    return;
  }

  const response = await fetch(parsed.data.url, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': 'VisualMindBot/1.0 (+https://flexforge.ai)',
    },
  });

  if (!response.ok) {
    res.status(400).json({ message: `Failed to fetch URL (${response.status})` });
    return;
  }

  const html = await response.text();
  const text = stripHtmlToText(html).slice(0, limits.maxTextChars);
  if (!text) {
    res.status(400).json({ message: 'No extractable text found on the webpage' });
    return;
  }

  res.json({ text });
});

importsRouter.post('/pdf', importRateLimit, expressRawPdf, (req, res) => {
  const limits = getLimitsForPlan(req.user!.plan);
  if (!limits.canImportPdf) {
    res.status(403).json({ message: 'PDF import is a Pro feature' });
    return;
  }

  const contentType = (req.headers['content-type'] || '').toString();
  if (!contentType.includes('application/pdf')) {
    res.status(400).json({ message: 'Expected application/pdf content type' });
    return;
  }

  const body = req.body as Buffer | undefined;
  if (!body || !Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ message: 'PDF file is empty' });
    return;
  }

  const extracted = extractPdfText(body).slice(0, limits.maxTextChars);
  if (!extracted) {
    res.status(400).json({ message: 'Could not extract text from PDF' });
    return;
  }

  res.json({ text: extracted });
});

function expressRawPdf(req: any, res: any, next: any): void {
  const chunks: Buffer[] = [];
  req.on('data', (chunk: Buffer) => chunks.push(chunk));
  req.on('end', () => {
    req.body = Buffer.concat(chunks);
    next();
  });
  req.on('error', (error: Error) => next(error));
}
