import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';


const MonthlyPerformanceSchema = new mongoose.Schema({
  month: { type: String, enum: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] },
  year: Number,
  inspections: { type: Number, default: 0 },
  qualityScore: { type: Number, default: 0, min: 0, max: 5 }
}, { _id: false });

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

const BillingHistorySchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true },
  date: { type: Date, required: true },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['paid', 'pending', 'failed'], default: 'paid' },
  paymentMethod: String,
  downloadUrl: String
}, { timestamps: true });

const userSchema = new mongoose.Schema({
  // Basic Info
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  name: { type: String, trim: true },
  customerName: { type: String, trim: true },
  email: {
    type: String, required: [true, 'Email is required'],
    unique: true, lowercase: true, trim: true, index: true
  },
  password: {
    type: String, required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'], select: false
  },
  phone: { type: String, trim: true },
  website: { type: String, trim: true },
  avatarUrl: { type: String, trim: true },

  // Role & Permissions
  role: {
    type: String, enum: ['super_admin', 'admin', 'team'],
    required: true, index: true
  },
  customRole: { type: String, trim: true, default: null },
  permissions: [{ type: String }],

  // Team Fields (legacy string fields for backward compatibility)
  teamRole: { type: String, trim: true, default: 'inspector' },
  department: { type: String, trim: true, default: 'General' },
  location: { type: String, trim: true, default: 'Main Office' },

  // Reference IDs for team configuration
  roleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TeamRole',
    index: true
  },
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    index: true
  },
  locationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Location',
    index: true
  },

  // Team creation info
  teamCreatedAt: { type: Date, default: null },
  teamCreatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Status
  status: {
    type: String, enum: ['active', 'inactive', 'suspended', 'on_leave'],
    default: 'active', index: true
  },

  // Hierarchy
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  bio: { type: String, trim: true, maxlength: 500 },
  joinDate: { type: Date, default: Date.now },

  // Activity Tracking
  lastLogin: Date,
  lastActiveAt: { type: Date, default: null },
  lastInactivityEmailSent: { type: Date, default: null },
  
  assignedCount: { type: Number, default: 0 },
  completedCount: { type: Number, default: 0 },
  onTimeRate: { type: Number, default: 0, min: 0, max: 100 },
  qualityScore: { type: Number, default: 0, min: 0, max: 5 },
  performanceScore: { type: Number, default: 0, min: 0, max: 100 },
  monthlyPerformance: [MonthlyPerformanceSchema],
  inspectionsThisMonth: { type: Number, default: 0 },
  lastMonthReset: { type: Date, default: Date.now },

  // Admin — Subscription & Billing
  membershipPlan: {
    type: String, enum: ['free', 'standard', 'premium', 'enterprise', null], default: null
  },
  subscriptionStartDate: { type: Date, default: Date.now },
  subscriptionEndDate: Date,
  licenseLimit: { type: Number, default: 10 },
  usersUsed: { type: Number, default: 0 },
  billingHistory: [BillingHistorySchema],
  lastExpiryNotificationSent: { type: String, default: null },

  // Admin — Storage & API
  storageUsed: { type: Number, default: 0 },
  storageLimit: { type: Number, default: 10 },
  apiCallsThisMonth: { type: Number, default: 0 },
  apiCallLimit: { type: Number, default: 10000 },
  lastApiReset: { type: Date, default: Date.now },

  // Misc Counters
  submissionsCount: { type: Number, default: 0 },
  activeChecklistCount: { type: Number, default: 0 },
  notes: { type: String, trim: true },

  // Settings & Notes
  settings: SettingsSchema,
  adminNotes: { type: String, trim: true },

  // Auth Tokens
  refreshToken: { type: String, select: false },
  passwordResetToken: String,
  passwordResetExpires: Date,

  // Soft Delete
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: Date,
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ── Virtuals ────────────────────────────────────────────────────────────────

userSchema.virtual('fullName').get(function () {
  if (this.role === 'team') return `${this.firstName || ''} ${this.lastName || ''}`.trim();
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
  return Math.max(0, Math.ceil((this.subscriptionEndDate - new Date()) / 86400000));
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
  if (this.role === 'team') {
    return this.teamRole
      ? this.teamRole.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      : 'Team Member';
  }
  return { super_admin: 'Super Administrator', admin: 'Organization Admin' }[this.role] || this.role;
});

userSchema.virtual('teamTenureDays').get(function () {
  if (this.role !== 'team' || !this.teamCreatedAt) return 0;
  return Math.max(0, Math.floor((new Date() - new Date(this.teamCreatedAt)) / 86400000));
});

// ── Virtual Refs ─────────────────────────────────────────────────────────────

userSchema.virtual('assignedChecklists', {
  ref: 'Assignments', localField: '_id',
  foreignField: 'assignedToTeamMembers.userId',
  options: { sort: { dueDate: 1 } }
});

userSchema.virtual('assignedAssets', {
  ref: 'Asset', localField: '_id',
  foreignField: 'assignedUsers.primaryUser'
});

userSchema.virtual('completedInspections', {
  ref: 'Assignments', localField: '_id',
  foreignField: 'assignedToTeamMembers.userId',
  match: { status: { $in: ['completed', 'approved'] } }
});

userSchema.virtual('notifications', {
  ref: 'Notification', localField: '_id',
  foreignField: 'recipient',
  options: { sort: { createdAt: -1 } }
});

// ── Indexes ──────────────────────────────────────────────────────────────────

userSchema.index({ adminId: 1, role: 1 });
userSchema.index({ adminId: 1, status: 1 });
userSchema.index({ role: 1, status: 1 });
userSchema.index({ email: 1, role: 1 });
userSchema.index({ role: 1, membershipPlan: 1, status: 1 });
userSchema.index({ subscriptionEndDate: 1 });
userSchema.index({ subscriptionEndDate: 1, lastExpiryNotificationSent: 1 });
userSchema.index({ teamRole: 1 });
userSchema.index({ department: 1 });
userSchema.index({ location: 1 });
userSchema.index({ teamCreatedAt: -1 });
userSchema.index({ performanceScore: -1 });
userSchema.index({ completedCount: -1 });
userSchema.index({ lastLogin: 1 });
userSchema.index({ roleId: 1, adminId: 1 });
userSchema.index({ departmentId: 1, adminId: 1 });
userSchema.index({ locationId: 1, adminId: 1 });
userSchema.index({ firstName: 'text', lastName: 'text', name: 'text', customerName: 'text', email: 'text' });

// ── Pre-Save ─────────────────────────────────────────────────────────────────

userSchema.pre('save', async function (next) {
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 12);
  }

  const now = new Date();

  if (this.role === 'team') {
    if (this.isNew && !this.teamCreatedAt) this.teamCreatedAt = now;

    if (this.lastMonthReset) {
      const lr = new Date(this.lastMonthReset);
      if (now.getMonth() !== lr.getMonth() || now.getFullYear() !== lr.getFullYear()) {
        this.inspectionsThisMonth = 0;
        this.lastMonthReset = now;
      }
    }
  }

  if (this.role === 'admin' && this.lastApiReset) {
    const lr = new Date(this.lastApiReset);
    if (now.getMonth() !== lr.getMonth() || now.getFullYear() !== lr.getFullYear()) {
      this.apiCallsThisMonth = 0;
      this.lastApiReset = now;
    }
  }

  if (this.isNew) {
    if (this.role === 'admin') {
      if (!this.membershipPlan) this.membershipPlan = 'standard';
      if (!this.subscriptionEndDate) {
        const end = new Date();
        end.setDate(end.getDate() + 30);
        this.subscriptionEndDate = end;
      }
      if (!this.permissions?.length) this.permissions = ['manage_team', 'manage_assets', 'view_reports'];
    }
    if (this.role === 'team') {
      if (!this.joinDate) this.joinDate = now;
      if (!this.teamRole) this.teamRole = 'inspector';
      if (!this.department) this.department = 'General';
      if (!this.location) this.location = 'Main Office';
    }
    if (this.role === 'super_admin') {
      if (!this.permissions?.length) this.permissions = ['*'];
    }
  }

  next();
});

// ── Instance Methods ──────────────────────────────────────────────────────────

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.generateAuthToken = function () {
  const payload = { _id: this._id, email: this.email, role: this.role };
  if (this.role === 'team' && this.adminId) payload.adminId = this.adminId;
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
};

userSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    { _id: this._id, type: 'refresh', role: this.role },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

userSchema.methods.generatePasswordResetToken = function () {
  const raw = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto.createHash('sha256').update(raw).digest('hex');
  this.passwordResetExpires = Date.now() + 3 * 24 * 60 * 60 * 1000;
  return raw;
};

userSchema.methods.canAddUsers = function (count = 1) {
  return this.role === 'admin' && (this.usersUsed + count) <= this.licenseLimit;
};

userSchema.methods.isSubscriptionActive = function () {
  if (this.role !== 'admin') return true;
  return this.status === 'active' && this.subscriptionEndDate > new Date();
};

userSchema.methods.updatePerformance = async function (completed, onTime, quality) {
  if (this.role !== 'team') return;
  this.completedCount += completed;
  this.inspectionsThisMonth += completed;
  const prev = this.completedCount - completed;
  if (onTime !== undefined) {
    this.onTimeRate = (this.onTimeRate * prev + (onTime ? 100 : 0)) / this.completedCount;
  }
  if (quality) {
    this.qualityScore = (this.qualityScore * prev + quality) / this.completedCount;
  }
  this.performanceScore = Math.round((this.onTimeRate + this.qualityScore * 20) / 2);
  await this.save();
};

userSchema.methods.addMonthlyPerformance = async function (month, year, inspections, qualityScore) {
  if (this.role !== 'team') return;
  const idx = this.monthlyPerformance.findIndex(mp => mp.month === month && mp.year === year);
  if (idx !== -1) {
    this.monthlyPerformance[idx] = { month, year, inspections, qualityScore };
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
  Object.assign(this, { isDeleted: true, deletedAt: new Date(), deletedBy, status: 'inactive' });
  await this.save();
};

userSchema.methods.restore = async function () {
  Object.assign(this, { isDeleted: false, deletedAt: null, deletedBy: null, status: 'active' });
  await this.save();
};

// ── Static Methods ────────────────────────────────────────────────────────────

userSchema.statics.findByRole = function (role, includeDeleted = false) {
  const query = { role };
  if (!includeDeleted) query.isDeleted = false;
  return this.find(query);
};

userSchema.statics.getInactiveUsers = function (days = 7) {
  const cutoff = new Date(Date.now() - days * 86400000);
  return this.find({
    status: 'active', isDeleted: false,
    $or: [
      { lastLogin: { $lt: cutoff } },
      { lastActiveAt: { $lt: cutoff } },
      { lastLogin: { $exists: false }, createdAt: { $lt: cutoff } }
    ]
  });
};

userSchema.statics.getExpiringSubscriptions = function () {
  const now = new Date();
  const in7d = new Date(Date.now() + 7 * 86400000);
  return this.find({
    role: 'admin', status: 'active', isDeleted: false,
    subscriptionEndDate: { $gt: now, $lte: in7d }
  });
};

// Helper: builds label from underscore_value
const toLabel = v => v?.replace(/_/g, ' ')?.replace(/\b\w/g, c => c.toUpperCase()) || '';

userSchema.statics.getDistinctTeamRoles = async function (adminId) {
  const rows = await this.aggregate([
    { $match: { adminId: new mongoose.Types.ObjectId(adminId), role: 'team', isDeleted: false } },
    { $group: { _id: '$teamRole', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  return rows.map(r => ({ value: r._id, label: toLabel(r._id), count: r.count }));
};

userSchema.statics.getDistinctDepartments = async function (adminId) {
  const rows = await this.aggregate([
    { $match: { adminId: new mongoose.Types.ObjectId(adminId), role: 'team', isDeleted: false } },
    { $group: { _id: '$department', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  return rows.map(r => ({ value: r._id, label: r._id, count: r.count }));
};

userSchema.statics.getDistinctLocations = async function (adminId) {
  const rows = await this.aggregate([
    { $match: { adminId: new mongoose.Types.ObjectId(adminId), role: 'team', isDeleted: false } },
    { $group: { _id: '$location', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);
  return rows.map(r => ({ value: r._id, label: r._id, count: r.count }));
};

userSchema.statics.getTeamMembersWithStats = async function (adminId, {
  sortBy = 'performanceScore', sortOrder = 'desc',
  page = 1, limit = 10, search = '',
  teamRole = '', department = '', location = '', status = ''
}) {
  const match = {
    adminId: new mongoose.Types.ObjectId(adminId),
    role: 'team', isDeleted: false
  };

  if (search) {
    match.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }
  if (teamRole) match.teamRole = teamRole;
  if (department) match.department = department;
  if (location) match.location = location;
  if (status) match.status = status;

  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };
  const skip = (page - 1) * limit;

  const [members, [agg]] = await Promise.all([
    this.aggregate([
      { $match: match }, { $sort: sort }, { $skip: skip }, { $limit: limit },
      {
        $lookup: {
          from: 'assignments', localField: '_id',
          foreignField: 'assignedToTeamMembers.userId', as: 'assignments'
        }
      },
      {
        $addFields: {
          assignedCount: { $size: '$assignments' },
          completedCount: {
            $size: {
              $filter: {
                input: '$assignments', as: 'a',
                cond: { $in: ['$$a.status', ['completed', 'approved']] }
              }
            }
          }
        }
      },
      { $project: { password: 0, refreshToken: 0, passwordResetToken: 0, assignments: 0 } }
    ]),
    this.aggregate([
      { $match: match },
      {
        $facet: {
          total: [{ $count: 'count' }],
          active: [{ $match: { status: 'active' } }, { $count: 'count' }],
          onLeave: [{ $match: { status: 'on_leave' } }, { $count: 'count' }],
          inactive: [{ $match: { status: 'inactive' } }, { $count: 'count' }],
          byRole: [{ $group: { _id: '$teamRole', count: { $sum: 1 } } }],
          byDepartment: [{ $group: { _id: '$department', count: { $sum: 1 } } }],
          byLocation: [{ $group: { _id: '$location', count: { $sum: 1 } } }],
          avgPerformance: [
            { $match: { status: 'active', performanceScore: { $gt: 0 } } },
            { $group: { _id: null, avg: { $avg: '$performanceScore' } } }
          ],
          totalInspections: [{ $group: { _id: null, total: { $sum: '$completedCount' } } }],
          totalAssigned: [{ $group: { _id: null, total: { $sum: '$assignedCount' } } }]
        }
      }
    ])
  ]);

  const toObj = arr => Object.fromEntries((arr || []).map(({ _id, count }) => [_id, count]));
  const total = agg?.total[0]?.count || 0;

  return {
    members,
    stats: {
      total,
      active: agg?.active[0]?.count || 0,
      onLeave: agg?.onLeave[0]?.count || 0,
      inactive: agg?.inactive[0]?.count || 0,
      avgPerformance: Math.round(agg?.avgPerformance[0]?.avg || 0),
      totalInspections: agg?.totalInspections[0]?.total || 0,
      totalAssigned: agg?.totalAssigned[0]?.total || 0,
      byRole: toObj(agg?.byRole),
      byDepartment: toObj(agg?.byDepartment),
      byLocation: toObj(agg?.byLocation)
    },
    pagination: { page, limit, total, pages: Math.ceil(total / limit) }
  };
};

userSchema.statics.getTeamMemberDetails = function (memberId, adminId) {
  return this.findOne({ _id: memberId, role: 'team', adminId, isDeleted: false })
    .select('-password -refreshToken -passwordResetToken')
    .populate('teamCreatedBy', 'firstName lastName email')
    .populate('createdBy', 'firstName lastName email')
    .lean();
};

const User = mongoose.models.User || mongoose.model('User', userSchema);
export default User;