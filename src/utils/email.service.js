import { sendMail } from "../config/email.js";
import logger from "../utils/logger.js";

export const sendWelcomeEmail = async (user) => {
  try {
    const html = `
      <h1>Welcome ${user.name}!</h1>
      <p>Thank you for joining our platform.</p>
    `;

    const result = await sendMail({
      to: user.email,
      subject: "Welcome to Our Platform",
      html,
    });

    if (result.success) {
      logger.info(`Welcome email sent to ${user.email}`);
    }
  } catch (error) {
    logger.error("Failed to send welcome email", { error, userId: user.id });
  }
};

export const sendPasswordResetEmail = async (email, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  
  const html = `
    <h1>Password Reset Request</h1>
    <p>Click the link below to reset your password:</p>
    <a href="${resetUrl}">${resetUrl}</a>
    <p>This link will expire in 1 hour.</p>
  `;

  return sendMail({
    to: email,
    subject: "Password Reset Request",
    html,
  });
};