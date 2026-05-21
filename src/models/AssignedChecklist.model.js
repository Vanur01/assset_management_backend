import mongoose from 'mongoose';

// ─── Sub-schemas ───────────────────────────────────────────────────────────────

const fieldResponseSchema = new mongoose.Schema(
  {
    fieldId:          { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    label:            { type: String, trim: true },
    fieldType:        { type: String },
    value:            { type: mongoose.Schema.Types.Mixed },
    filePaths:        [{ type: String }],
    isValid:          { type: Boolean, default: true },
    validationErrors: [{ type: String }],
    answeredAt:       { type: Date, default: Date.now },
  },
  { _id: true }
);

const teamMemberSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:        { type: String, trim: true },
  status: {
    type:    String,
    enum:    ['pending', 'accepted', 'in_progress', 'completed', 'rejected'],
    default: 'pending',
  },
  assignedAt:  { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },
});

const assetAssignmentSchema = new mongoose.Schema({
  assetId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  assetName:     { type: String, trim: true },
  assetTagNumber:{ type: String, trim: true },
  assetLocation: { type: String, trim: true },
  assetCategory: { type: String, trim: true },
  assignedAt:    { type: Date, default: Date.now },
});

// ─── Main schema ───────────────────────────────────────────────────────────────

const assignmentSchema = new mongoose.Schema(
  {
    // ── References ──────────────────────────────────────────────────────────────
    checklist: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'Checklist',
      required: true,
      index:    true,
    },
    checklistName:    { type: String, trim: true },
    checklistVersion: { type: String, trim: true },

    checklistRequest: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'ChecklistRequest',
      default: null,
      index:   true,
    },
    checklistRequestName: { type: String, trim: true },

    // ── Assignment hierarchy ─────────────────────────────────────────────────────
    assignedBy: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      'User',
      required: true,
    },
    // FIX: added 'team' so a team-role user can trigger assignment flows if needed
    assignedByRole: {
      type:     String,
      enum:     ['super_admin', 'admin', 'team'],
      required: true,
    },
    assignedToAdmin: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
      index:   true,
    },
    assignedToAdminName: { type: String, trim: true },

    assignedToTeamMembers: [teamMemberSchema],

    // ── Customer ─────────────────────────────────────────────────────────────────
    customerId: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     'User',
      default: null,
      index:   true,
    },
    customerName:  { type: String, trim: true },
    customerEmail: { type: String, trim: true },
    customerPhone: { type: String, trim: true },

    // ── Assets ───────────────────────────────────────────────────────────────────
    assets: [assetAssignmentSchema],

    // ── Dates ────────────────────────────────────────────────────────────────────
    dueDate:     { type: Date, required: [true, 'Due date is required'], index: true },
    assignedAt:  { type: Date, default: Date.now },
    startedAt:   { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    reviewedAt:  { type: Date, default: null },

    // ── Status ───────────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: [
        'pending', 'in_progress', 'submitted',
        'under_review', 'approved', 'rejected', 'completed', 'overdue',
      ],
      default: 'pending',
      index:   true,
    },
    submissionStatus: {
      type:    String,
      enum:    ['pending_review', 'approved', 'rejected', 'needs_revision'],
      default: null,
    },
    priority: {
      type:    String,
      enum:    ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index:   true,
    },

    // ── Form responses ───────────────────────────────────────────────────────────
    responses: [fieldResponseSchema],

    // FIX: totalFieldsSnapshot stored at submission time so completion % is always accurate
    totalFieldsSnapshot: { type: Number, default: 0 },

    completionRate: { type: Number, default: 0, min: 0, max: 100 },

    // ── Review ───────────────────────────────────────────────────────────────────
    reviewedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedByName:  { type: String, trim: true },
    rejectionReason: { type: String, trim: true },
    reviewComments:  { type: String, trim: true },

    // ── Misc ─────────────────────────────────────────────────────────────────────
    notes:          { type: String, trim: true },
    inspectorNotes: { type: String, trim: true },
    overallRating:  { type: Number, min: 1, max: 5 },
    isDraft:        { type: Boolean, default: false },
    draftCount:     { type: Number, default: 0 },
    lastSavedAt:    { type: Date, default: null },

    // ── Files ────────────────────────────────────────────────────────────────────
    uploadedPhotos: [{ type: String }],
    signaturePath:  { type: String },
    attachments: [{
      name:       String,
      url:        String,
      uploadedAt: { type: Date, default: Date.now },
    }],

    // ── Metadata ─────────────────────────────────────────────────────────────────
    metadata: {
      location:   { type: String, trim: true },
      department: { type: String, trim: true },
      tags:       [{ type: String, trim: true }],
    },
  },
  {
    timestamps: true,
    toJSON:     { virtuals: true },
    toObject:   { virtuals: true },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

assignmentSchema.index({ assignedBy: 1, createdAt: -1 });
assignmentSchema.index({ assignedToAdmin: 1, status: 1 });
assignmentSchema.index({ customerId: 1, status: 1 });
assignmentSchema.index({ checklist: 1, status: 1 });
assignmentSchema.index({ checklistRequest: 1, status: 1 });
assignmentSchema.index({ dueDate: 1, status: 1 });
assignmentSchema.index({ priority: 1, status: 1 });
assignmentSchema.index({ status: 1, dueDate: 1 });
assignmentSchema.index({ status: 1, createdAt: -1 });
assignmentSchema.index({ 'assignedToTeamMembers.userId': 1, status: 1 });
assignmentSchema.index({ 'assets.assetId': 1, status: 1 });

// Compound indexes
assignmentSchema.index({ assignedToAdmin: 1, status: 1, dueDate: 1 });
assignmentSchema.index({ customerId: 1, status: 1, dueDate: 1 });
assignmentSchema.index({ checklistRequest: 1, status: 1, createdAt: -1 });
assignmentSchema.index({ 'assignedToTeamMembers.userId': 1, status: 1, dueDate: 1 });
assignmentSchema.index({ 'assets.assetId': 1, status: 1, dueDate: 1 });
assignmentSchema.index({ status: 1, submissionStatus: 1, createdAt: -1 });

// Inspection-history specific: quickly find a user's submitted/completed work
assignmentSchema.index({
  'assignedToTeamMembers.userId': 1,
  submittedAt: -1,
  submissionStatus: 1,
});

// Full-text search
assignmentSchema.index(
  {
    customerName:         'text',
    checklistName:        'text',
    'assets.assetName':   'text',
    'assets.assetTagNumber': 'text',
  },
  {
    weights: {
      customerName:            2,
      checklistName:           3,
      'assets.assetName':      1,
      'assets.assetTagNumber': 1,
    },
  }
);

// ─── Virtuals ─────────────────────────────────────────────────────────────────

assignmentSchema.virtual('isOverdue').get(function () {
  return (
    this.dueDate &&
    this.dueDate < new Date() &&
    !['completed', 'approved', 'rejected'].includes(this.status)
  );
});

assignmentSchema.virtual('daysRemaining').get(function () {
  if (!this.dueDate) return null;
  const days = Math.ceil((this.dueDate - new Date()) / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
});

assignmentSchema.virtual('daysOverdue').get(function () {
  if (!this.isOverdue) return 0;
  const days = Math.ceil((new Date() - this.dueDate) / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
});

assignmentSchema.virtual('totalTeamMembers').get(function () {
  return this.assignedToTeamMembers?.length || 0;
});

assignmentSchema.virtual('totalAssets').get(function () {
  return this.assets?.length || 0;
});

assignmentSchema.virtual('completedTeamMembers').get(function () {
  return this.assignedToTeamMembers?.filter(tm => tm.status === 'completed').length || 0;
});

// ─── Pre-save middleware ───────────────────────────────────────────────────────

assignmentSchema.pre('save', async function (next) {
  try {
    const now = new Date();

    // Auto-mark overdue (only for non-terminal statuses)
    if (
      this.dueDate &&
      this.dueDate < now &&
      !['completed', 'approved', 'rejected', 'submitted', 'under_review'].includes(this.status)
    ) {
      this.status = 'overdue';
    }

    // FIX: use totalFieldsSnapshot (set by service at submission time) so the
    // denominator is the real checklist field count, not just responses.length.
    if (this.responses && this.responses.length > 0) {
      const answeredFields = this.responses.filter(r => {
        const val = r.value;
        return (
          val !== null &&
          val !== undefined &&
          val !== '' &&
          !(Array.isArray(val) && val.length === 0)
        );
      }).length;

      const denominator = this.totalFieldsSnapshot > 0
        ? this.totalFieldsSnapshot
        : this.responses.length;         // graceful fallback

      this.completionRate = Math.min(
        100,
        Math.round((answeredFields / denominator) * 100)
      );
    } else {
      this.completionRate = 0;
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ─── Instance methods ─────────────────────────────────────────────────────────

assignmentSchema.methods.updateStatus = async function (newStatus, userId, notes = '') {
  const validTransitions = {
    pending:      ['in_progress', 'overdue'],
    in_progress:  ['submitted', 'overdue'],
    submitted:    ['under_review', 'rejected'],
    under_review: ['approved', 'rejected'],
    rejected:     ['pending', 'in_progress'],
    approved:     ['completed'],
    overdue:      ['in_progress', 'submitted'],
  };

  if (validTransitions[this.status] && !validTransitions[this.status].includes(newStatus)) {
    throw new Error(`Invalid status transition from ${this.status} to ${newStatus}`);
  }

  this.status = newStatus;

  if (newStatus === 'in_progress' && !this.startedAt) this.startedAt = new Date();
  if (newStatus === 'submitted') {
    this.submittedAt     = new Date();
    this.submissionStatus = 'pending_review';
    this.isDraft          = false;
  }
  if (newStatus === 'approved') {
    this.completedAt      = new Date();
    this.submissionStatus = 'approved';
  }
  if (newStatus === 'rejected') {
    this.rejectionReason  = notes;
    this.submissionStatus = 'rejected';
  }

  if (notes)  this.notes      = notes;
  if (userId) this.reviewedBy = userId;

  await this.save();
  return this;
};

assignmentSchema.methods.updateTeamMemberStatus = async function (teamMemberId, status) {
  const teamMember = this.assignedToTeamMembers.find(
    tm => tm.userId.toString() === teamMemberId.toString()
  );
  if (!teamMember) throw new Error('Team member not found in this assignment');

  teamMember.status = status;
  if (status === 'completed') teamMember.completedAt = new Date();

  const allCompleted =
    this.assignedToTeamMembers.length > 0 &&
    this.assignedToTeamMembers.every(tm => tm.status === 'completed');

  if (allCompleted && !['completed', 'approved'].includes(this.status)) {
    this.status      = 'completed';
    this.completedAt = new Date();
  }

  await this.save();
  return this;
};

assignmentSchema.methods.addAsset = async function (assetData) {
  if (!this.assets) this.assets = [];

  if (this.assets.some(a => a.assetId.toString() === assetData.assetId.toString())) {
    throw new Error('Asset already assigned to this checklist');
  }

  this.assets.push({
    assetId:       assetData.assetId,
    assetName:     assetData.assetName,
    assetTagNumber:assetData.assetTagNumber,
    assetLocation: assetData.assetLocation,
    assetCategory: assetData.assetCategory,
    assignedAt:    new Date(),
  });

  await this.save();
  return this;
};

assignmentSchema.methods.removeAsset = async function (assetId) {
  this.assets = this.assets.filter(a => a.assetId.toString() !== assetId.toString());
  await this.save();
  return this;
};

assignmentSchema.methods.addResponse = async function (fieldId, value, fieldLabel, fieldType) {
  const existingIndex = this.responses.findIndex(
    r => r.fieldId.toString() === fieldId.toString()
  );

  const response = { fieldId, label: fieldLabel, fieldType, value, answeredAt: new Date() };

  if (existingIndex !== -1) {
    this.responses[existingIndex] = { ...this.responses[existingIndex].toObject(), ...response };
  } else {
    this.responses.push(response);
  }

  // completionRate will be recalculated in pre-save
  await this.save();
  return this;
};

assignmentSchema.methods.getSummary = function () {
  return {
    id:               this._id,
    checklist:        { id: this.checklist, name: this.checklistName, version: this.checklistVersion },
    status:           this.status,
    priority:         this.priority,
    completionRate:   this.completionRate,
    dueDate:          this.dueDate,
    daysRemaining:    this.daysRemaining,
    isOverdue:        this.isOverdue,
    totalTeamMembers: this.totalTeamMembers,
    totalAssets:      this.totalAssets,
  };
};

// ─── Static methods ───────────────────────────────────────────────────────────

assignmentSchema.statics.getByAdmin = async function (adminId, filters = {}) {
  const query = { assignedToAdmin: adminId };
  if (filters.status)      query.status    = filters.status;
  if (filters.priority)    query.priority  = filters.priority;
  if (filters.checklistId) query.checklist = filters.checklistId;

  const page  = parseInt(filters.page)  || 1;
  const limit = Math.min(parseInt(filters.limit) || 10, 100);
  const skip  = (page - 1) * limit;

  const [assignments, total] = await Promise.all([
    this.find(query)
      .populate('checklist', 'name version category')
      .populate('assignedToTeamMembers.userId', 'name email')
      .populate('assets.assetId', 'assetName tagNumber currentLocation')
      .populate('customerId', 'name email')
      .sort({ dueDate: 1, priority: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments(query),
  ]);

  return {
    assignments,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
};

assignmentSchema.statics.getStatistics = async function (userId, userRole) {
  const matchStage =
    userRole === 'admin'
      ? { assignedToAdmin: userId }
      : userRole === 'team'
        ? { 'assignedToTeamMembers.userId': userId }
        : {};

  const [stats] = await this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id:        null,
        total:      { $sum: 1 },
        pending:    { $sum: { $cond: [{ $eq: ['$status', 'pending'] },    1, 0] } },
        inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
        submitted:  { $sum: { $cond: [{ $eq: ['$status', 'submitted'] },  1, 0] } },
        completed:  { $sum: { $cond: [{ $eq: ['$status', 'completed'] },  1, 0] } },
        approved:   { $sum: { $cond: [{ $eq: ['$status', 'approved'] },   1, 0] } },
        rejected:   { $sum: { $cond: [{ $eq: ['$status', 'rejected'] },   1, 0] } },
        overdue:    { $sum: { $cond: [{ $eq: ['$status', 'overdue'] },    1, 0] } },
        avgCompletion: { $avg: '$completionRate' },
      },
    },
  ]);

  return stats || {
    total: 0, pending: 0, inProgress: 0, submitted: 0,
    completed: 0, approved: 0, rejected: 0, overdue: 0, avgCompletion: 0,
  };
};

// ─── Post-save middleware ─────────────────────────────────────────────────────

assignmentSchema.post('save', async function (doc) {
  if (doc.isNew && doc.checklist) {
    try {
      await mongoose.model('Checklist').updateOne(
        { _id: doc.checklist },
        { $inc: { totalAssignments: 1 }, $set: { lastAssignedAt: new Date() } }
      );
    } catch (error) {
      console.error('Error updating checklist stats after assignment save:', error);
    }
  }
});

// ─── Model export ─────────────────────────────────────────────────────────────

const Assignment = mongoose.model('Assignments', assignmentSchema);
export default Assignment;