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

const BROWSER_FETCH_TIMEOUT_MS = 20_000;

const shouldUseBrowserFallback = (url: string, status?: number, text?: string): boolean => {
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return '';
    }
  })();

  if (host.includes('notion.so') || host.includes('notion.site')) return true;
  if (status === 401 || status === 403) return true;
  if (!text || text.length < 120) return true;
  return false;
};

const extractBrowserText = async (url: string): Promise<string> => {
  let chromium: any;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error('Browser import fallback is unavailable because Playwright is not installed on the backend');
  }

  let browser: any;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('chrome-headless-shell') && message.includes('ENOENT')) {
      throw new Error(
        'Browser import fallback is unavailable because the Playwright Chromium headless shell is not installed in the backend runtime. Rebuild the backend image after installing Playwright browsers.',
      );
    }
    throw error;
  }

  try {
    const page = await browser.newPage({
      userAgent:
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
    });

    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: BROWSER_FETCH_TIMEOUT_MS,
    });

    await page.waitForTimeout(1200);

    const text = await page.evaluate(() => {
      const root = document.querySelector('main') || document.body;
      return (root?.innerText || document.body?.innerText || '').replace(/\s+/g, ' ').trim();
    });

    return text;
  } finally {
    await browser.close();
  }
};

const importWebText = async (url: string, maxChars: number): Promise<string> => {
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'User-Agent': 'VisualMindBot/1.0 (+https://flexforge.ai)',
    },
  });

  let fetchedHtml = '';
  if (response.ok) {
    fetchedHtml = await response.text();
    const text = stripHtmlToText(fetchedHtml).slice(0, maxChars);
    if (text && !shouldUseBrowserFallback(url, response.status, text)) {
      return text;
    }
  }

  if (!response.ok && !shouldUseBrowserFallback(url, response.status)) {
    throw new Error(`Failed to fetch URL (${response.status})`);
  }

  const browserText = (await extractBrowserText(url)).slice(0, maxChars);
  if (!browserText) {
    if (!response.ok) {
      throw new Error(`Failed to fetch URL (${response.status})`);
    }
    throw new Error('No extractable text found on the webpage');
  }

  return browserText;
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

  try {
    const text = await importWebText(parsed.data.url, limits.maxTextChars);
    res.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Web import failed';
    console.error('[VisualMind] import:web:failed', {
      url: parsed.data.url,
      message,
    });
    res.status(400).json({ message });
  }
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
