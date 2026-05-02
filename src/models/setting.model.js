// models/Settings.model.js
import mongoose from 'mongoose';

// Notification Settings Sub-Schema
const NotificationSettingsSchema = new mongoose.Schema({
  emailNotifications: {
    type: Boolean,
    default: true,
    description: 'Receive notifications via email'
  },
  taskAssignments: {
    type: Boolean,
    default: true,
    description: 'Get notified when assigned new tasks'
  },
  inspectionReminders: {
    type: Boolean,
    default: true,
    description: 'Reminders for upcoming inspections'
  },
  teamUpdates: {
    type: Boolean,
    default: false,                          // UI shows this OFF by default
    description: 'Updates from your team members'
  },
  systemAlerts: {
    type: Boolean,
    default: true,
    description: 'Important system notifications'
  },
  pushNotifications: {
    type: Boolean,
    default: true
  },
  reminderFrequency: {
    type: String,
    enum: ['daily', 'weekly', 'realtime'],
    default: 'daily'
  }
}, { _id: false });

// Security Settings Sub-Schema
const SecuritySettingsSchema = new mongoose.Schema({
  twoFactorAuth: {
    enabled: { type: Boolean, default: false },
    verified: { type: Boolean, default: false },
    secret: { type: String, default: null },
    backupCodes: [{ type: String }]
  },
  lastPasswordChange: { type: Date, default: null },
  sessionTimeout: {
    type: Number,
    default: 30,
    description: 'Session timeout in minutes'
  },
  loginAlerts: {
    type: Boolean,
    default: true
  },
  allowedIPs: [{ type: String }],
  maxLoginAttempts: {
    type: Number,
    default: 5
  }
}, { _id: false });

// Preferences Sub-Schema
const PreferencesSchema = new mongoose.Schema({
  language: {
    type: String,
    enum: ['English', 'Spanish', 'French', 'German', 'Chinese', 'Japanese'],
    default: 'English'
  },
  timezone: {
    type: String,
    enum: [
      'Eastern Time (EST)',
      'Central Time (CST)',
      'Mountain Time (MST)',
      'Pacific Time (PST)',
      'Greenwich Mean Time (GMT)',
      'Central European Time (CET)'
    ],
    default: 'Eastern Time (EST)'
  },
  dateFormat: {
    type: String,
    enum: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'],
    default: 'MM/DD/YYYY'
  },
  timeFormat: {
    type: String,
    enum: ['12h', '24h'],
    default: '12h'
  },
  weekStart: {
    type: String,
    enum: ['Sunday', 'Monday'],
    default: 'Monday'
  },
  defaultDashboard: {
    type: String,
    enum: ['overview', 'analytics', 'reports', 'team'],
    default: 'overview'
  }
}, { _id: false });

// Appearance Settings Sub-Schema
const AppearanceSchema = new mongoose.Schema({
  theme: {
    type: String,
    enum: ['light', 'dark', 'auto'],
    default: 'light'                        // UI shows Light selected by default
  },
  compactMode: {
    type: Boolean,
    default: false,                          // UI shows Compact Mode OFF by default
    description: 'Reduce spacing for denser layout'
  },
  primaryColor: {
    type: String,
    default: '#4F46E5'
  },
  fontSize: {
    type: String,
    enum: ['small', 'medium', 'large'],
    default: 'medium'
  },
  animations: {
    type: Boolean,
    default: true
  },
  sidebarCollapsed: {
    type: Boolean,
    default: false
  }
}, { _id: false });

// Admin Controls Sub-Schema
const AdminControlsSchema = new mongoose.Schema({
  customerDataAccess: {
    type: Boolean,
    default: false,
    description: 'Access to customer data across all accounts'
  },
  formTemplateManagement: {
    type: Boolean,
    default: false,
    description: 'Create and modify global form templates'
  },
  userRoleManagement: {
    type: Boolean,
    default: false,
    description: 'Modify user roles and permissions'
  },
  systemConfigAccess: {
    type: Boolean,
    default: false,
    description: 'Access to system configuration'
  },
  auditLogAccess: {
    type: Boolean,
    default: false,
    description: 'View audit logs'
  },
  apiManagement: {
    type: Boolean,
    default: false,
    description: 'Manage API keys and integrations'
  }
}, { _id: false });

// System Settings Sub-Schema
const SystemSettingsSchema = new mongoose.Schema({
  maximumUsersPerAccount: {
    type: Number,
    default: 50,                            // UI shows 50
    min: 1,
    max: 1000
  },
  dataRetentionPeriod: {
    type: Number,
    default: 365,                           // UI shows 365 days
    description: 'Data retention period in days'
  },
  automaticBackups: {
    enabled: { type: Boolean, default: true },     // UI shows Automatic Backups ON
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      default: 'daily'
    },
    backupTime: {
      type: String,
      default: '02:00',
      description: 'UTC time for backups'
    },
    retentionDays: {
      type: Number,
      default: 30
    }
  },
  sessionSettings: {
    maxConcurrentSessions: { type: Number, default: 5 },
    idleTimeout: { type: Number, default: 30 },
    rememberMeDuration: { type: Number, default: 7 }
  },
  fileUploadSettings: {
    maxFileSizeMB: { type: Number, default: 10 },
    allowedFileTypes: [{ type: String }],
    maxFilesPerUpload: { type: Number, default: 10 }
  },
  apiRateLimit: {
    enabled: { type: Boolean, default: true },
    requestsPerMinute: { type: Number, default: 60 },
    requestsPerHour: { type: Number, default: 1000 }
  }
}, { _id: false });

// Data Visibility Control Sub-Schema (My Control - Admin only)
// Matches the 10 categories shown in the UI (Images 7 & 8)
// "8 of 10 categories are currently visible" = performanceMetrics & financialData are OFF
const DataVisibilitySchema = new mongoose.Schema({
  assetInformation: {
    enabled: { type: Boolean, default: true },       // UI: ON
  },
  teamMemberDetails: {
    enabled: { type: Boolean, default: true },       // UI: ON
  },
  inspectionResults: {
    enabled: { type: Boolean, default: true },       // UI: ON
  },
  reportsAndAnalytics: {
    enabled: { type: Boolean, default: true },       // UI: ON
  },
  formResponses: {
    enabled: { type: Boolean, default: true },       // UI: ON
  },
  performanceMetrics: {
    enabled: { type: Boolean, default: false },      // FIX: UI shows OFF (was true)
  },
  financialData: {
    enabled: { type: Boolean, default: false },      // UI: OFF
  },
  customFields: {
    enabled: { type: Boolean, default: true },       // UI: ON
  },
  locationData: {
    enabled: { type: Boolean, default: true },       // UI: ON
  },
  complianceRecords: {
    enabled: { type: Boolean, default: true },       // UI: ON
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastUpdatedAt: { type: Date, default: Date.now }
}, { _id: false });

// Main Settings Schema
const SettingsSchema = new mongoose.Schema({
  // User reference
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  userRole: {
    type: String,
    enum: ['super_admin', 'admin', 'team'],
    required: true
  },

  // Settings categories
  notifications: {
    type: NotificationSettingsSchema,
    default: () => ({})
  },
  security: {
    type: SecuritySettingsSchema,
    default: () => ({})
  },
  preferences: {
    type: PreferencesSchema,
    default: () => ({})
  },
  appearance: {
    type: AppearanceSchema,
    default: () => ({})
  },
  adminControls: {
    type: AdminControlsSchema,
    default: () => ({})
  },
  systemSettings: {
    type: SystemSettingsSchema,
    default: () => ({})
  },
  dataVisibility: {
    type: DataVisibilitySchema,
    default: () => ({})
  },

  // Audit trail
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastModifiedAt: {
    type: Date,
    default: Date.now
  },
  modificationHistory: [{
    category: { type: String },
    field: { type: String },
    oldValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
    modifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    modifiedAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

// Indexes
SettingsSchema.index({ userId: 1, userRole: 1 });
SettingsSchema.index({ lastModifiedAt: -1 });

// Virtual: Data Visibility Summary
// FIX: Correctly counts nested { enabled: Boolean } objects (previous version had a bug
// where it checked `v === true` which never matched `{ enabled: true }` objects)
SettingsSchema.virtual('dataVisibilitySummary').get(function () {
  const EXCLUDED_KEYS = ['lastUpdatedBy', 'lastUpdatedAt', '_id'];
  const categories = this.dataVisibility.toObject();

  const categoryKeys = Object.keys(categories).filter(k => !EXCLUDED_KEYS.includes(k));
  const total = categoryKeys.length;                                   // always 10
  const enabled = categoryKeys.filter(k => categories[k]?.enabled === true).length;

  return {
    total,
    enabled,
    disabled: total - enabled,
    percentage: total > 0 ? Math.round((enabled / total) * 100) : 0,
    // Human-readable label shown in UI: "8 of 10 categories are currently visible to Super Admin"
    label: `${enabled} of ${total} categories are currently visible to Super Admin`
  };
});

// Pre-save middleware
SettingsSchema.pre('save', function (next) {
  this.lastModifiedAt = new Date();

  if (this.userRole === 'admin') {
    if (this.isModified('adminControls') && this.adminControls) {
      this.modificationHistory.push({
        category: 'adminControls',
        field: 'multiple',
        oldValue: this._original?.adminControls,
        newValue: this.adminControls,
        modifiedBy: this.lastModifiedBy,
        modifiedAt: new Date()
      });
    }
  }

  next();
});

// Instance Methods
SettingsSchema.methods.getVisibleCategories = function () {
  const EXCLUDED_KEYS = ['lastUpdatedBy', 'lastUpdatedAt', '_id'];
  const visibility = this.dataVisibility.toObject();

  return Object.keys(visibility)
    .filter(key => !EXCLUDED_KEYS.includes(key) && visibility[key]?.enabled === true);
};

SettingsSchema.methods.updateVisibility = async function (updates, userId) {
  for (const [key, value] of Object.entries(updates)) {
    if (this.dataVisibility[key] !== undefined) {
      const oldValue = this.dataVisibility[key];
      this.dataVisibility[key] = typeof value === 'object' ? value : { enabled: value };

      this.modificationHistory.push({
        category: 'dataVisibility',
        field: key,
        oldValue: oldValue?.enabled !== undefined ? oldValue.enabled : oldValue,
        newValue: typeof value === 'object' ? value.enabled : value,
        modifiedBy: userId,
        modifiedAt: new Date()
      });
    }
  }

  this.dataVisibility.lastUpdatedBy = userId;
  this.dataVisibility.lastUpdatedAt = new Date();
  this.lastModifiedBy = userId;

  await this.save();
  return this;
};

// Static Methods
SettingsSchema.statics.getByUser = async function (userId, userRole) {
  let settings = await this.findOne({ userId });

  if (!settings) {
    settings = await this.create({
      userId,
      userRole,
      notifications: {},
      security: {},
      preferences: {},
      appearance: {},
      adminControls: {},
      systemSettings: userRole === 'super_admin' ? {} : undefined,
      dataVisibility: userRole === 'admin' ? {} : undefined
    });
  }

  return settings;
};

SettingsSchema.statics.resetToDefaults = async function (userId, category = null) {
  const settings = await this.findOne({ userId });
  if (!settings) {
    throw new Error('Settings not found');
  }

  const defaults = {
    notifications: {},
    security: {},
    preferences: {},
    appearance: {},
    adminControls: {},
    systemSettings: {},
    dataVisibility: {}
  };

  if (category && defaults[category] !== undefined) {
    settings[category] = defaults[category];
  } else if (!category) {
    Object.assign(settings, defaults);
  }

  settings.lastModifiedAt = new Date();
  await settings.save();

  return settings;
};

const Settings = mongoose.model('Settings', SettingsSchema);
export default Settings;