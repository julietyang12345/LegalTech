/**
 * Email sending via MailChannels API (free for Cloudflare Workers)
 * https://blog.cloudflare.com/sending-email-from-workers-with-mailchannels/
 */

export interface EmailOptions {
  to: { email: string; name?: string };
  from: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
  dkimPrivateKey?: string;
  dkimSelector?: string;
  dkimDomain?: string;
}

export interface SendEmailResult {
  success: boolean;
  error?: string;
}

/**
 * Send email via MailChannels API
 * Includes single retry for transient failures
 */
export async function sendEmail(options: EmailOptions): Promise<SendEmailResult> {
  const mailchannelsUrl = 'https://api.mailchannels.net/tx/v1/send';

  const payload: Record<string, unknown> = {
    personalizations: [
      {
        to: [{ email: options.to.email, name: options.to.name }],
      },
    ],
    from: {
      email: options.from.email,
      name: options.from.name,
    },
    subject: options.subject,
    content: [
      {
        type: 'text/plain',
        value: options.text,
      },
      {
        type: 'text/html',
        value: options.html,
      },
    ],
  };

  // Add DKIM signing if configured (improves deliverability)
  if (options.dkimPrivateKey && options.dkimSelector && options.dkimDomain) {
    payload.personalizations = [
      {
        to: [{ email: options.to.email, name: options.to.name }],
        dkim_domain: options.dkimDomain,
        dkim_selector: options.dkimSelector,
        dkim_private_key: options.dkimPrivateKey,
      },
    ];
  }

  // Attempt to send with single retry
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(mailchannelsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok || response.status === 202) {
        return { success: true };
      }

      // Non-retryable errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        const errorText = await response.text();
        console.error('MailChannels error (non-retryable):', response.status, errorText);
        return {
          success: false,
          error: `Email delivery failed: ${response.status}`,
        };
      }

      // Retryable error (5xx) - wait before retry
      if (attempt === 0) {
        console.warn('MailChannels temporary error, retrying...', response.status);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      const errorText = await response.text();
      console.error('MailChannels error after retry:', response.status, errorText);
      return {
        success: false,
        error: `Email delivery failed after retry: ${response.status}`,
      };
    } catch (error) {
      if (attempt === 0) {
        console.warn('MailChannels network error, retrying...', error);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      console.error('MailChannels network error after retry:', error);
      return {
        success: false,
        error: 'Network error sending email',
      };
    }
  }

  return { success: false, error: 'Unknown error' };
}
