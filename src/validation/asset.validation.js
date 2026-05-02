import { body, param, query } from 'express-validator';

export const validateCreateAsset = [
  body('assetName').notEmpty().withMessage('Asset name is required').trim(),
  body('assetCategory').optional().isString(),
  body('serialNumber').optional().trim(),
  body('status').optional().isIn(['Active', 'In Maintenance', 'Retired', 'In Transit', 'Reserved']),
  body('currentLocation').optional().isString(),
  body('purchaseCost').optional().isNumeric(),
  body('parentAsset').optional().isMongoId()
];

export const validateUpdateAsset = [
  param('id').isMongoId().withMessage('Invalid asset ID'),
  body('assetName').optional().trim(),
  body('status').optional().isIn(['Active', 'In Maintenance', 'Retired', 'In Transit', 'Reserved']),
  body('statusChangeReason').optional().trim()
];

export const validateAssetId = [
  param('id').isMongoId().withMessage('Invalid asset ID')
];

export const validateListAssets = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('sortBy').optional().isString(),
  query('sortOrder').optional().isIn(['asc', 'desc']),
  query('status').optional().isString(),
  query('search').optional().trim()
];

export const validateStatusUpdate = [
  param('id').isMongoId(),
  body('status').isIn(['Active', 'In Maintenance', 'Retired', 'In Transit', 'Reserved']).withMessage('Invalid status'),
  body('reason').optional().trim()
];

export const validateCloneAsset = [
  param('id').isMongoId(),
  body('assetName').optional().trim(),
  body('description').optional().trim(),
  body('serialNumber').optional().trim(),
  body('currentLocation').optional().isString(),
  body('status').optional().isIn(['Active', 'In Maintenance', 'Retired', 'In Transit', 'Reserved'])
];

export const validateCreateAssetRequest = [
  body('requestType').isIn(['parent_asset', 'child_asset']),
  body('assetName').notEmpty().trim(),
  body('category').notEmpty().trim(),
  body('location').notEmpty().trim(),
  body('parentAssetId').optional().isMongoId(),
  body('assignedTo').optional().isMongoId(),
  body('priority').optional().isIn(['low', 'medium', 'high', 'critical'])
];

export const validateReviewAssetRequest = [
  param('id').isMongoId(),
  body('action').isIn(['approve', 'reject']),
  body('rejectionReason').optional().trim()
];

export const validateBulkReview = [
  body('requestIds').isArray().notEmpty(),
  body('action').isIn(['approve', 'reject']),
  body('rejectionReason').optional().trim()
];