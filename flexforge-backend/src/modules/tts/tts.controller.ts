import { Controller, Get, Query, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

@Controller('tts')
export class TtsController {
  /**
   * GET /api/v1/tts/speak?text=hello&lang=zh-CN
   * Proxy to Google Translate TTS (free, no API key)
   */
  @Get('speak')
  async speak(
    @Query('text') text: string,
    @Query('lang') lang: string = 'en',
    @Res() res: Response,
  ) {
    if (!text) {
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Text is required' });
    }

    try {
      // Google Translate TTS URL
      const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(text)}`;

      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      if (!response.ok) {
        throw new Error(`Google TTS returned ${response.status}`);
      }

      const audioBuffer = await response.arrayBuffer();

      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength,
        'Cache-Control': 'public, max-age=86400',
      });

      res.status(HttpStatus.OK).send(Buffer.from(audioBuffer));
    } catch (error) {
      console.error('TTS proxy error:', error.message);
      res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: 'TTS failed' });
    }
  }
}
