// models/AssetRequest.model.js
import mongoose from 'mongoose';

const assetRequestSchema = new mongoose.Schema({
  requestType: {
    type: String,
    enum: ['parent', 'child'],
    required: true,
    index: true
  },

  parentAssetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Asset',
    index: true
  },
  parentAssetName: { type: String, trim: true },
  parentAssetDetails: {
    assetId: String,
    tagNumber: String,
    status: String,
    location: String
  },

  assetName: { type: String, required: true, trim: true },
  assetDescription: { type: String, trim: true },
  category: { type: String, required: true, trim: true },
  subCategory: { type: String, trim: true },
  location: { type: String, required: true, trim: true },
  locationDetails: {
    warehouse: String,
    bay: String,
    floor: String
  },

  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedToName: { type: String, trim: true },
  assignedToDetails: {
    firstName: String,
    lastName: String,
    email: String
  },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  requestedByName: { type: String, trim: true },
  requestedByRole: { type: String, trim: true },
  requestedByDetails: {
    firstName: String,
    lastName: String,
    email: String,
    avatarUrl: String
  },

  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },

  approvedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'approvedByModel' },
  approvedByModel: { type: String, enum: ['Client', 'Auth', 'Team'] },
  approvedAt: { type: Date },
  approvedByName: { type: String, trim: true },
  approvedByDetails: {
    firstName: String,
    lastName: String,
    email: String
  },

  rejectedBy: { type: mongoose.Schema.Types.ObjectId, refPath: 'rejectedByModel' },
  rejectedByModel: { type: String, enum: ['Client', 'Auth', 'Team'] },
  rejectedAt: { type: Date },
  rejectionReason: { type: String, trim: true },
  rejectedByName: { type: String, trim: true },
  rejectedByDetails: {
    firstName: String,
    lastName: String,
    email: String
  },

  createdAssetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },
  createdAssetDetails: {
    assetId: String,
    assetName: String,
    tagNumber: String
  },
  notes: { type: String, trim: true },
  requestedAt: { type: Date, default: Date.now },

  reviewedAt: { type: Date },
  timeToReview: { type: Number }

}, { timestamps: true });

// Indexes
assetRequestSchema.index({ adminId: 1, status: 1, requestType: 1 });
assetRequestSchema.index({ adminId: 1, createdAt: -1 });
assetRequestSchema.index({ requestedBy: 1, status: 1, createdAt: -1 });
assetRequestSchema.index({ parentAssetId: 1, status: 1 });
assetRequestSchema.index({ status: 1, priority: 1 });
assetRequestSchema.index({ createdAt: -1 });
assetRequestSchema.index({ updatedAt: -1 });
assetRequestSchema.index({ adminId: 1, status: 1, priority: 1 });

// Virtuals
assetRequestSchema.virtual('timeSinceRequested').get(function () {
  if (!this.requestedAt) return null;
  const hours = Math.round((Date.now() - this.requestedAt) / (1000 * 60 * 60));
  return { hours, days: Math.round(hours / 24) };
});

assetRequestSchema.virtual('isOverdue').get(function () {
  if (this.status !== 'pending') return false;
  if (!this.requestedAt) return false;
  const hoursSinceRequest = (Date.now() - this.requestedAt) / (1000 * 60 * 60);
  const priorityThresholds = { low: 168, medium: 72, high: 24, critical: 12 };
  return hoursSinceRequest > (priorityThresholds[this.priority] || 72);
});

// Pre-save middleware
assetRequestSchema.pre('save', async function (next) {
  try {
    if (this.isModified('parentAssetId') && this.parentAssetId) {
      const Asset = mongoose.model('Asset');
      const parentAsset = await Asset.findById(this.parentAssetId)
        .select('assetName assetId tagNumber status currentLocation')
        .lean();

      if (parentAsset) {
        this.parentAssetName = parentAsset.assetName;
        this.parentAssetDetails = {
          assetId: parentAsset.assetId,
          tagNumber: parentAsset.tagNumber,
          status: parentAsset.status,
          location: parentAsset.currentLocation
        };
      }
    }

    if (this.isModified('assignedTo') && this.assignedTo) {
      const User = mongoose.model('User');
      const user = await User.findById(this.assignedTo)
        .select('firstName lastName email')
        .lean();

      if (user) {
        this.assignedToName = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.email;
        this.assignedToDetails = {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email
        };
      }
    }

    if (this.isModified('requestedBy')) {
      const User = mongoose.model('User');
      const user = await User.findById(this.requestedBy)
        .select('firstName lastName email role avatarUrl')
        .lean();

      if (user) {
        this.requestedByName = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.email;
        this.requestedByRole = user.role;
        this.requestedByDetails = {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          avatarUrl: user.avatarUrl
        };
      }
    }

    if (this.isModified('status') && this.status !== 'pending') {
      this.reviewedAt = new Date();
      if (this.requestedAt) {
        this.timeToReview = Math.round((this.reviewedAt - this.requestedAt) / (1000 * 60 * 60));
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Static methods
assetRequestSchema.statics.getPendingCount = async function (adminId) {
  return await this.countDocuments({ adminId, status: 'pending' });
};

assetRequestSchema.statics.getRequestsByPriority = async function (adminId) {
  return await this.aggregate([
    { $match: { adminId: new mongoose.Types.ObjectId(adminId), status: 'pending' } },
    { $group: { _id: '$priority', count: { $sum: 1 } } },
    { $sort: { count: -1 } }
  ]);
};

const AssetRequest = mongoose.model('AssetRequest', assetRequestSchema);
export default AssetRequest;