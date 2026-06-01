// src/controllers/asset.controller.js
import AssetService from '../services/asset.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.js';

class AssetController {
  /**
   * Get asset list with filters and pagination
   * GET /api/assets
   */
  getAssetList = asyncHandler(async (req, res) => {
    const { user, query } = req;

    // For admin: user._id is the admin ID
    // For team: user.adminId is the admin they belong to
    const adminId = user.role === 'admin' ? user._id : user.adminId;

    const result = await AssetService.getAssets(
      query,
      user._id,      // Current user's ID
      user.role,     // User role (admin/team)
      adminId        // Admin ID (for team members, this is their parent admin)
    );

    return sendResponse(res, 200, 'Assets fetched successfully', result);
  });

  /**
   * Get single asset by ID
   * GET /api/assets/:id
   */
  getAssetById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { user } = req;

    const adminId = user.role === 'admin' ? user._id : user.adminId;

    const asset = await AssetService.getAssetById(
      id,
      user.role,
      adminId,
      user._id
    );

    return sendResponse(res, 200, 'Asset fetched successfully', asset);
  });

  /**
   * Create new asset
   * POST /api/assets/add
   */
  addAsset = asyncHandler(async (req, res) => {
    const { user, body, ip, headers } = req;

    // Determine adminId based on user role
    let adminId;
    if (user.role === 'admin') {
      adminId = user._id;  // Admin creates asset for themselves
    } else if (user.role === 'team') {
      adminId = user.adminId;  // Team creates asset for their admin
    }

    const asset = await AssetService.addAsset(
      body,
      adminId,
      user._id,
      user.role,
      { ip, headers: { 'user-agent': headers['user-agent'] } }
    );

    return sendResponse(res, 201, 'Asset created successfully', asset);
  });

  /**
   * Update existing asset
   * PUT /api/assets/:id
   */
  editAsset = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { user, body } = req;

    const adminId = user.role === 'admin' ? user._id : user.adminId;

    const asset = await AssetService.updateAsset(
      id,
      body,
      user._id,
      user.role,
      adminId
    );

    return sendResponse(res, 200, 'Asset updated successfully', asset);
  });

  /**
   * Delete asset (soft delete)
   * DELETE /api/assets/:id
   */
  deleteAsset = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { user, body } = req;

    const result = await AssetService.deleteAsset(
      id,
      user._id,
      user.role,
      user.adminId,
      body.reason || ''
    );

    return sendResponse(res, 200, result.message, result);
  });

  /**
   * Update asset status
   * PATCH /api/assets/:id/status
   */
  updateAssetStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { user, body } = req;
    const { status, reason } = body;

    const adminId = user.role === 'admin' ? user._id : user.adminId;

    const asset = await AssetService.updateAssetStatus(
      id,
      status,
      reason,
      user._id,
      user.role,
      adminId
    );

    return sendResponse(res, 200, 'Asset status updated successfully', asset);
  });

  /**
   * Clone asset
   * POST /api/assets/:id/clone
   */
  cloneAsset = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { user, body, ip, headers } = req;

    const adminId = user.role === 'admin' ? user._id : user.adminId;

    const clonedAsset = await AssetService.cloneAsset(
      id,
      body,
      user._id,
      user.role,
      adminId,
      { ip, headers: { 'user-agent': headers['user-agent'] } }
    );

    return sendResponse(res, 201, 'Asset cloned successfully', clonedAsset);
  });

  /**
   * Get clone list for an asset
   * GET /api/assets/:id/clones
   */
  getCloneList = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { user } = req;

    const adminId = user.role === 'admin' ? user._id : user.adminId;

    const result = await AssetService.getCloneList(
      id,
      user._id,
      user.role,
      adminId
    );

    return sendResponse(res, 200, 'Clone list fetched successfully', result);
  });
}

export default new AssetController();