import AssetService from '../services/asset.service.js';
import { ValidationError } from '../errors/customError.js';
import { sendResponse } from '../utils/response.js';
import { asyncHandler } from '../utils/asyncHandler.js';

class AssetController {

  // ==================== ASSET CRUD OPERATIONS ====================

  createAsset = asyncHandler(async (req, res) => {
    const { userRole, userId, adminId, teamMemberId } = req;
    const asset = await AssetService.createAsset(req.body, userRole, userId, adminId, teamMemberId);
    return sendResponse(res, 201, 'Asset created successfully', asset);
  });

  getAllAssets = asyncHandler(async (req, res) => {
    const { userRole, userId, adminId, teamMemberId } = req;
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc', includeDeleted = 'false', ...filters } = req.query;

    const result = await AssetService.getAllAssets(
      userRole, userId, adminId, teamMemberId,
      filters, parseInt(page), parseInt(limit), sortBy, sortOrder, includeDeleted === 'true'
    );

    return sendResponse(res, 200, 'Assets retrieved successfully', {
      assets: result.assets,
      pagination: result.pagination,
      filters: req.query
    });
  });

  getDeletedAssets = asyncHandler(async (req, res) => {
    const { adminId } = req;
    const { page = 1, limit = 20 } = req.query;
    
    const result = await AssetService.getDeletedAssets(adminId, parseInt(page), parseInt(limit));
    return sendResponse(res, 200, 'Deleted assets retrieved successfully', result);
  });

  getAssetById = asyncHandler(async (req, res) => {
    const { userRole, userId, adminId, teamMemberId } = req;
    const asset = await AssetService.getAssetById(req.params.id, userRole, userId, adminId, teamMemberId);
    return sendResponse(res, 200, 'Asset retrieved successfully', asset);
  });

  updateAsset = asyncHandler(async (req, res) => {
    const { userRole, userId, adminId, teamMemberId } = req;
    const updatedAsset = await AssetService.updateAsset(
      req.params.id, req.body, userRole, userId, adminId, teamMemberId
    );
    return sendResponse(res, 200, 'Asset updated successfully', updatedAsset);
  });

  deleteAsset = asyncHandler(async (req, res) => {
    const { userRole, userId, adminId, teamMemberId } = req;
    const { permanent = false } = req.query;
    
    const result = await AssetService.deleteAsset(
      req.params.id, userRole, userId, adminId, teamMemberId, permanent === 'true'
    );
    
    const message = permanent === 'true' ? 'Asset permanently deleted' : 'Asset moved to trash';
    return sendResponse(res, 200, message, result);
  });

  restoreAsset = asyncHandler(async (req, res) => {
    const { userRole, userId, adminId, teamMemberId } = req;
    const { id } = req.params;
    
    const asset = await AssetService.restoreAsset(id, userRole, userId, adminId, teamMemberId);
    return sendResponse(res, 200, 'Asset restored successfully', asset);
  });

  updateAssetStatus = asyncHandler(async (req, res) => {
    const { userRole, userId, adminId, teamMemberId } = req;
    const { status, reason } = req.body;

    if (!status) {
      throw new ValidationError('Status is required');
    }

    const updatedAsset = await AssetService.updateAsset(
      req.params.id, { status, statusChangeReason: reason }, userRole, userId, adminId, teamMemberId
    );
    return sendResponse(res, 200, 'Asset status updated successfully', updatedAsset);
  });

  // ==================== ASSET IMAGE MANAGEMENT ====================

  addAssetImage = asyncHandler(async (req, res) => {
    const { userRole, userId, adminId, teamMemberId } = req;
    const { id } = req.params;
    
    if (!req.file) {
      throw new ValidationError('No image file provided');
    }
    
    const imageData = {
      name: req.file.originalname,
      url: `/uploads/assets/${req.file.filename}`,
      uploadedAt: new Date().toISOString(),
    };
    
    const image = await AssetService.addAssetImage(id, imageData, userRole, userId, adminId, teamMemberId);
    return sendResponse(res, 201, 'Image added successfully', image);
  });

  addMultipleAssetImages = asyncHandler(async (req, res) => {
    const { userRole, userId, adminId, teamMemberId } = req;
    const { id } = req.params;
    
    if (!req.files || req.files.length === 0) {
      throw new ValidationError('No image files provided');
    }
    
    const uploadedImages = [];
    for (const file of req.files) {
      const imageData = {
        name: file.originalname,
        url: `/uploads/assets/${file.filename}`,
        uploadedAt: new Date().toISOString(),
      };
      const image = await AssetService.addAssetImage(id, imageData, userRole, userId, adminId, teamMemberId);
      uploadedImages.push(image);
    }
    
    return sendResponse(res, 201, `${uploadedImages.length} images added successfully`, uploadedImages);
  });

  removeAssetImage = asyncHandler(async (req, res) => {
    const { userRole, userId, adminId, teamMemberId } = req;
    const { id, imageId } = req.params;
    
    const result = await AssetService.removeAssetImage(id, imageId, userRole, userId, adminId, teamMemberId);
    return sendResponse(res, 200, 'Image removed successfully', result);
  });

  setPrimaryImage = asyncHandler(async (req, res) => {
    const { userRole, userId, adminId, teamMemberId } = req;
    const { id, imageId } = req.params;
    
    const result = await AssetService.setPrimaryImage(id, imageId, userRole, userId, adminId, teamMemberId);
    return sendResponse(res, 200, 'Primary image set successfully', result);
  });

  // ==================== LINK CHILD ASSETS ====================

  linkChildAssets = asyncHandler(async (req, res) => {
    const { userRole, userId, adminId, teamMemberId } = req;
    const { id } = req.params;
    const { childAssetIds } = req.body;
    
    if (!childAssetIds || !Array.isArray(childAssetIds) || childAssetIds.length === 0) {
      throw new ValidationError('childAssetIds array is required with at least one asset ID');
    }
    
    const result = await AssetService.linkChildAssets(
      id, childAssetIds, userRole, userId, adminId, teamMemberId
    );
    
    return sendResponse(res, 200, 'Child assets linked successfully', result);
  });

  unlinkChildAsset = asyncHandler(async (req, res) => {
    const { userRole, userId, adminId, teamMemberId } = req;
    const { id, childId } = req.params;
    
    // Get the asset and remove child
    const asset = await AssetService.getAssetDocumentById(id, userRole, userId, adminId, teamMemberId);
    
    if (!asset.childAssets || !asset.childAssets.includes(childId)) {
      throw new ValidationError('Child asset not found in parent\'s children list');
    }
    
    // Remove child relationship
    await asset.removeChildAsset(childId);
    
    // Also remove parent reference from child asset
    const childAsset = await AssetService.getAssetDocumentById(childId, userRole, userId, adminId, teamMemberId);
    if (childAsset) {
      childAsset.parentAsset = null;
      childAsset.parentChildRelationship = 'standalone';
      childAsset.relationshipMetadata.parentHierarchyLevel = 0;
      await childAsset.save();
    }
    
    return sendResponse(res, 200, 'Child asset unlinked successfully', { 
      parentAssetId: id, 
      unlinkedChildId: childId 
    });
  });

  getChildAssets = asyncHandler(async (req, res) => {
    const { userRole, userId, adminId, teamMemberId } = req;
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    const asset = await AssetService.getAssetById(id, userRole, userId, adminId, teamMemberId);
    
    // Paginate child assets
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedChildren = asset.childAssets?.slice(startIndex, endIndex) || [];
    
    return sendResponse(res, 200, 'Child assets retrieved successfully', {
      childAssets: paginatedChildren,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: asset.childAssets?.length || 0,
        totalPages: Math.ceil((asset.childAssets?.length || 0) / limit)
      }
    });
  });

  // ==================== ASSET REQUEST APPROVAL ====================

  approveAssetRequest = asyncHandler(async (req, res) => {
    const { userRole, user } = req;
    const { requestId } = req.params;
    const actorName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
    const model = userRole === 'admin' ? 'Client' : 'Team';
    
    const result = await AssetService.approveAssetRequest(requestId, user._id, model, actorName);
    return sendResponse(res, 200, 'Asset request approved and asset created successfully', result);
  });

  rejectAssetRequest = asyncHandler(async (req, res) => {
    const { userRole, user } = req;
    const { requestId } = req.params;
    const { rejectionReason } = req.body;
    
    if (!rejectionReason) {
      throw new ValidationError('Rejection reason is required');
    }
    
    const actorName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
    const model = userRole === 'admin' ? 'Client' : 'Team';
    
    const result = await AssetService.rejectAssetRequest(requestId, rejectionReason, user._id, model, actorName);
    return sendResponse(res, 200, 'Asset request rejected successfully', result);
  });

  // ==================== CLONE OPERATIONS ====================

  cloneAsset = asyncHandler(async (req, res) => {
    const { userRole, userId, adminId, teamMemberId } = req;
    const clonedAsset = await AssetService.cloneAsset(
      req.params.id, req.body, userRole, userId, adminId, teamMemberId
    );
    return sendResponse(res, 201, 'Asset cloned successfully', clonedAsset);
  });

  getAssetClones = asyncHandler(async (req, res) => {
    const { userRole, userId, adminId, teamMemberId } = req;
    const { page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    const result = await AssetService.getAssetClones(
      req.params.id, userRole, userId, adminId, teamMemberId,
      parseInt(page), parseInt(limit), sortBy, sortOrder
    );

    return sendResponse(res, 200, 'Asset clones retrieved successfully', {
      clones: result.clones,
      pagination: result.pagination
    });
  });

  getCloneTree = asyncHandler(async (req, res) => {
    const { userRole, userId, adminId, teamMemberId } = req;
    const cloneTree = await AssetService.getCloneTree(req.params.id, userRole, userId, adminId, teamMemberId);
    return sendResponse(res, 200, 'Clone tree retrieved successfully', cloneTree);
  });

  // ==================== BULK OPERATIONS ====================

  bulkDeleteAssets = asyncHandler(async (req, res) => {
    const { userRole, userId, adminId, teamMemberId } = req;
    const { assetIds, permanent = false } = req.body;
    
    if (!assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
      throw new ValidationError('assetIds array is required with at least one asset ID');
    }
    
    const results = {
      successful: [],
      failed: []
    };
    
    for (const assetId of assetIds) {
      try {
        const result = await AssetService.deleteAsset(
          assetId, userRole, userId, adminId, teamMemberId, permanent === 'true'
        );
        results.successful.push({ assetId, result });
      } catch (error) {
        results.failed.push({ assetId, error: error.message });
      }
    }
    
    const message = permanent === 'true' ? 'Bulk permanent deletion completed' : 'Bulk move to trash completed';
    return sendResponse(res, 200, message, results);
  });

  bulkUpdateAssetStatus = asyncHandler(async (req, res) => {
    const { userRole, userId, adminId, teamMemberId } = req;
    const { assetIds, status, reason } = req.body;
    
    if (!assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
      throw new ValidationError('assetIds array is required with at least one asset ID');
    }
    
    if (!status) {
      throw new ValidationError('Status is required');
    }
    
    const results = {
      successful: [],
      failed: []
    };
    
    for (const assetId of assetIds) {
      try {
        const updatedAsset = await AssetService.updateAsset(
          assetId, { status, statusChangeReason: reason }, userRole, userId, adminId, teamMemberId
        );
        results.successful.push({ assetId, status: updatedAsset.status });
      } catch (error) {
        results.failed.push({ assetId, error: error.message });
      }
    }
    
    return sendResponse(res, 200, 'Bulk status update completed', results);
  });

  // ==================== EXPORT/IMPORT OPERATIONS ====================

  exportAssets = asyncHandler(async (req, res) => {
    const { userRole, userId, adminId, teamMemberId } = req;
    const { format = 'json', ...filters } = req.query;
    
    const result = await AssetService.getAllAssets(
      userRole, userId, adminId, teamMemberId,
      filters, 1, 999999, 'createdAt', 'desc', false
    );
    
    if (format === 'csv') {
      // Convert to CSV format
      const csvData = result.assets.map(asset => ({
        assetId: asset.assetId,
        assetName: asset.assetName,
        tagNumber: asset.tagNumber,
        serialNumber: asset.serialNumber,
        assetCategory: asset.assetCategory,
        status: asset.status,
        assetCondition: asset.assetCondition,
        currentLocation: asset.currentLocation,
        purchaseCost: asset.purchaseCost,
        commissioningDate: asset.commissioningDate
      }));
      
      return sendResponse(res, 200, 'Assets exported successfully', {
        count: result.assets.length,
        data: csvData,
        format: 'csv'
      });
    }
    
    return sendResponse(res, 200, 'Assets exported successfully', {
      count: result.assets.length,
      data: result.assets,
      format: 'json'
    });
  });

  // ==================== STATISTICS ====================

  getAssetStatistics = asyncHandler(async (req, res) => {
    const { userRole, userId, adminId, teamMemberId } = req;
    
    const query = AssetService.buildRoleBasedQuery ? 
      Asset.buildRoleBasedQuery(userRole, userId, adminId, false) : 
      { adminId: adminId, isDeleted: false };
    
    const [totalAssets, statusCounts, categoryCounts, conditionCounts] = await Promise.all([
      Asset.countDocuments(query),
      Asset.aggregate([
        { $match: query },
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ]),
      Asset.aggregate([
        { $match: query },
        { $group: { _id: '$assetCategory', count: { $sum: 1 } } }
      ]),
      Asset.aggregate([
        { $match: query },
        { $group: { _id: '$assetCondition', count: { $sum: 1 } } }
      ])
    ]);
    
    return sendResponse(res, 200, 'Asset statistics retrieved successfully', {
      totalAssets,
      byStatus: statusCounts,
      byCategory: categoryCounts,
      byCondition: conditionCounts
    });
  });
}

export default new AssetController();