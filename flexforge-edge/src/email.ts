/**
 * Email sending via Resend API
 * https://resend.com/docs/api-reference/emails/send-email
 */

export interface EmailOptions {
  to: { email: string; name?: string };
  from: { email: string; name?: string };
  subject: string;
  html: string;
  text: string;
  resendApiKey: string;
}

export interface SendEmailResult {
  success: boolean;
  error?: string;
}

/**
 * Send email via Resend API
 * Includes single retry for transient failures
 */
export async function sendEmail(options: EmailOptions): Promise<SendEmailResult> {
  const resendUrl = 'https://api.resend.com/emails';

  const payload = {
    from: options.from.name
      ? `${options.from.name} <${options.from.email}>`
      : options.from.email,
    to: [options.to.email],
    subject: options.subject,
    html: options.html,
    text: options.text,
  };

  // Attempt to send with single retry
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch(resendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.resendApiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return { success: true };
      }

      // Non-retryable errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        const errorText = await response.text();
        console.error('Resend error (non-retryable):', response.status, errorText);
        return {
          success: false,
          error: `Email delivery failed: ${response.status} - ${errorText}`,
        };
      }

      // Retryable error (5xx) - wait before retry
      if (attempt === 0) {
        console.warn('Resend temporary error, retrying...', response.status);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      const errorText = await response.text();
      console.error('Resend error after retry:', response.status, errorText);
      return {
        success: false,
        error: `Email delivery failed after retry: ${response.status}`,
      };
    } catch (error) {
      if (attempt === 0) {
        console.warn('Resend network error, retrying...', error);
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      console.error('Resend network error after retry:', error);
      return {
        success: false,
        error: 'Network error sending email',
      };
    }
  }

  return { success: false, error: 'Unknown error' };
}
