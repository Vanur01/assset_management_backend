import mongoose from 'mongoose';
import Asset from '../models/asset.model.js';
import AuditLog from '../models/auditLog.model.js';
import User from '../models/user.model.js';
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
   * Get admin ID based on role
   */
  getAdminIdForRole(userId, userRole, providedAdminId = null) {
    if (userRole === 'admin') {
      return this.toObjectId(userId);
    } else if (userRole === 'team') {
      if (!providedAdminId) {
        throw new ValidationError([{
          field: 'adminId',
          message: 'Admin ID is required for team members'
        }]);
      }
      return this.toObjectId(providedAdminId);
    }
    throw new ForbiddenError('Invalid user role');
  }

  /**
   * Get team member access filter
   */
  getTeamAccessFilter(userId) {
    return {
      $or: [
        { 'assignedUsers.primaryUser': this.toObjectId(userId) },
        { 'assignedUsers.secondaryUser': this.toObjectId(userId) },
        { 'assignedUsers.custodian': this.toObjectId(userId) },
        { createdBy: this.toObjectId(userId) }
      ]
    };
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

  /**
   * Add new asset
   */
  async addAsset(assetData, adminId, userId, userRole = 'admin', req = null) {
    // Validate admin ID
    const resolvedAdminId = this.getAdminIdForRole(userId, userRole, adminId);
    
    if (!userId) {
      throw new ValidationError([{ field: 'userId', message: 'User ID is required' }]);
    }

    // Verify team member belongs to this admin
    if (userRole === 'team') {
      const user = await User.findById(this.toObjectId(userId));
      if (!user || user.adminId?.toString() !== resolvedAdminId.toString()) {
        throw new ForbiddenError('You are not authorized to add assets for this admin');
      }
    }

    // Validate asset category if provided
    if (assetData.assetCategoryId) {
      const AssetCategory = mongoose.model('AssetCategory');
      if (AssetCategory) {
        const assetCategory = await AssetCategory.findById(assetData.assetCategoryId);
        if (!assetCategory) {
          throw new ValidationError([{ field: 'assetCategoryId', message: 'Invalid asset category ID' }]);
        }
      }
    }

    // Check for duplicates
    const orConditions = [];
    if (assetData.assetId) orConditions.push({ assetId: assetData.assetId });
    if (assetData.serialNumber) orConditions.push({ serialNumber: assetData.serialNumber });
    if (assetData.tagNumber) orConditions.push({ tagNumber: assetData.tagNumber });

    if (orConditions.length > 0) {
      const existingAsset = await Asset.findOne({
        adminId: resolvedAdminId,
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

    // Generate unique identifiers if not provided
    if (!assetData.assetId) assetData.assetId = await this.generateUniqueAssetId(resolvedAdminId);
    if (!assetData.tagNumber) assetData.tagNumber = await this.generateUniqueTagNumber(resolvedAdminId);

    // Status history
    const statusHistory = [{
      status: assetData.status || 'Active',
      changedAt: new Date(),
      changedBy: this.toObjectId(userId),
      reason: 'Asset created'
    }];

    const createdByModel = userRole === 'team' ? 'Team' : 'Client';

    // Create asset
    const asset = new Asset({
      ...assetData,
      adminId: resolvedAdminId,
      createdBy: this.toObjectId(userId),
      createdByModel,
      status: assetData.status || 'Active',
      canBeCloned: assetData.canBeCloned !== false,
      statusHistory
    });

    await asset.save();

    // Create audit log
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

  /**
   * Get assets with filters and pagination
   */
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

    // ==========================
    // ROLE BASED FILTERING
    // ==========================

    if (userRole === 'admin') {
      // Admin sees all assets under their adminId (their own userId)
      filter.adminId = this.toObjectId(userId);
    } else if (userRole === 'team') {
      // Team member must have adminId
      if (!adminId) {
        throw new ValidationError([{
          field: 'adminId',
          message: 'Admin ID is required for team members'
        }]);
      }
      
      // Team sees assets under their parent admin
      filter.adminId = this.toObjectId(adminId);
      
      // Team only sees assets they are associated with
      filter.$or = [
        { 'assignedUsers.primaryUser': this.toObjectId(userId) },
        { 'assignedUsers.secondaryUser': this.toObjectId(userId) },
        { 'assignedUsers.custodian': this.toObjectId(userId) },
        { createdBy: this.toObjectId(userId) }
      ];
    }

    // ==========================
    // OPTIONAL FILTERS
    // ==========================

    if (status) filter.status = status;
    if (assetCategoryId) filter.assetCategoryId = this.toObjectId(assetCategoryId);
    if (currentLocation) filter.currentLocation = currentLocation;
    
    if (isClone !== undefined) {
      filter.isClone = isClone === 'true';
    }
    
    if (clonedFrom) {
      filter.clonedFrom = this.toObjectId(clonedFrom);
    }
    
    if (assignedTo) {
      const assignedToCondition = {
        $or: [
          { 'assignedUsers.primaryUser': this.toObjectId(assignedTo) },
          { 'assignedUsers.secondaryUser': this.toObjectId(assignedTo) },
          { 'assignedUsers.custodian': this.toObjectId(assignedTo) }
        ]
      };

      if (filter.$or) {
        filter.$and = [
          { $or: filter.$or },
          assignedToCondition
        ];
        delete filter.$or;
      } else {
        filter.$or = assignedToCondition.$or;
      }
    }

    if (search) {
      filter.$text = { $search: search };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    // ==========================
    // ASSET LIST
    // ==========================

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

    // ==========================
    // STATS FILTER
    // ==========================

    const statsFilter = { ...filter };
    delete statsFilter.$text;

    const [
      totalAssets,
      activeAssets,
      inactiveAssets,
      clonedAssets,
      nonClonedAssets,
      assignedAssets,
      unassignedAssets,
      conditionStats,
      locationStats,
      valueStats
    ] = await Promise.all([
      Asset.countDocuments(statsFilter),
      Asset.countDocuments({ ...statsFilter, status: 'Active' }),
      Asset.countDocuments({ ...statsFilter, status: { $ne: 'Active' } }),
      Asset.countDocuments({ ...statsFilter, isClone: true }),
      Asset.countDocuments({ ...statsFilter, isClone: false }),
      Asset.countDocuments({
        ...statsFilter,
        $or: [
          { 'assignedUsers.primaryUser': { $exists: true, $ne: null } },
          { 'assignedUsers.secondaryUser': { $exists: true, $ne: null } },
          { 'assignedUsers.custodian': { $exists: true, $ne: null } }
        ]
      }),
      Asset.countDocuments({
        ...statsFilter,
        'assignedUsers.primaryUser': null,
        'assignedUsers.secondaryUser': null,
        'assignedUsers.custodian': null
      }),
      Asset.aggregate([
        { $match: statsFilter },
        { $group: { _id: '$assetCondition', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      Asset.aggregate([
        { $match: statsFilter },
        { $group: { _id: '$currentLocation', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      Asset.aggregate([
        { $match: statsFilter },
        {
          $group: {
            _id: null,
            totalPurchaseCost: { $sum: { $ifNull: ['$purchaseCost', 0] } },
            totalCurrentValue: { $sum: { $ifNull: ['$currentValue', 0] } },
            averagePurchaseCost: { $avg: { $ifNull: ['$purchaseCost', 0] } },
            averageCurrentValue: { $avg: { $ifNull: ['$currentValue', 0] } }
          }
        }
      ])
    ]);

    // ==========================
    // RESPONSE
    // ==========================

    return {
      stats: {
        totalAssets,
        activeAssets,
        inactiveAssets,
        clonedAssets,
        nonClonedAssets,
        assignedAssets,
        unassignedAssets,
        totalPurchaseCost: valueStats?.[0]?.totalPurchaseCost || 0,
        totalCurrentValue: valueStats?.[0]?.totalCurrentValue || 0,
        averagePurchaseCost: valueStats?.[0]?.averagePurchaseCost || 0,
        averageCurrentValue: valueStats?.[0]?.averageCurrentValue || 0,
        conditionStats,
        locationStats
      },
      assets: assets.map(asset => this.formatAssetResponse(asset)),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    };
  }

  /**
   * Get asset by ID
   */
  async getAssetById(assetId, userRole, adminId, userId) {
    const query = { _id: this.toObjectId(assetId), isDeleted: false };

    if (userRole === 'admin') {
      // Admin can view any asset under their adminId
      query.adminId = this.toObjectId(userId);
    } else if (userRole === 'team') {
      // Team member must be scoped to their parent admin's assets
      if (!adminId) {
        throw new ValidationError([{ field: 'adminId', message: 'Admin ID is required' }]);
      }
      query.adminId = this.toObjectId(adminId);
      query.$or = [
        { 'assignedUsers.primaryUser': this.toObjectId(userId) },
        { 'assignedUsers.secondaryUser': this.toObjectId(userId) },
        { 'assignedUsers.custodian': this.toObjectId(userId) },
        { createdBy: this.toObjectId(userId) }
      ];
    }

    const asset = await Asset.findOne(query)
      .populate('adminId', 'name email customerName')
      .populate('createdBy', 'name email firstName lastName')
      .populate('assetCategoryId', 'name')
      .populate('assignedUsers.primaryUser', 'name email firstName lastName')
      .populate('assignedUsers.secondaryUser', 'name email firstName lastName')
      .populate('assignedUsers.custodian', 'name email firstName lastName')
      .lean({ virtuals: true });

    if (!asset) throw new NotFoundError('Asset not found or you do not have permission to view it');

    return this.formatAssetResponse(asset);
  }

  /**
   * Update asset
   */
  async updateAsset(assetId, updateData, userId, userRole, adminId = null) {
    const asset = await Asset.findById(this.toObjectId(assetId));
    if (!asset) throw new NotFoundError('Asset not found');

    // Role-based authorization
    if (userRole === 'admin') {
      if (asset.adminId.toString() !== userId.toString()) {
        throw new ForbiddenError('You can only update assets belonging to your organization');
      }
    } else if (userRole === 'team') {
      if (!adminId || asset.adminId.toString() !== adminId.toString()) {
        throw new ForbiddenError('You do not have permission to update this asset');
      }

      // Team members cannot modify identity/ownership fields
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

    // Check unique fields if updating
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

  /**
   * Delete asset (soft delete) - Admin only
   */
  async deleteAsset(assetId, userId, userRole, adminId = null, reason = '') {
    const asset = await Asset.findById(this.toObjectId(assetId));
    if (!asset) throw new NotFoundError('Asset not found');

    // Only admins can delete assets
    if (userRole !== 'admin') {
      throw new ForbiddenError('Only admins can delete assets');
    }

    // Admin can only delete their own organization's assets
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

  /**
   * Update asset status
   */
  async updateAssetStatus(assetId, status, reason, userId, userRole, adminId = null) {
    const asset = await Asset.findById(this.toObjectId(assetId));
    if (!asset) throw new NotFoundError('Asset not found');

    // Role-based authorization
    if (userRole === 'admin') {
      if (asset.adminId.toString() !== userId.toString()) {
        throw new ForbiddenError('You can only update status for assets belonging to your organization');
      }
    } else if (userRole === 'team') {
      if (!adminId || asset.adminId.toString() !== adminId.toString()) {
        throw new ForbiddenError('You do not have permission to update this asset status');
      }
    }

    // Validate status
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

  /**
   * Clone asset
   */
  async cloneAsset(assetId, cloneData, userId, userRole, adminId = null, req = null) {
    const originalAsset = await Asset.findById(this.toObjectId(assetId));
    if (!originalAsset) throw new NotFoundError('Original asset not found');

    if (!originalAsset.canBeCloned) {
      throw new ForbiddenError('This asset cannot be cloned');
    }

    // Role-based authorization
    if (userRole === 'admin') {
      if (originalAsset.adminId.toString() !== userId.toString()) {
        throw new ForbiddenError('You can only clone assets belonging to your organization');
      }
    } else if (userRole === 'team') {
      if (!adminId || originalAsset.adminId.toString() !== adminId.toString()) {
        throw new ForbiddenError('You do not have permission to clone this asset');
      }
    }

    const existingCloneCount = await Asset.countDocuments({
      clonedFrom: this.toObjectId(assetId),
      isDeleted: false
    });
    const nextCloneVersion = existingCloneCount + 1;

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

    newAssetData.assetId = await this.generateUniqueAssetId(resolvedAdminId);

    if (cloneData.tagNumber) {
      await this.checkUniqueFields({ tagNumber: cloneData.tagNumber }, null, resolvedAdminId);
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

    return this.formatAssetResponse(clonedAsset.toObject());
  }

  /**
   * Get all clones with filters
   */
  async getAllClonesWithFilters(userId, userRole, adminId = null, filters = {}) {
    const {
      page = 1,
      limit = 10,
      search = '',
      status = '',
      sortBy = 'createdAt',
      sortOrder = 'desc',
      originalAssetId = null
    } = filters;

    const getId = (obj) => {
      if (!obj) return null;
      return obj._id?.toString() || obj.toString();
    };

    let query = {
      isClone: true,
      isDeleted: false
    };

    // Role-based filtering
    if (userRole === 'admin') {
      // Admin sees clones under their adminId
      query.adminId = this.toObjectId(userId);
    } else if (userRole === 'team') {
      // Team member must have adminId
      if (!adminId) {
        throw new ValidationError([{
          field: 'adminId',
          message: 'Admin ID is required for team members'
        }]);
      }
      
      // Team sees clones under their parent admin
      query.adminId = this.toObjectId(adminId);
      
      // Team only sees clones they are associated with
      query.$or = [
        { createdBy: this.toObjectId(userId) },
        { 'assignedUsers.primaryUser': this.toObjectId(userId) },
        { 'assignedUsers.secondaryUser': this.toObjectId(userId) },
        { 'assignedUsers.custodian': this.toObjectId(userId) }
      ];
    }

    // Apply filters
    if (originalAssetId) {
      query.clonedFrom = this.toObjectId(originalAssetId);
    }

    if (search) {
      query.$or = [
        { assetId: { $regex: search, $options: 'i' } },
        { assetName: { $regex: search, $options: 'i' } },
        { tagNumber: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (status && status !== 'all') {
      query.status = status;
    }

    // Pagination
    const skip = (page - 1) * limit;
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute queries
    const [clones, totalClones] = await Promise.all([
      Asset.find(query)
        .populate('createdBy', 'name email firstName lastName')
        .populate('adminId', 'name email customerName')
        .populate('clonedFrom', 'assetId assetName name description status')
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .lean({ virtuals: true }),
      Asset.countDocuments(query)
    ]);

    // Format clones
    const formattedClones = clones.map(clone => {
      return {
        ...this.formatAssetResponse(clone),
        cloneInfo: {
          version: clone.cloneVersion || 1,
          clonedAt: clone.createdAt,
          clonedBy: clone.createdBy ? {
            id: getId(clone.createdBy),
            name: clone.createdBy.name || clone.createdBy.email,
            email: clone.createdBy.email
          } : null
        }
      };
    });

    const totalPages = Math.ceil(totalClones / limit);

    return {
      success: true,
      clones: formattedClones,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalClones,
        pages: totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
    };
  }

  /**
   * Check unique fields
   */
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

  /**
   * Generate unique asset ID
   */
  async generateUniqueAssetId(adminId) {
    const prefix = 'AST';
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const assetId = `${prefix}-${timestamp}-${random}`;

    const existing = await Asset.findOne({ assetId, isDeleted: false, adminId: this.toObjectId(adminId) });
    if (existing) return this.generateUniqueAssetId(adminId);

    return assetId;
  }

  /**
   * Generate unique tag number
   */
  async generateUniqueTagNumber(adminId) {
    const prefix = 'TAG';
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    const tagNumber = `${prefix}-${timestamp}-${random}`;

    const existing = await Asset.findOne({ tagNumber, isDeleted: false, adminId: this.toObjectId(adminId) });
    if (existing) return this.generateUniqueTagNumber(adminId);

    return tagNumber;
  }

  /**
   * Format asset response
   */
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