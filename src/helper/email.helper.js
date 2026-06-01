// utils/emailService.js - Fixed with proper error handling

import nodemailer from "nodemailer";

// Validate required environment variables
const validateEmailConfig = () => {
  const required = ['EMAIL_USERNAME', 'EMAIL_PASSWORD', 'EMAIL_FROM'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error(`Missing email configuration: ${missing.join(', ')}`);
    return false;
  }
  
  // Validate EMAIL_FROM format
  const emailFrom = process.env.EMAIL_FROM;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailFrom)) {
    console.error(`Invalid EMAIL_FROM format: ${emailFrom}`);
    return false;
  }
  
  return true;
};

// Create transporter with better configuration
const createTransporter = () => {
  // For Gmail (recommended for testing)
  if (process.env.EMAIL_SERVICE === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD, // Use App Password for Gmail
      },
    });
  }
  
  // For SMTP (mailer91.com or others)
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.mailer91.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
    tls: {
      rejectUnauthorized: false, // For self-signed certificates
    },
    connectionTimeout: 10000, // 10 seconds
  });
};

// Send email with retry logic
export const sendEmail = async (to, subject, html, retries = 2) => {
  // Skip email sending in development if configured
  if (process.env.SKIP_EMAILS === 'true') {
    console.log(`[EMAIL SKIPPED] To: ${to}, Subject: ${subject}`);
    return { success: true, message: 'Email skipped (development mode)' };
  }

  // Validate configuration
  if (!validateEmailConfig()) {
    console.error('Email configuration invalid, skipping email send');
    return { success: false, error: 'Email configuration invalid' };
  }

  // Validate recipient
  if (!to || !to.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    console.error(`Invalid recipient email: ${to}`);
    return { success: false, error: 'Invalid recipient email' };
  }

  let lastError;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const transporter = createTransporter();
      
      // Verify connection before sending
      await transporter.verify();
      
      const mailOptions = {
        from: `"Asset Management Platform" <${process.env.EMAIL_FROM}>`,
        to: to.trim(),
        subject: subject.trim(),
        html: html,
        // Add fallback text version
        text: html.replace(/<[^>]*>/g, ''), // Simple HTML to text conversion
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`Email sent successfully to ${to} (Attempt ${attempt}):`, info.messageId);
      return { success: true, messageId: info.messageId };
      
    } catch (error) {
      lastError = error;
      console.error(`Email attempt ${attempt} failed for ${to}:`, error.message);
      
      // Wait before retry (exponential backoff)
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }
  
  console.error(`All ${retries} email attempts failed for ${to}`);
  return { success: false, error: lastError?.message };
};

// Alternative: Log email to console instead of sending (useful for development)
export const logEmail = (to, subject, html) => {
  console.log('\n📧 ========== EMAIL LOGGED (Not Sent) ==========');
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Body: ${html.replace(/<[^>]*>/g, '').substring(0, 500)}...`);
  console.log('================================================\n');
  return { success: true, logged: true };
};

// Wrapper that chooses between sending or logging based on environment
export const sendEmailSafe = async (to, subject, html) => {
  if (process.env.NODE_ENV === 'development' && process.env.LOG_EMAILS_ONLY === 'true') {
    return logEmail(to, subject, html);
  }
  return sendEmail(to, subject, html);
};