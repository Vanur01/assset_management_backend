// services/auth.service.js (updated with proper audit logging)
import User from '../models/user.model.js';
import AuditLog from '../models/auditLog.model.js';
import crypto from 'crypto';
import EmailService from './email.service.js';
import { AuthenticationError, ValidationError, NotFoundError, ConflictError } from '../errors/customError.js';

class AuthService {
  async registersuper_admin(data, req = null) {
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

    // Create audit log with request data if available
    await AuditLog.create({
      action: 'CREATE',
      resource: 'user',
      resourceId: super_admin._id,
      actor: super_admin._id,
      actorRole: 'super_admin',
      description: 'Super admin account created',
      ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || 'system',
      userAgent: req?.headers?.['user-agent'] || 'system',
      metadata: { registrationMethod: 'direct' }
    });

    return { user: this.formatUserResponse(super_admin), accessToken, refreshToken };
  }

  async login({ email, password }, req = null) {
    
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

    await AuditLog.create({
      action: 'LOGIN',
      resource: 'user',
      resourceId: user._id,
      actor: user._id,
      actorRole: user.role,
      description: `User logged in successfully`,
      ipAddress: req?.ip || req?.headers?.['x-forwarded-for'],
      userAgent: req?.headers?.['user-agent'],
      metadata: { loginMethod: 'password' }
    });

    return { accessToken, refreshToken, user: this.formatUserResponse(user) };
  }

  async forgotPassword(email, req = null) {
    const user = await User.findOne({ email, isDeleted: false });
    if (!user) {
      return {
        success: false,
        message: 'No account found with this email address.'
      };
    }

    const resetToken = user.generatePasswordResetToken();
    await user.save();

    await EmailService.sendPasswordResetEmail(user, resetToken);

    await AuditLog.create({
      action: 'PASSWORD_RESET',
      resource: 'user',
      resourceId: user._id,
      actor: user._id,
      actorRole: user.role,
      description: 'Password reset requested',
      ipAddress: req?.ip || req?.headers?.['x-forwarded-for'],
      userAgent: req?.headers?.['user-agent'],
      metadata: { resetTokenSent: true }
    });

    return {
      success: true,
      message: 'Password reset link sent to your email.'
    };
  }

  async resetPassword(token, newPassword, req = null) {
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      throw new ValidationError([{ field: 'token', message: 'Password reset token is invalid or has expired' }]);
    }

    const oldPasswordHash = user.password;
    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    await AuditLog.create({
      action: 'PASSWORD_CHANGE',
      resource: 'user',
      resourceId: user._id,
      actor: user._id,
      actorRole: user.role,
      description: 'Password reset successfully completed',
      ipAddress: req?.ip || req?.headers?.['x-forwarded-for'],
      userAgent: req?.headers?.['user-agent'],
      changes: {
        old: { passwordChanged: true },
        new: { passwordReset: true }
      },
      metadata: { resetMethod: 'token' }
    });

    return { success: true, message: 'Password has been reset successfully.' };
  }

  async logout(userId, req = null) {
    const user = await User.findById(userId);
    if (!user) throw new NotFoundError('User not found');

    await User.findByIdAndUpdate(userId, { $unset: { refreshToken: 1, token: 1 } });

    await AuditLog.create({
      action: 'LOGOUT',
      resource: 'user',
      resourceId: userId,
      actor: userId,
      actorRole: user.role,
      description: 'User logged out',
      ipAddress: req?.ip || req?.headers?.['x-forwarded-for'],
      userAgent: req?.headers?.['user-agent']
    });

    return true;
  }

  async getCurrentUser(userId) {
    const user = await User.findById(userId).lean();
    if (!user) throw new NotFoundError('User not found');
    return this.formatUserResponse(user);
  }

  async changePassword(userId, currentPassword, newPassword, req = null) {
    const user = await User.findById(userId).select('+password');
    if (!user) throw new NotFoundError('User not found');

    const isValid = await user.comparePassword(currentPassword);
    if (!isValid) {
      throw new ValidationError([{ field: 'currentPassword', message: 'Current password is incorrect' }]);
    }

    const oldPasswordHash = user.password;
    user.password = newPassword;
    user.refreshToken = undefined;
    await user.save();

    await AuditLog.create({
      action: 'PASSWORD_CHANGE',
      resource: 'user',
      resourceId: userId,
      actor: userId,
      actorRole: user.role,
      description: 'Password changed by user',
      ipAddress: req?.ip || req?.headers?.['x-forwarded-for'],
      userAgent: req?.headers?.['user-agent'],
      changes: {
        old: { passwordChanged: true },
        new: { passwordUpdated: true }
      },
      metadata: { changeMethod: 'manual' }
    });

    return true;
  }

  async updateLastActive(userId) {
    await User.findByIdAndUpdate(userId, { lastActiveAt: new Date(), lastLogin: new Date() });
    return true;
  }

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

    if (user.role === 'super_admin') {
      return { ...base, name: user.name, permissions: user.permissions || ['*'] };
    }

    if (user.role === 'admin') {
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
    }

    if (user.role === 'team') {
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
        monthlyPerformance: user.monthlyPerformance || [],
        adminNotes: user.adminNotes
      };
    }

    return base;
  }
}

export default new AuthService();