import mongoose from 'mongoose';

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const fieldResponseSchema = new mongoose.Schema(
  {
    fieldId:          { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    label:            { type: String, trim: true },
    fieldType:        { type: String },
    value:            { type: mongoose.Schema.Types.Mixed },
    filePaths:        [{ type: String }],   // uploaded image/file paths
    isValid:          { type: Boolean, default: true },
    validationErrors: [{ type: String }],
    answeredAt:       { type: Date, default: Date.now },
  },
  { _id: true }
);

const teamMemberSchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name:        { type: String, trim: true },
  email:       { type: String, trim: true },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'in_progress', 'completed', 'rejected'],
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
  assetStatus:   { type: String, trim: true },
  assignedAt:    { type: Date, default: Date.now },
});

// ── NEW: Submission sub-schema (one per team member who submits) ───────────────
const submissionSchema = new mongoose.Schema(
  {
    submittedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    submittedByName:  { type: String, trim: true },
    submittedByEmail: { type: String, trim: true },
    submittedAt:      { type: Date, default: Date.now },

    // Per-checklist responses inside this submission
    checklistResponses: [{
      checklistId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Checklist' },
      checklistName:      { type: String, trim: true },
      responses:          [fieldResponseSchema],
      completionRate:     { type: Number, default: 0, min: 0, max: 100 },
      totalFieldsSnapshot:{ type: Number, default: 0 },
    }],

    // Overall metrics
    overallCompletionRate: { type: Number, default: 0, min: 0, max: 100 },
    score:                 { type: Number, default: null, min: 0, max: 100 },     // admin sets after review
    overallCondition:      { type: String, trim: true },
    inspectorName:         { type: String, trim: true },
    notes:                 { type: String, trim: true },

    // Uploaded evidence files (images, PDFs) at submission level
    attachments: [{
      filePath:    { type: String },
      originalName:{ type: String },
      mimetype:    { type: String },
      size:        { type: Number },
      uploadedAt:  { type: Date, default: Date.now },
    }],

    // Review
    reviewStatus: {
      type: String,
      enum: ['pending_review', 'approved', 'rejected', 'needs_revision'],
      default: 'pending_review',
    },
    reviewedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedByName:  { type: String, trim: true },
    reviewedAt:      { type: Date, default: null },
    reviewComments:  { type: String, trim: true },
    rejectionReason: { type: String, trim: true },

    // Inspection-specific fields (mirrors UI screenshots)
    inspectionId:    { type: String, trim: true },   // e.g. INS-2024-001
    itemsPassed:     { type: Number, default: 0 },
    itemsFailed:     { type: Number, default: 0 },
    itemsNA:         { type: Number, default: 0 },
    performanceRating:{ type: Number, default: null, min: 0, max: 5 },
  },
  { _id: true, timestamps: true }
);

// ─── Main schema ───────────────────────────────────────────────────────────────

const assignmentSchema = new mongoose.Schema(
  {
    // ── References ────────────────────────────────────────────────────────────
    checklistIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Checklist' }],

    checklistData: [{
      checklistId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Checklist' },
      name:                { type: String, trim: true },
      version:             { type: String },
      type:                { type: String },
      category:            { type: String },
      responses:           [fieldResponseSchema],         // legacy field kept for compat
      totalFieldsSnapshot: { type: Number, default: 0 },
      completionRate:      { type: Number, default: 0, min: 0, max: 100 },
    }],

    // ── Hierarchy ─────────────────────────────────────────────────────────────
    assignedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedByRole: { type: String, enum: ['super_admin', 'admin'] },

    assignedToAdmin:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    assignedToAdminName: { type: String },

    assignedToTeamMembers: [teamMemberSchema],

    // ── Assets ────────────────────────────────────────────────────────────────
    assetIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Asset' }],
    assets:   [assetAssignmentSchema],

    // ── Customer ──────────────────────────────────────────────────────────────
    customerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    customerName:  { type: String, trim: true },
    customerEmail: { type: String, trim: true },

    // ── Dates ─────────────────────────────────────────────────────────────────
    dueDate:     { type: Date, index: true },
    assignedAt:  { type: Date, default: Date.now },
    startedAt:   { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    // ── Status / Priority ─────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'submitted', 'approved', 'rejected', 'completed', 'overdue'],
      default: 'pending',
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true,
    },

    // ── NEW: Submissions list (many-to-one: each team member submits once) ────
    submissions: [submissionSchema],

    // Aggregate stats derived from submissions
    totalSubmissions:    { type: Number, default: 0 },
    approvedSubmissions: { type: Number, default: 0 },
    avgScore:            { type: Number, default: null },

    // ── Review (assignment-level, kept for admin-assigned) ────────────────────
    reviewedBy:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectionReason: { type: String, trim: true },
    reviewComments:  { type: String, trim: true },

    // ── Soft delete ───────────────────────────────────────────────────────────
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // ── Reassignment ──────────────────────────────────────────────────────────
    isReassigned:         { type: Boolean, default: false },
    originalAssignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignments', default: null },
    reassignedAt:         { type: Date, default: null },
    reassignedBy:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reassignmentReason:   { type: String, trim: true },

    reassignmentHistory: [{
      fromType:       { type: String, enum: ['admin', 'team'] },
      fromId:         { type: mongoose.Schema.Types.ObjectId },
      toType:         { type: String, enum: ['admin', 'team'] },
      toIds:          [{ type: mongoose.Schema.Types.ObjectId }],
      reassignedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reassignedAt:   { type: Date, default: Date.now },
      reason:         { type: String, trim: true },
      oldChecklistIds:[{ type: mongoose.Schema.Types.ObjectId }],
      newChecklistIds:[{ type: mongoose.Schema.Types.ObjectId }],
      oldAssetIds:    [{ type: mongoose.Schema.Types.ObjectId }],
      newAssetIds:    [{ type: mongoose.Schema.Types.ObjectId }],
    }],

    // ── Misc ──────────────────────────────────────────────────────────────────
    notes: { type: String, trim: true },
    metadata: {
      location:   { type: String, trim: true },
      department: { type: String, trim: true },
      tags:       [{ type: String, trim: true }],
    },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

assignmentSchema.index({ assignedBy: 1, createdAt: -1 });
assignmentSchema.index({ assignedToAdmin: 1, status: 1, isDeleted: 1 });
assignmentSchema.index({ customerId: 1, status: 1, isDeleted: 1 });
assignmentSchema.index({ dueDate: 1, status: 1, isDeleted: 1 });
assignmentSchema.index({ priority: 1, status: 1 });
assignmentSchema.index({ 'assignedToTeamMembers.userId': 1, status: 1, isDeleted: 1 });
assignmentSchema.index({ 'assets.assetId': 1, status: 1, isDeleted: 1 });
assignmentSchema.index({ isDeleted: 1, deletedAt: 1 });
assignmentSchema.index({ originalAssignmentId: 1 });
assignmentSchema.index({ checklistIds: 1 });
assignmentSchema.index({ assetIds: 1 });
assignmentSchema.index({ 'submissions.submittedBy': 1 });
assignmentSchema.index({ 'submissions.reviewStatus': 1 });
// Compound
assignmentSchema.index({ assignedToAdmin: 1, status: 1, dueDate: 1 });
assignmentSchema.index({ 'assignedToTeamMembers.userId': 1, status: 1, dueDate: 1 });
assignmentSchema.index({ isDeleted: 1, status: 1, dueDate: 1 });

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

assignmentSchema.virtual('totalChecklists').get(function () {
  return this.checklistIds?.length || 0;
});

assignmentSchema.virtual('totalAssets').get(function () {
  return this.assetIds?.length || 0;
});

assignmentSchema.virtual('totalTeamMembers').get(function () {
  return this.assignedToTeamMembers?.length || 0;
});

// ─── Pre-save middleware ───────────────────────────────────────────────────────

assignmentSchema.pre('save', async function (next) {
  try {
    const now = new Date();

    // Auto-mark overdue
    if (
      this.dueDate && this.dueDate < now &&
      !['completed', 'approved', 'rejected', 'submitted'].includes(this.status) &&
      !this.isDeleted
    ) {
      this.status = 'overdue';
    }

    // Calculate completion rates for legacy checklistData
    if (this.checklistData?.length > 0) {
      for (const checklist of this.checklistData) {
        if (checklist.responses?.length > 0) {
          const answered = checklist.responses.filter(r => {
            const v = r.value;
            return v !== null && v !== undefined && v !== '' &&
                   !(Array.isArray(v) && v.length === 0);
          }).length;
          const denom = checklist.totalFieldsSnapshot > 0
            ? checklist.totalFieldsSnapshot
            : checklist.responses.length;
          checklist.completionRate = Math.min(100, Math.round((answered / denom) * 100));
        } else {
          checklist.completionRate = 0;
        }
      }
    }

    // Aggregate submission stats
    if (this.submissions?.length > 0) {
      this.totalSubmissions    = this.submissions.length;
      this.approvedSubmissions = this.submissions.filter(s => s.reviewStatus === 'approved').length;
      const scores = this.submissions.map(s => s.score).filter(s => s != null);
      this.avgScore = scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;
    }

    next();
  } catch (err) {
    next(err);
  }
});

// ─── Instance methods ─────────────────────────────────────────────────────────

assignmentSchema.methods.softDelete = async function (deletedByUserId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedByUserId;
  await this.save();
  return this;
};

assignmentSchema.methods.restore = async function () {
  this.isDeleted = false;
  this.deletedAt = null;
  this.deletedBy = null;
  if (this.status === 'deleted') this.status = 'pending';
  await this.save();
  return this;
};

assignmentSchema.methods.permanentDelete = async function () {
  await this.deleteOne();
  return true;
};

assignmentSchema.methods.updateStatus = async function (newStatus, userId, notes = '') {
  const validTransitions = {
    pending:     ['in_progress', 'overdue'],
    in_progress: ['submitted', 'overdue'],
    submitted:   ['approved', 'rejected'],
    rejected:    ['pending', 'in_progress'],
    approved:    ['completed'],
    overdue:     ['in_progress', 'submitted'],
  };

  if (validTransitions[this.status] && !validTransitions[this.status].includes(newStatus)) {
    throw new Error(`Invalid status transition from ${this.status} to ${newStatus}`);
  }

  this.status = newStatus;
  if (newStatus === 'in_progress' && !this.startedAt) this.startedAt = new Date();
  if (newStatus === 'submitted') this.submittedAt = new Date();
  if (newStatus === 'approved')  this.completedAt = new Date();
  if (newStatus === 'rejected' && notes) this.rejectionReason = notes;
  if (notes)  this.notes = notes;
  if (userId) this.reviewedBy = userId;

  await this.save();
  return this;
};

assignmentSchema.methods.updateTeamMemberStatus = async function (teamMemberId, status) {
  const tm = this.assignedToTeamMembers.find(
    t => t.userId.toString() === teamMemberId.toString()
  );
  if (!tm) throw new Error('Team member not found');

  tm.status = status;
  if (status === 'completed') tm.completedAt = new Date();

  const allDone = this.assignedToTeamMembers.every(t => t.status === 'completed');
  if (allDone && this.status !== 'completed') {
    this.status = 'completed';
    this.completedAt = new Date();
  }

  await this.save();
  return this;
};

// Add or update a submission
assignmentSchema.methods.addSubmission = async function (submissionData) {
  const existingIdx = this.submissions.findIndex(
    s => s.submittedBy.toString() === submissionData.submittedBy.toString()
  );

  if (existingIdx !== -1) {
    // Update existing submission
    this.submissions[existingIdx] = {
      ...this.submissions[existingIdx].toObject(),
      ...submissionData,
      updatedAt: new Date(),
    };
  } else {
    this.submissions.push(submissionData);
  }

  // Update assignment-level status
  if (this.status === 'pending' || this.status === 'in_progress') {
    this.status = 'submitted';
    this.submittedAt = new Date();
  }

  await this.save();
  return this;
};

// Review a submission
assignmentSchema.methods.reviewSubmission = async function (submissionId, reviewData) {
  const sub = this.submissions.id(submissionId);
  if (!sub) throw new Error('Submission not found');

  sub.reviewStatus   = reviewData.reviewStatus;
  sub.reviewedBy     = reviewData.reviewedBy;
  sub.reviewedByName = reviewData.reviewedByName;
  sub.reviewedAt     = new Date();
  sub.reviewComments = reviewData.reviewComments || '';
  if (reviewData.reviewStatus === 'rejected') {
    sub.rejectionReason = reviewData.rejectionReason || '';
  }
  if (reviewData.score != null) sub.score = reviewData.score;

  // If all submissions approved → mark assignment approved
  const allApproved = this.submissions.every(s => s.reviewStatus === 'approved');
  if (allApproved) {
    this.status = 'approved';
    this.completedAt = new Date();
  }

  await this.save();
  return this;
};

assignmentSchema.methods.getSummary = function () {
  return {
    id: this._id,
    checklists: this.checklistData.map(c => ({
      id: c.checklistId, name: c.name, completionRate: c.completionRate,
    })),
    assets: this.assets.map(a => ({
      id: a.assetId, name: a.assetName, tagNumber: a.assetTagNumber,
    })),
    assignedTo: this.assignedToAdmin
      ? { type: 'admin', id: this.assignedToAdmin, name: this.assignedToAdminName }
      : { type: 'team', members: this.assignedToTeamMembers.length },
    status: this.status,
    priority: this.priority,
    dueDate: this.dueDate,
    daysRemaining: this.daysRemaining,
    isOverdue: this.isOverdue,
    totalSubmissions: this.totalSubmissions,
    approvedSubmissions: this.approvedSubmissions,
    avgScore: this.avgScore,
  };
};

// ─── Static methods ───────────────────────────────────────────────────────────

assignmentSchema.statics.getActive  = function () { return this.find({ isDeleted: false }); };
assignmentSchema.statics.getDeleted = function () { return this.find({ isDeleted: true });  };

assignmentSchema.statics.checkExistingAssignment = async function (checklistIds, assigneeId, assigneeType) {
  const query = {
    checklistIds: { $in: checklistIds },
    isDeleted: false,
    status: { $in: ['pending', 'in_progress', 'submitted'] },
  };
  if (assigneeType === 'admin') query.assignedToAdmin = assigneeId;
  else if (assigneeType === 'team') query['assignedToTeamMembers.userId'] = assigneeId;

  const existing = await this.findOne(query);
  return existing
    ? { exists: true,  assignment: existing, status: existing.status }
    : { exists: false };
};

// ─── Post-save: update checklist stats ───────────────────────────────────────

assignmentSchema.post('save', async function (doc) {
  if (doc.isNew && doc.checklistIds?.length > 0) {
    try {
      await mongoose.model('Checklist').updateMany(
        { _id: { $in: doc.checklistIds } },
        { $inc: { totalAssignments: 1 }, $set: { lastAssignedAt: new Date() } }
      );
    } catch (err) {
      console.error('Error updating checklist stats:', err);
    }
  }
});

const Assignment = mongoose.model('Assignments', assignmentSchema);
export default Assignment;