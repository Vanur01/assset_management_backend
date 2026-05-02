import Asset from '../models/asset.model.js';
import AssetRequest from '../models/AssetRequest.model.js';
import mongoose from 'mongoose';
import {
  NotFoundError,
  ValidationError,
  AuthorizationError,
  DatabaseError,
  InvalidOperationError,
  DuplicateEntryError
} from '../errors/customError.js';

class AssetService {

  // ==================== HELPER METHODS ====================

  toObjectId(id) {
    if (!id) return null;
    if (id instanceof mongoose.Types.ObjectId) return id;
    if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
      return new mongoose.Types.ObjectId(id);
    }
    return null;
  }

  // ==================== ASSET CRUD ====================

  async createAsset(assetData, userRole, userId, adminId, teamMemberId = null) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      await this.checkDuplicateIdentifiers(assetData, adminId);

      const preparedData = this.prepareAssetData(assetData, userRole, userId, adminId, teamMemberId);

      if (!preparedData.assetId) {
        preparedData.assetId = `AST-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      }
      if (!preparedData.tagNumber) {
        preparedData.tagNumber = `TAG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      }

      const asset = new Asset(preparedData);
      await asset.save({ session });

      if (assetData.parentAsset) {
        await this.handleParentChildRelationship(asset, assetData.parentAsset, adminId, session);
      }

      await session.commitTransaction();
      return await this.getPopulatedAsset(asset._id);
    } catch (error) {
      await session.abortTransaction();
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        throw new DuplicateEntryError(field);
      }
      throw error;
    } finally {
      session.endSession();
    }
  }

  async getAllAssets(
    userRole,
    userId,
    adminId,
    teamMemberId,
    filters = {},
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
    includeDeleted = false
  ) {
    try {
      let query = {};

      // ================= ROLE BASED ACCESS =================
      if (userRole === "superadmin") {
        // Superadmin sees all assets
        query = {};
      }
      else if (userRole === "admin") {
        // Admin sees all assets created under own company/account
        query = { adminId };
      }
      else if (userRole === "team") {
        // Team member sees only assigned assets
        query = {
          adminId,
          $or: [
            { "assignedUsers.primaryUser": teamMemberId || userId },
            { "assignedUsers.secondaryUser": teamMemberId || userId },
            { "assignedUsers.custodian": teamMemberId || userId }
          ]
        };
      }
      else {
        throw new Error("Unauthorized role");
      }

      // Deleted filter
      if (!includeDeleted) {
        query.isDeleted = false;
      }

      this.applyAssetFilters(query, filters);
      page = parseInt(page) || 1;
      limit = parseInt(limit) || 10;
      const skip = (page - 1) * limit;

      // Sorting
      const sortOptions = {
        [sortBy]: sortOrder === "asc" ? 1 : -1
      };

      const [assets, total] = await Promise.all([
        Asset.find(query)
          .populate(
            "assignedUsers.primaryUser",
            "firstName lastName email phone"
          )
          .populate(
            "assignedUsers.secondaryUser",
            "firstName lastName email phone"
          )
          .populate(
            "assignedUsers.custodian",
            "firstName lastName email phone"
          )
          .populate(
            "parentAsset",
            "assetName assetId tagNumber status"
          )
          .populate(
            "clonedFrom",
            "assetName assetId"
          )
          .sort(sortOptions)
          .skip(skip)
          .limit(limit)
          .lean(),

        Asset.countDocuments(query)
      ]);

      return {
        success: true,
        assets,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1
        }
      };

    } catch (error) {
      console.error("getAllAssets Error:", error);
      throw new DatabaseError("Failed to fetch assets", error);
    }
  }


  async getDeletedAssets(adminId, page = 1, limit = 20) {
    return await Asset.getDeletedAssets(adminId, page, limit);
  }

  async getAssetById(assetId, userRole, userId, adminId, teamMemberId) {
    try {
      const query = { _id: this.toObjectId(assetId), isDeleted: false };
      this.applyRoleAccess(query, userRole, userId, adminId, teamMemberId);

      const asset = await Asset.findOne(query)
        .populate('assignedUsers.primaryUser', 'firstName lastName email')
        .populate('assignedUsers.secondaryUser', 'firstName lastName email')
        .populate('assignedUsers.custodian', 'firstName lastName email')
        .populate('parentAsset', 'assetName assetId tagNumber status')
        .populate('childAssets', 'assetName assetId tagNumber serialNumber assetCategory currentLocation status')
        .populate('clonedFrom', 'assetName assetId')
        .lean();

      if (!asset) {
        throw new NotFoundError('Asset Not Found');
      }

      return asset;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError('Failed to fetch asset', error);
    }
  }

  async getAssetDocumentById(assetId, userRole, userId, adminId, teamMemberId) {
    try {
      const query = { _id: this.toObjectId(assetId), isDeleted: false };
      this.applyRoleAccess(query, userRole, userId, adminId, teamMemberId);

      const asset = await Asset.findOne(query)
        .populate('assignedUsers.primaryUser', 'firstName lastName email')
        .populate('assignedUsers.secondaryUser', 'firstName lastName email')
        .populate('assignedUsers.custodian', 'firstName lastName email')
        .populate('parentAsset', 'assetName assetId tagNumber status')
        .populate('childAssets', 'assetName assetId tagNumber serialNumber assetCategory currentLocation status')
        .populate('clonedFrom', 'assetName assetId');

      if (!asset) {
        throw new NotFoundError('Asset Not Found');
      }

      return asset;
    } catch (error) {
      if (error instanceof NotFoundError) throw error;
      throw new DatabaseError('Failed to fetch asset document', error);
    }
  }

  async updateAsset(assetId, updateData, userRole, userId, adminId, teamMemberId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const asset = await this.getAssetDocumentById(assetId, userRole, userId, adminId, teamMemberId);

      if (userRole === 'team') {
        const allowedFields = ['status', 'assetCondition', 'mhe', 'transportation', 'garbageManagement', 'rotatingMachinery', 'metadata'];
        const restrictedFields = Object.keys(updateData).filter(field => !allowedFields.includes(field));
        if (restrictedFields.length > 0) {
          throw new AuthorizationError(`Team members cannot update fields: ${restrictedFields.join(', ')}`);
        }
      }

      await this.checkDuplicateIdentifiersForUpdate(updateData, assetId, adminId, asset);

      const preparedUpdate = this.prepareUpdateData(updateData, userRole, userId);

      if (updateData.status && updateData.status !== asset.status) {
        preparedUpdate.statusHistory = [
          ...(asset.statusHistory || []),
          {
            status: updateData.status,
            changedAt: new Date(),
            changedBy: userId,
            changedByModel: userRole === 'admin' ? 'Client' : 'Team',
            reason: updateData.statusChangeReason || 'Status updated'
          }
        ];
      }

      const updatedAsset = await Asset.findByIdAndUpdate(
        this.toObjectId(assetId),
        { $set: preparedUpdate },
        { new: true, runValidators: true, session }
      );

      if (!updatedAsset) {
        throw new NotFoundError('Asset');
      }

      await session.commitTransaction();
      return await this.getPopulatedAsset(assetId);
    } catch (error) {
      await session.abortTransaction();
      if (error.code === 11000) {
        const field = Object.keys(error.keyPattern)[0];
        throw new DuplicateEntryError(field);
      }
      throw error;
    } finally {
      session.endSession();
    }
  }

  async deleteAsset(
    assetId,
    userRole,
    userId,
    adminId,
    teamMemberId,
    permanent = false
  ) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Get asset document
      const asset = await Asset.findById(assetId).session(session);

      if (!asset) {
        throw new NotFoundError("Asset not found");
      }

      // ================= ROLE CHECK =================
      if (userRole === "team") {
        const isOwner =
          asset.createdBy?.toString() === userId.toString() ||
          asset.assignedUsers?.primaryUser?.toString() === userId.toString() ||
          asset.assignedUsers?.secondaryUser?.toString() === userId.toString() ||
          asset.assignedUsers?.custodian?.toString() === userId.toString();

        if (!isOwner) {
          throw new AuthorizationError(
            "You do not have permission to delete this asset"
          );
        }
      }

      if (userRole === "admin" && asset.adminId?.toString() !== adminId.toString()) {
        throw new AuthorizationError("Unauthorized asset access");
      }

      // ================= CHILD CHECK =================
      if (asset.childAssets && asset.childAssets.length > 0) {
        throw new InvalidOperationError(
          "Cannot delete asset with child assets. Remove child assets first."
        );
      }

      let result;

      // ================= PERMANENT DELETE =================
      if (permanent && userRole === "admin") {
        const deletedAssetData = asset.toObject();

        await Asset.findByIdAndDelete(assetId).session(session);

        // Remove from parent childAssets
        if (asset.parentAsset) {
          await Asset.findByIdAndUpdate(
            asset.parentAsset,
            { $pull: { childAssets: asset._id } },
            { session }
          );
        }

        result = {
          _id: asset._id,
          assetId: deletedAssetData.assetId,
          assetName: deletedAssetData.assetName,
          tagNumber: deletedAssetData.tagNumber,
          message: "Asset permanently deleted"
        };
      }

      // ================= SOFT DELETE =================
      else {
        await Asset.findByIdAndUpdate(
          assetId,
          {
            $set: {
              isDeleted: true,
              deletedAt: new Date(),
              deletedBy: userId,
              deletedByRole: userRole,
              status: "Deleted"
            }
          },
          { session, new: true }
        );

        const softDeletedAsset = await Asset.findById(assetId)
          .select("-__v -statusHistory -metadata.attachments")
          .lean();

        result = {
          ...softDeletedAsset,
          message: "Asset moved to trash"
        };
      }

      await session.commitTransaction();
      return result;

    } catch (error) {
      await session.abortTransaction();
      console.error("deleteAsset Error:", error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  async cloneAsset(
    assetId,
    cloneData,
    userRole,
    userId,
    adminId,
    teamMemberId
  ) {
    try {
      // Get original asset as mongoose document
      const asset = await Asset.findById(assetId);

      if (!asset) {
        throw new NotFoundError("Source Asset");
      }

      // ================= ROLE CHECK =================
      if (
        userRole !== "admin" &&
        asset.createdBy?.toString() !== userId.toString()
      ) {
        throw new AuthorizationError(
          "You do not have permission to clone this asset"
        );
      }

      // ================= PREPARE CLONE DATA =================
      const clonedData = {
        ...asset.toObject(),
        _id: undefined,
        __v: undefined,
        assetName: cloneData.assetName || `${asset.assetName} Copy`,
        assetId: cloneData.assetId || `AST-${Date.now()}`,
        tagNumber: cloneData.tagNumber || null,
        clonedFrom: asset._id,
        parentAsset: asset._id,
        createdBy: userId,
        adminId: adminId,
        createdAt: new Date(),
        updatedAt: new Date(),
        status: cloneData.status || "Available",
        ...cloneData
      };
      const clonedAsset = await Asset.create(clonedData);
      return clonedAsset;

    } catch (error) {
      console.error("cloneAsset Error:", error);
      throw new DatabaseError("Failed to clone asset", error);
    }
  }


  async getAssetClones(
    assetId,
    userRole,
    userId,
    adminId,
    teamMemberId,
    page = 1,
    limit = 20,
    sortBy = "createdAt",
    sortOrder = "desc"
  ) {
    try {
      // Check parent asset exists + access permission
      await this.getAssetById(
        assetId,
        userRole,
        userId,
        adminId,
        teamMemberId
      );

      // Pagination
      page = parseInt(page) || 1;
      limit = parseInt(limit) || 20;
      const skip = (page - 1) * limit;

      // Sorting
      const sortOptions = {
        [sortBy]: sortOrder === "asc" ? 1 : -1
      };

      // ================= ROLE BASED QUERY =================
      let query = {
        clonedFrom: assetId
      };

      if (userRole === "admin") {
        // Admin sees all clones under admin account
        query.adminId = adminId;
      }
      else if (userRole === "team") {
        // Team sees only own assigned clones
        query.adminId = adminId;
        query.$or = [
          { createdBy: userId },
          { "assignedUsers.primaryUser": teamMemberId || userId },
          { "assignedUsers.secondaryUser": teamMemberId || userId },
          { "assignedUsers.custodian": teamMemberId || userId }
        ];
      }
      else {
        throw new AuthorizationError("Unauthorized access");
      }

      const [clones, total] = await Promise.all([
        Asset.find(query)
          .populate(
            "assignedUsers.primaryUser",
            "firstName lastName email phone"
          )
          .populate(
            "assignedUsers.secondaryUser",
            "firstName lastName email phone"
          )
          .populate(
            "assignedUsers.custodian",
            "firstName lastName email phone"
          )
          .populate(
            "clonedFrom",
            "assetName assetId"
          )
          .sort(sortOptions)
          .skip(skip)
          .limit(limit)
          .lean(),

        Asset.countDocuments(query)
      ]);

      return {
        success: true,
        clones,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1
        }
      };

    } catch (error) {
      console.error("getAssetClones Error:", error);
      throw new DatabaseError("Failed to fetch cloned assets", error);
    }
  }

  async getCloneTree(assetId, userRole, userId, adminId, teamMemberId) {
    await this.getAssetById(assetId, userRole, userId, adminId, teamMemberId);
    return await Asset.getCloneTree(assetId);
  }

  // ==================== LINK CHILD ASSETS METHOD ====================

  async linkChildAssets(parentAssetId, childAssetIds, userRole, userId, adminId, teamMemberId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Get parent asset with proper access control
      const parentAsset = await this.getAssetDocumentById(parentAssetId, userRole, userId, adminId, teamMemberId);

      if (!parentAsset) {
        throw new NotFoundError('Parent asset not found');
      }

      // Validate parent is not already a child
      if (parentAsset.parentAsset) {
        throw new InvalidOperationError('Cannot link child assets to an asset that is already a child');
      }

      const linkedAssets = [];
      const skippedAssets = [];
      const errors = [];

      // Process each child asset ID
      for (const childId of childAssetIds) {
        try {
          // Get child asset with access control
          const childAsset = await this.getAssetDocumentById(childId, userRole, userId, adminId, teamMemberId);

          if (!childAsset) {
            errors.push({ childId, error: 'Asset not found' });
            continue;
          }

          // Check if already has a parent
          if (childAsset.parentAsset) {
            skippedAssets.push({
              assetId: childAsset._id,
              assetName: childAsset.assetName,
              assetId_code: childAsset.assetId,
              currentParent: childAsset.parentAsset,
              reason: 'Already linked to a parent asset'
            });
            continue;
          }

          // Check for circular reference
          if (childAsset._id.toString() === parentAsset._id.toString()) {
            errors.push({ childId, error: 'Cannot link asset to itself' });
            continue;
          }

          // Check if child is already in parent's childAssets
          if (parentAsset.childAssets && parentAsset.childAssets.includes(childAsset._id)) {
            skippedAssets.push({
              assetId: childAsset._id,
              assetName: childAsset.assetName,
              assetId_code: childAsset.assetId,
              reason: 'Already linked to this parent'
            });
            continue;
          }

          // Update child asset
          childAsset.parentAsset = parentAsset._id;
          childAsset.parentChildRelationship = 'child';
          if (!childAsset.relationshipMetadata) {
            childAsset.relationshipMetadata = {};
          }
          childAsset.relationshipMetadata.parentHierarchyLevel = (parentAsset.relationshipMetadata?.parentHierarchyLevel || 0) + 1;

          // Optional: Inherit settings from parent
          if (parentAsset.relationshipMetadata?.inheritanceSettings) {
            const inheritSettings = parentAsset.relationshipMetadata.inheritanceSettings;
            if (inheritSettings.inheritStatus) {
              childAsset.status = parentAsset.status;
            }
            if (inheritSettings.inheritLocation) {
              childAsset.currentLocation = parentAsset.currentLocation;
            }
            if (inheritSettings.inheritAssignment && parentAsset.assignedUsers) {
              childAsset.assignedUsers = parentAsset.assignedUsers;
            }
          }

          await childAsset.save({ session });

          // Add to parent's childAssets array if not already present
          if (!parentAsset.childAssets.includes(childAsset._id)) {
            parentAsset.childAssets.push(childAsset._id);
          }

          linkedAssets.push({
            _id: childAsset._id,
            assetName: childAsset.assetName,
            assetId: childAsset.assetId,
            tagNumber: childAsset.tagNumber,
            serialNumber: childAsset.serialNumber,
            assetCategory: childAsset.assetCategory,
            currentLocation: childAsset.currentLocation,
            status: childAsset.status
          });

        } catch (error) {
          errors.push({ childId, error: error.message });
        }
      }

      // Update parent relationship status
      if (parentAsset.childAssets.length > 0) {
        parentAsset.parentChildRelationship = 'parent';
        await parentAsset.save({ session });
      }

      await session.commitTransaction();

      // Get updated populated parent asset
      const updatedParent = await Asset.findById(parentAsset._id)
        .populate('assignedUsers.primaryUser', 'firstName lastName email')
        .populate('assignedUsers.secondaryUser', 'firstName lastName email')
        .populate('assignedUsers.custodian', 'firstName lastName email')
        .populate('childAssets', 'assetName assetId tagNumber serialNumber assetCategory currentLocation status')
        .populate('parentAsset', 'assetName assetId tagNumber status')
        .lean();

      return {
        parentAsset: updatedParent,
        linkedAssets,
        skippedAssets,
        errors,
        summary: {
          totalRequested: childAssetIds.length,
          successfullyLinked: linkedAssets.length,
          skipped: skippedAssets.length,
          failed: errors.length
        }
      };

    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  // ==================== ASSET REQUEST APPROVAL METHODS ====================

  async approveAssetRequest(requestId, userId, userModel, actorName) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const request = await AssetRequest.findById(requestId).session(session);
      if (!request) {
        throw new NotFoundError('Asset request not found');
      }

      if (request.status !== 'pending') {
        throw new ValidationError(`Cannot approve request that is already ${request.status}`);
      }

      let createdAsset;
      if (request.requestType === 'parent') {
        createdAsset = await this.createAssetFromParentRequest(request, userId, userModel, session);
      } else {
        createdAsset = await this.createAssetFromChildRequest(request, userId, userModel, session);
      }

      request.status = 'approved';
      request.approvedBy = userId;
      request.approvedByModel = userModel;
      request.approvedAt = new Date();
      request.approvedByName = actorName;
      request.createdAssetId = createdAsset._id;
      request.createdAssetDetails = {
        assetId: createdAsset.assetId,
        assetName: createdAsset.assetName,
        tagNumber: createdAsset.tagNumber
      };

      await request.save({ session });
      await session.commitTransaction();

      return {
        request,
        createdAsset
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async rejectAssetRequest(requestId, rejectionReason, userId, userModel, actorName) {
    const request = await AssetRequest.findById(requestId);
    if (!request) {
      throw new NotFoundError('Asset request not found');
    }

    if (request.status !== 'pending') {
      throw new ValidationError(`Cannot reject request that is already ${request.status}`);
    }

    request.status = 'rejected';
    request.rejectedBy = userId;
    request.rejectedByModel = userModel;
    request.rejectedAt = new Date();
    request.rejectionReason = rejectionReason;
    request.rejectedByName = actorName;

    await request.save();

    return request;
  }

  async createAssetFromParentRequest(request, userId, userModel, session) {
    const assetData = {
      assetName: request.assetName,
      description: request.assetDescription,
      assetCategory: request.category,
      currentLocation: request.location,
      adminId: request.adminId,
      createdBy: userId,
      createdByModel: userModel,
      status: 'Active',
      metadata: {
        notes: `Created from asset request ${request._id}`
      }
    };

    if (request.assignedTo) {
      assetData.assignedUsers = {
        primaryUser: request.assignedTo
      };
    }

    if (request.locationDetails) {
      assetData.customPhysicalAddress = request.locationDetails;
    }

    const asset = new Asset(assetData);
    await asset.save({ session });
    return asset;
  }

  async createAssetFromChildRequest(request, userId, userModel, session) {
    const parentAsset = await Asset.findById(request.parentAssetId).session(session);
    if (!parentAsset) {
      throw new NotFoundError('Parent asset not found');
    }

    const assetData = {
      assetName: request.assetName,
      description: request.assetDescription,
      assetCategory: request.category,
      currentLocation: request.location || parentAsset.currentLocation,
      adminId: request.adminId,
      parentAsset: parentAsset._id,
      createdBy: userId,
      createdByModel: userModel,
      status: 'Active',
      metadata: {
        notes: `Created as child asset of ${parentAsset.assetName} from request ${request._id}`
      }
    };

    if (request.assignedTo) {
      assetData.assignedUsers = {
        primaryUser: request.assignedTo
      };
    }

    const asset = new Asset(assetData);
    await asset.save({ session });

    await parentAsset.addChildAsset(asset._id);

    return asset;
  }

  // ==================== PRIVATE HELPER METHODS ====================

  async checkDuplicateIdentifiers(data, adminId) {
    const checks = [];

    if (data.assetId) {
      checks.push(Asset.findOne({ assetId: data.assetId, adminId: this.toObjectId(adminId), isDeleted: false }));
    }
    if (data.serialNumber) {
      checks.push(Asset.findOne({ serialNumber: data.serialNumber, adminId: this.toObjectId(adminId), isDeleted: false }));
    }
    if (data.tagNumber) {
      checks.push(Asset.findOne({ tagNumber: data.tagNumber, adminId: this.toObjectId(adminId), isDeleted: false }));
    }

    const results = await Promise.all(checks);

    if (results[0] && data.assetId) throw new DuplicateEntryError('Asset ID');
    if (results[1] && data.serialNumber) throw new DuplicateEntryError('Serial Number');
    if (results[2] && data.tagNumber) throw new DuplicateEntryError('Tag Number');
  }

  async checkDuplicateIdentifiersForUpdate(data, assetId, adminId, currentAsset) {
    const checks = [];

    if (data.assetId && data.assetId !== currentAsset.assetId) {
      checks.push(Asset.findOne({ assetId: data.assetId, adminId: this.toObjectId(adminId), _id: { $ne: this.toObjectId(assetId) }, isDeleted: false }));
    }
    if (data.serialNumber && data.serialNumber !== currentAsset.serialNumber) {
      checks.push(Asset.findOne({ serialNumber: data.serialNumber, adminId: this.toObjectId(adminId), _id: { $ne: this.toObjectId(assetId) }, isDeleted: false }));
    }
    if (data.tagNumber && data.tagNumber !== currentAsset.tagNumber) {
      checks.push(Asset.findOne({ tagNumber: data.tagNumber, adminId: this.toObjectId(adminId), _id: { $ne: this.toObjectId(assetId) }, isDeleted: false }));
    }

    const results = await Promise.all(checks);

    if (results[0] && data.assetId && data.assetId !== currentAsset.assetId) throw new DuplicateEntryError('Asset ID');
    if (results[1] && data.serialNumber && data.serialNumber !== currentAsset.serialNumber) throw new DuplicateEntryError('Serial Number');
    if (results[2] && data.tagNumber && data.tagNumber !== currentAsset.tagNumber) throw new DuplicateEntryError('Tag Number');
  }

  prepareAssetData(data, userRole, userId, adminId, teamMemberId) {
    const preparedData = {
      ...data,
      adminId: this.toObjectId(adminId),
      createdBy: this.toObjectId(userId),
      createdByModel: userRole === 'admin' ? 'Client' : 'Team',
      updatedBy: this.toObjectId(userId),
      updatedByModel: userRole === 'admin' ? 'Client' : 'Team'
    };

    if (userRole === 'team' && teamMemberId) {
      preparedData.teamId = this.toObjectId(teamMemberId);
      if (!data.assignedUsers?.primaryUser) {
        preparedData.assignedUsers = {
          ...data.assignedUsers,
          primaryUser: this.toObjectId(teamMemberId)
        };
      }
    }

    return preparedData;
  }

  prepareUpdateData(data, userRole, userId) {
    const { statusChangeReason, ...updateData } = data;
    return {
      ...updateData,
      updatedBy: this.toObjectId(userId),
      updatedByModel: userRole === 'admin' ? 'Client' : 'Team'
    };
  }

  applyAssetFilters(query, filters) {
    const filterMappings = {
      status: 'status',
      assetCondition: 'assetCondition',
      assetCategory: 'assetCategory',
      currentLocation: 'currentLocation',
      assetId: 'assetId',
      serialNumber: 'serialNumber',
      mheUtilizationStatus: 'mhe.utilizationStatus',
      vehicleType: 'transportation.vehicleType',
      containerType: 'garbageManagement.containerTypeSize',
      pmStatus: 'facilityManagement.pmStatus',
      maintenancePriority: 'facilityManagement.maintenancePriority',
      isClone: 'isClone'
    };

    Object.entries(filterMappings).forEach(([filterKey, dbField]) => {
      if (filters[filterKey]) {
        query[dbField] = filters[filterKey];
      }
    });

    if (filters.search) {
      query.$text = { $search: filters.search };
    }

    if (filters.fromDate) {
      query.createdAt = { ...query.createdAt, $gte: new Date(filters.fromDate) };
    }
    if (filters.toDate) {
      query.createdAt = { ...query.createdAt, $lte: new Date(filters.toDate) };
    }

    if (filters.fillLevelMin || filters.fillLevelMax) {
      query['garbageManagement.smartStatusIoTFillLevel'] = {};
      if (filters.fillLevelMin) {
        query['garbageManagement.smartStatusIoTFillLevel'].$gte = parseInt(filters.fillLevelMin);
      }
      if (filters.fillLevelMax) {
        query['garbageManagement.smartStatusIoTFillLevel'].$lte = parseInt(filters.fillLevelMax);
      }
    }

    if (filters.osPlatform) {
      query['itAssets.osPlatform'] = { $in: [filters.osPlatform] };
    }

    if (filters.warrantyExpiringSoon === 'true') {
      const ninetyDaysFromNow = new Date();
      ninetyDaysFromNow.setDate(ninetyDaysFromNow.getDate() + 90);
      query.$or = [
        { warrantyExpiry: { $lte: ninetyDaysFromNow, $gte: new Date() } },
        { leaseExpiry: { $lte: ninetyDaysFromNow, $gte: new Date() } }
      ];
    }

    if (filters.warrantyExpired === 'true') {
      query.$or = [
        { warrantyExpiry: { $lt: new Date() } },
        { leaseExpiry: { $lt: new Date() } }
      ];
    }

    if (filters.clonedFrom) {
      query.clonedFrom = this.toObjectId(filters.clonedFrom);
    }
  }

  applyRoleAccess(query, userRole, userId, adminId, teamMemberId) {
    if (userRole === 'admin') {
      query.adminId = this.toObjectId(adminId);
    } else if (userRole === 'team') {
      query.$or = [
        { adminId: this.toObjectId(adminId) },
        { teamId: this.toObjectId(teamMemberId) },
        { 'assignedUsers.primaryUser': this.toObjectId(teamMemberId) },
        { 'assignedUsers.secondaryUser': this.toObjectId(teamMemberId) },
        { createdBy: this.toObjectId(teamMemberId), createdByModel: 'Team' }
      ];
    }
  }

  async handleParentChildRelationship(asset, parentAssetId, adminId, session) {
    const parentAsset = await Asset.findById(parentAssetId).session(session);
    if (!parentAsset) {
      throw new NotFoundError('Parent Asset');
    }
    if (parentAsset.adminId.toString() !== adminId) {
      throw new AuthorizationError('Parent asset does not belong to your organization');
    }
    await parentAsset.addChildAsset(asset._id);
  }

  async getPopulatedAsset(assetId) {
    return await Asset.findById(assetId)
      .populate('assignedUsers.primaryUser', 'firstName lastName email')
      .populate('assignedUsers.secondaryUser', 'firstName lastName email')
      .populate('assignedUsers.custodian', 'firstName lastName email')
      .populate('parentAsset', 'assetName assetId tagNumber status')
      .populate('childAssets', 'assetName assetId tagNumber serialNumber assetCategory currentLocation status')
      .populate('clonedFrom', 'assetName assetId')
      .lean();
  }
}

export default new AssetService();