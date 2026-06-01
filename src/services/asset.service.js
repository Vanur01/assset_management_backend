// src/services/asset.service.js
import mongoose from 'mongoose';
import Asset from '../models/asset.model.js';
import AuditLog from '../models/auditLog.model.js';
import User from '../models/user.model.js'; // Import User model
import { NotFoundError, ValidationError, ForbiddenError, ConflictError } from '../errors/customError.js';

class AssetService {
  /**
   * Convert string to ObjectId
   */
  toObjectId(id) {
    if (!id) return null;
    if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
      return new mongoose.Types.ObjectId(id);
    }
    return id;
  }

  /**
   * Create audit log
   */
  async createAuditLog(action, resource, resourceId, actorId, actorRole, data = {}) {
    try {
      await AuditLog.create({
        action,
        resource,
        resourceId: this.toObjectId(resourceId),
        actor: this.toObjectId(actorId),
        actorRole,
        description: data.description || `${action} performed on ${resource}`,
        changes: data.changes || {},
        ipAddress: data.ipAddress,
        userAgent: data.userAgent
      });
    } catch (error) {
      console.error('Failed to create audit log:', error);
    }
  }

  async addAsset(assetData, adminId, userId, userRole = 'admin', req = null) {
    // Validate adminId exists
    if (!adminId) {
      throw new ValidationError([{ field: 'adminId', message: 'Admin ID is required' }]);
    }

    // Validate that the user has permission to add asset
    if (userRole === 'team') {
      // Verify team member belongs to this admin
      const user = await User.findById(this.toObjectId(userId));
      if (!user || user.adminId?.toString() !== adminId.toString()) {
        throw new ForbiddenError('You are not authorized to add assets for this admin');
      }
    }

    // Validate assetCategoryId if provided
    if (assetData.assetCategoryId) {
      const AssetCategory = mongoose.model('AssetCategory');
      if (AssetCategory) {
        const assetCategory = await AssetCategory.findById(assetData.assetCategoryId);
        if (!assetCategory) {
          throw new ValidationError([{ field: 'assetCategoryId', message: 'Invalid asset category ID' }]);
        }
      }
    }

    // Check for existing asset with same identifiers
    const orConditions = [];
    if (assetData.assetId) orConditions.push({ assetId: assetData.assetId });
    if (assetData.serialNumber) orConditions.push({ serialNumber: assetData.serialNumber });
    if (assetData.tagNumber) orConditions.push({ tagNumber: assetData.tagNumber });

    if (orConditions.length > 0) {
      const existingAsset = await Asset.findOne({
        adminId: this.toObjectId(adminId),
        $or: orConditions,
        isDeleted: false
      });

      if (existingAsset) {
        let duplicateField = '';
        if (existingAsset.assetId === assetData.assetId) duplicateField = 'Asset ID';
        else if (existingAsset.serialNumber === assetData.serialNumber) duplicateField = 'Serial Number';
        else if (existingAsset.tagNumber === assetData.tagNumber) duplicateField = 'Tag Number';
        throw new ConflictError(`${duplicateField} already exists`);
      }
    }

    // Generate IDs if not provided
    if (!assetData.assetId) assetData.assetId = await this.generateUniqueAssetId(adminId);
    if (!assetData.tagNumber) assetData.tagNumber = await this.generateUniqueTagNumber(adminId);

    // Initialize status history
    const statusHistory = [{
      status: assetData.status || 'Active',
      changedAt: new Date(),
      changedBy: this.toObjectId(userId),
      reason: 'Asset created'
    }];

    const createdByModel = userRole === 'team' ? 'Team' : 'Client';

    const asset = new Asset({
      ...assetData,
      adminId: this.toObjectId(adminId),
      createdBy: this.toObjectId(userId),
      createdByModel,
      status: assetData.status || 'Active',
      canBeCloned: assetData.canBeCloned !== false,
      statusHistory
    });

    await asset.save();

    await this.createAuditLog(
      'ASSET_CREATED',
      'asset',
      asset._id,
      userId,
      userRole,
      {
        description: `Asset "${asset.assetName}" (${asset.assetId}) was created`,
        changes: { assetData, assetId: asset.assetId, tagNumber: asset.tagNumber },
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent']
      }
    );
  
    return asset._doc;
  }

  async getAssets(query, userId, userRole, adminId = null) {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      assetCategoryId,
      currentLocation,
      assignedTo,
      isClone,
      clonedFrom,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = query;

    const filter = { isDeleted: false };

    // Role-based base filter
    if (userRole === 'admin') {
      // Admin can see their own assets AND assets created by their team members
      filter.adminId = this.toObjectId(userId);
      
      // Also include assets where team members (under this admin) are assigned
      // Find all team members under this admin
      const teamMembers = await User.find({ 
        adminId: this.toObjectId(userId), 
        role: 'team',
        isDeleted: false 
      }).select('_id');
      
      const teamMemberIds = teamMembers.map(member => member._id);
      
      if (teamMemberIds.length > 0) {
        filter.$or = [
          { createdBy: this.toObjectId(userId) }, // Admin's own created assets
          { createdBy: { $in: teamMemberIds } }, // Team members' created assets
          { 'assignedUsers.primaryUser': { $in: teamMemberIds } },
          { 'assignedUsers.secondaryUser': { $in: teamMemberIds } },
          { 'assignedUsers.custodian': { $in: teamMemberIds } }
        ];
      }
    } else if (userRole === 'team') {
      // Team members can only see assets belonging to their admin's pool
      // AND where they are personally linked (assigned or creator)
      if (!adminId) {
        throw new ValidationError([{ field: 'adminId', message: 'Admin ID is required for team members' }]);
      }
      
      filter.adminId = this.toObjectId(adminId);
      filter.$or = [
        { 'assignedUsers.primaryUser': this.toObjectId(userId) },
        { 'assignedUsers.secondaryUser': this.toObjectId(userId) },
        { 'assignedUsers.custodian': this.toObjectId(userId) },
        { createdBy: this.toObjectId(userId) }
      ];
    }

    // Optional filters
    if (status) filter.status = status;
    if (assetCategoryId) filter.assetCategoryId = this.toObjectId(assetCategoryId);
    if (currentLocation) filter.currentLocation = currentLocation;
    if (isClone !== undefined) filter.isClone = isClone === 'true';
    if (clonedFrom) filter.clonedFrom = this.toObjectId(clonedFrom);

    // Merge assignedTo filter with existing $or using $and
    if (assignedTo) {
      const assignedToCondition = {
        $or: [
          { 'assignedUsers.primaryUser': this.toObjectId(assignedTo) },
          { 'assignedUsers.secondaryUser': this.toObjectId(assignedTo) },
          { 'assignedUsers.custodian': this.toObjectId(assignedTo) }
        ]
      };

      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, assignedToCondition];
        delete filter.$or;
      } else {
        filter.$or = assignedToCondition.$or;
      }
    }

    // Text search
    if (search) filter.$text = { $search: search };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [assets, total] = await Promise.all([
      Asset.find(filter)
        .populate('adminId', 'name email customerName')
        .populate('createdBy', 'name email firstName lastName')
        .populate('assetCategoryId', 'name')
        .populate('assignedUsers.primaryUser', 'name email firstName lastName')
        .populate('assignedUsers.secondaryUser', 'name email firstName lastName')
        .populate('assignedUsers.custodian', 'name email firstName lastName')
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .lean({ virtuals: true }),
      Asset.countDocuments(filter)
    ]);

    return {
      assets: assets.map(asset => this.formatAssetResponse(asset)),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    };
  }

  async getAssetById(assetId, userRole, adminId, userId) {
    const asset = await Asset.findById(this.toObjectId(assetId))
      .populate('adminId', 'name email customerName')
      .populate('createdBy', 'name email firstName lastName')
      .populate('assetCategoryId', 'name')
      .populate('assignedUsers.primaryUser', 'name email firstName lastName')
      .populate('assignedUsers.secondaryUser', 'name email firstName lastName')
      .populate('assignedUsers.custodian', 'name email firstName lastName')
      .lean({ virtuals: true });

    if (!asset) throw new NotFoundError('Asset not found');

    if (!await this.hasAssetAccess(asset, userId, userRole, adminId)) {
      throw new ForbiddenError('You do not have access to this asset');
    }

    return this.formatAssetResponse(asset);
  }

  async updateAsset(assetId, updateData, userId, userRole, adminId = null) {
    const asset = await Asset.findById(this.toObjectId(assetId));
    if (!asset) throw new NotFoundError('Asset not found');

    if (!await this.hasAssetAccess(asset, userId, userRole, adminId)) {
      throw new ForbiddenError('You do not have access to this asset');
    }

    if (userRole === 'team') {
      const restrictedFields = ['adminId', 'teamId', 'createdBy', 'assetId', 'tagNumber', 'serialNumber'];
      for (const field of restrictedFields) {
        if (updateData[field] !== undefined) {
          const incoming = updateData[field]?.toString();
          const existing = asset[field]?.toString();
          if (incoming !== existing) {
            throw new ForbiddenError(`Team members cannot modify ${field}`);
          }
        }
      }
    }

    if (updateData.assetId || updateData.serialNumber || updateData.tagNumber) {
      await this.checkUniqueFields(updateData, assetId, asset.adminId);
    }

    const updatedAsset = await Asset.findByIdAndUpdate(
      this.toObjectId(assetId),
      { ...updateData, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    await this.createAuditLog(
      'ASSET_UPDATED',
      'asset',
      assetId,
      userId,
      userRole,
      {
        description: `Asset "${asset.assetName}" was updated`,
        changes: updateData
      }
    );

    return await this.getAssetById(assetId, userRole, adminId, userId);
  }

  async deleteAsset(assetId, userId, userRole, adminId = null, reason = '') {
    const asset = await Asset.findById(this.toObjectId(assetId));
    if (!asset) throw new NotFoundError('Asset not found');

    if (!await this.hasAssetAccess(asset, userId, userRole, adminId)) {
      throw new ForbiddenError('You do not have access to this asset');
    }

    // Only admin can delete assets (team members cannot)
    if (userRole !== 'admin') {
      throw new ForbiddenError('Only admins can delete assets');
    }

    // Verify admin owns this asset
    if (asset.adminId.toString() !== userId.toString()) {
      throw new ForbiddenError('You can only delete assets that belong to your organization');
    }

    asset.isDeleted = true;
    asset.deletedAt = new Date();
    asset.deletedBy = this.toObjectId(userId);
    await asset.save();

    await this.createAuditLog(
      'ASSET_DELETED',
      'asset',
      assetId,
      userId,
      userRole,
      {
        description: `Asset "${asset.assetName}" was deleted`,
        changes: { reason }
      }
    );

    return { success: true, message: 'Asset deleted successfully' };
  }

  async updateAssetStatus(assetId, status, reason, userId, userRole, adminId = null) {
    const asset = await Asset.findById(this.toObjectId(assetId));
    if (!asset) throw new NotFoundError('Asset not found');

    if (!await this.hasAssetAccess(asset, userId, userRole, adminId)) {
      throw new ForbiddenError('You do not have access to this asset');
    }

    const validStatuses = ['Active', 'In Maintenance', 'Retired', 'Under Repair', 'Decommissioned'];
    if (!validStatuses.includes(status)) {
      throw new ValidationError([{
        field: 'status',
        message: `Status must be one of: ${validStatuses.join(', ')}`
      }]);
    }

    asset.status = status;
    if (!asset.statusHistory) asset.statusHistory = [];
    asset.statusHistory.push({
      status,
      changedAt: new Date(),
      changedBy: this.toObjectId(userId),
      reason: reason || `Status changed to ${status}`
    });
    await asset.save();

    await this.createAuditLog(
      'ASSET_STATUS_UPDATED',
      'asset',
      assetId,
      userId,
      userRole,
      {
        description: `Asset "${asset.assetName}" status changed to ${status}`,
        changes: { status, reason }
      }
    );

    return await this.getAssetById(assetId, userRole, adminId, userId);
  }

  async cloneAsset(assetId, cloneData, userId, userRole, adminId = null, req = null) {
    const originalAsset = await Asset.findById(this.toObjectId(assetId));
    if (!originalAsset) throw new NotFoundError('Original asset not found');

    if (!await this.hasAssetAccess(originalAsset, userId, userRole, adminId)) {
      throw new ForbiddenError('You do not have access to this asset');
    }

    if (!originalAsset.canBeCloned) {
      throw new ForbiddenError('This asset cannot be cloned');
    }

    // Get next clone version from existing clones count
    const existingCloneCount = await Asset.countDocuments({
      clonedFrom: this.toObjectId(assetId),
      isDeleted: false
    });
    const nextCloneVersion = existingCloneCount + 1;

    // Build clone object — strip fields that must be unique or reset
    const cloneObj = originalAsset.toObject();
    delete cloneObj._id;
    delete cloneObj.__v;
    delete cloneObj.createdAt;
    delete cloneObj.updatedAt;
    delete cloneObj.assetId;
    delete cloneObj.tagNumber;
    delete cloneObj.serialNumber;
    delete cloneObj.statusHistory;
    delete cloneObj.isDeleted;
    delete cloneObj.deletedAt;
    delete cloneObj.deletedBy;

    const createdByModel = userRole === 'team' ? 'Team' : 'Client';

    const resolvedAdminId = userRole === 'admin'
      ? this.toObjectId(userId)
      : this.toObjectId(adminId || originalAsset.adminId);

    const newAssetData = {
      ...cloneObj,
      ...cloneData,
      isClone: true,
      clonedFrom: originalAsset._id,
      cloneVersion: nextCloneVersion,
      status: 'Active',
      createdBy: this.toObjectId(userId),
      createdByModel,
      adminId: resolvedAdminId,
      statusHistory: [{
        status: 'Active',
        changedAt: new Date(),
        changedBy: this.toObjectId(userId),
        reason: `Cloned from asset ${originalAsset.assetId || originalAsset._id}`
      }]
    };

    // Generate unique identifiers for the clone
    newAssetData.assetId = await this.generateUniqueAssetId(resolvedAdminId);

    if (cloneData.tagNumber) {
      await this.checkUniqueFields({ tagNumber: cloneData.tagNumber }, null, newAssetData.adminId);
      newAssetData.tagNumber = cloneData.tagNumber;
    } else {
      newAssetData.tagNumber = await this.generateUniqueTagNumber(resolvedAdminId);
    }

    const clonedAsset = await Asset.create(newAssetData);

    await this.createAuditLog(
      'ASSET_CLONED',
      'asset',
      clonedAsset._id,
      userId,
      userRole,
      {
        description: `Asset "${originalAsset.assetName}" cloned as "${clonedAsset.assetName}"`,
        changes: { clonedFrom: originalAsset._id, cloneVersion: clonedAsset.cloneVersion },
        ipAddress: req?.ip,
        userAgent: req?.headers?.['user-agent']
      }
    );

    return await this.getAssetById(clonedAsset._id, userRole, adminId, userId);
  }

  async getCloneList(assetId, userId, userRole, adminId = null) {
    const originalAsset = await Asset.findById(this.toObjectId(assetId))
      .lean({ virtuals: true });

    if (!originalAsset) throw new NotFoundError('Original asset not found');

    if (!await this.hasAssetAccess(originalAsset, userId, userRole, adminId)) {
      throw new ForbiddenError('You do not have access to this asset');
    }

    const clones = await Asset.find({
      clonedFrom: this.toObjectId(assetId),
      isDeleted: false
    })
      .populate('createdBy', 'name email firstName lastName')
      .populate('adminId', 'name email customerName')
      .sort({ cloneVersion: 1 })
      .lean({ virtuals: true });

    return {
      originalAsset: this.formatAssetResponse(originalAsset),
      clones: clones.map(clone => this.formatAssetResponse(clone)),
      totalClones: clones.length
    };
  }

  /**
   * Check if user has access to asset
   */
  async hasAssetAccess(asset, userId, userRole, adminId = null) {
    if (!asset) return false;
    
    const userIdObj = this.toObjectId(userId);
    const assetAdminId = asset.adminId?._id || asset.adminId;
    
    if (userRole === 'admin') {
      // Admin has access if:
      // 1. Asset belongs to this admin, OR
      // 2. Asset was created by a team member under this admin
      if (assetAdminId?.toString() === userId.toString()) {
        return true;
      }
      
      // Check if asset was created by a team member under this admin
      const creatorId = asset.createdBy?._id || asset.createdBy;
      if (creatorId) {
        const creator = await User.findById(creatorId);
        if (creator && creator.adminId?.toString() === userId.toString()) {
          return true;
        }
      }
      
      // Check if asset is assigned to a team member under this admin
      const assignedUsers = [
        asset.assignedUsers?.primaryUser,
        asset.assignedUsers?.secondaryUser,
        asset.assignedUsers?.custodian
      ].filter(Boolean);
      
      for (const assignedUser of assignedUsers) {
        const userIdd = assignedUser._id || assignedUser;
        const user = await User.findById(userIdd);
        if (user && user.adminId?.toString() === userId.toString()) {
          return true;
        }
      }
      
      return false;
    } else if (userRole === 'team') {
      // Team member has access if they belong to the same admin AND
      // they are personally linked to the asset
      if (assetAdminId?.toString() !== adminId?.toString()) {
        return false;
      }
      
      // Check if team member is assigned or creator
      return (
        (asset.assignedUsers?.primaryUser?._id?.toString() === userId.toString() ||
         asset.assignedUsers?.primaryUser?.toString() === userId.toString()) ||
        (asset.assignedUsers?.secondaryUser?._id?.toString() === userId.toString() ||
         asset.assignedUsers?.secondaryUser?.toString() === userId.toString()) ||
        (asset.assignedUsers?.custodian?._id?.toString() === userId.toString() ||
         asset.assignedUsers?.custodian?.toString() === userId.toString()) ||
        (asset.createdBy?._id?.toString() === userId.toString() ||
         asset.createdBy?.toString() === userId.toString())
      );
    }
    
    return false;
  }

  async checkUniqueFields(data, excludeId = null, adminId = null) {
    const fieldsToCheck = ['assetId', 'tagNumber', 'serialNumber'];
    const errors = [];

    for (const field of fieldsToCheck) {
      if (data[field]) {
        const query = { [field]: data[field], isDeleted: false };
        if (excludeId) query._id = { $ne: this.toObjectId(excludeId) };
        if (adminId) query.adminId = this.toObjectId(adminId);

        const existing = await Asset.findOne(query);
        if (existing) errors.push({ field, message: `${field} already exists` });
      }
    }

    if (errors.length > 0) throw new ConflictError(errors[0].message);
  }

  async generateUniqueAssetId(adminId) {
    const prefix = 'AST';
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const assetId = `${prefix}-${timestamp}-${random}`;

    const existing = await Asset.findOne({ assetId, isDeleted: false, adminId: this.toObjectId(adminId) });
    if (existing) return this.generateUniqueAssetId(adminId);

    return assetId;
  }

  async generateUniqueTagNumber(adminId) {
    const prefix = 'TAG';
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const tagNumber = `${prefix}-${timestamp}-${random}`;

    const existing = await Asset.findOne({ tagNumber, isDeleted: false, adminId: this.toObjectId(adminId) });
    if (existing) return this.generateUniqueTagNumber(adminId);

    return tagNumber;
  }

  formatAssetResponse(asset) {
    if (!asset) return null;

    return {
      id: asset._id,
      adminId: asset.adminId,
      teamId: asset.teamId,
      createdBy: asset.createdBy,
      createdByModel: asset.createdByModel,
      assetCategoryId: asset.assetCategoryId,
      isClone: asset.isClone,
      clonedFrom: asset.clonedFrom,
      cloneVersion: asset.cloneVersion,
      canBeCloned: asset.canBeCloned,
      assetId: asset.assetId,
      tagNumber: asset.tagNumber,
      assetName: asset.assetName,
      description: asset.description,
      serialNumber: asset.serialNumber,
      currentLocation: asset.currentLocation,
      customPhysicalAddress: asset.customPhysicalAddress,
      assignedUsers: asset.assignedUsers,
      status: asset.status,
      statusHistory: asset.statusHistory,
      assetCondition: asset.assetCondition,
      acquisitionDate: asset.acquisitionDate,
      invoiceDate: asset.invoiceDate,
      warrantyExpiry: asset.warrantyExpiry,
      leaseExpiry: asset.leaseExpiry,
      warrantyLeaseExpiryWarning: asset.warrantyLeaseExpiryWarning,
      purchaseCost: asset.purchaseCost,
      currentValue: asset.currentValue,
      depreciationRate: asset.depreciationRate,
      commissioningDate: asset.commissioningDate,
      manufacturer: asset.manufacturer,
      model: asset.model,
      type: asset.type,
      powerSource: asset.powerSource,
      weightCapacity: asset.weightCapacity,
      dimensions: asset.dimensions,
      inspectionSystems: asset.inspectionSystems,
      mhe: asset.mhe,
      transportation: asset.transportation,
      rotatingMachinery: asset.rotatingMachinery,
      garbageManagement: asset.garbageManagement,
      itAssets: asset.itAssets,
      facilityManagement: asset.facilityManagement,
      metadata: asset.metadata,
      warrantyStatus: asset.warrantyStatus,
      daysUntilNextInspection: asset.daysUntilNextInspection,
      fillLevelPercentage: asset.fillLevelPercentage,
      healthScore: asset.healthScore,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt
    };
  }
}

export default new AssetService();