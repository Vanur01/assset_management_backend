import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Address Sub-Schema
const AddressSchema = new mongoose.Schema({
  street: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  zipCode: { type: String, trim: true },
  country: { type: String, trim: true }
}, { _id: false });

// Certification Sub-Schema
const CertificationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  issuedDate: Date,
  expiryDate: Date,
  issuingAuthority: String,
  certificateUrl: String
}, { _id: false });

// Monthly Performance Sub-Schema
const MonthlyPerformanceSchema = new mongoose.Schema({
  month: { type: String, enum: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] },
  year: Number,
  inspections: { type: Number, default: 0 },
  qualityScore: { type: Number, default: 0, min: 0, max: 5 }
}, { _id: false });

// Settings Sub-Schema
const SettingsSchema = new mongoose.Schema({
  notifications: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    inspectionReminders: { type: Boolean, default: true }
  },
  appearance: {
    theme: { type: String, enum: ['light', 'dark', 'system'], default: 'light' },
    compactView: { type: Boolean, default: false }
  },
  preferences: {
    language: { type: String, default: 'en' },
    timezone: { type: String, default: 'America/New_York' },
    dateFormat: { type: String, default: 'MM/DD/YYYY' }
  },
  autoRenewal: { type: Boolean, default: true }
}, { _id: false });

// Billing History Sub-Schema
const BillingHistorySchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true },
  date: { type: Date, required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['paid', 'pending', 'failed'], default: 'paid' },
  paymentMethod: { type: String },
  downloadUrl: { type: String }
}, { timestamps: true });

// Main User Schema
const userSchema = new mongoose.Schema({
  // Basic Information
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  name: { type: String, trim: true },
  customerName: { type: String, trim: true },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    index: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    select: false
  },
  phone: { type: String, trim: true },
  website: { type: String, trim: true },
  avatarUrl: { type: String, trim: true },

  // Role & Permissions
  role: {
    type: String,
    enum: ['super_admin', 'admin', 'team'],
    required: true,
    index: true
  },
  teamRole: {
    type: String,
    enum: ['inspector', 'senior_inspector', 'lead_inspector', 'junior_inspector', 'supervisor', 'manager', null],
    default: null
  },
  permissions: [{ type: String }],

  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'on_leave'],
    default: 'active',
    index: true
  },

  // Organization Hierarchy
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Address & Personal Info
  address: AddressSchema,
  bio: { type: String, trim: true, maxlength: 500 },
  department: { type: String, trim: true },
  location: { type: String, trim: true },
  joinDate: { type: Date, default: Date.now },
  lastLogin: Date,
  lastLoginDate: Date,
  lastActiveAt: { type: Date, default: null },

  // Certifications (Team only)
  certifications: [CertificationSchema],

  // Performance Metrics (Team only)
  assignedCount: { type: Number, default: 0 },
  completedCount: { type: Number, default: 0 },
  onTimeRate: { type: Number, default: 0, min: 0, max: 100 },
  qualityScore: { type: Number, default: 0, min: 0, max: 5 },
  performanceScore: { type: Number, default: 0, min: 0, max: 100 },
  monthlyPerformance: [MonthlyPerformanceSchema],
  inspectionsThisMonth: { type: Number, default: 0 },
  lastMonthReset: { type: Date, default: Date.now },

  // Subscription & Billing (Admin only)
  membershipPlan: {
    type: String,
    enum: ['free', 'standard', 'premium', 'enterprise', null],
    default: null
  },
  subscriptionStartDate: { type: Date, default: Date.now },
  subscriptionEndDate: { type: Date },
  licenseLimit: { type: Number, default: 10 },
  usersUsed: { type: Number, default: 0 },
  billingHistory: [BillingHistorySchema],

  // Storage tracking
  storageUsed: { type: Number, default: 0 },
  storageLimit: { type: Number, default: 10 },

  // API tracking
  apiCallsThisMonth: { type: Number, default: 0 },
  apiCallLimit: { type: Number, default: 10000 },
  lastApiReset: { type: Date, default: Date.now },

  // Additional tracking
  submissionsCount: { type: Number, default: 0 },
  activeChecklistCount: { type: Number, default: 0 },
  notes: { type: String, trim: true },

  // Settings
  settings: SettingsSchema,
  adminNotes: { type: String, trim: true },

  // Tokens
  refreshToken: { type: String, select: false },
  token: { type: String, select: false },

  // Password Reset
  passwordResetToken: String,
  passwordResetExpires: Date,

  // System Fields
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: Date,
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

}, { timestamps: true });

// ==================== VIRTUALS ====================

userSchema.virtual('fullName').get(function () {
  if (this.role === 'team') {
    return `${this.firstName || ''} ${this.lastName || ''}`.trim();
  }
  if (this.role === 'admin') return this.customerName;
  return this.name;
});

userSchema.virtual('initials').get(function () {
  if (this.role === 'team') {
    return `${(this.firstName?.[0] || '').toUpperCase()}${(this.lastName?.[0] || '').toUpperCase()}`;
  }
  if (this.role === 'admin' && this.customerName) {
    return this.customerName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }
  return this.email?.[0]?.toUpperCase() || 'U';
});

userSchema.virtual('daysRemaining').get(function () {
  if (this.role !== 'admin' || !this.subscriptionEndDate) return 0;
  const diff = this.subscriptionEndDate - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

userSchema.virtual('usagePercentage').get(function () {
  if (this.role !== 'admin' || !this.licenseLimit) return 0;
  return Math.round((this.usersUsed / this.licenseLimit) * 100);
});

userSchema.virtual('storagePercentage').get(function () {
  if (this.role !== 'admin' || !this.storageLimit) return 0;
  return Math.round((this.storageUsed / this.storageLimit) * 100);
});

userSchema.virtual('apiUsagePercentage').get(function () {
  if (this.role !== 'admin' || !this.apiCallLimit) return 0;
  return Math.round((this.apiCallsThisMonth / this.apiCallLimit) * 100);
});

userSchema.virtual('completionRate').get(function () {
  if (this.role !== 'team' || !this.assignedCount) return 0;
  return Math.round((this.completedCount / this.assignedCount) * 100);
});

userSchema.virtual('roleDisplay').get(function () {
  const roleMap = {
    super_admin: 'Super Administrator',
    admin: 'Organization Admin',
    team: {
      inspector: 'Inspector',
      senior_inspector: 'Senior Inspector',
      lead_inspector: 'Lead Inspector',
      junior_inspector: 'Junior Inspector',
      supervisor: 'Supervisor',
      manager: 'Manager'
    }
  };
  if (this.role === 'team' && this.teamRole) {
    return roleMap.team[this.teamRole] || 'Team Member';
  }
  return roleMap[this.role] || this.role;
});

// ==================== INDEXES ====================
userSchema.index({ adminId: 1, role: 1 });
userSchema.index({ adminId: 1, status: 1 });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ email: 1, role: 1 });
userSchema.index({ subscriptionEndDate: 1 });
userSchema.index({ teamRole: 1 });
userSchema.index({ role: 1, membershipPlan: 1, status: 1 });
userSchema.index({ firstName: 'text', lastName: 'text', name: 'text', customerName: 'text', email: 'text' });

// ==================== PRE-SAVE MIDDLEWARE ====================
userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 12);
  }

  // Reset monthly API calls for admin
  if (this.role === 'admin' && this.lastApiReset) {
    const now = new Date();
    const lastReset = new Date(this.lastApiReset);
    if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
      this.apiCallsThisMonth = 0;
      this.lastApiReset = now;
    }
  }

  // Reset monthly inspections for team
  if (this.role === 'team' && this.lastMonthReset) {
    const now = new Date();
    const lastReset = new Date(this.lastMonthReset);
    if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
      this.inspectionsThisMonth = 0;
      this.lastMonthReset = now;
    }
  }

  if (this.isNew) {
    if (this.role === 'admin') {
      if (!this.membershipPlan) this.membershipPlan = 'standard';
      if (!this.subscriptionEndDate) {
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);
        this.subscriptionEndDate = endDate;
      }
      if (!this.permissions || this.permissions.length === 0) {
        this.permissions = ['manage_team', 'manage_assets', 'view_reports'];
      }
    }
    if (this.role === 'team') {
      if (!this.teamRole) this.teamRole = 'inspector';
      if (!this.joinDate) this.joinDate = new Date();
    }
    if (this.role === 'super_admin') {
      if (!this.permissions || this.permissions.length === 0) {
        this.permissions = ['*'];
      }
    }
  }
  next();
});

// ==================== INSTANCE METHODS ====================

userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.generateAuthToken = function () {
  const payload = { _id: this._id, email: this.email, role: this.role };
  if (this.role === 'team' && this.adminId) payload.adminId = this.adminId;
  return jwt.sign(payload, "f764063ba30c2a1465967e1427f891e57bffe402c0c62a5216dee6ef910ff1b0", { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    { _id: this._id, type: 'refresh', role: this.role },
    "f764063ba30c2a1465967e1427f891e57bffe402c0c62a5216dee6ef910ff1b0",
    { expiresIn: '30d' }
  );
};

userSchema.methods.canAddUsers = function (count = 1) {
  if (this.role !== 'admin') return false;
  return (this.usersUsed + count) <= this.licenseLimit;
};

userSchema.methods.isSubscriptionActive = function () {
  if (this.role !== 'admin') return true;
  return this.status === 'active' && this.subscriptionEndDate > new Date();
};

userSchema.methods.updatePerformance = async function (completed, onTime, quality) {
  if (this.role !== 'team') return;
  this.completedCount += completed;
  this.inspectionsThisMonth += completed;
  if (onTime !== undefined) {
    this.onTimeRate = ((this.onTimeRate * (this.completedCount - completed) + (onTime ? 100 : 0)) / this.completedCount);
  }
  if (quality) {
    this.qualityScore = ((this.qualityScore * (this.completedCount - completed) + quality) / this.completedCount);
  }
  this.performanceScore = Math.round((this.onTimeRate + this.qualityScore * 20) / 2);
  await this.save();
};

userSchema.methods.addMonthlyPerformance = async function (month, year, inspections, qualityScore) {
  if (this.role !== 'team') return;
  const existingIndex = this.monthlyPerformance.findIndex(mp => mp.month === month && mp.year === year);
  if (existingIndex !== -1) {
    this.monthlyPerformance[existingIndex] = { month, year, inspections, qualityScore };
  } else {
    this.monthlyPerformance.push({ month, year, inspections, qualityScore });
  }
  await this.save();
};

userSchema.methods.updateLastActive = async function () {
  this.lastActiveAt = new Date();
  await this.save();
};

userSchema.methods.softDelete = async function (deletedBy) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  this.status = 'inactive';
  await this.save();
};

userSchema.methods.restore = async function () {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  this.status = 'active';
  await this.save();
};

// ==================== STATIC METHODS ====================

userSchema.statics.findByRole = function (role, includeDeleted = false) {
  const query = { role };
  if (!includeDeleted) query.isDeleted = false;
  return this.find(query);
};

userSchema.statics.getTeamByAdmin = function (adminId, filters = {}) {
  const query = { role: 'team', adminId, isDeleted: false };
  if (filters.status) query.status = filters.status;
  if (filters.teamRole) query.teamRole = filters.teamRole;
  return this.find(query);
};

// Safe export
const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;
