const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const sesClient = new SESClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

/**
 * Send password reset email via AWS SES
 * @param {string} email - Recipient email address
 * @param {string} username - User's username
 * @param {string} resetToken - Password reset token (64-char hex)
 * @param {string} language - User's language preference (en, pt, sw)
 * @returns {Promise<{success: boolean, messageId?: string}>}
 */
async function sendPasswordResetEmail(email, username, resetToken, language = 'en') {
  const resetUrl = `${process.env.PASSWORD_RESET_URL}/${resetToken}`;
  // The Peskas logo (public/email/peskas-logo.png, 480x86, shown at half size) comes from the app's
  // own origin, the one the reset link points to; email clients need an absolute URL.
  const logoUrl = `${new URL(process.env.PASSWORD_RESET_URL).origin}/email/peskas-logo.png`;

  // Multi-language email templates (en, pt, sw)
  const templates = {
    en: {
      subject: 'Reset Your Password - Peskas Management Platform',
      heading: 'Password Reset Request',
      greeting: `Hello ${username},`,
      body: 'We received a request to reset your password. Click the button below to create a new password:',
      button: 'Reset Password',
      expiry: 'This link will expire in 1 hour.',
      ignore: 'If you did not request this reset, please ignore this email.',
      footer: 'Peskas Management Platform - WorldFish Center'
    },
    pt: {
      subject: 'Redefinir sua senha - Plataforma de Gestão Peskas',
      heading: 'Solicitação de Redefinição de Senha',
      greeting: `Olá ${username},`,
      body: 'Recebemos uma solicitação para redefinir sua senha. Clique no botão abaixo para criar uma nova senha:',
      button: 'Redefinir Senha',
      expiry: 'Este link expirará em 1 hora.',
      ignore: 'Se você não solicitou esta redefinição, ignore este e-mail.',
      footer: 'Plataforma de Gestão Peskas - WorldFish Center'
    },
    sw: {
      subject: 'Weka Upya Nywila Yako - Jukwaa la Usimamizi la Peskas',
      heading: 'Ombi la Kuweka Upya Nywila',
      greeting: `Habari ${username},`,
      body: 'Tumepokea ombi la kuweka upya nywila yako. Bonyeza kitufe hapa chini kuunda nywila mpya:',
      button: 'Weka Upya Nywila',
      expiry: 'Kiungo hiki kitaisha baada ya saa 1.',
      ignore: 'Ikiwa hukuomba kuweka upya hii, puuza barua pepe hii.',
      footer: 'Jukwaa la Usimamizi la Peskas - WorldFish Center'
    }
  };

  const t = templates[language] || templates.en;

  // HTML email body with Tabler-style branding
  const htmlBody = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; border-radius: 10px; padding: 30px; margin-bottom: 20px;">
        <img src="${logoUrl}" width="240" height="43" alt="Peskas" style="display: block; width: 240px; height: 43px; border: 0; margin-bottom: 20px;">
        <h1 style="color: #206bc4; margin-bottom: 20px;">${t.heading}</h1>
        <p style="font-size: 16px; margin-bottom: 15px;">${t.greeting}</p>
        <p style="margin-bottom: 25px;">${t.body}</p>
        <a href="${resetUrl}" style="display: inline-block; background-color: #206bc4; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">${t.button}</a>
        <p style="margin-top: 25px; font-size: 14px; color: #666;">
          <strong>${t.expiry}</strong><br>
          ${t.ignore}
        </p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
        <p style="font-size: 12px; color: #999; text-align: center;">${t.footer}</p>
      </div>
    </body>
    </html>
  `;

  // Plain text fallback
  const textBody = `
${t.heading}

${t.greeting}

${t.body}

${resetUrl}

${t.expiry}
${t.ignore}

${t.footer}
  `;

  const params = {
    Source: `${process.env.AWS_SES_FROM_NAME} <${process.env.AWS_SES_FROM_EMAIL}>`,
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: t.subject, Charset: 'UTF-8' },
      Body: {
        Html: { Data: htmlBody, Charset: 'UTF-8' },
        Text: { Data: textBody, Charset: 'UTF-8' }
      }
    }
  };

  try {
    const command = new SendEmailCommand(params);
    const response = await sesClient.send(command);
    console.log('[EMAIL_SENT] Password reset email sent:', {
      email,
      messageId: response.MessageId,
      language
    });
    return { success: true, messageId: response.MessageId };
  } catch (error) {
    console.error('[EMAIL_ERROR] Failed to send password reset email:', {
      email,
      error: error.message,
      code: error.code
    });
    throw error;
  }
}

module.exports = { sendPasswordResetEmail };
