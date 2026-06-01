import nodemailer from 'nodemailer';
import {
  getNewClientEmailTemplate,
  getNewTeamMemberEmailTemplate,
  getTeamMemberRemovedEmailTemplate,
  getClientDeactivatedEmailTemplate,
  getContactInquiryEmailTemplate,
  getContactInquiryAdminEmailTemplate,
  getInactivityReminderEmailTemplate,
  getSubscriptionExpiryEmailTemplate,
  getPasswordResetEmailTemplate
} from '../utils/emailTemplates.js';
import AuditLog from '../models/auditLog.model.js';

// Validate email configuration
const validateEmailConfig = () => {
  const required = ['EMAIL_USERNAME', 'EMAIL_PASSWORD', 'EMAIL_FROM'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error(`Missing email configuration: ${missing.join(', ')}`);
    return false;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(process.env.EMAIL_FROM)) {
    console.error(`Invalid EMAIL_FROM format: ${process.env.EMAIL_FROM}`);
    return false;
  }
  
  return true;
};

// Create transporter
const createTransporter = () => {
  if (process.env.EMAIL_SERVICE === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }
  
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.mailer91.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USERNAME,
      pass: process.env.EMAIL_PASSWORD,
    },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 10000,
  });
};

// Base email sending function
const sendEmail = async (to, subject, html, metadata = {}) => {
  if (process.env.SKIP_EMAILS === 'true') {
    console.log(`[EMAIL SKIPPED] To: ${to}, Subject: ${subject}`);
    return { success: true, message: 'Email skipped (development mode)' };
  }

  if (!validateEmailConfig()) {
    console.error('Email configuration invalid');
    return { success: false, error: 'Email configuration invalid' };
  }

  if (!to || !to.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    console.error(`Invalid recipient email: ${to}`);
    return { success: false, error: 'Invalid recipient email' };
  }

  try {
    const transporter = createTransporter();
    await transporter.verify();
    
    const mailOptions = {
      from: `"Asset Management Platform" <${process.env.EMAIL_FROM}>`,
      to: to.trim(),
      subject: subject.trim(),
      html: html,
      text: html.replace(/<[^>]*>/g, ''),
    };

    const info = await transporter.sendMail(mailOptions);
    
    // Log email sent
    await AuditLog.create({
      action: 'EMAIL_SENT',
      resource: 'email',
      resourceId: info.messageId,
      actor: metadata.actorId || null,
      actorRole: metadata.actorRole || 'system',
      description: `Email sent to ${to}: ${subject}`,
      metadata: { to, subject, ...metadata }
    });
    
    console.log(`Email sent successfully to ${to}:`, info.messageId);
    return { success: true, messageId: info.messageId };
    
  } catch (error) {
    console.error(`Email failed for ${to}:`, error.message);
    return { success: false, error: error.message };
  }
};

// Email sending methods
class EmailService {
  async sendClientWelcomeEmail(client, actorId = null) {
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${client.passwordResetToken || ''}`;
    const html = getNewClientEmailTemplate(client, resetLink);
    const result = await sendEmail(client.email, 'Welcome to Asset Management Platform', html, {
      actorId,
      actorRole: 'super_admin',
      type: 'client_welcome'
    });
    return result;
  }

  async sendTeamMemberWelcomeEmail(member, admin, tempPassword, resetToken, actorId = null) {
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    const html = getNewTeamMemberEmailTemplate(member, admin, tempPassword, resetLink);
    const result = await sendEmail(member.email, 'Welcome to the Team!', html, {
      actorId,
      actorRole: 'admin',
      type: 'team_welcome'
    });
    return result;
  }

  async sendTeamMemberRemovedEmail(member, admin, actorId = null) {
    const html = getTeamMemberRemovedEmailTemplate(member, admin);
    const result = await sendEmail(member.email, 'Your Account Access Has Been Updated', html, {
      actorId,
      actorRole: 'admin',
      type: 'team_removed'
    });
    return result;
  }

  async sendClientDeactivatedEmail(client, actorId = null) {
    const html = getClientDeactivatedEmailTemplate(client);
    const result = await sendEmail(client.email, 'Your Account Has Been Deactivated', html, {
      actorId,
      actorRole: 'super_admin',
      type: 'client_deactivated'
    });
    return result;
  }

  async sendContactConfirmationEmail(inquiryData) {
    const html = getContactInquiryEmailTemplate(inquiryData);
    const result = await sendEmail(inquiryData.email, 'We received your inquiry - Asset Management Platform', html, {
      type: 'contact_confirmation'
    });
    return result;
  }

  async sendContactAdminNotificationEmail(inquiryData) {
    const adminEmail = process.env.ADMIN_EMAIL || 'psamantaray77@gmail.com';
    const html = getContactInquiryAdminEmailTemplate(inquiryData);
    const result = await sendEmail(adminEmail, 'New Contact Inquiry Received', html, {
      type: 'contact_admin_notification'
    });
    return result;
  }

  async sendInactivityReminderEmail(user, daysInactive, actorId = null) {
    const html = getInactivityReminderEmailTemplate(user, daysInactive);
    const roleText = user.role === 'admin' ? 'Organization' : 'Team Member';
    const result = await sendEmail(user.email, `${roleText} Account Inactivity Notice`, html, {
      actorId,
      actorRole: 'system',
      type: 'inactivity_reminder'
    });
    return result;
  }

  async sendSubscriptionExpiryEmail(client, daysRemaining, actorId = null) {
    const html = getSubscriptionExpiryEmailTemplate(client, daysRemaining);
    const result = await sendEmail(client.email, `Your Subscription Will Expire in ${daysRemaining} Days`, html, {
      actorId,
      actorRole: 'system',
      type: 'subscription_expiry'
    });
    return result;
  }

  async sendPasswordResetEmail(user, resetToken, actorId = null) {
    const resetLink = `http://localhost:5173/reset-password?token=${resetToken}`;
    const html = getPasswordResetEmailTemplate(user, resetLink);
    const result = await sendEmail(user.email, 'Reset Your Password - Asset Management Platform', html, {
      actorId,
      actorRole: user.role,
      type: 'password_reset'
    });
    return result;
  }
}

export default new EmailService();