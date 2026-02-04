/**
 * Email templates for password reset and email verification
 */

interface PasswordResetEmailParams {
  resetUrl: string;
  userName?: string;
  expiresInMinutes: number;
}

interface EmailVerificationParams {
  verifyUrl: string;
  userName?: string;
  expiresInHours: number;
}

const baseStyles = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5; }
  .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
  .header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 32px; text-align: center; }
  .header h1 { color: #ffffff; margin: 0; font-size: 24px; font-weight: 600; }
  .content { padding: 32px; }
  .button { display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff !important; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 16px; margin: 24px 0; }
  .button:hover { opacity: 0.9; }
  .footer { padding: 24px 32px; background: #f8f9fa; text-align: center; font-size: 14px; color: #6c757d; }
  .warning { background: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 12px 16px; margin: 16px 0; font-size: 14px; color: #856404; }
  p { margin: 16px 0; }
  .link-fallback { font-size: 12px; color: #6c757d; word-break: break-all; margin-top: 16px; }
`;

/**
 * Generate password reset email HTML and text
 */
export function passwordResetEmail(params: PasswordResetEmailParams): { html: string; text: string } {
  const { resetUrl, userName, expiresInMinutes } = params;
  const greeting = userName ? `Hi ${userName},` : 'Hi,';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password - FlexForge</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>FlexForge</h1>
    </div>
    <div class="content">
      <p>${greeting}</p>
      <p>We received a request to reset your password for your FlexForge account. Click the button below to create a new password:</p>
      <p style="text-align: center;">
        <a href="${resetUrl}" class="button">Reset Password</a>
      </p>
      <div class="warning">
        This link will expire in ${expiresInMinutes} minutes. If you didn't request a password reset, you can safely ignore this email.
      </div>
      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p class="link-fallback">${resetUrl}</p>
    </div>
    <div class="footer">
      <p>This email was sent by FlexForge. If you have questions, contact us at support@flexforge.ai</p>
      <p>&copy; ${new Date().getFullYear()} FlexForge. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
${greeting}

We received a request to reset your password for your FlexForge account.

Click this link to reset your password:
${resetUrl}

This link will expire in ${expiresInMinutes} minutes.

If you didn't request a password reset, you can safely ignore this email.

---
FlexForge
support@flexforge.ai
  `.trim();

  return { html, text };
}

/**
 * Generate email verification email HTML and text
 */
export function emailVerificationEmail(params: EmailVerificationParams): { html: string; text: string } {
  const { verifyUrl, userName, expiresInHours } = params;
  const greeting = userName ? `Hi ${userName},` : 'Hi,';

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verify Your Email - FlexForge</title>
  <style>${baseStyles}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>FlexForge</h1>
    </div>
    <div class="content">
      <p>${greeting}</p>
      <p>Welcome to FlexForge! Please verify your email address to complete your account setup and start learning.</p>
      <p style="text-align: center;">
        <a href="${verifyUrl}" class="button">Verify Email</a>
      </p>
      <div class="warning">
        This link will expire in ${expiresInHours} hours. If you didn't create a FlexForge account, you can safely ignore this email.
      </div>
      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p class="link-fallback">${verifyUrl}</p>
    </div>
    <div class="footer">
      <p>This email was sent by FlexForge. If you have questions, contact us at support@flexforge.ai</p>
      <p>&copy; ${new Date().getFullYear()} FlexForge. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  const text = `
${greeting}

Welcome to FlexForge! Please verify your email address to complete your account setup.

Click this link to verify your email:
${verifyUrl}

This link will expire in ${expiresInHours} hours.

If you didn't create a FlexForge account, you can safely ignore this email.

---
FlexForge
support@flexforge.ai
  `.trim();

  return { html, text };
}
