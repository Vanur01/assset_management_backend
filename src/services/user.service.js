// services/user.service.js - Updated with Email Notifications & Custom Roles

import User from '../models/user.model.js';
import Asset from '../models/asset.model.js';
import Assignment from '../models/AssignedChecklist.model.js';
import Contact from '../models/contact.model.js';
import crypto from 'crypto';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import { sendEmail } from '../helper/email.helper.js';
import {
  getNewClientEmailTemplate,
  getNewTeamMemberEmailTemplate,
  getTeamMemberRemovedEmailTemplate,
  getClientDeactivatedEmailTemplate,
  getContactInquiryAdminEmailTemplate,
 getContactInquiryEmailTemplate
} from '../utils/emailTemplates.js';
import {
  AuthenticationError,
  ValidationError,
  NotFoundError,
  AuthorizationError,
  ConflictError
} from '../errors/customError.js';

class UserService {

  // ==================== AUTHENTICATION METHODS ====================

  async registersuper_admin(data) {
    const existingUser = await User.findOne({ email: data.email });
    if (existingUser) throw new ConflictError('Email already registered');

    const super_admin = await User.create({
      name: data.name,
      email: data.email,
      password: data.password,
      phone: data.phone || null,
      role: 'super_admin',
      status: 'active',
      permissions: ['*']
    });

    const accessToken = super_admin.generateAuthToken();
    const refreshToken = super_admin.generateRefreshToken();
    super_admin.refreshToken = refreshToken;
    await super_admin.save();

    return { user: this.formatUserResponse(super_admin), accessToken, refreshToken };
  }

  async login({ email, password }) {
    const user = await User.findOne({ email }).select('+password');
    if (!user) throw new AuthenticationError('Invalid email or password');
    if (user.isDeleted) throw new AuthenticationError('Account not found');
    if (user.status !== 'active') throw new AuthenticationError('Account is not active');

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) throw new AuthenticationError('Invalid email or password');

    user.lastLogin = new Date();
    user.lastActiveAt = new Date();
    if (user.role === 'team') user.lastLoginDate = new Date();

    const accessToken = user.generateAuthToken();
    const refreshToken = user.generateRefreshToken();
    user.refreshToken = refreshToken;
    await user.save();

    return { accessToken, refreshToken, user: this.formatUserResponse(user) };
  }

  async logout(userId) {
    await User.findByIdAndUpdate(userId, { $unset: { refreshToken: 1, token: 1 } });
    return true;
  }

  async getCurrentUser(userId) {
    const user = await User.findById(userId).lean();
    if (!user) throw new NotFoundError('User not found');
    return this.formatUserResponse(user);
  }

  async changePassword(userId, currentPassword, newPassword) {
    const user = await User.findById(userId).select('+password');
    if (!user) throw new NotFoundError('User not found');

    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) throw new ValidationError([{ field: 'currentPassword', message: 'Current password is incorrect' }]);

    user.password = newPassword;
    user.refreshToken = undefined;
    await user.save();
    return true;
  }

  async updateLastActive(userId) {
    await User.findByIdAndUpdate(userId, { lastActiveAt: new Date(), lastLogin: new Date() });
    return true;
  }

  // ==================== CLIENT MANAGEMENT (Super Admin Only) ====================

  async createClient(data, createdBy) {
    const existing = await User.findOne({ email: data.email });
    if (existing) throw new ConflictError('Email already registered');

    const tempPassword = data.password || crypto.randomBytes(8).toString('hex');
    const durationDays = data.duration || 30;
    const subscriptionEndDate = new Date();
    subscriptionEndDate.setDate(subscriptionEndDate.getDate() + durationDays);

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
      settings: { autoRenewal: data.autoRenewal !== false }
    });

    // Send welcome email with credentials
    const emailHtml = getNewClientEmailTemplate(client, tempPassword);
    await sendEmail(client.email, 'Welcome to Asset Management Platform', emailHtml).catch(err => {
      console.error('Failed to send welcome email:', err);
    });

    const response = client.toObject();
    delete response.password;
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
        .select('-password -refreshToken')
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
        daysRemaining: client.daysRemaining,
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
      .select('-password -refreshToken')
      .lean();
    if (!client) throw new NotFoundError('Client not found');

    const [teamCount, activeTeamCount, assetCount] = await Promise.all([
      User.countDocuments({ adminId: clientId, role: 'team', isDeleted: false }),
      User.countDocuments({ adminId: clientId, role: 'team', status: 'active', isDeleted: false }),
      Asset.countDocuments({ adminId: clientId, isDeleted: false })
    ]);

    return {
      ...client,
      daysRemaining: client.daysRemaining,
      usagePercentage: client.usagePercentage,
      storagePercentage: client.storagePercentage,
      apiUsagePercentage: client.apiUsagePercentage,
      stats: { team: { total: teamCount, active: activeTeamCount }, assets: assetCount }
    };
  }

  async updateClient(clientId, updateData) {
    const client = await User.findOne({ _id: clientId, role: 'admin' });
    if (!client) throw new NotFoundError('Client not found');

    if (updateData.email && updateData.email !== client.email) {
      const existing = await User.findOne({ email: updateData.email });
      if (existing) throw new ConflictError('Email already in use');
    }

    if (updateData.extendDays) {
      const baseDate = client.subscriptionEndDate
        ? new Date(client.subscriptionEndDate)
        : new Date();
      baseDate.setDate(baseDate.getDate() + Number(updateData.extendDays));
      updateData.subscriptionEndDate = baseDate;
      delete updateData.extendDays;
    }

    Object.assign(client, updateData);
    await client.save();
    const response = client.toObject();
    delete response.password;
    return response;
  }

  async deleteClient(clientId, permanent = false) {
    const client = await User.findOne({ _id: clientId, role: 'admin' });
    if (!client) throw new NotFoundError('Client not found');

    // Soft delete only - no permanent deletion
    await client.softDelete(client.createdBy);

    // Send notification email
    const emailHtml = getClientDeactivatedEmailTemplate(client);
    await sendEmail(client.email, 'Your Account Has Been Deactivated', emailHtml).catch(err => {
      console.error('Failed to send deactivation email:', err);
    });

    return { message: 'Client deactivated successfully' };
  }

  async toggleClientStatus(clientId, status) {
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

    // Send notification on deactivation
    if (status === 'inactive') {
      const emailHtml = getClientDeactivatedEmailTemplate(client);
      await sendEmail(client.email, 'Your Account Has Been Deactivated', emailHtml).catch(err => {
        console.error('Failed to send deactivation email:', err);
      });
    }

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

  // ==================== CUSTOM ROLES MANAGEMENT ====================

  async getAllCustomRoles(adminId) {
    const roles = await User.getAllCustomRoles(adminId);
    return { roles };
  }

  async addCustomRole(adminId, roleName) {
    if (!roleName || roleName.trim() === '') {
      throw new ValidationError([{ field: 'roleName', message: 'Role name is required' }]);
    }

    const existingRoles = await User.getAllCustomRoles(adminId);
    if (existingRoles.includes(roleName)) {
      throw new ConflictError(`Role "${roleName}" already exists`);
    }

    // Just return success - roles are stored on team members directly
    return { success: true, role: roleName, message: `Role "${roleName}" added successfully` };
  }

  // ==================== TEAM MANAGEMENT (Enhanced) ====================

  async createTeamMember(data, adminId, createdBy) {
    const admin = await User.findOne({ _id: adminId, role: 'admin', isDeleted: false });
    if (!admin) throw new NotFoundError('Admin not found');
    if (!admin.canAddUsers(1)) {
      throw new AuthorizationError(`License limit reached (${admin.usersUsed}/${admin.licenseLimit})`);
    }

    const existing = await User.findOne({ email: data.email });
    if (existing) throw new ConflictError('Email already registered');

    const tempPassword = data.password || crypto.randomBytes(6).toString('hex') + '@123';

    const member = await User.create({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      password: tempPassword,
      phone: data.phone,
      role: 'team',
      customRole: data.customRole || null, // Allow custom role
      department: data.department,
      location: data.location,
      address: data.address,
      bio: data.bio,
      adminId,
      createdBy,
      status: 'active',
      joinDate: new Date(),
      certifications: data.certifications || []
    });

    admin.usersUsed = await User.countDocuments({
      adminId, role: 'team', status: 'active', isDeleted: false
    });
    await admin.save();

    // Send welcome email
    const emailHtml = getNewTeamMemberEmailTemplate(member, admin, tempPassword);
    await sendEmail(member.email, 'Welcome to the Team!', emailHtml).catch(err => {
      console.error('Failed to send welcome email:', err);
    });

    const response = member.toObject();
    delete response.password;
    response.temporaryPassword = tempPassword;
    return response;
  }

  async getAllTeamMembers(adminId, query = {}) {
    const defaultQuery = {
      sortBy: 'performanceScore',
      sortOrder: 'desc',
      page: 1,
      limit: 10,
      ...query
    };

    const result = await User.getTeamMembersWithStats(adminId, defaultQuery);

    return {
      members: result.members.map(member => ({
        id: member.id,
        name: member.fullName,
        initials: member.initials,
        email: member.email,
        role: member.roleDisplay,
        customRole: member.role,
        assignedCount: member.assignedCount,
        completedCount: member.completedCount,
        performance: `${member.performanceScore}%`,
        performanceScore: member.performanceScore,
        status: member.status,
        statusColor: member.status === 'active' ? 'green' :
          member.status === 'on_leave' ? 'orange' :
            member.status === 'inactive' ? 'gray' : 'red',
        avatarUrl: member.avatarUrl,
        department: member.department,
        location: member.location,
        phone: member.phone
      })),
      stats: {
        total: result.stats.total,
        active: result.stats.active,
        onLeave: result.stats.onLeave,
        avgPerformance: `${result.stats.avgPerformance}%`,
        totalInspections: result.stats.totalInspections,
        totalAssigned: result.stats.totalAssigned,
        byRole: result.stats.byRole
      },
      pagination: result.pagination
    };
  }

  async getTeamMemberById(memberId, adminId) {
    const member = await User.findOne({
      _id: memberId, role: 'team', adminId, isDeleted: false
    }).select('-password -refreshToken -token').lean();

    if (!member) throw new NotFoundError('Team member not found');

    const Assignment = mongoose.model('Assignments');
    const assignments = await Assignment.find({
      'assignedToTeamMembers.userId': member._id
    }).lean();

    const assignedCount = assignments.filter(a =>
      a.status === 'pending' || a.status === 'in_progress' || a.status === 'assigned'
    ).length;

    const completedCount = assignments.filter(a =>
      a.status === 'completed' || a.status === 'approved'
    ).length;

    const performanceScore = member.performanceScore ||
      (assignedCount + completedCount > 0
        ? Math.round((completedCount / (assignedCount + completedCount)) * 100)
        : 0);

    return {
      ...member,
      assignedCount,
      completedCount,
      performanceScore,
      performanceDisplay: `${performanceScore}%`,
      completionRate: assignedCount + completedCount > 0
        ? Math.round((completedCount / (assignedCount + completedCount)) * 100)
        : 0
    };
  }

  async getTeamMemberDetails(memberId, adminId) {
    const memberDetails = await User.getTeamMemberDetails(memberId, adminId);
    if (!memberDetails) throw new NotFoundError('Team member not found');
    return memberDetails;
  }

  async updateTeamMember(memberId, adminId, updateData) {
    const member = await User.findOne({ _id: memberId, role: 'team', adminId, isDeleted: false });
    if (!member) throw new NotFoundError('Team member not found');

    const allowed = [
      'firstName', 'lastName', 'phone', 'customRole', 'department',
      'location', 'address', 'bio', 'status', 'certifications',
      'adminNotes', 'avatarUrl', 'performanceScore', 'qualityScore',
      'assignedCount', 'completedCount', 'onTimeRate'
    ];
    allowed.forEach(key => {
      if (updateData[key] !== undefined) member[key] = updateData[key];
    });

    await member.save();

    // If status changed to inactive, send notification
    if (updateData.status === 'inactive' && member.status !== 'inactive') {
      const admin = await User.findById(adminId);
      const emailHtml = getTeamMemberRemovedEmailTemplate(member, admin);
      await sendEmail(member.email, 'Your Account Access Has Been Updated', emailHtml).catch(err => {
        console.error('Failed to send removal email:', err);
      });
    }

    return this.getTeamMemberById(memberId, adminId);
  }

  async deleteTeamMember(memberId, adminId, permanent = false) {
    const member = await User.findOne({ _id: memberId, role: 'team', adminId, isDeleted: false });
    if (!member) throw new NotFoundError('Team member not found');

    // Soft delete only - No permanent deletion
    await member.softDelete(adminId);

    const admin = await User.findById(adminId);
    if (admin) {
      admin.usersUsed = await User.countDocuments({
        adminId, role: 'team', status: 'active', isDeleted: false
      });
      await admin.save();
    }

    // Send notification email
    const emailHtml = getTeamMemberRemovedEmailTemplate(member, admin);
    await sendEmail(member.email, 'Your Account Access Has Been Updated', emailHtml).catch(err => {
      console.error('Failed to send removal email:', err);
    });

    return {
      success: true,
      message: 'Team member deactivated successfully'
    };
  }

  async getTeamStats(adminId) {
    const stats = await User.aggregate([
      { $match: { adminId: new mongoose.Types.ObjectId(adminId), role: 'team', isDeleted: false } },
      {
        $facet: {
          total: [{ $count: 'count' }],
          active: [{ $match: { status: 'active' } }, { $count: 'count' }],
          onLeave: [{ $match: { status: 'on_leave' } }, { $count: 'count' }],
          byRole: [{ $group: { _id: { $ifNull: ['$customRole', 'inspector'] }, count: { $sum: 1 } } }],
          avgPerformance: [
            { $match: { status: 'active', performanceScore: { $gt: 0 } } },
            { $group: { _id: null, avg: { $avg: '$performanceScore' } } }
          ],
          totalInspections: [
            { $group: { _id: null, total: { $sum: '$completedCount' } } }
          ],
          topPerformers: [
            { $match: { status: 'active', performanceScore: { $gt: 0 } } },
            { $sort: { performanceScore: -1 } },
            { $limit: 5 },
            {
              $project: {
                name: { $concat: ['$firstName', ' ', '$lastName'] },
                initials: {
                  $concat: [
                    { $substrCP: ['$firstName', 0, 1] },
                    { $substrCP: ['$lastName', 0, 1] }
                  ]
                },
                performanceScore: 1,
                role: { $ifNull: ['$customRole', 'inspector'] }
              }
            }
          ]
        }
      }
    ]);

    const byRoleObj = {};
    (stats[0]?.byRole || []).forEach(({ _id, count }) => {
      byRoleObj[_id] = count;
    });

    return {
      total: stats[0]?.total[0]?.count || 0,
      active: stats[0]?.active[0]?.count || 0,
      onLeave: stats[0]?.onLeave[0]?.count || 0,
      byRole: byRoleObj,
      avgPerformance: Math.round(stats[0]?.avgPerformance[0]?.avg || 0),
      totalInspections: stats[0]?.totalInspections[0]?.total || 0,
      topPerformers: stats[0]?.topPerformers || []
    };
  }

  // ==================== TEAM SELF-SERVICE ====================

  async getMyProfile(memberId) {
    const member = await User.findOne({ _id: memberId, role: 'team', isDeleted: false })
      .select('-password -refreshToken -token')
      .populate('adminId', 'customerName email');
    if (!member) throw new NotFoundError('Team member not found');
    return this.formatUserResponse(member);
  }

  async updateMyProfile(memberId, updateData) {
    const member = await User.findOne({ _id: memberId, role: 'team' });
    if (!member) throw new NotFoundError('Team member not found');

    const allowed = ['firstName', 'lastName', 'phone', 'location', 'address', 'bio', 'department', 'avatarUrl'];
    allowed.forEach(key => {
      if (updateData[key] !== undefined) member[key] = updateData[key];
    });

    await member.save();
    return this.getMyProfile(memberId);
  }

  async changeMyPassword(memberId, { currentPassword, newPassword }) {
    const member = await User.findById(memberId).select('+password');
    if (!member) throw new NotFoundError('Team member not found');

    const isMatch = await member.comparePassword(currentPassword);
    if (!isMatch) {
      throw new ValidationError([{ field: 'currentPassword', message: 'Current password is incorrect' }]);
    }

    member.password = newPassword;
    await member.save();
    return { success: true, message: 'Password changed successfully' };
  }

  async getMyRecentInspections(memberId, limit = 10) {
    return await Assignment.find({ 'assignedToTeamMembers.userId': memberId })
      .sort('-submittedAt')
      .limit(limit)
      .populate('checklist', 'name')
      .populate('assets.assetId', 'assetName assetId currentLocation')
      .lean();
  }

  async getMyAssignedAssets(memberId) {
    const assignments = await Assignment.find({ 'assignedToTeamMembers.userId': memberId })
      .populate('assets.assetId', 'assetName assetId currentLocation assetCategory status healthScore')
      .lean();

    const assets = [];
    assignments.forEach(assignment => {
      (assignment.assets || []).forEach(asset => {
        if (asset.assetId) {
          assets.push({
            ...asset.assetId,
            assignmentId: assignment._id,
            assignmentStatus: assignment.status,
            dueDate: assignment.dueDate,
            checklistName: assignment.checklistName
          });
        }
      });
    });
    return assets;
  }

  async getMyScheduledTasks(memberId) {
    return await Assignment.find({
      'assignedToTeamMembers.userId': memberId,
      status: { $in: ['pending', 'in_progress'] }
    })
      .sort('dueDate')
      .populate('checklist', 'name')
      .populate('assets.assetId', 'assetName assetId')
      .lean();
  }

  // ==================== ADMIN DASHBOARD ====================

  async getAdminDashboardStats(adminId) {
    const admin = await User.findOne({ _id: adminId, role: 'admin', isDeleted: false });
    if (!admin) throw new NotFoundError('Admin not found');

    const teamMembers = await User.find({ adminId, role: 'team', isDeleted: false });
    const assets = await Asset.find({ adminId, isDeleted: false });
    const recentSubmissions = await Assignment.find({ assignedBy: adminId })
      .sort('-createdAt')
      .limit(5)
      .populate('assignedToTeamMembers.userId', 'firstName lastName email')
      .lean();

    return {
      overview: {
        totalTeamMembers: teamMembers.length,
        activeTeamMembers: teamMembers.filter(t => t.status === 'active').length,
        totalAssets: assets.length,
        activeChecklists: admin.activeChecklistCount || 0,
        totalSubmissions: admin.submissionsCount || 0
      },
      subscription: {
        plan: admin.membershipPlan,
        daysRemaining: admin.daysRemaining,
        usagePercentage: admin.usagePercentage,
        licenseLimit: admin.licenseLimit,
        licensesUsed: admin.usersUsed,
        autoRenewal: admin.settings?.autoRenewal !== false
      },
      usage: {
        storage: {
          used: admin.storageUsed || 0,
          limit: admin.storageLimit || 10,
          percentage: admin.storagePercentage
        },
        api: {
          used: admin.apiCallsThisMonth || 0,
          limit: admin.apiCallLimit || 10000,
          percentage: admin.apiUsagePercentage
        }
      },
      recentSubmissions: recentSubmissions.map(sub => ({
        id: sub._id,
        checklistName: sub.checklistName,
        assignedTo: sub.assignedToTeamMembers?.[0]?.userId,
        status: sub.status,
        createdAt: sub.createdAt
      }))
    };
  }

  // ==================== CONTACT ====================


// Update the createContact method in UserService class
async createContact(data) {
  const { fullName, email, phone, message } = data;

  // Validate required fields
  if (!fullName || !email || !message) {
    throw new ValidationError([{ field: 'required', message: 'Name, email, and message are required' }]);
  }

  // Create contact inquiry
  const contact = await Contact.create({ fullName, email, phone, message });

  // Send confirmation email to the user
  const userEmailHtml = getContactInquiryEmailTemplate({ fullName, email, phone, message });
  await sendEmail(email, 'We received your inquiry - Asset Management Platform', userEmailHtml).catch(err => {
    console.error('Failed to send confirmation email:', err);
  });

  // Send notification email to admin/support
  const adminEmail = process.env.ADMIN_EMAIL || 'psamantaray77@gmail.com';
  const adminEmailHtml = getContactInquiryAdminEmailTemplate({ fullName, email, phone, message, contactId: contact._id });
  await sendEmail(adminEmail, 'New Contact Inquiry Received', adminEmailHtml).catch(err => {
    console.error('Failed to send admin notification email:', err);
  });

  return contact._doc;
}

  async getAllContacts(filters = {}) {
  const { page = 1, limit = 10, search = '' } = filters;
  const query = {};

  if (search) {
    query.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }

  const skip = (page - 1) * limit;

  const [contacts, total] = await Promise.all([
    Contact.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Contact.countDocuments(query)
  ]);

  return {
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      contacts
    }
  };
}

  async getContactById(contactId) {
  const contact = await Contact.findById(contactId);
  if (!contact) throw new NotFoundError('Contact message not found');
  return contact._doc;
}

  async deleteContact(contactId) {
  const contact = await Contact.findById(contactId);
  if (!contact) throw new NotFoundError('Contact message not found');
  await Contact.findByIdAndDelete(contactId);
  return { success: true, message: 'Contact deleted successfully' };
}

// ==================== HELPER METHODS ====================

formatUserResponse(user) {
  const base = {
    id: user._id,
    email: user.email,
    role: user.role,
    status: user.status,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };

  switch (user.role) {
    case 'super_admin':
      return { ...base, name: user.name, permissions: user.permissions || ['*'] };

    case 'admin':
      return {
        ...base,
        name: user.customerName,
        customerName: user.customerName,
        phone: user.phone,
        website: user.website,
        address: user.address,
        membershipPlan: user.membershipPlan,
        daysRemaining: user.daysRemaining,
        usagePercentage: user.usagePercentage,
        storagePercentage: user.storagePercentage,
        apiUsagePercentage: user.apiUsagePercentage,
        licenseLimit: user.licenseLimit,
        usersUsed: user.usersUsed,
        subscriptionStartDate: user.subscriptionStartDate,
        subscriptionEndDate: user.subscriptionEndDate,
        storageUsed: user.storageUsed,
        storageLimit: user.storageLimit,
        apiCallsThisMonth: user.apiCallsThisMonth,
        apiCallLimit: user.apiCallLimit,
        submissionsCount: user.submissionsCount,
        activeChecklistCount: user.activeChecklistCount,
        lastActiveAt: user.lastActiveAt,
        notes: user.notes,
        settings: user.settings,
        autoRenewal: user.settings?.autoRenewal !== false
      };

    case 'team': {
      const monthsOrder = {
        Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
        Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12
      };
      return {
        ...base,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.fullName,
        initials: user.initials,
        phone: user.phone,
        customRole: user.customRole,
        roleDisplay: user.roleDisplay,
        department: user.department,
        location: user.location,
        address: user.address,
        bio: user.bio,
        joinDate: user.joinDate,
        lastLoginDate: user.lastLoginDate,
        lastActiveAt: user.lastActiveAt,
        adminId: user.adminId,
        organization: user.adminId?.customerName,
        stats: {
          totalInspections: user.completedCount || 0,
          assignedCount: user.assignedCount || 0,
          onTimeRate: user.onTimeRate || 0,
          qualityScore: user.qualityScore || 0,
          performanceScore: user.performanceScore || 0,
          completionRate: user.completionRate || 0,
          inspectionsThisMonth: user.inspectionsThisMonth || 0
        },
        certifications: user.certifications || [],
        monthlyPerformance: (user.monthlyPerformance || [])
          .sort((a, b) =>
            (b.year - a.year) || (monthsOrder[b.month] - monthsOrder[a.month])
          )
          .slice(0, 6)
          .reverse(),
        adminNotes: user.adminNotes
      };
    }

    default:
      return base;
  }
}
}

export default new UserService();