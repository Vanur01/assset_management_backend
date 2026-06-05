import mongoose from 'mongoose';

const ApprovalSchema = new mongoose.Schema({
    approverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    approvedAt: { type: Date },
    level: { type: Number, default: 1 }
}, { _id: false });

const AssetRequestSchema = new mongoose.Schema({
    assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true, index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    requestType: { type: String, enum: ['transfer', 'maintenance', 'repair', 'checkout', 'other'], required: true, index: true },
    description: { type: String, trim: true, maxlength: 1000 },
    urgency: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'], default: 'pending', index: true },

    // Parent-Child Relations
    parentRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'AssetRequest', index: true, default: null },
    isChildRequest: { type: Boolean, default: false, index: true },
    childRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AssetRequest' }],

    // Approval & Completion
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectionReason: { type: String, trim: true, maxlength: 500 },
    completedAt: { type: Date },
    completionNotes: { type: String, trim: true },
    approvalChain: [ApprovalSchema],
    
    // Metadata for additional data like child assets
    metadata: {
        childAssets: [{
            assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },
            relationshipType: { type: String, enum: ['related', 'replacement', 'accessory'], default: 'related' },
            linkedAt: { type: Date },
            linkedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
        }],
        approvalNotes: String
    }
}, { timestamps: true, toJSON: { virtuals: true } });

// Indexes
AssetRequestSchema.index({ adminId: 1, status: 1, createdAt: -1 });
AssetRequestSchema.index({ requestedBy: 1, status: 1, createdAt: -1 });
AssetRequestSchema.index({ assetId: 1, status: 1 });
AssetRequestSchema.index({ parentRequestId: 1, isChildRequest: 1 });
AssetRequestSchema.index({ 'metadata.childAssets.assetId': 1 });

// Virtuals
AssetRequestSchema.virtual('statusLabel').get(function() {
    const labels = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', completed: 'Completed' };
    return labels[this.status] || this.status;
});

AssetRequestSchema.virtual('isParentRequest').get(function() {
    return this.childRequests?.length > 0;
});

AssetRequestSchema.virtual('linkedChildAssets').get(function() {
    return this.metadata?.childAssets || [];
});

// Pre-save middleware
AssetRequestSchema.pre('save', async function(next) {
    if (this.status === 'completed' && !this.completedAt) this.completedAt = new Date();
    if (this.status === 'approved' && this.approvedBy && !this.approvedAt) this.approvedAt = new Date();
    
    if (this.isChildRequest && this.parentRequestId) {
        const parentExists = await this.constructor.findById(this.parentRequestId);
        if (!parentExists) return next(new Error('Parent request not found'));
    }
    next();
});

// Static Methods
AssetRequestSchema.statics.getRequestTree = async function(requestId) {
    const request = await this.findById(requestId)
        .populate('childRequests')
        .populate('assetId', 'name code')
        .populate('requestedBy', 'name email');
    
    if (!request) return null;
    
    if (request.childRequests?.length) {
        for (let i = 0; i < request.childRequests.length; i++) {
            const childId = request.childRequests[i]._id || request.childRequests[i];
            request.childRequests[i] = await this.getRequestTree(childId);
        }
    }
    return request;
};

AssetRequestSchema.statics.getStats = async function(adminId) {
    const stats = await this.aggregate([
        { $match: { adminId: new mongoose.Types.ObjectId(adminId) } },
        { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    
    const result = { pending: 0, approved: 0, rejected: 0, completed: 0 };
    stats.forEach(stat => { if (result[stat._id] !== undefined) result[stat._id] = stat.count; });
    return result;
};

// Instance Methods
AssetRequestSchema.methods.approve = async function(approverId) {
    this.status = 'approved';
    this.approvedBy = approverId;
    return await this.save();
};

AssetRequestSchema.methods.reject = async function(reason) {
    this.status = 'rejected';
    this.rejectionReason = reason;
    return await this.save();
};

AssetRequestSchema.methods.complete = async function(notes = '') {
    this.status = 'completed';
    if (notes) this.completionNotes = notes;
    return await this.save();
};

AssetRequestSchema.methods.addChildRequest = async function(childData) {
    const childRequest = new this.constructor({
        ...childData,
        parentRequestId: this._id,
        isChildRequest: true,
        adminId: childData.adminId || this.adminId,
        requestedBy: childData.requestedBy || this.requestedBy
    });
    
    await childRequest.save();
    
    if (!this.childRequests) this.childRequests = [];
    this.childRequests.push(childRequest._id);
    await this.save();
    
    return childRequest;
};

AssetRequestSchema.methods.getChildren = async function() {
    return await this.constructor.find({ parentRequestId: this._id });
};

AssetRequestSchema.methods.updateChildStatus = async function(childId, status, updates = {}) {
    const child = await this.constructor.findById(childId);
    if (!child || child.parentRequestId.toString() !== this._id.toString()) {
        throw new Error('Child request not found');
    }
    
    child.status = status;
    Object.assign(child, updates);
    await child.save();
    
    const children = await this.getChildren();
    const allCompleted = children.every(c => c.status === 'completed');
    
    if (allCompleted && this.status !== 'completed') {
        this.status = 'completed';
        this.completedAt = new Date();
        this.completionNotes = 'All child requests completed';
        await this.save();
    }
    
    return child;
};

// ==================== FIX: Add linkChildAsset method ====================
AssetRequestSchema.methods.linkChildAsset = async function(childAssetId, relationshipType, userId) {
    // Initialize metadata if it doesn't exist
    if (!this.metadata) {
        this.metadata = {};
    }
    
    // Initialize childAssets array if it doesn't exist
    if (!this.metadata.childAssets) {
        this.metadata.childAssets = [];
    }
    
    // Check if asset is already linked
    const alreadyLinked = this.metadata.childAssets.some(
        item => item.assetId.toString() === childAssetId.toString()
    );
    
    if (alreadyLinked) {
        throw new Error('Child asset already linked to this request');
    }
    
    // Add the child asset
    this.metadata.childAssets.push({
        assetId: childAssetId,
        relationshipType: relationshipType || 'related',
        linkedAt: new Date(),
        linkedBy: userId
    });
    
    await this.save();
    return this;
};

// Optional: Method to remove linked child asset
AssetRequestSchema.methods.unlinkChildAsset = async function(childAssetId) {
    if (!this.metadata?.childAssets) {
        throw new Error('No child assets linked to this request');
    }
    
    const initialLength = this.metadata.childAssets.length;
    this.metadata.childAssets = this.metadata.childAssets.filter(
        item => item.assetId.toString() !== childAssetId.toString()
    );
    
    if (this.metadata.childAssets.length === initialLength) {
        throw new Error('Child asset not found');
    }
    
    await this.save();
    return this;
};

// Optional: Method to get linked child assets with populated data
AssetRequestSchema.methods.getLinkedChildAssets = async function() {
    if (!this.metadata?.childAssets || this.metadata.childAssets.length === 0) {
        return [];
    }
    
    const assetIds = this.metadata.childAssets.map(item => item.assetId);
    const assets = await this.constructor.populate(this, {
        path: 'metadata.childAssets.assetId',
        select: 'name code serialNumber status currentLocation'
    });
    
    return assets.metadata?.childAssets || [];
};

const AssetRequest = mongoose.models.AssetRequest || mongoose.model('AssetRequest', AssetRequestSchema);
export default AssetRequest;