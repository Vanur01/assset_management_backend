
import User from '../models/user.model.js';
import AuditLog from '../models/auditLog.model.js';
import Asset from '../models/asset.model.js'
import crypto from 'crypto';
import EmailService from './email.service.js';
import NotificationService from './notification.service.js';
import { NotFoundError, ConflictError, ValidationError } from '../errors/customError.js';

class ClientService {
  async createClient(data, createdBy) {
    const existing = await User.findOne({ email: data.email });
    if (existing) throw new ConflictError('Email already registered');

    const tempPassword = data.password || crypto.randomBytes(8).toString('hex');
    const durationDays = data.duration || 30;
    const subscriptionEndDate = new Date();
    subscriptionEndDate.setDate(subscriptionEndDate.getDate() + durationDays);

    // Generate password reset token for welcome email
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    const client = await User.create({
      customerName: data.customerName,
      email: data.email,
      password: tempPassword,
      phone: data.phone,
      website: data.website,
      address: data.address,
      role: 'admin',
      status: 'active',
      membershipPlan: data.membershipPlan || 'standard',
      subscriptionEndDate,
      licenseLimit: data.licenseLimit || 10,
      storageLimit: data.storageLimit || 10,
      apiCallLimit: data.apiCallLimit || 10000,
      notes: data.notes,
      createdBy,
      settings: { autoRenewal: data.autoRenewal !== false },
      passwordResetToken: hashedToken,
      passwordResetExpires: Date.now() + 3 * 24 * 60 * 60 * 1000 // 3 days
    });

    // Send welcome email with reset link
    client.passwordResetToken = resetToken; // Store plain token for email
    await EmailService.sendClientWelcomeEmail(client, tempPassword, createdBy);
    client.passwordResetToken = hashedToken; // Restore hashed token
    await client.save();

    // Create notification for super admin
    const superAdmin = await User.findById(createdBy);
    if (superAdmin) {
      await NotificationService.notifyClientCreated(client, superAdmin);
    }

    await AuditLog.create({
      action: 'CREATE',
      resource: 'user',
      resourceId: client._id,
      actor: createdBy,
      actorRole: 'super_admin',
      description: `Client ${client.customerName} created`,
      newData: { customerName: client.customerName, email: client.email, plan: client.membershipPlan }
    });

    const response = client.toObject();
    delete response.password;
    delete response.passwordResetToken;
    return response;
  }

  async getAllClients(filters = {}) {
    const {
      status, membershipPlan, search, expiringSoon,
      page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc'
    } = filters;

    const query = { role: 'admin', isDeleted: false };
    if (status) query.status = status;
    if (membershipPlan) query.membershipPlan = membershipPlan;
    if (search) {
      query.$or = [
        { customerName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    if (expiringSoon === 'true') {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      query.subscriptionEndDate = { $lte: thirtyDaysFromNow, $gt: new Date() };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [clients, total] = await Promise.all([
      User.find(query)
        .select('-password -refreshToken -passwordResetToken')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(query)
    ]);

    const clientsWithStats = await Promise.all(clients.map(async (client) => {
      const teamCount = await User.countDocuments({ adminId: client._id, role: 'team', isDeleted: false });
      const assetCount = await Asset.countDocuments({ adminId: client._id, isDeleted: false });
      return {
        ...client,
        daysRemaining: this.calculateDaysRemaining(client.subscriptionEndDate),
        usagePercentage: client.usagePercentage || Math.round((teamCount / client.licenseLimit) * 100),
        stats: { teamCount, assetCount }
      };
    }));

    const summary = {
      total,
      totalCustomers: total,
      activeCustomers: clients.filter(c => c.status === 'active').length,
      expiringSoon: clientsWithStats.filter(c => c.daysRemaining <= 30 && c.daysRemaining > 0).length,
      byPlan: {
        free: clients.filter(c => c.membershipPlan === 'free').length,
        standard: clients.filter(c => c.membershipPlan === 'standard').length,
        premium: clients.filter(c => c.membershipPlan === 'premium').length,
        enterprise: clients.filter(c => c.membershipPlan === 'enterprise').length
      }
    };

    return {
      clients: clientsWithStats,
      summary,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    };
  }

  async getClientById(clientId) {
    const client = await User.findOne({ _id: clientId, role: 'admin', isDeleted: false })
      .select('-password -refreshToken -passwordResetToken')
      .lean();
    if (!client) throw new NotFoundError('Client not found');

    const [teamCount, activeTeamCount, assetCount] = await Promise.all([
      User.countDocuments({ adminId: clientId, role: 'team', isDeleted: false }),
      User.countDocuments({ adminId: clientId, role: 'team', status: 'active', isDeleted: false }),
      Asset.countDocuments({ adminId: clientId, isDeleted: false })
    ]);

    return {
      ...client,
      daysRemaining: this.calculateDaysRemaining(client.subscriptionEndDate),
      usagePercentage: client.usagePercentage,
      storagePercentage: client.storagePercentage,
      apiUsagePercentage: client.apiUsagePercentage,
      stats: { team: { total: teamCount, active: activeTeamCount }, assets: assetCount }
    };
  }

  async updateClient(clientId, updateData, actorId) {
    const client = await User.findOne({ _id: clientId, role: 'admin' });
    if (!client) throw new NotFoundError('Client not found');

    const oldData = { ...client.toObject() };
    delete oldData.password;

    if (updateData.email && updateData.email !== client.email) {
      const existing = await User.findOne({ email: updateData.email });
      if (existing) throw new ConflictError('Email already in use');
    }

    if (updateData.extendDays) {
      const baseDate = client.subscriptionEndDate ? new Date(client.subscriptionEndDate) : new Date();
      baseDate.setDate(baseDate.getDate() + Number(updateData.extendDays));
      updateData.subscriptionEndDate = baseDate;
      delete updateData.extendDays;
    }

    Object.assign(client, updateData);
    await client.save();

    await AuditLog.create({
      action: 'UPDATE',
      resource: 'user',
      resourceId: client._id,
      actor: actorId,
      actorRole: 'super_admin',
      description: `Client ${client.customerName} updated`,
      oldData: { customerName: oldData.customerName, email: oldData.email, plan: oldData.membershipPlan },
      newData: { customerName: client.customerName, email: client.email, plan: client.membershipPlan }
    });

    const response = client.toObject();
    delete response.password;
    return response;
  }

  async deleteClient(clientId, actorId) {
    const client = await User.findOne({ _id: clientId, role: 'admin' });
    if (!client) throw new NotFoundError('Client not found');

    await client.softDelete(actorId);

    // Send deactivation email
    await EmailService.sendClientDeactivatedEmail(client, actorId);

    // Create notification
    const superAdmin = await User.findById(actorId);
    if (superAdmin) {
      await NotificationService.notifyClientDeactivated(client, superAdmin);
    }

    await AuditLog.create({
      action: 'SOFT_DELETE',
      resource: 'user',
      resourceId: client._id,
      actor: actorId,
      actorRole: 'super_admin',
      description: `Client ${client.customerName} deactivated`
    });

    return { message: 'Client deactivated successfully' };
  }

  async toggleClientStatus(clientId, status, actorId) {
    if (!['active', 'inactive'].includes(status)) {
      throw new ValidationError([{ field: 'status', message: 'Status must be either "active" or "inactive"' }]);
    }
    
    const client = await User.findOne({ _id: clientId, role: 'admin' });
    if (!client) throw new NotFoundError('Client not found');
    if (client.status === status) {
      throw new ConflictError(`Client is already ${status === 'active' ? 'active' : 'inactive'}`);
    }

    client.status = status;
    if (status === 'inactive') {
      await User.updateMany({ adminId: clientId, role: 'team', isDeleted: false }, { status: 'inactive' });
    }
    await client.save();

    if (status === 'inactive') {
      await EmailService.sendClientDeactivatedEmail(client, actorId);
    }

    await AuditLog.create({
      action: 'STATUS_CHANGE',
      resource: 'user',
      resourceId: client._id,
      actor: actorId,
      actorRole: 'super_admin',
      description: `Client ${client.customerName} status changed to ${status}`,
      oldData: { status: client.status === 'active' ? 'inactive' : 'active' },
      newData: { status }
    });

    return { success: true, message: `Client ${status === 'active' ? 'activated' : 'deactivated'} successfully` };
  }

  async toggleAutoRenewal(clientId, enabled) {
    const client = await User.findOne({ _id: clientId, role: 'admin' });
    if (!client) throw new NotFoundError('Client not found');
    if (!client.settings) client.settings = {};
    client.settings.autoRenewal = enabled;
    await client.save();
    return { autoRenewal: enabled };
  }

  calculateDaysRemaining(subscriptionEndDate) {
    if (!subscriptionEndDate) return 0;
    const diff = subscriptionEndDate - new Date();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  }
}

export default new ClientService();