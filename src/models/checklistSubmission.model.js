import mongoose from 'mongoose';

// ─── Field Response Sub-Schema ─────────────────────────────────────────────────
const submissionFieldResponseSchema = new mongoose.Schema(
  {
    fieldId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    label: { type: String, trim: true },
    fieldType: { type: String, trim: true },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    filePaths: [{ type: String }],
    isValid: { type: Boolean, default: true },
    validationErrors: [{ type: String }],
    answeredAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

// ─── Reviewer Action Sub-Schema ────────────────────────────────────────────────
const reviewActionSchema = new mongoose.Schema(
  {
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reviewedByName: { type: String, trim: true },
    reviewedByRole: {
      type: String,
      enum: ['super_admin', 'admin'],
    },
    action: {
      type: String,
      enum: ['approved', 'rejected', 'needs_revision'],
      required: true,
    },
    comments: { type: String, trim: true },
    rejectionReason: { type: String, trim: true },
    reviewedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

// ─── Attachment Sub-Schema ─────────────────────────────────────────────────────
const attachmentSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    url: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    size: { type: Number, default: 0 },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

// ─── Asset Snapshot Sub-Schema ─────────────────────────────────────────────────
// Captures asset state at submission time so history is never lost
const assetSnapshotSchema = new mongoose.Schema(
  {
    assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
    assetName: { type: String, trim: true },
    assetTagNumber: { type: String, trim: true },
    assetLocation: { type: String, trim: true },
    assetCategory: { type: String, trim: true },
    assetStatus: { type: String, trim: true },
    assetCondition: { type: String, trim: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    adminName: { type: String, trim: true },
  },
  { _id: false }
);

// ─── Checklist Snapshot Sub-Schema ────────────────────────────────────────────
// Captures checklist structure at submission time for immutable audit trail
const checklistSnapshotSchema = new mongoose.Schema(
  {
    checklistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Checklist', required: true },
    checklistName: { type: String, trim: true },
    checklistVersion: { type: String, trim: true },
    type: { type: String, trim: true },
    category: { type: String, trim: true },
    sections: { type: mongoose.Schema.Types.Mixed, default: [] },
    totalFields: { type: Number, default: 0 },
    snapshotAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ─── Submitter Info Sub-Schema ─────────────────────────────────────────────────
const submitterInfoSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, trim: true },
    email: { type: String, trim: true },
    role: { type: String, enum: ['super_admin', 'admin', 'team'] },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    adminName: { type: String, trim: true },
  },
  { _id: false }
);

// ─── Main Submission Schema ────────────────────────────────────────────────────
const submissionSchema = new mongoose.Schema(
  {
    // ── Core References ──────────────────────────────────────────────────────────
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assignments',
      required: true,
      index: true,
    },
    checklist: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Checklist',
      required: true,
      index: true,
    },
    asset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Asset',
      default: null,
      index: true,
    },

    // ── Immutable Snapshots (audit trail) ────────────────────────────────────────
    checklistSnapshot: checklistSnapshotSchema,
    assetSnapshots: [assetSnapshotSchema],

    // ── Submission Numbering ─────────────────────────────────────────────────────
    // Human-readable reference number e.g. SUB-2024-000042
    submissionNumber: {
      type: String,
      unique: true,
      index: true,
    },
    // Which attempt this is for the same assignment (re-submissions after rejection)
    submissionAttempt: { type: Number, default: 1, min: 1 },

    // ── Who Submitted ────────────────────────────────────────────────────────────
    submittedBy: submitterInfoSchema,

    // ── Customer / Admin Context ─────────────────────────────────────────────────
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    customerName: { type: String, trim: true },
    customerEmail: { type: String, trim: true },

    // ── Denormalised Names (for fast search/display without populate) ─────────────
    checklistName: { type: String, trim: true },
    checklistVersion: { type: String, trim: true },
    assetName: { type: String, trim: true },
    assetTagNumber: { type: String, trim: true },

    // ── Status ───────────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['pending_review', 'approved', 'rejected', 'needs_revision'],
      default: 'pending_review',
      index: true,
    },

    // ── Form Responses ───────────────────────────────────────────────────────────
    responses: [submissionFieldResponseSchema],
    totalFieldsCount: { type: Number, default: 0 },
    answeredFieldCount: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0, min: 0, max: 100 },

    // ── Rating & Notes ───────────────────────────────────────────────────────────
    overallRating: { type: Number, min: 1, max: 5, default: null },
    inspectorNotes: { type: String, trim: true },
    submissionNotes: { type: String, trim: true },

    // ── Review ───────────────────────────────────────────────────────────────────
    reviewHistory: [reviewActionSchema],           // full audit trail of all reviews
    latestReview: reviewActionSchema,             // quick access to the most-recent review
    rejectionReason: { type: String, trim: true },
    reviewComments: { type: String, trim: true },
    reviewedAt: { type: Date, default: null },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // ── Files ────────────────────────────────────────────────────────────────────
    photos: [{ type: String }],                // URLs / paths
    signaturePath: { type: String, default: null },
    attachments: [attachmentSchema],

    // ── Draft Support ────────────────────────────────────────────────────────────
    isDraft: { type: Boolean, default: false },
    draftCount: { type: Number, default: 0 },
    lastSavedAt: { type: Date, default: null },

    // ── Timing ───────────────────────────────────────────────────────────────────
    submittedAt: { type: Date, default: null, index: true },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    // ── Geolocation (optional) ───────────────────────────────────────────────────
    location: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      address: { type: String, trim: true },
    },

    // ── Device / Session Info (optional) ─────────────────────────────────────────
    deviceInfo: {
      platform: { type: String, trim: true },
      userAgent: { type: String, trim: true },
      appVersion: { type: String, trim: true },
    },

    // ── Soft Delete ───────────────────────────────────────────────────────────────
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // ── Metadata ─────────────────────────────────────────────────────────────────
    metadata: {
      tags: [{ type: String, trim: true }],
      department: { type: String, trim: true },
      notes: { type: String, trim: true },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ───────────────────────────────────────────────────────────────────

// Core lookups
submissionSchema.index({ assignment: 1, submittedAt: -1 });
submissionSchema.index({ checklist: 1, status: 1 });
submissionSchema.index({ checklist: 1, submittedAt: -1 });
submissionSchema.index({ asset: 1, submittedAt: -1 });
submissionSchema.index({ customerId: 1, status: 1 });
submissionSchema.index({ customerId: 1, submittedAt: -1 });
submissionSchema.index({ 'submittedBy.userId': 1, submittedAt: -1 });
submissionSchema.index({ status: 1, submittedAt: -1 });
submissionSchema.index({ status: 1, createdAt: -1 });
submissionSchema.index({ isDeleted: 1, submittedAt: -1 });
submissionSchema.index({ isDraft: 1, 'submittedBy.userId': 1 });

// Compound
submissionSchema.index({ checklist: 1, status: 1, submittedAt: -1 });
submissionSchema.index({ customerId: 1, status: 1, submittedAt: -1 });
submissionSchema.index({ assignment: 1, 'submittedBy.userId': 1, status: 1 });
submissionSchema.index({ isDeleted: 1, status: 1, submittedAt: -1 });

// Full-text search
submissionSchema.index(
  {
    checklistName: 'text',
    customerName: 'text',
    assetName: 'text',
    assetTagNumber: 'text',
    submissionNumber: 'text',
  },
  {
    weights: {
      checklistName: 3,
      customerName: 2,
      assetName: 1,
      assetTagNumber: 1,
      submissionNumber: 4,
    },
  }
);

// ─── Virtuals ──────────────────────────────────────────────────────────────────

submissionSchema.virtual('isApproved').get(function () {
  return this.status === 'approved';
});

submissionSchema.virtual('isRejected').get(function () {
  return this.status === 'rejected';
});

submissionSchema.virtual('isPendingReview').get(function () {
  return this.status === 'pending_review';
});

submissionSchema.virtual('needsRevision').get(function () {
  return this.status === 'needs_revision';
});

submissionSchema.virtual('timeTakenMinutes').get(function () {
  if (!this.startedAt || !this.submittedAt) return null;
  return Math.round((this.submittedAt - this.startedAt) / (1000 * 60));
});

submissionSchema.virtual('reviewCount').get(function () {
  return this.reviewHistory?.length || 0;
});

// ─── Pre-validate: auto-generate submissionNumber ──────────────────────────────

submissionSchema.pre('validate', async function (next) {
  if (this.isNew && !this.submissionNumber) {
    try {
      const year = new Date().getFullYear();
      const prefix = `SUB-${year}-`;
      const last = await mongoose
        .model('Submission')
        .findOne({ submissionNumber: { $regex: `^${prefix}` } })
        .sort({ submissionNumber: -1 })
        .select('submissionNumber')
        .lean();

      let seq = 1;
      if (last?.submissionNumber) {
        const parts = last.submissionNumber.split('-');
        seq = (parseInt(parts[2], 10) || 0) + 1;
      }

      this.submissionNumber = `${prefix}${String(seq).padStart(6, '0')}`;
    } catch (err) {
      // Non-fatal — a unique constraint will still protect duplicates
      console.error('Error generating submission number:', err);
    }
  }
  next();
});

// ─── Pre-save: compute completionRate ─────────────────────────────────────────

submissionSchema.pre('save', function (next) {
  if (this.responses && this.responses.length > 0) {
    const answered = this.responses.filter(r => {
      const v = r.value;
      return v !== null && v !== undefined && v !== '' &&
        !(Array.isArray(v) && v.length === 0);
    }).length;

    this.answeredFieldCount = answered;

    const denominator = this.totalFieldsCount > 0
      ? this.totalFieldsCount
      : this.responses.length;

    this.completionRate = Math.min(100, Math.round((answered / denominator) * 100));
  } else {
    this.answeredFieldCount = 0;
    this.completionRate = 0;
  }
  next();
});

// ─── Instance Methods ──────────────────────────────────────────────────────────

/**
 * Approve this submission.
 * @param {ObjectId} reviewerId
 * @param {string}   reviewerName
 * @param {string}   reviewerRole
 * @param {string}   [comments]
 */
submissionSchema.methods.approve = async function (reviewerId, reviewerName, reviewerRole, comments = '') {
  const action = {
    reviewedBy: reviewerId,
    reviewedByName: reviewerName,
    reviewedByRole: reviewerRole,
    action: 'approved',
    comments: comments.trim(),
    reviewedAt: new Date(),
  };

  this.status = 'approved';
  this.reviewedBy = reviewerId;
  this.reviewedAt = new Date();
  this.reviewComments = comments.trim();
  this.completedAt = new Date();
  this.latestReview = action;
  this.reviewHistory.push(action);

  await this.save();
  return this;
};

/**
 * Reject this submission.
 * @param {ObjectId} reviewerId
 * @param {string}   reviewerName
 * @param {string}   reviewerRole
 * @param {string}   rejectionReason  – required
 * @param {string}   [comments]
 */
submissionSchema.methods.reject = async function (reviewerId, reviewerName, reviewerRole, rejectionReason, comments = '') {
  if (!rejectionReason?.trim()) {
    throw new Error('Rejection reason is required');
  }

  const action = {
    reviewedBy: reviewerId,
    reviewedByName: reviewerName,
    reviewedByRole: reviewerRole,
    action: 'rejected',
    rejectionReason: rejectionReason.trim(),
    comments: comments.trim(),
    reviewedAt: new Date(),
  };

  this.status = 'rejected';
  this.rejectionReason = rejectionReason.trim();
  this.reviewComments = comments.trim();
  this.reviewedBy = reviewerId;
  this.reviewedAt = new Date();
  this.latestReview = action;
  this.reviewHistory.push(action);

  await this.save();
  return this;
};

/**
 * Mark as needs revision.
 */
submissionSchema.methods.requestRevision = async function (reviewerId, reviewerName, reviewerRole, comments) {
  const action = {
    reviewedBy: reviewerId,
    reviewedByName: reviewerName,
    reviewedByRole: reviewerRole,
    action: 'needs_revision',
    comments: comments?.trim() || '',
    reviewedAt: new Date(),
  };

  this.status = 'needs_revision';
  this.reviewComments = comments?.trim() || '';
  this.reviewedBy = reviewerId;
  this.reviewedAt = new Date();
  this.latestReview = action;
  this.reviewHistory.push(action);

  await this.save();
  return this;
};

/**
 * Soft-delete the submission.
 */
submissionSchema.methods.softDelete = async function (deletedByUserId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedByUserId;
  await this.save();
  return this;
};

/**
 * Returns a compact summary object (safe for list views).
 */
submissionSchema.methods.getSummary = function () {
  return {
    id: this._id,
    submissionNumber: this.submissionNumber,
    checklistName: this.checklistName,
    assetName: this.assetName,
    assetTagNumber: this.assetTagNumber,
    customerName: this.customerName,
    submittedBy: this.submittedBy?.name || 'Unknown',
    status: this.status,
    completionRate: this.completionRate,
    overallRating: this.overallRating,
    submittedAt: this.submittedAt,
    reviewedAt: this.reviewedAt,
    reviewCount: this.reviewCount,
  };
};

// ─── Static Methods ────────────────────────────────────────────────────────────

/**
 * Get all submissions for a given assignment.
 */
submissionSchema.statics.getByAssignment = async function (assignmentId, options = {}) {
  const { page = 1, limit = 20, status } = options;
  const query = { assignment: assignmentId, isDeleted: false };
  if (status) query.status = status;

  const skip = (Math.max(page, 1) - 1) * Math.min(limit, 100);

  const [submissions, total] = await Promise.all([
    this.find(query)
      .populate('submittedBy.userId', 'name email')
      .populate('reviewedBy', 'name email')
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(Math.min(limit, 100))
      .lean(),
    this.countDocuments(query),
  ]);

  return {
    submissions,
    pagination: {
      page: Math.max(page, 1),
      limit: Math.min(limit, 100),
      total,
      totalPages: Math.ceil(total / Math.min(limit, 100)),
    },
  };
};

/**
 * Get all submissions for a given checklist.
 */
submissionSchema.statics.getByChecklist = async function (checklistId, userId, userRole, options = {}) {
  const { page = 1, limit = 20, status, dateFrom, dateTo, search } = options;

  const query = { checklist: checklistId, isDeleted: false };

  if (userRole === 'admin') {
    query.customerId = userId;
  }

  if (status) query.status = status;

  if (dateFrom || dateTo) {
    query.submittedAt = {};
    if (dateFrom) query.submittedAt.$gte = new Date(dateFrom);
    if (dateTo) query.submittedAt.$lte = new Date(dateTo);
  }

  if (search?.trim()) {
    query.$or = [
      { checklistName: { $regex: search.trim(), $options: 'i' } },
      { customerName: { $regex: search.trim(), $options: 'i' } },
      { assetName: { $regex: search.trim(), $options: 'i' } },
      { assetTagNumber: { $regex: search.trim(), $options: 'i' } },
      { submissionNumber: { $regex: search.trim(), $options: 'i' } },
    ];
  }

  const skip = (Math.max(page, 1) - 1) * Math.min(limit, 100);
  const lim = Math.min(limit, 100);

  const [submissions, total] = await Promise.all([
    this.find(query)
      .populate('submittedBy.userId', 'name email')
      .populate('reviewedBy', 'name email')
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(lim)
      .lean(),
    this.countDocuments(query),
  ]);

  return {
    submissions,
    pagination: { page: Math.max(page, 1), limit: lim, total, totalPages: Math.ceil(total / lim) },
  };
};

/**
 * Aggregate stats for a checklist (used in analytics).
 */
submissionSchema.statics.getChecklistStats = async function (checklistId, userId, userRole, dateRange = 30) {
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - parseInt(dateRange, 10));

  const match = {
    checklist: new mongoose.Types.ObjectId(checklistId),
    isDeleted: false,
    submittedAt: { $gte: fromDate },
  };

  if (userRole === 'admin') {
    match.customerId = new mongoose.Types.ObjectId(userId);
  }

  const [agg] = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
        needsRevision: { $sum: { $cond: [{ $eq: ['$status', 'needs_revision'] }, 1, 0] } },
        pendingReview: { $sum: { $cond: [{ $eq: ['$status', 'pending_review'] }, 1, 0] } },
        avgCompletion: { $avg: '$completionRate' },
        avgRating: { $avg: '$overallRating' },
        avgTimeTakenMs: {
          $avg: {
            $cond: [
              { $and: ['$startedAt', '$submittedAt'] },
              { $subtract: ['$submittedAt', '$startedAt'] },
              null,
            ],
          },
        },
      },
    },
  ]);

  const stats = agg || {
    total: 0, approved: 0, rejected: 0,
    needsRevision: 0, pendingReview: 0,
    avgCompletion: 0, avgRating: 0, avgTimeTakenMs: 0,
  };

  return {
    total: stats.total,
    approved: stats.approved,
    rejected: stats.rejected,
    needsRevision: stats.needsRevision,
    pendingReview: stats.pendingReview,
    approvalRate: stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0,
    avgCompletion: stats.avgCompletion != null ? Math.round(stats.avgCompletion) : 0,
    avgRating: stats.avgRating != null ? parseFloat(stats.avgRating.toFixed(1)) : null,
    avgTimeTakenMinutes: stats.avgTimeTakenMs != null
      ? Math.round(stats.avgTimeTakenMs / (1000 * 60))
      : null,
  };
};

/**
 * Recent submissions (used in dashboards).
 */
submissionSchema.statics.getRecent = async function (userId, userRole, limit = 10) {
  const query = { isDeleted: false, isDraft: false };

  if (userRole === 'team') {
    query['submittedBy.userId'] = userId;
  } else if (userRole === 'admin') {
    query.customerId = userId;
  }

  return this.find(query)
    .populate('checklist', 'name category')
    .populate('submittedBy.userId', 'name email')
    .sort({ submittedAt: -1 })
    .limit(Math.min(limit, 50))
    .lean();
};

/**
 * Inspection history (submitted + reviewed submissions).
 */
submissionSchema.statics.getInspectionHistory = async function (userId, userRole, options = {}) {
  const {
    status, search, dateFrom, dateTo,
    page = 1, limit = 20,
    sortBy = 'submittedAt', sortOrder = 'desc',
    customerId,
  } = options;

  const query = { isDeleted: false, isDraft: false };

  if (status && status !== 'all') {
    query.status = status;
  }

  if (userRole === 'team') {
    query['submittedBy.userId'] = userId;
  } else if (userRole === 'admin') {
    query.customerId = userId;
  } else if (userRole === 'super_admin' && customerId) {
    query.customerId = customerId;
  }

  if (dateFrom || dateTo) {
    query.submittedAt = {};
    if (dateFrom) query.submittedAt.$gte = new Date(dateFrom);
    if (dateTo) query.submittedAt.$lte = new Date(dateTo);
  }

  if (search?.trim()) {
    query.$or = [
      { checklistName: { $regex: search.trim(), $options: 'i' } },
      { customerName: { $regex: search.trim(), $options: 'i' } },
      { assetName: { $regex: search.trim(), $options: 'i' } },
      { assetTagNumber: { $regex: search.trim(), $options: 'i' } },
      { submissionNumber: { $regex: search.trim(), $options: 'i' } },
    ];
  }

  const p = Math.max(parseInt(page, 10) || 1, 1);
  const lim = Math.min(parseInt(limit, 10) || 20, 100);
  const skip = (p - 1) * lim;
  const dir = sortOrder === 'asc' ? 1 : -1;

  const [submissions, total, statsAgg] = await Promise.all([
    this.find(query)
      .populate('checklist', 'name type category')
      .populate('assignment', 'priority dueDate')
      .populate('submittedBy.userId', 'name email')
      .populate('reviewedBy', 'name email')
      .sort({ [sortBy]: dir, _id: dir })
      .skip(skip)
      .limit(lim)
      .lean(),
    this.countDocuments(query),
    this.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] } },
          pendingReview: { $sum: { $cond: [{ $eq: ['$status', 'pending_review'] }, 1, 0] } },
          needsRevision: { $sum: { $cond: [{ $eq: ['$status', 'needs_revision'] }, 1, 0] } },
          avgScore: { $avg: '$completionRate' },
        },
      },
    ]),
  ]);

  const s = statsAgg[0] || {};

  return {
    success: true,
    submissions,
    stats: {
      total: s.total || 0,
      approved: s.approved || 0,
      rejected: s.rejected || 0,
      pendingReview: s.pendingReview || 0,
      needsRevision: s.needsRevision || 0,
      avgScore: s.avgScore != null ? Math.round(s.avgScore) : 0,
    },
    pagination: {
      page: p,
      limit: lim,
      total,
      totalPages: Math.ceil(total / lim),
      hasNextPage: p < Math.ceil(total / lim),
      hasPrevPage: p > 1,
    },
  };
};

// ─── Model Export ──────────────────────────────────────────────────────────────
const Submission = mongoose.model('Submission', submissionSchema);
export default Submission;