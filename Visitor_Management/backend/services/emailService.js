require('dotenv').config();
const nodemailer = require('nodemailer');

console.log('[emailService] Initializing transporter with host:', process.env.MAIL_HOST || 'smtp.gmail.com');
console.log('[emailService] MAIL_USER configured:', !!process.env.MAIL_USER);

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.MAIL_PORT || '587', 10),
  secure: false,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

async function sendOtpEmail({ to, code, method, contact }) {
  const subject = 'Your Breakthru.ai Verification Code';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #0f172a;">
      <h2 style="color: #0a1628;">Breakthru.ai Verification</h2>
      <p>Use the following OTP to verify your ${method === 'phone' ? 'mobile number' : 'email address'}:</p>
      <div style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #2563eb; margin: 16px 0;">${code}</div>
      <p style="color: #64748b; font-size: 13px;">This code will expire in 5 minutes. Do not share it with anyone.</p>
    </div>
  `;

  console.log('[sendOtpEmail] Sending OTP to:', to);
  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.MAIL_USER,
    to,
    subject,
    html,
  });

  console.log('[sendOtpEmail] Email sent, messageId:', info.messageId);
  return info;
}

module.exports = { sendOtpEmail };
