import User from '../models/user.model.js';
import Notification from '../models/notification.model.js';

class NotificationService {
  /**
   * Create a notification for a user
   */
  async createNotification({
    recipient,
    recipientRole,
    title,
    message,
    type,
    priority = 'medium',
    sender = null,
    actionLink = null,
    relatedEntityId = null,
    relatedEntityModel = null,
    metadata = {},
    createdBy = null
  }) {
    try {
      const notification = await Notification.create({
        recipient,
        recipientRole,
        title,
        message,
        type,
        priority,
        sender,
        actionLink,
        relatedEntityId,
        relatedEntityModel,
        metadata,
        createdBy
      });
      
      console.log(`Notification created for ${recipientRole} ${recipient}: ${type}`);
      return notification;
    } catch (error) {
      console.error('Failed to create notification:', error);
      return null;
    }
  }

  /**
   * Get notifications for a user with pagination
   */
  async getUserNotifications(userId, { page = 1, limit = 20, unreadOnly = false }) {
    const query = { recipient: userId };
    if (unreadOnly) query.isRead = false;
    
    const skip = (page - 1) * limit;
    
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(query),
      Notification.getUnreadCount(userId)
    ]);
    
    return {
      notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      unreadCount
    };
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId, userId) {
    console.log("userId..........", userId)
    const notification = await Notification.findOne({ _id: notificationId, recipient: userId });
    if (!notification) {
      throw new Error('Notification not found');
    }
    await notification.markAsRead();
    return notification;
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId) {
    const result = await Notification.markAllAsRead(userId);
    return { modifiedCount: result.modifiedCount };
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId, userId) {
    const result = await Notification.deleteOne({ _id: notificationId, recipient: userId });
    return { deleted: result.deletedCount > 0 };
  }

  /**
   * Create team member created notifications
   */
  async notifyTeamMemberCreated(member, admin, tempPassword) {
    // Notification for admin
    await this.createNotification({
      recipient: admin._id,
      recipientRole: 'admin',
      title: 'New Team Member Added',
      message: `${member.firstName} ${member.lastName || ''} has been added as ${member.customRole || 'team member'}.`,
      type: 'team_created',
      priority: 'medium',
      sender: admin._id,
      relatedEntityId: member._id,
      relatedEntityModel: 'User',
      metadata: { memberId: member._id, memberEmail: member.email, tempPassword }
    });
  }

  /**
   * Create client created notifications
   */
  async notifyClientCreated(client, superAdmin) {
    // Notification for super admin
    await this.createNotification({
      recipient: superAdmin._id,
      recipientRole: 'super_admin',
      title: 'New Client Registered',
      message: `${client.customerName} (${client.email}) has been registered as a new client.`,
      type: 'client_created',
      priority: 'medium',
      sender: superAdmin._id,
      relatedEntityId: client._id,
      relatedEntityModel: 'User',
      metadata: { clientId: client._id, clientName: client.customerName }
    });
  }

  /**
   * Create team member deactivated notification
   */
  async notifyTeamMemberDeactivated(member, admin) {
    // Notification for admin
    await this.createNotification({
      recipient: admin._id,
      recipientRole: 'admin',
      title: 'Team Member Deactivated',
      message: `${member.firstName} ${member.lastName || ''} has been deactivated from the team.`,
      type: 'team_deactivated',
      priority: 'medium',
      sender: admin._id,
      relatedEntityId: member._id,
      relatedEntityModel: 'User',
      metadata: { memberId: member._id, memberEmail: member.email }
    });
  }

  /**
   * Create client deactivated notification
   */
  async notifyClientDeactivated(client, superAdmin) {
    // Notification for super admin
    await this.createNotification({
      recipient: superAdmin._id,
      recipientRole: 'super_admin',
      title: 'Client Deactivated',
      message: `${client.customerName} (${client.email}) has been deactivated.`,
      type: 'client_deactivated',
      priority: 'medium',
      sender: superAdmin._id,
      relatedEntityId: client._id,
      relatedEntityModel: 'User',
      metadata: { clientId: client._id, clientName: client.customerName }
    });
  }

  /**
   * Create subscription expiry notification
   */
  async notifySubscriptionExpiry(client, daysRemaining) {
    // Notification for client (admin)
    await this.createNotification({
      recipient: client._id,
      recipientRole: 'admin',
      title: `Subscription Expiring in ${daysRemaining} Days`,
      message: `Your subscription will expire on ${new Date(client.subscriptionEndDate).toLocaleDateString()}. Please renew to continue using our services.`,
      type: 'subscription_expiring',
      priority: daysRemaining <= 3 ? 'urgent' : 'high',
      actionLink: `${process.env.FRONTEND_URL}/settings/billing`,
      relatedEntityId: client._id,
      relatedEntityModel: 'User',
      metadata: { daysRemaining, expiryDate: client.subscriptionEndDate }
    });
  }

  /**
   * Create inactivity reminder notification
   */
  async notifyInactivity(user, daysInactive) {
    const roleText = user.role === 'admin' ? 'Organization' : 'Team Member';
    await this.createNotification({
      recipient: user._id,
      recipientRole: user.role,
      title: `Account Inactivity Alert`,
      message: `Your ${roleText.toLowerCase()} account has been inactive for ${daysInactive} days. Please log in to keep your account active.`,
      type: 'inactivity_reminder',
      priority: 'medium',
      relatedEntityId: user._id,
      relatedEntityModel: 'User',
      metadata: { daysInactive, lastLogin: user.lastLogin }
    });
  }

  /**
   * Create contact inquiry notification for super admin
   */
  async notifyContactInquiry(inquiryData) {
    const superAdmins = await User.find({ role: 'super_admin', status: 'active', isDeleted: false });
    
    for (const admin of superAdmins) {
      await this.createNotification({
        recipient: admin._id,
        recipientRole: 'super_admin',
        title: 'New Contact Inquiry',
        message: `New inquiry from ${inquiryData.fullName} (${inquiryData.email}): "${inquiryData.message.substring(0, 100)}${inquiryData.message.length > 100 ? '...' : ''}"`,
        type: 'contact_inquiry',
        priority: 'high',
        actionLink: `${process.env.FRONTEND_URL}/admin/contact-inquiries`,
        metadata: { inquiryData }
      });
    }
  }

  /**
   * Get notifications for team member (clients can see team notifications)
   */
  async getTeamNotifications(adminId, filters = {}) {
    const teamMembers = await User.find({ adminId, role: 'team', isDeleted: false }).select('_id');
    const teamIds = teamMembers.map(m => m._id);
    
    const query = { recipient: { $in: teamIds } };
    if (filters.type) query.type = filters.type;
    if (filters.unreadOnly) query.isRead = false;
    
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(filters.limit || 50)
      .lean();
    
    return notifications;
  }

  /**
   * Get notifications for clients (super admin can see client notifications)
   */
  async getClientNotifications(filters = {}) {
    const clients = await User.find({ role: 'admin', isDeleted: false }).select('_id');
    const clientIds = clients.map(c => c._id);
    
    const query = { recipient: { $in: clientIds } };
    if (filters.type) query.type = filters.type;
    if (filters.unreadOnly) query.isRead = false;
    
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(filters.limit || 50)
      .lean();
    
    return notifications;
  }
}

export default new NotificationService();