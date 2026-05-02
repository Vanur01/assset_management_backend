// controllers/settings.controller.js
import SettingsService from '../services/settings.service.js';

class SettingsController {

  /**
   * GET /settings
   * Returns role-appropriate settings for all tabs visible in the UI
   */
  async getSettings(req, res) {
    try {
      const settings = await SettingsService.getSettings(req.user._id, req.user.role);

      res.status(200).json({ success: true, data: settings });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * PUT /settings/notifications
   * Notifications tab (Image 1):
   *   emailNotifications, taskAssignments, inspectionReminders,
   *   teamUpdates, systemAlerts, pushNotifications, reminderFrequency
   */
  async updateNotifications(req, res) {
    try {
      const notifications = await SettingsService.updateNotifications(
        req.user._id, req.body
      );

      res.status(200).json({
        success: true,
        message: 'Notification settings updated successfully',
        data:    notifications
      });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * PUT /settings/security
   * Security tab — non-password fields (sessionTimeout, loginAlerts, etc.)
   */
  async updateSecurity(req, res) {
    try {
      const security = await SettingsService.updateSecurity(req.user._id, req.body);

      res.status(200).json({
        success: true,
        message: 'Security settings updated successfully',
        data:    security
      });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /settings/security/change-password
   * Security tab — password form (Image 2):
   *   currentPassword, newPassword, confirmPassword
   */
  async changePassword(req, res) {
    try {
      const { currentPassword, newPassword, confirmPassword } = req.body;

      if (!currentPassword || !newPassword || !confirmPassword) {
        return res.status(400).json({
          success: false,
          message: 'All password fields are required'
        });
      }

      const result = await SettingsService.changePassword(
        req.user._id, currentPassword, newPassword, confirmPassword
      );

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /settings/security/2fa/setup
   * Security tab — Two-Factor Authentication toggle (Image 2)
   * Body: { enable: Boolean, verificationCode?: String }
   */
  async setupTwoFactorAuth(req, res) {
    try {
      const { enable, verificationCode } = req.body;

      const result = await SettingsService.toggleTwoFactorAuth(
        req.user._id, enable, verificationCode
      );

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * PUT /settings/preferences
   * Preferences tab (Image 3): language, timezone, dateFormat, timeFormat, weekStart, defaultDashboard
   */
  async updatePreferences(req, res) {
    try {
      const preferences = await SettingsService.updatePreferences(req.user._id, req.body);

      res.status(200).json({
        success: true,
        message: 'Preferences updated successfully',
        data:    preferences
      });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * PUT /settings/appearance
   * Appearance tab (Image 4): theme (light/dark/auto), compactMode, primaryColor, fontSize, etc.
   */
  async updateAppearance(req, res) {
    try {
      const appearance = await SettingsService.updateAppearance(req.user._id, req.body);

      res.status(200).json({
        success: true,
        message: 'Appearance settings updated successfully',
        data:    appearance
      });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * PUT /settings/admin-controls/:userId
   * Admin Controls tab (Image 5) — Super Admin only
   * Toggles: customerDataAccess, formTemplateManagement, userRoleManagement,
   *          systemConfigAccess, auditLogAccess, apiManagement
   */
  async updateAdminControls(req, res) {
    try {
      const adminControls = await SettingsService.updateAdminControls(
        req.params.userId, req.body, req.user.role
      );

      res.status(200).json({
        success: true,
        message: 'Admin controls updated successfully',
        data:    adminControls
      });
    } catch (error) {
      res.status(403).json({ success: false, message: error.message });
    }
  }

  /**
   * PUT /settings/system-settings
   * System Settings tab (Image 6) — Super Admin only
   * Fields: maximumUsersPerAccount (50), dataRetentionPeriod (365), automaticBackups, etc.
   */
  async updateSystemSettings(req, res) {
    try {
      if (req.user.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Only Super Admin can update system settings'
        });
      }

      const systemSettings = await SettingsService.updateSystemSettings(
        req.user._id, req.body
      );

      res.status(200).json({
        success: true,
        message: 'System settings updated successfully',
        data:    systemSettings
      });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * PUT /settings/data-visibility
   * "My Control" tab (Images 7 & 8) — Admin only
   * Handles all 10 category toggles; response includes the summary label:
   * "8 of 10 categories are currently visible to Super Admin"
   */
  async updateDataVisibility(req, res) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Only admin users can configure data visibility'
        });
      }

      const result = await SettingsService.updateDataVisibility(req.user._id, req.body);

      res.status(200).json({
        success: true,
        message: 'Data visibility settings updated successfully',
        data:    result
      });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /settings/data-visibility/summary
   * Returns the summary shown at the bottom of My Control tab (Image 8)
   * e.g. { total: 10, enabled: 8, disabled: 2, percentage: 80,
   *         label: "8 of 10 categories are currently visible to Super Admin" }
   */
  async getDataVisibilitySummary(req, res) {
    try {
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Only admin users can view data visibility summary'
        });
      }

      const summary = await SettingsService.getDataVisibilitySummary(req.user._id);

      res.status(200).json({ success: true, data: summary });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * POST /settings/reset?category=<name>
   * "Reset to Defaults" button (Image 8)
   * Optional query param `category` resets only that section; omit to reset all
   */
  async resetSettings(req, res) {
    try {
      const result = await SettingsService.resetSettings(
        req.user._id, req.query.category || null
      );

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /settings/history?limit=50
   * Returns the modification history for the current user
   */
  async getModificationHistory(req, res) {
    try {
      const history = await SettingsService.getModificationHistory(
        req.user._id, parseInt(req.query.limit || '50', 10)
      );

      res.status(200).json({ success: true, data: history });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * GET /settings/by-role/:role?page=1&limit=20
   * Super Admin overview of settings across users by role
   */
  async getSettingsByRole(req, res) {
    try {
      if (req.user.role !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Only Super Admin can view settings by role'
        });
      }

      const result = await SettingsService.getSettingsByRole(
        req.params.role,
        parseInt(req.query.page  || '1',  10),
        parseInt(req.query.limit || '20', 10)
      );

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}

export default new SettingsController();