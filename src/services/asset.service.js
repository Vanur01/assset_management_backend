import Asset from '../models/asset.model.js';
import mongoose from 'mongoose';

class AssetService {

  toObjectId(id) {
    if (!id) return null;
    if (id instanceof mongoose.Types.ObjectId) return id;
    if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
      return new mongoose.Types.ObjectId(id);
    }
    return null;
  }

  // ==================== 1. ADD ASSET (Admin only) ====================
  async addAsset(assetData, adminId, userId) {
    try {
      const existingAsset = await Asset.findOne({
        adminId: this.toObjectId(adminId),
        $or: [
          { assetId: assetData.assetId },
          { serialNumber: assetData.serialNumber },
          { tagNumber: assetData.tagNumber }
        ],
        isDeleted: false
      });

      if (existingAsset) {
        throw new Error('Asset ID, Serial Number, or Tag Number already exists');
      }

      if (!assetData.assetId) {
        assetData.assetId = `AST-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      }
      if (!assetData.tagNumber) {
        assetData.tagNumber = `TAG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      }

      const asset = new Asset({
        ...assetData,
        adminId: this.toObjectId(adminId),
        createdBy: this.toObjectId(userId),
        createdByModel: 'Client',
        isRequest: false,
        requestStatus: null,
        status: assetData.status || 'Active',
        canBeCloned: true
      });

      await asset.save();
      return await this.getAssetById(asset._id, 'admin', adminId, userId);
    } catch (error) {
      throw error;
    }
  }

  // ==================== 2. ADD ASSET REQUEST (Team only) ====================
  async addAssetRequest(assetData, teamId, adminId) {
    try {
      const assetId = `REQ-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const tagNumber = `TAG-REQ-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

      const assetRequest = new Asset({
        ...assetData,
        assetId,
        tagNumber,
        adminId: this.toObjectId(adminId),
        teamId: this.toObjectId(teamId),
        createdBy: this.toObjectId(teamId),
        createdByModel: 'Team',
        isRequest: true,
        requestStatus: 'pending',
        status: 'Pending Approval',
        requestType: assetData.parentAsset ? 'child' : 'parent',
        parentRequestId: assetData.parentAsset ? this.toObjectId(assetData.parentAsset) : null,
        canBeCloned: false
      });

      await assetRequest.save();
      return assetRequest;
    } catch (error) {
      throw error;
    }
  }

  // ==================== 3. ASSET LIST ====================
  // Admin: sees all assets under their adminId (own + team-created)
  // Team: sees only their own created assets
  async getAssetList(userRole, adminId, teamId, filters = {}, page = 1, limit = 10) {
    try {
      let query = { isDeleted: false };

      if (userRole === 'admin') {
        // Admin sees everything under their adminId (includes team-created assets)
        query.adminId = this.toObjectId(adminId);
      } else if (userRole === 'team') {
        // Team sees only what they created
        query.adminId = this.toObjectId(adminId);
        query.createdBy = this.toObjectId(teamId);
        query.createdByModel = 'Team';
      }

      if (filters.status) query.status = filters.status;
      if (filters.requestStatus) query.requestStatus = filters.requestStatus;
      if (filters.isRequest !== undefined) query.isRequest = filters.isRequest === 'true';
      if (filters.assetCategory) query.assetCategory = filters.assetCategory;
      if (filters.isClone !== undefined) query.isClone = filters.isClone === 'true';
      if (filters.assetCondition) query.assetCondition = filters.assetCondition;
      if (filters.currentLocation) query.currentLocation = filters.currentLocation;
      if (filters.vehicleType) query['transportation.vehicleType'] = filters.vehicleType;
      if (filters.mheStatus) query['mhe.utilizationStatus'] = filters.mheStatus;
      if (filters.containerType) query['garbageManagement.containerTypeSize'] = filters.containerType;
      if (filters.pmStatus) query['facilityManagement.pmStatus'] = filters.pmStatus;

      if (filters.search) {
        query.$or = [
          { assetName: { $regex: filters.search, $options: 'i' } },
          { assetId: { $regex: filters.search, $options: 'i' } },
          { serialNumber: { $regex: filters.search, $options: 'i' } },
          { tagNumber: { $regex: filters.search, $options: 'i' } }
        ];
      }

      if (filters.fromDate) {
        query.createdAt = { ...query.createdAt, $gte: new Date(filters.fromDate) };
      }
      if (filters.toDate) {
        query.createdAt = { ...query.createdAt, $lte: new Date(filters.toDate) };
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

      const skip = (page - 1) * limit;
      const sortOptions = { createdAt: -1 };

      const [assets, total] = await Promise.all([
        Asset.find(query)
          .populate('createdBy', 'firstName lastName email name customerName')
          .populate('parentAsset', 'assetName assetId status')
          .populate('childAssets', 'assetName assetId status')
          .populate('clonedFrom', 'assetName assetId')
          .populate('assignedUsers.primaryUser', 'firstName lastName email')
          .populate('assignedUsers.secondaryUser', 'firstName lastName email')
          .populate('assignedUsers.custodian', 'firstName lastName email')
          .populate('transportation.driverId', 'firstName lastName email')
          .sort(sortOptions)
          .skip(skip)
          .limit(limit)
          .lean(),
        Asset.countDocuments(query)
      ]);

      return {
        assets,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      throw error;
    }
  }

  // ==================== 4. ASSET DETAILS ====================
  async getAssetById(assetId, userRole, adminId, teamId) {
    try {
      let query = { _id: this.toObjectId(assetId), isDeleted: false };

      if (userRole === 'admin') {
        query.adminId = this.toObjectId(adminId);
      } else if (userRole === 'team') {
        query.adminId = this.toObjectId(adminId);
        query.createdBy = this.toObjectId(teamId);
        query.createdByModel = 'Team';
      }

      const asset = await Asset.findOne(query)
        .populate('createdBy', 'firstName lastName email name customerName')
        .populate('parentAsset', 'assetName assetId status')
        .populate('childAssets', 'assetName assetId status')
        .populate('clonedFrom', 'assetName assetId')
        .populate('assignedUsers.primaryUser', 'firstName lastName email')
        .populate('assignedUsers.secondaryUser', 'firstName lastName email')
        .populate('assignedUsers.custodian', 'firstName lastName email')
        .populate('transportation.driverId', 'firstName lastName email')
        .lean();

      if (!asset) {
        throw new Error('Asset not found');
      }

      return asset;
    } catch (error) {
      throw error;
    }
  }

  // ==================== 5. EDIT ASSET ====================
  async editAsset(assetId, updateData, userRole, adminId, teamId) {
    try {
      let query = { _id: this.toObjectId(assetId), isDeleted: false };

      if (userRole === 'admin') {
        query.adminId = this.toObjectId(adminId);
      } else if (userRole === 'team') {
        query.adminId = this.toObjectId(adminId);
        query.createdBy = this.toObjectId(teamId);
        query.createdByModel = 'Team';
        query.requestStatus = 'pending';
      }

      const asset = await Asset.findOne(query);
      if (!asset) {
        throw new Error('Asset not found or unauthorized');
      }

      const allowedFields = [
        'assetName', 'description', 'assetCategory', 'customAssetCategory',
        'currentLocation', 'customPhysicalAddress', 'manufacturer', 'model',
        'type', 'powerSource', 'weightCapacity', 'dimensions', 'status',
        'assetCondition', 'assignedUsers', 'mhe', 'transportation',
        'rotatingMachinery', 'garbageManagement', 'itAssets', 'facilityManagement'
      ];

      if (userRole === 'team') {
        Object.keys(updateData).forEach(key => {
          if (allowedFields.includes(key)) {
            asset[key] = updateData[key];
          }
        });
      } else {
        const restrictedFields = ['isRequest', 'requestStatus', 'approvedBy', 'approvedAt', 'rejectionReason', 'isClone', 'clonedFrom', 'canBeCloned'];
        Object.keys(updateData).forEach(key => {
          if (!restrictedFields.includes(key)) {
            asset[key] = updateData[key];
          }
        });
      }

      await asset.save();
      return await this.getAssetById(assetId, userRole, adminId, teamId);
    } catch (error) {
      throw error;
    }
  }

  // ==================== 6. DELETE ASSET ====================
  async deleteAsset(assetId, userRole, adminId, teamId, permanent = false) {
    try {
      let query = { _id: this.toObjectId(assetId) };

      if (userRole === 'admin') {
        query.adminId = this.toObjectId(adminId);
      } else if (userRole === 'team') {
        query.adminId = this.toObjectId(adminId);
        query.createdBy = this.toObjectId(teamId);
        query.createdByModel = 'Team';
        query.requestStatus = 'pending';
      }

      const asset = await Asset.findOne(query);
      if (!asset) {
        throw new Error('Asset not found or unauthorized');
      }

      if (asset.childAssets && asset.childAssets.length > 0) {
        throw new Error('Cannot delete asset with child assets. Remove child assets first.');
      }

      if (permanent && userRole === 'admin') {
        if (asset.parentAsset) {
          await Asset.findByIdAndUpdate(asset.parentAsset, {
            $pull: { childAssets: asset._id }
          });
        }
        await Asset.findByIdAndDelete(assetId);
        return { message: 'Asset permanently deleted', assetId };
      } else {
        asset.isDeleted = true;
        asset.deletedAt = new Date();
        asset.deletedBy = this.toObjectId(userRole === 'admin' ? adminId : teamId);
        await asset.save();
        return { message: 'Asset moved to trash', assetId };
      }
    } catch (error) {
      throw error;
    }
  }

  // ==================== 7. UPLOAD ASSET IMAGE ====================
  async uploadAssetImage(assetId, imageData, userRole, adminId, teamId) {
    try {
      let query = { _id: this.toObjectId(assetId), isDeleted: false };

      if (userRole === 'admin') {
        query.adminId = this.toObjectId(adminId);
      } else if (userRole === 'team') {
        query.adminId = this.toObjectId(adminId);
        query.createdBy = this.toObjectId(teamId);
        query.createdByModel = 'Team';
      }

      const asset = await Asset.findOne(query);
      if (!asset) {
        throw new Error('Asset not found or unauthorized');
      }

      const newImage = {
        ...imageData,
        uploadedBy: this.toObjectId(userRole === 'admin' ? adminId : teamId),
        uploadedByModel: userRole === 'admin' ? 'Client' : 'Team',
        uploadedAt: new Date(),
        isPrimary: asset.assetImages.length === 0
      };

      asset.assetImages.push(newImage);
      await asset.save();

      return newImage;
    } catch (error) {
      throw error;
    }
  }

  // ==================== 8. LINK ASSET (Parent/Child) ====================
  async linkAsset(parentAssetId, childAssetIds, userRole, adminId, teamId) {
    try {
      let parentQuery = { _id: this.toObjectId(parentAssetId), isDeleted: false };
      let childQuery = { isDeleted: false };

      if (userRole === 'admin') {
        parentQuery.adminId = this.toObjectId(adminId);
        childQuery.adminId = this.toObjectId(adminId);
      } else if (userRole === 'team') {
        parentQuery.adminId = this.toObjectId(adminId);
        parentQuery.createdBy = this.toObjectId(teamId);
        parentQuery.createdByModel = 'Team';
        childQuery.adminId = this.toObjectId(adminId);
        childQuery.createdBy = this.toObjectId(teamId);
        childQuery.createdByModel = 'Team';
      }

      const parentAsset = await Asset.findOne(parentQuery);
      if (!parentAsset) {
        throw new Error('Parent asset not found or unauthorized');
      }

      if (parentAsset.parentAsset) {
        throw new Error('Cannot link child assets to an asset that is already a child');
      }

      const linkedAssets = [];
      const errors = [];

      for (const childId of childAssetIds) {
        try {
          const childAsset = await Asset.findOne({ ...childQuery, _id: this.toObjectId(childId) });

          if (!childAsset) {
            errors.push({ childId, error: 'Asset not found' });
            continue;
          }

          if (childAsset.parentAsset) {
            errors.push({ childId, error: 'Asset already has a parent' });
            continue;
          }

          if (childAsset._id.toString() === parentAsset._id.toString()) {
            errors.push({ childId, error: 'Cannot link asset to itself' });
            continue;
          }

          childAsset.parentAsset = parentAsset._id;
          childAsset.parentChildRelationship = 'child';
          await childAsset.save();

          if (!parentAsset.childAssets.includes(childAsset._id)) {
            parentAsset.childAssets.push(childAsset._id);
          }

          linkedAssets.push({
            _id: childAsset._id,
            assetName: childAsset.assetName,
            assetId: childAsset.assetId
          });
        } catch (err) {
          errors.push({ childId, error: err.message });
        }
      }

      if (parentAsset.childAssets.length > 0) {
        parentAsset.parentChildRelationship = 'parent';
        await parentAsset.save();
      }

      return {
        parentAsset: {
          _id: parentAsset._id,
          assetName: parentAsset.assetName,
          assetId: parentAsset.assetId
        },
        linkedAssets,
        errors,
        summary: {
          totalRequested: childAssetIds.length,
          successfullyLinked: linkedAssets.length,
          failed: errors.length
        }
      };
    } catch (error) {
      throw error;
    }
  }

  // ==================== 9 & 10. ASSET REQUEST LISTS (parent / child) ====================
  // Admin: sees all requests under their adminId
  // Team: sees only their own requests
  async getAssetRequests(userRole, adminId, teamId, requestType, page = 1, limit = 10, status = null, search = null, parentAssetId = null) {
    try {
      let query = {
        isRequest: true,
        isDeleted: false,
        adminId: this.toObjectId(adminId)
      };

      // Filter by request type
      if (requestType === 'parent') {
        query.requestType = 'parent';
        query.parentAsset = null;
      } else if (requestType === 'child') {
        query.requestType = 'child';
        query.parentAsset = { $ne: null };
      }

      // Role-based scoping: team sees only their own requests
      if (userRole === 'team') {
        query.createdBy = this.toObjectId(teamId);
        query.createdByModel = 'Team';
      }

      // Optional filters
      if (status && status !== 'all') {
        query.requestStatus = status;
      }

      if (parentAssetId) {
        query.parentRequestId = this.toObjectId(parentAssetId);
      }

      if (search) {
        query.$or = [
          { assetName: { $regex: search, $options: 'i' } },
          { assetId: { $regex: search, $options: 'i' } },
          { serialNumber: { $regex: search, $options: 'i' } },
          { tagNumber: { $regex: search, $options: 'i' } }
        ];
      }

      const skip = (page - 1) * limit;
      const sortOptions = { createdAt: -1 };

      const [requests, total] = await Promise.all([
        Asset.find(query)
          .populate('createdBy', 'firstName lastName email name')
          .populate('parentAsset', 'assetName assetId')
          .populate('approvedBy', 'firstName lastName email name')
          .sort(sortOptions)
          .skip(skip)
          .limit(limit)
          .lean(),
        Asset.countDocuments(query)
      ]);

      return {
        requests,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      throw error;
    }
  }

  // ==================== 11. APPROVE/REJECT ASSET REQUEST ====================
  async approveAssetRequest(requestId, adminId, action, rejectionReason = null) {
    try {
      const request = await Asset.findOne({
        _id: this.toObjectId(requestId),
        adminId: this.toObjectId(adminId),
        isRequest: true,
        isDeleted: false
      });

      if (!request) {
        throw new Error('Asset request not found');
      }

      if (request.requestStatus !== 'pending') {
        throw new Error(`Cannot ${action} a request that is already ${request.requestStatus}`);
      }

      if (action === 'approve') {
        request.requestStatus = 'approved';
        request.approvedBy = this.toObjectId(adminId);
        request.approvedAt = new Date();
        request.status = 'Active';
        request.isRequest = false;
        request.canBeCloned = true;
      } else if (action === 'reject') {
        if (!rejectionReason) {
          throw new Error('Rejection reason is required');
        }
        request.requestStatus = 'rejected';
        request.rejectionReason = rejectionReason;
        request.status = 'Rejected';
        request.canBeCloned = false;
      }

      await request.save();

      if (action === 'approve' && request.requestType === 'child' && request.parentRequestId) {
        const parentAsset = await Asset.findOne({
          _id: request.parentRequestId,
          adminId: this.toObjectId(adminId)
        });

        if (parentAsset) {
          if (!parentAsset.childAssets.includes(request._id)) {
            parentAsset.childAssets.push(request._id);
          }
          parentAsset.parentChildRelationship = 'parent';
          await parentAsset.save();

          request.parentAsset = parentAsset._id;
          await request.save();
        }
      }

      return request;
    } catch (error) {
      throw error;
    }
  }

  // ==================== 12. CLONE ASSET ====================
  async cloneAsset(assetId, cloneData, userRole, adminId, teamId) {
    try {
      let query = { _id: this.toObjectId(assetId), isDeleted: false };

      if (userRole === 'admin') {
        query.adminId = this.toObjectId(adminId);
      } else if (userRole === 'team') {
        query.adminId = this.toObjectId(adminId);
        query.createdBy = this.toObjectId(teamId);
        query.createdByModel = 'Team';
      }

      const originalAsset = await Asset.findOne(query);
      if (!originalAsset) {
        throw new Error('Asset not found or unauthorized');
      }

      if (!originalAsset.canBeCloned) {
        throw new Error('This asset cannot be cloned');
      }

      if (originalAsset.isClone) {
        throw new Error('Cannot clone an asset that is already a clone');
      }

      const newAssetId = cloneData.assetId || `AST-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const newTagNumber = cloneData.tagNumber || `TAG-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

      const existingAsset = await Asset.findOne({
        adminId: this.toObjectId(adminId),
        $or: [
          { assetId: newAssetId },
          { tagNumber: newTagNumber }
        ],
        isDeleted: false
      });

      if (existingAsset) {
        throw new Error('Asset ID or Tag Number already exists');
      }

      const clonedAssetData = {
        ...originalAsset.toObject(),
        _id: undefined,
        __v: undefined,
        assetId: newAssetId,
        tagNumber: newTagNumber,
        assetName: cloneData.assetName || `${originalAsset.assetName} (Clone)`,
        description: cloneData.description || originalAsset.description,
        isClone: true,
        clonedFrom: originalAsset._id,
        cloneVersion: (originalAsset.cloneVersion || 1) + 1,
        canBeCloned: false,
        isRequest: false,
        requestStatus: null,
        requestType: null,
        parentRequestId: null,
        rejectionReason: null,
        approvedBy: null,
        approvedAt: null,
        status: cloneData.status || 'Active',
        parentAsset: null,
        childAssets: [],
        parentChildRelationship: 'standalone',
        assetImages: originalAsset.assetImages.map(img => ({
          ...img.toObject(),
          _id: undefined
        })),
        createdBy: this.toObjectId(userRole === 'admin' ? adminId : teamId),
        createdByModel: userRole === 'admin' ? 'Client' : 'Team',
        adminId: this.toObjectId(adminId),
        teamId: userRole === 'team' ? this.toObjectId(teamId) : null,
        ...cloneData
      };

      const clonedAsset = new Asset(clonedAssetData);
      await clonedAsset.save();

      originalAsset.canBeCloned = false;
      await originalAsset.save();

      return await this.getAssetById(clonedAsset._id, userRole, adminId, teamId);
    } catch (error) {
      throw error;
    }
  }

  // ==================== 13. GET CLONE LIST ====================
  async getCloneList(assetId, userRole, adminId, teamId, page = 1, limit = 10) {
    try {
      let query = {
        clonedFrom: this.toObjectId(assetId),
        isDeleted: false,
        adminId: this.toObjectId(adminId)
      };

      if (userRole === 'team') {
        query.createdBy = this.toObjectId(teamId);
        query.createdByModel = 'Team';
      }

      const skip = (page - 1) * limit;
      const sortOptions = { createdAt: -1 };

      const [clones, total] = await Promise.all([
        Asset.find(query)
          .populate('createdBy', 'firstName lastName email name')
          .populate('clonedFrom', 'assetName assetId')
          .sort(sortOptions)
          .skip(skip)
          .limit(limit)
          .lean(),
        Asset.countDocuments(query)
      ]);

      return {
        clones,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      throw error;
    }
  }

  // ==================== 14. UPDATE ASSET STATUS ====================
  async updateAssetStatus(assetId, status, reason, userRole, adminId, teamId) {
    try {
      let query = { _id: this.toObjectId(assetId), isDeleted: false };

      if (userRole === 'admin') {
        query.adminId = this.toObjectId(adminId);
      } else if (userRole === 'team') {
        query.adminId = this.toObjectId(adminId);
        query.createdBy = this.toObjectId(teamId);
        query.createdByModel = 'Team';
      }

      const asset = await Asset.findOne(query);
      if (!asset) {
        throw new Error('Asset not found or unauthorized');
      }

      asset.status = status;
      if (!asset.statusHistory) asset.statusHistory = [];
      asset.statusHistory.push({
        status,
        changedAt: new Date(),
        changedBy: this.toObjectId(userRole === 'admin' ? adminId : teamId),
        reason: reason || 'Status updated'
      });

      await asset.save();
      return await this.getAssetById(assetId, userRole, adminId, teamId);
    } catch (error) {
      throw error;
    }
  }

}

export default new AssetService();