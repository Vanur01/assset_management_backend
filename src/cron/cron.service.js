import cron from 'node-cron';
import User  from '../models/user.model.js';
import EmailService from '../services/email.service.js';
import NotificationService from '../services/notification.service.js';

class CronService {
  constructor() {
    this.isRunning = false;
  }

  /**
   * Initialize all cron jobs
   */
  init() {
    if (this.isRunning) {
      console.log('Cron jobs already running');
      return;
    }

    console.log('Initializing cron jobs...');

    // Run daily at 9:00 AM
    cron.schedule('0 9 * * *', async () => {
      console.log('Running daily cron jobs...');
      await this.checkInactiveUsers();
      await this.checkExpiringSubscriptions();
    });

    // Run every hour for subscription expiry checks
    cron.schedule('0 * * * *', async () => {
      console.log('Running hourly subscription expiry check...');
      await this.checkExpiringSubscriptions();
    });

    // Run every 6 hours for inactivity checks
    cron.schedule('0 */6 * * *', async () => {
      console.log('Running inactivity check...');
      await this.checkInactiveUsers();
    });

    this.isRunning = true;
    console.log('Cron jobs initialized successfully');
  }

  /**
   * Check for inactive users (7+ days no login) and send reminders
   */
  async checkInactiveUsers() {
    console.log('Checking for inactive users...');
    
    try {
      const inactiveUsers = await User.getInactiveUsers(7);
      
      for (const user of inactiveUsers) {
        // Check if we've already sent an email in the last 7 days
        const lastEmailSent = user.lastInactivityEmailSent;
        const shouldSendEmail = !lastEmailSent || 
          (new Date() - lastEmailSent) > 7 * 24 * 60 * 60 * 1000;
        
        if (shouldSendEmail) {
          console.log(`Sending inactivity reminder to ${user.email} (${user.role})`);
          
          // Calculate actual days inactive
          const lastActivity = user.lastLogin || user.lastActiveAt || user.createdAt;
          const daysInactive = Math.floor((new Date() - lastActivity) / (1000 * 60 * 60 * 24));
          
          // Send email
          await EmailService.sendInactivityReminderEmail(user, daysInactive);
          
          // Create notification
          await NotificationService.notifyInactivity(user, daysInactive);
          
          // Update last email sent time
          user.lastInactivityEmailSent = new Date();
          await user.save();
        }
      }
      
      console.log(`Processed ${inactiveUsers.length} inactive users`);
    } catch (error) {
      console.error('Error checking inactive users:', error);
    }
  }

  /**
   * Check for expiring subscriptions and send reminders
   * Sends reminders at 7 days and 3 days before expiry
   */
  async checkExpiringSubscriptions() {
    console.log('Checking for expiring subscriptions...');
    
    try {
      const expiringSubscriptions = await User.getExpiringSubscriptions();
      
      for (const client of expiringSubscriptions) {
        const daysRemaining = this.calculateDaysRemaining(client.subscriptionEndDate);
        
        // Check if we need to send a notification for 7 days or 3 days
        const shouldSend7Day = daysRemaining <= 7 && daysRemaining > 3 && 
          (!client.lastExpiryNotificationSent || !client.lastExpiryNotificationSent.includes('7'));
        
        const shouldSend3Day = daysRemaining <= 3 && daysRemaining > 0 &&
          (!client.lastExpiryNotificationSent || !client.lastExpiryNotificationSent.includes('3'));
        
        if (shouldSend7Day) {
          console.log(`Sending 7-day expiry reminder to ${client.email}`);
          await EmailService.sendSubscriptionExpiryEmail(client, daysRemaining);
          await NotificationService.notifySubscriptionExpiry(client, daysRemaining);
          
          // Update notification tracking
          const notifications = client.lastExpiryNotificationSent ? 
            client.lastExpiryNotificationSent.split(',') : [];
          notifications.push('7');
          client.lastExpiryNotificationSent = notifications.join(',');
          await client.save();
        }
        
        if (shouldSend3Day) {
          console.log(`Sending 3-day expiry reminder to ${client.email}`);
          await EmailService.sendSubscriptionExpiryEmail(client, daysRemaining);
          await NotificationService.notifySubscriptionExpiry(client, daysRemaining);
          
          // Update notification tracking
          const notifications = client.lastExpiryNotificationSent ? 
            client.lastExpiryNotificationSent.split(',') : [];
          if (!notifications.includes('3')) {
            notifications.push('3');
            client.lastExpiryNotificationSent = notifications.join(',');
            await client.save();
          }
        }
      }
      
      console.log(`Processed ${expiringSubscriptions.length} expiring subscriptions`);
    } catch (error) {
      console.error('Error checking expiring subscriptions:', error);
    }
  }

  calculateDaysRemaining(subscriptionEndDate) {
    if (!subscriptionEndDate) return 0;
    const diff = subscriptionEndDate - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }
}

export default new CronService();