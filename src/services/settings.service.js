// services/settings.service.js
import Settings from '../models/setting.model.js';
import User from '../models/user.model.js';

class SettingsService {

  /**
   * Get all settings for a user
   * Returns role-appropriate settings matching the UI tab visibility:
   *   - All roles  : notifications, security (safe fields only), preferences, appearance
   *   - admin+     : adminControls
   *   - super_admin: systemSettings
   *   - admin only : dataVisibility + dataVisibilitySummary  (shown as "My Control" in UI)
   */
  async getSettings(userId, userRole) {
    const settings = await Settings.getByUser(userId, userRole);

    const response = {
      notifications: settings.notifications,
      // Never expose secret / backupCodes to the client
      security: {
        twoFactorAuth: {
          enabled: settings.security.twoFactorAuth?.enabled || false,
          verified: settings.security.twoFactorAuth?.verified || false
        },
        sessionTimeout:      settings.security.sessionTimeout,
        loginAlerts:         settings.security.loginAlerts,
        lastPasswordChange:  settings.security.lastPasswordChange
      },
      preferences: settings.preferences,
      appearance:  settings.appearance
    };

    // Admin Controls tab — visible to super_admin and admin
    if (userRole === 'super_admin' || userRole === 'admin') {
      response.adminControls = settings.adminControls;
    }

    // System Settings tab — super_admin only
    if (userRole === 'super_admin') {
      response.systemSettings = settings.systemSettings;
    }

    // My Control tab — admin only
    // Returns dataVisibility + the summary shown at the bottom of the UI card:
    // "8 of 10 categories are currently visible to Super Admin"
    if (userRole === 'admin') {
      response.dataVisibility        = settings.dataVisibility;
      response.dataVisibilitySummary = settings.dataVisibilitySummary;
    }

    return response;
  }

  /**
   * Update notification settings
   * Covers all 7 toggles / dropdowns visible in the Notifications tab (Image 1):
   *   emailNotifications, taskAssignments, inspectionReminders,
   *   teamUpdates, systemAlerts, pushNotifications, reminderFrequency
   */
  async updateNotifications(userId, updates) {
    const settings = await Settings.findOne({ userId });
    if (!settings) throw new Error('Settings not found');

    const allowedFields = [
      'emailNotifications',
      'taskAssignments',
      'inspectionReminders',
      'teamUpdates',
      'systemAlerts',
      'pushNotifications',
      'reminderFrequency'
    ];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && settings.notifications[key] !== undefined) {
        const oldValue = settings.notifications[key];
        settings.notifications[key] = value;

        settings.modificationHistory.push({
          category:   'notifications',
          field:      key,
          oldValue,
          newValue:   value,
          modifiedBy: userId,
          modifiedAt: new Date()
        });
      }
    }

    settings.lastModifiedAt  = new Date();
    settings.lastModifiedBy  = userId;
    await settings.save();

    return settings.notifications;
  }

  /**
   * Update security settings (non-password fields)
   */
  async updateSecurity(userId, updates) {
    const settings = await Settings.findOne({ userId });
    if (!settings) throw new Error('Settings not found');

    const allowedFields = ['sessionTimeout', 'loginAlerts', 'allowedIPs', 'maxLoginAttempts'];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && settings.security[key] !== undefined) {
        const oldValue = settings.security[key];
        settings.security[key] = value;

        settings.modificationHistory.push({
          category:   'security',
          field:      key,
          oldValue,
          newValue:   value,
          modifiedBy: userId,
          modifiedAt: new Date()
        });
      }
    }

    settings.lastModifiedAt = new Date();
    settings.lastModifiedBy = userId;
    await settings.save();

    return settings.security;
  }

  /**
   * Change password
   * Handles the three-field password form visible in the Security tab (Image 2)
   */
  async changePassword(userId, currentPassword, newPassword, confirmPassword) {
    if (newPassword !== confirmPassword) {
      throw new Error('New passwords do not match');
    }

    if (newPassword.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    const user = await User.findById(userId).select('+password');
    if (!user) throw new Error('User not found');

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) throw new Error('Current password is incorrect');

    user.password = newPassword;
    await user.save();

    // Record last password change in security settings
    const settings = await Settings.findOne({ userId });
    if (settings) {
      settings.security.lastPasswordChange = new Date();
      await settings.save();
    }

    return { message: 'Password changed successfully', lastPasswordChange: new Date() };
  }

  /**
   * Enable / Disable Two-Factor Authentication
   * Handles the 2FA toggle in the Security tab (Image 2)
   */
  async toggleTwoFactorAuth(userId, enable, verificationCode = null) {
    const settings = await Settings.findOne({ userId });
    if (!settings) throw new Error('Settings not found');

    if (enable) {
      const speakeasy = await import('speakeasy');
      const secret = speakeasy.generateSecret({ length: 20 });

      settings.security.twoFactorAuth.secret  = secret.base32;
      settings.security.twoFactorAuth.enabled = true;

      // Generate 10 backup codes
      const backupCodes = Array.from({ length: 10 }, () =>
        Math.random().toString(36).substring(2, 10).toUpperCase()
      );
      settings.security.twoFactorAuth.backupCodes = backupCodes;

      await settings.save();

      return {
        enabled:     true,
        secret:      secret.base32,
        otpauthUrl:  secret.otpauth_url,
        backupCodes
      };
    } else {
      settings.security.twoFactorAuth.enabled     = false;
      settings.security.twoFactorAuth.verified    = false;
      settings.security.twoFactorAuth.secret      = null;
      settings.security.twoFactorAuth.backupCodes = [];

      await settings.save();
      return { enabled: false, message: '2FA disabled' };
    }
  }

  /**
   * Update preferences
   * Handles Language, Timezone, Date Format dropdowns in Preferences tab (Image 3)
   * (timeFormat, weekStart, defaultDashboard are also stored but may be below the fold)
   */
  async updatePreferences(userId, updates) {
    const settings = await Settings.findOne({ userId });
    if (!settings) throw new Error('Settings not found');

    const allowedFields = [
      'language',
      'timezone',
      'dateFormat',
      'timeFormat',
      'weekStart',
      'defaultDashboard'
    ];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && settings.preferences[key] !== undefined) {
        const oldValue = settings.preferences[key];
        settings.preferences[key] = value;

        settings.modificationHistory.push({
          category:   'preferences',
          field:      key,
          oldValue,
          newValue:   value,
          modifiedBy: userId,
          modifiedAt: new Date()
        });
      }
    }

    settings.lastModifiedAt = new Date();
    settings.lastModifiedBy = userId;
    await settings.save();

    return settings.preferences;
  }

  /**
   * Update appearance settings
   * Handles Light/Dark/Auto theme cards + Compact Mode toggle (Image 4)
   */
  async updateAppearance(userId, updates) {
    const settings = await Settings.findOne({ userId });
    if (!settings) throw new Error('Settings not found');

    const allowedFields = [
      'theme',
      'compactMode',
      'primaryColor',
      'fontSize',
      'animations',
      'sidebarCollapsed'
    ];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && settings.appearance[key] !== undefined) {
        const oldValue = settings.appearance[key];
        settings.appearance[key] = value;

        settings.modificationHistory.push({
          category:   'appearance',
          field:      key,
          oldValue,
          newValue:   value,
          modifiedBy: userId,
          modifiedAt: new Date()
        });
      }
    }

    settings.lastModifiedAt = new Date();
    settings.lastModifiedBy = userId;
    await settings.save();

    return settings.appearance;
  }

  /**
   * Update admin controls (Super Admin only)
   * Handles Customer Data Access, Form Template Management, User Role Management toggles
   * shown in Admin Controls tab (Image 5), plus the hidden-below-fold ones
   */
  async updateAdminControls(userId, updates, requestingUserRole) {
    if (requestingUserRole !== 'super_admin') {
      throw new Error('Only Super Admin can update admin controls');
    }

    const settings = await Settings.findOne({ userId });
    if (!settings) throw new Error('Settings not found');

    const allowedFields = [
      'customerDataAccess',
      'formTemplateManagement',
      'userRoleManagement',
      'systemConfigAccess',
      'auditLogAccess',
      'apiManagement'
    ];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && settings.adminControls[key] !== undefined) {
        const oldValue = settings.adminControls[key];
        settings.adminControls[key] = value;

        settings.modificationHistory.push({
          category:   'adminControls',
          field:      key,
          oldValue,
          newValue:   value,
          modifiedBy: userId,
          modifiedAt: new Date()
        });
      }
    }

    settings.lastModifiedAt = new Date();
    settings.lastModifiedBy = userId;
    await settings.save();

    return settings.adminControls;
  }

  /**
   * Update system settings (Super Admin only)
   * Handles Maximum Users per Account, Data Retention Period, Automatic Backups (Image 6)
   */
  async updateSystemSettings(userId, updates) {
    const settings = await Settings.findOne({ userId });
    if (!settings) throw new Error('Settings not found');

    const allowedFields = [
      'maximumUsersPerAccount',
      'dataRetentionPeriod',
      'automaticBackups',
      'sessionSettings',
      'fileUploadSettings',
      'apiRateLimit'
    ];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && settings.systemSettings[key] !== undefined) {
        const oldValue = settings.systemSettings[key];
        settings.systemSettings[key] = value;

        settings.modificationHistory.push({
          category:   'systemSettings',
          field:      key,
          oldValue,
          newValue:   value,
          modifiedBy: userId,
          modifiedAt: new Date()
        });
      }
    }

    settings.lastModifiedAt = new Date();
    settings.lastModifiedBy = userId;
    await settings.save();

    return settings.systemSettings;
  }

  /**
   * Update data visibility (My Control tab - Admin only)
   * Handles all 10 category toggles shown in Images 7 & 8 and returns the
   * summary label displayed at the bottom of the UI card.
   *
   * Allowed categories (must match model keys exactly):
   *   assetInformation, teamMemberDetails, inspectionResults, reportsAndAnalytics,
   *   formResponses, performanceMetrics, financialData, customFields,
   *   locationData, complianceRecords
   */
  async updateDataVisibility(userId, updates) {
    const settings = await Settings.findOne({ userId });
    if (!settings) throw new Error('Settings not found');

    if (settings.userRole !== 'admin') {
      throw new Error('Only admin users can configure data visibility');
    }

    const allowedFields = [
      'assetInformation',
      'teamMemberDetails',
      'inspectionResults',
      'reportsAndAnalytics',
      'formResponses',
      'performanceMetrics',
      'financialData',
      'customFields',
      'locationData',
      'complianceRecords'
    ];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        const oldValue = settings.dataVisibility[key];
        // Always store as { enabled: Boolean } to match the schema
        settings.dataVisibility[key] = { enabled: Boolean(value) };

        settings.modificationHistory.push({
          category:   'dataVisibility',
          field:      key,
          oldValue:   oldValue?.enabled ?? oldValue,
          newValue:   Boolean(value),
          modifiedBy: userId,
          modifiedAt: new Date()
        });
      }
    }

    settings.dataVisibility.lastUpdatedBy  = userId;
    settings.dataVisibility.lastUpdatedAt  = new Date();
    settings.lastModifiedAt                = new Date();
    settings.lastModifiedBy                = userId;
    await settings.save();

    return {
      dataVisibility:        settings.dataVisibility,
      dataVisibilitySummary: settings.dataVisibilitySummary  // includes .label for UI
    };
  }

  /**
   * Reset settings to defaults
   * Triggered by the "Reset to Defaults" button in the UI (Image 8)
   */
  async resetSettings(userId, category = null) {
    const settings = await Settings.resetToDefaults(userId, category);

    settings.modificationHistory.push({
      category:   category || 'all',
      field:      'reset',
      oldValue:   'previous settings',
      newValue:   'defaults',
      modifiedBy: userId,
      modifiedAt: new Date()
    });

    await settings.save();

    return {
      message: category
        ? `${category} settings reset to defaults`
        : 'All settings reset to defaults'
    };
  }

  /**
   * Get modification history
   */
  async getModificationHistory(userId, limit = 50) {
    const settings = await Settings.findOne({ userId });
    if (!settings) throw new Error('Settings not found');

    return settings.modificationHistory
      .sort((a, b) => b.modifiedAt - a.modifiedAt)
      .slice(0, limit);
  }

  /**
   * Get data visibility summary (for dashboard widgets)
   * Returns the label shown in the UI: "8 of 10 categories are currently visible to Super Admin"
   */
  async getDataVisibilitySummary(userId) {
    const settings = await Settings.findOne({ userId });
    if (!settings) throw new Error('Settings not found');

    return settings.dataVisibilitySummary;
  }

  /**
   * Get settings by user role (Super Admin overview)
   */
  async getSettingsByRole(role, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const users = await User.find({ role, isDeleted: false })
      .select('_id firstName lastName email customerName')
      .skip(skip)
      .limit(limit);

    const userIds   = users.map(u => u._id);
    const settingsList = await Settings.find({ userId: { $in: userIds } });
    const settingsMap  = new Map(settingsList.map(s => [s.userId.toString(), s]));

    const data  = users.map(user => ({
      user,
      settings: settingsMap.get(user._id.toString()) || null
    }));

    const total = await User.countDocuments({ role, isDeleted: false });

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }
}

export default new SettingsService();