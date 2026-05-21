import AssetService from '../services/asset.service.js';
import Asset from '../models/asset.model.js';

class AssetController {

  // 1. Add Asset (Admin only)
  addAsset = async (req, res) => {
    try {
      const { userRole, userId, adminId } = req;

      if (userRole !== 'admin') {
        return res.status(403).json({ success: false, error: 'Only admins can add assets directly' });
      }

      const asset = await AssetService.addAsset(req.body, adminId, userId);
      res.status(201).json({ success: true, data: asset });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  };

  // 2. Add Asset Request (Team only)
  addAssetRequest = async (req, res) => {
    try {
      const { userRole, userId, adminId } = req;

      if (userRole !== 'team') {
        return res.status(403).json({ success: false, error: 'Only team members can create asset requests' });
      }

      const assetRequest = await AssetService.addAssetRequest(req.body, userId, adminId);
      res.status(201).json({ success: true, data: assetRequest, message: 'Asset request submitted for approval' });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  };

  // 3. Asset List
  // Admin: sees all assets under their org (own + team-created)
  // Team: sees only their own assets
  getAssetList = async (req, res) => {
    try {
      const { userRole, userId, adminId } = req;
      const { page = 1, limit = 10, ...filters } = req.query;

      const result = await AssetService.getAssetList(
        userRole, adminId, userId, filters, parseInt(page), parseInt(limit)
      );

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  };

  // 4. Asset Details
  getAssetById = async (req, res) => {
    try {
      const { userRole, userId, adminId } = req;
      const { id } = req.params;

      const asset = await AssetService.getAssetById(id, userRole, adminId, userId);
      res.status(200).json({ success: true, data: asset });
    } catch (error) {
      res.status(404).json({ success: false, error: error.message });
    }
  };

  // 5. Edit Asset
  editAsset = async (req, res) => {
    try {
      const { userRole, userId, adminId } = req;
      const { id } = req.params;

      const updatedAsset = await AssetService.editAsset(id, req.body, userRole, adminId, userId);
      res.status(200).json({ success: true, data: updatedAsset });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  };

  // 6. Delete Asset
  deleteAsset = async (req, res) => {
    try {
      const { userRole, userId, adminId } = req;
      const { id } = req.params;
      const { permanent = false } = req.query;

      const result = await AssetService.deleteAsset(id, userRole, adminId, userId, permanent === 'true');
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  };

  // 7. Upload Asset Image
  uploadAssetImage = async (req, res) => {
    try {
      const { userRole, userId, adminId } = req;
      const { id } = req.params;

      if (!req.file) {
        return res.status(400).json({ success: false, error: 'No image file provided' });
      }

      const imageData = {
        name: req.file.originalname,
        filename: req.file.filename,
        url: `http://localhost:9001/uploads/assets/${req.file.filename}`,
        fileSize: req.file.size,
        mimeType: req.file.mimetype
      };

      const image = await AssetService.uploadAssetImage(id, imageData, userRole, adminId, userId);
      res.status(201).json({ success: true, data: image });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  };

  // 8. Link Asset (Parent/Child)
  linkAsset = async (req, res) => {
    try {
      const { userRole, userId, adminId } = req;
      const { id } = req.params;
      const { childAssetIds } = req.body;

      if (!childAssetIds || !Array.isArray(childAssetIds) || childAssetIds.length === 0) {
        return res.status(400).json({ success: false, error: 'childAssetIds array is required' });
      }

      const result = await AssetService.linkAsset(id, childAssetIds, userRole, adminId, userId);
      res.status(200).json({ success: true, ...result });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  };

  // 9. Get Parent Asset Requests
  // Admin: sees all parent requests in their org
  // Team: sees only their own parent requests
  getParentAssetRequests = async (req, res) => {
    try {
      const { userRole, userId, adminId } = req;
      const { page = 1, limit = 10, status, search } = req.query;

      const result = await AssetService.getAssetRequests(
        userRole, adminId, userId, 'parent',
        parseInt(page), parseInt(limit),
        status, search, null
      );

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  };

  // 10. Get Child Asset Requests
  // Admin: sees all child requests in their org
  // Team: sees only their own child requests
  getChildAssetRequests = async (req, res) => {
    try {
      const { userRole, userId, adminId } = req;
      const { page = 1, limit = 10, status, search, parentAssetId } = req.query;

      const result = await AssetService.getAssetRequests(
        userRole, adminId, userId, 'child',
        parseInt(page), parseInt(limit),
        status, search, parentAssetId
      );

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  };

  // 11. Get My Requests (Team members see only their own requests, both parent and child)
  getMyRequests = async (req, res) => {
    try {
      const { userRole, userId, adminId } = req;

      if (userRole !== 'team') {
        return res.status(403).json({ success: false, error: 'Only team members can access this endpoint' });
      }

      const { page = 1, limit = 10, status, requestType } = req.query;

      let query = {
        isRequest: true,
        isDeleted: false,
        adminId: AssetService.toObjectId(adminId),
        createdBy: AssetService.toObjectId(userId),
        createdByModel: 'Team'
      };

      if (status && status !== 'all') {
        query.requestStatus = status;
      }

      if (requestType && ['parent', 'child'].includes(requestType)) {
        query.requestType = requestType;
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [requests, total] = await Promise.all([
        Asset.find(query)
          .populate('parentAsset', 'assetName assetId')
          .populate('approvedBy', 'firstName lastName email')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Asset.countDocuments(query)
      ]);

      res.status(200).json({
        success: true,
        requests,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / parseInt(limit))
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  };

  // 12. Process Asset Request (Approve/Reject — Admin only)
  processAssetRequest = async (req, res) => {
    try {
      const { userRole, adminId } = req;
      const { requestId } = req.params;
      const { action, rejectionReason } = req.body;

      if (userRole !== 'admin') {
        return res.status(403).json({ success: false, error: 'Only admins can process asset requests' });
      }

      if (!action || !['approve', 'reject'].includes(action)) {
        return res.status(400).json({ success: false, error: 'Action must be either "approve" or "reject"' });
      }

      // Calls approveAssetRequest (the correct service method name)
      const result = await AssetService.approveAssetRequest(requestId, adminId, action, rejectionReason);
      res.status(200).json({ success: true, data: result, message: `Request ${action}d successfully` });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  };

  // 13. Clone Asset
  cloneAsset = async (req, res) => {
    try {
      const { userRole, userId, adminId } = req;
      const { id } = req.params;

      const clonedAsset = await AssetService.cloneAsset(id, req.body, userRole, adminId, userId);
      res.status(201).json({ success: true, data: clonedAsset, message: 'Asset cloned successfully' });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  };

  // 14. Get Clone List
  getCloneList = async (req, res) => {
    try {
      const { userRole, userId, adminId } = req;
      const { id } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const result = await AssetService.getCloneList(
        id, userRole, adminId, userId, parseInt(page), parseInt(limit)
      );

      res.status(200).json({ success: true, ...result });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  };

  // 15. Update Asset Status
  updateAssetStatus = async (req, res) => {
    try {
      const { userRole, userId, adminId } = req;
      const { id } = req.params;
      const { status, reason } = req.body;

      if (!status) {
        return res.status(400).json({ success: false, error: 'Status is required' });
      }

      const updatedAsset = await AssetService.updateAssetStatus(id, status, reason, userRole, adminId, userId);
      res.status(200).json({ success: true, data: updatedAsset });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  };

}

export default new AssetController();