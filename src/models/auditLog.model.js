// models/auditLog.model.js
import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema({
  // Action details
  action: {
    type: String,
    required: true,
    index: true
  },
  resource: {
    type: String,
    required: true,
    index: true
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },
  resourceName: {
    type: String,
    default: null
  },
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  actorRole: {
    type: String,
    required: true,
    default: null
  },
  adminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    default: null
  },
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
    default: null
  },
  oldData: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  newData: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  changedFields: {
    type: [{
      field: String,
      oldValue: mongoose.Schema.Types.Mixed,
      newValue: mongoose.Schema.Types.Mixed
    }],
    default: []
  },

  // Request metadata
  ipAddress: {
    type: String,
    trim: true,
    default: null
  },
  userAgent: {
    type: String,
    trim: true,
    default: null
  },
  description: {
    type: String,
    trim: true,
    default: null
  },

  // Status
  status: {
    type: String,
    enum: ['success', 'failure', 'pending'],
    default: 'success',
    index: true
  },
  errorMessage: {
    type: String,
    trim: true,
    default: null
  },

  // Reference fields for linking related operations
  referenceId: {
    type: String,
    default: null,
    index: true
  },

  // Additional metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }

}, {
  timestamps: true
});

// Compound indexes for better query performance
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ actor: 1, createdAt: -1 });
AuditLogSchema.index({ adminId: 1, createdAt: -1 });
AuditLogSchema.index({ teamId: 1, createdAt: -1 });
AuditLogSchema.index({ resource: 1, resourceId: 1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ actorRole: 1, createdAt: -1 });
AuditLogSchema.index({ status: 1, createdAt: -1 });
AuditLogSchema.index({ referenceId: 1 });

// Static method to get audit trail for a resource
AuditLogSchema.statics.getAuditTrail = async function (resourceId, limit = 50) {
  return this.find({ resourceId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('actor', 'name email role');
};

// Static method to get organization audit logs
AuditLogSchema.statics.getOrganizationLogs = async function (adminId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  
  const [logs, total] = await Promise.all([
    this.find({ adminId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('actor', 'name email role')
      .lean(),
    this.countDocuments({ adminId })
  ]);
  
  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
};

// Static method to get user's own activity
AuditLogSchema.statics.getUserActivity = async function (userId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  
  const [logs, total] = await Promise.all([
    this.find({ actor: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    this.countDocuments({ actor: userId })
  ]);
  
  return {
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
};

// Instance method to get formatted log entry
AuditLogSchema.methods.getFormattedLog = function () {
  return {
    id: this._id,
    action: this.action,
    resource: this.resource,
    resourceId: this.resourceId,
    resourceName: this.resourceName,
    actor: this.actor,
    actorRole: this.actorRole,
    actorEmail: this.actorEmail,
    description: this.description,
    status: this.status,
    changedFields: this.changedFields,
    ipAddress: this.ipAddress,
    userAgent: this.userAgent,
    createdAt: this.createdAt,
    metadata: this.metadata
  };
};

// Pre-save middleware to ensure actorEmail is set
AuditLogSchema.pre('save', function(next) {
  if (!this.actorEmail && this.actor) {
    // You might want to populate actor email here if needed
    console.warn('Actor email not provided for audit log');
  }
  next();
});

const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
export default AuditLog;