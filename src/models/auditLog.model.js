import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema({
  // Action details
  action: {
    type: String,
    index: true
  },

  // Resource details
  resource: {
    type: String,
    index: true
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },

  // Actor
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  actorRole: {
    type: String,
    default: null
  },

  // Changes
  oldData: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  newData: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  // Additional info
  ipAddress: {
    type: String,
    trim: true
  },
  userAgent: {
    type: String,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },

  // Status
  status: {
    type: String,
    enum: ['success', 'failure', 'pending'],
    default: 'success'
  },
  errorMessage: {
    type: String,
    trim: true
  },

  // Reference fields
  referenceId: { type: String, default: null }

}, {
  timestamps: true
});

// Indexes
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ actor: 1, createdAt: -1 });
AuditLogSchema.index({ resource: 1, resourceId: 1 });

// Static method to get audit trail for a resource
AuditLogSchema.statics.getAuditTrail = async function (resourceId, limit = 50) {
  return this.find({ resourceId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('actor', 'name email role');
};

const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
export default AuditLog;