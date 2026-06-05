// models/auditLog.model.js
import mongoose from 'mongoose';

const AuditLogSchema = new mongoose.Schema({
  action: {
    type: String,
    index: true
  },
  resource: {
    type: String,
    index: true
  },
  resourceId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true
  },
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  actorRole: {
    type: String,
    enum: ['super_admin', 'admin', 'team'],
  },
  description: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['success', 'failure'],
    default: 'success'
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  },
  changes: {
    old: mongoose.Schema.Types.Mixed,
    new: mongoose.Schema.Types.Mixed
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for performance
AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ actor: 1, createdAt: -1 });
AuditLogSchema.index({ resource: 1, resourceId: 1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });

const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
export default AuditLog;