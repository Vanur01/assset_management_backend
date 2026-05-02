import mongoose from 'mongoose';

// Field Response Sub-Schema
const fieldResponseSchema = new mongoose.Schema({
  fieldId: { type: mongoose.Schema.Types.ObjectId, required: true },
  label: { type: String },
  fieldType: { type: String },
  value: { type: mongoose.Schema.Types.Mixed },
  filePaths: [{ type: String }],
  isValid: { type: Boolean, default: true },
  validationErrors: [{ type: String }],
  answeredAt: { type: Date, default: Date.now }
}, { _id: true });

// Main Assignment Schema
const assignmentSchema = new mongoose.Schema({
  // Checklist reference
  checklist: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Checklist',
    required: true,
    index: true,
  },

  // Assignment hierarchy: Super Admin -> Admin -> Team Member
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  assignedByRole: {
    type: String,
    enum: ['super_admin', 'admin'],
    required: true,
  },

  // For Super Admin assigning to Admin
  assignedToAdmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },

  // For Admin assigning to Team Members
  primaryMember: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  secondaryMember: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },

  // Customer/Asset assignment
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true,
  },
  customerName: { type: String, trim: true },
  
  assetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Asset',
    default: null,
    index: true,
  },
  assetName: { type: String, trim: true },
  assetDetails: {
    assetId: String,
    tagNumber: String,
    location: String,
    category: String
  },

  // Dates
  dueDate: {
    type: Date,
    required: [true, 'Due date is required'],
    index: true,
  },
  assignedAt: { type: Date, default: Date.now },
  startedAt: { type: Date, default: null },
  submittedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  reviewedAt: { type: Date, default: null },

  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'submitted', 'under_review', 'approved', 'rejected', 'completed', 'overdue'],
    default: 'pending',
    index: true,
  },
  
  submissionStatus: {
    type: String,
    enum: ['pending_review', 'approved', 'rejected', 'needs_revision'],
    default: null,
  },

  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    index: true,
  },

  // Form responses
  responses: [fieldResponseSchema],
  
  // Metrics
  completionRate: { type: Number, default: 0, min: 0, max: 100 },
  overallRating: { type: Number, min: 1, max: 5, default: null },
  timeSpentMinutes: { type: Number, default: 0 },

  // Notes and attachments
  inspectorNotes: { type: String, default: '', maxlength: 5000 },
  additionalNotes: { type: String, default: '', maxlength: 5000 },
  adminNotes: { type: String, default: '', maxlength: 2000 },
  
  signaturePath: { type: String, default: null },
  uploadedPhotos: [{ type: String }],
  attachments: [{
    name: String,
    url: String,
    uploadedAt: { type: Date, default: Date.now }
  }],

  // Review data
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedByName: { type: String },
  rejectionReason: { type: String, default: '', maxlength: 1000 },
  reviewComments: { type: String, default: '', maxlength: 2000 },

  // Draft tracking
  isDraft: { type: Boolean, default: false },
  lastSavedAt: { type: Date, default: null },
  draftCount: { type: Number, default: 0 },

  // Metadata
  tags: [{ type: String }],
  version: { type: String, default: '1.0' },

}, { timestamps: true });

// ==================== PRE-SAVE MIDDLEWARE ====================

// Auto-update overdue status
assignmentSchema.pre('save', function(next) {
  if (this.status !== 'completed' && this.status !== 'approved' && this.dueDate && this.dueDate < new Date()) {
    this.status = 'overdue';
  }
  
  // Calculate completion rate based on responses
  if (this.responses && this.checklist) {
    // Will be populated in service
    this.completionRate = this.responses.length > 0 
      ? Math.min(100, Math.round((this.responses.filter(r => r.value).length / (this.responses.length || 1)) * 100))
      : 0;
  }
  
  next();
});

// ==================== INDEXES ====================
assignmentSchema.index({ assignedBy: 1, createdAt: -1 });
assignmentSchema.index({ assignedToAdmin: 1, status: 1 });
assignmentSchema.index({ primaryMember: 1, status: 1 });
assignmentSchema.index({ customerId: 1, status: 1 });
assignmentSchema.index({ assetId: 1, status: 1 });
assignmentSchema.index({ dueDate: 1, status: 1 });
assignmentSchema.index({ priority: 1, status: 1 });
assignmentSchema.index({ checklist: 1, submissionStatus: 1 });
assignmentSchema.index({ status: 1, dueDate: 1 });
assignmentSchema.index({ 'customerName': 'text', 'assetName': 'text' });

// ==================== VIRTUALS ====================
assignmentSchema.virtual('isOverdue').get(function() {
  return this.dueDate && this.dueDate < new Date() && this.status !== 'completed' && this.status !== 'approved';
});

assignmentSchema.virtual('daysRemaining').get(function() {
  if (!this.dueDate) return null;
  const days = Math.ceil((this.dueDate - new Date()) / (1000 * 60 * 60 * 24));
  return days > 0 ? days : 0;
});

assignmentSchema.virtual('submissionTimeMinutes').get(function() {
  if (this.startedAt && this.submittedAt) {
    return Math.round((this.submittedAt - this.startedAt) / (1000 * 60));
  }
  return null;
});

// ==================== INSTANCE METHODS ====================
assignmentSchema.methods.updateStatus = async function(newStatus, userId) {
  const oldStatus = this.status;
  this.status = newStatus;
  
  if (newStatus === 'in_progress' && !this.startedAt) {
    this.startedAt = new Date();
  }
  if (newStatus === 'submitted' || newStatus === 'completed') {
    this.submittedAt = new Date();
    this.completedAt = new Date();
  }
  
  await this.save();
  return this;
};

assignmentSchema.methods.calculateCompletion = function(totalFields) {
  const answeredFields = this.responses.filter(r => r.value && r.value !== '').length;
  this.completionRate = totalFields > 0 ? Math.round((answeredFields / totalFields) * 100) : 0;
  return this.completionRate;
};

// Safe export to prevent overwrite error
const Assignment = mongoose.models.Assignment || mongoose.model('Assignment', assignmentSchema);
export default Assignment;