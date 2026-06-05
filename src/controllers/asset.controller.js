import AssetService from '../services/asset.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.js';

class AssetController {
  /**
   * Get asset list with filters and pagination
   * GET /api/assets
   * 
   * Role: Admin, Team
   * - Admin: Gets all assets under their organization (adminId = user._id)
   * - Team: Gets assets under their parent admin where they are assigned or created
   */
  getAssetList = asyncHandler(async (req, res) => {
    const { user, query } = req;

    // Determine adminId based on role
    const adminId = user.role === 'admin' ? user._id : user.adminId;

    const result = await AssetService.getAssets(
      query,           // query params
      user._id,        // userId - who is making the request
      user.role,       // role - admin or team
      adminId          // adminId - scoping anchor for the query
    );

    return sendResponse(res, 200, 'Assets fetched successfully', result);
  });

  /**
   * Get single asset by ID
   * GET /api/assets/:id
   * 
   * Role: Admin, Team
   * - Admin: Can view any asset under their organization
   * - Team: Can only view assets they are assigned to or created
   */
  getAssetById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { user } = req;

    const adminId = user.role === 'admin' ? user._id : user.adminId;

    const asset = await AssetService.getAssetById(
      id,          // asset ID
      user.role,   // role
      adminId,     // admin ID for scoping
      user._id     // user ID for team access check
    );

    return sendResponse(res, 200, 'Asset fetched successfully', asset);
  });

  /**
   * Create new asset
   * POST /api/assets/add
   * 
   * Role: Admin, Team
   * - Admin: Creates asset under their organization (adminId = user._id)
   * - Team: Creates asset under their parent admin (adminId = user.adminId)
   */
  addAsset = asyncHandler(async (req, res) => {
    const { user, body, ip, headers } = req;

    // Determine adminId based on role
    const adminId = user.role === 'admin' ? user._id : user.adminId;

    const asset = await AssetService.addAsset(
      body,                    // asset data
      adminId,                 // admin ID
      user._id,                // user ID
      user.role,               // role
      { ip, headers: { 'user-agent': headers['user-agent'] } }  // request info for audit
    );

    return sendResponse(res, 201, 'Asset created successfully', asset);
  });

  /**
   * Update existing asset
   * PUT /api/assets/:id
   * 
   * Role: Admin, Team (with restrictions)
   * - Admin: Can update any asset under their organization
   * - Team: Can update assets but cannot modify identity fields (assetId, tagNumber, etc.)
   */
  editAsset = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { user, body } = req;

    const adminId = user.role === 'admin' ? user._id : user.adminId;

    const asset = await AssetService.updateAsset(
      id,          // asset ID
      body,        // update data
      user._id,    // user ID
      user.role,   // role
      adminId      // admin ID for team permission check
    );

    return sendResponse(res, 200, 'Asset updated successfully', asset);
  });

  /**
   * Soft delete asset
   * DELETE /api/assets/:id
   * 
   * Role: Admin Only
   * - Only admins can delete assets from their organization
   */
  deleteAsset = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { user, body } = req;

    // adminId is not needed for delete as only admins can delete
    const result = await AssetService.deleteAsset(
      id,                      // asset ID
      user._id,                // user ID
      user.role,               // role (must be 'admin')
      user.adminId,            // adminId (null for admin)
      body.reason || ''        // deletion reason
    );

    return sendResponse(res, 200, result.message, result);
  });

  /**
   * Update asset status
   * PATCH /api/assets/:id/status
   * 
   * Role: Admin, Team
   * - Both roles can update status but with proper authorization
   */
  updateAssetStatus = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { user, body } = req;
    const { status, reason } = body;

    const adminId = user.role === 'admin' ? user._id : user.adminId;

    const asset = await AssetService.updateAssetStatus(
      id,          // asset ID
      status,      // new status
      reason,      // reason for status change
      user._id,    // user ID
      user.role,   // role
      adminId      // admin ID for permission check
    );

    return sendResponse(res, 200, 'Asset status updated successfully', asset);
  });

  /**
   * Clone asset
   * POST /api/assets/:id/clone
   * 
   * Role: Admin, Team
   * - Both roles can clone assets with proper authorization
   * - Cloned asset inherits adminId from original or uses role-based adminId
   */
  cloneAsset = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { user, body, ip, headers } = req;

    const adminId = user.role === 'admin' ? user._id : user.adminId;

    const clonedAsset = await AssetService.cloneAsset(
      id,                      // original asset ID
      body,                    // clone customization data
      user._id,                // user ID
      user.role,               // role
      adminId,                 // admin ID for permission check
      { ip, headers: { 'user-agent': headers['user-agent'] } }  // request info for audit
    );

    return sendResponse(res, 201, 'Asset cloned successfully', clonedAsset);
  });

  /**
   * Get clone list
   * GET /api/assets/clones
   * 
   * Role: Admin, Team
   * - Admin: Gets all clones under their organization
   * - Team: Gets clones under their parent admin where they are associated
   */
  getCloneList = asyncHandler(async (req, res) => {
    const { user, query } = req;

    const adminId = user.role === 'admin' ? user._id : user.adminId;

    const result = await AssetService.getAllClonesWithFilters(
      user._id,                // user ID
      user.role,               // role
      adminId,                 // admin ID for scoping
      {
        page: query.page,
        limit: query.limit,
        search: query.search,
        status: query.status,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        originalAssetId: query.originalAssetId
      }
    );

    return sendResponse(res, 200, 'Clones retrieved successfully', result);
  });
}

export default new AssetController();