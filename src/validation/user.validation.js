import { body, param, query } from 'express-validator';

const isValidObjectId = (value) => {
  const ObjectId = require('mongoose').Types.ObjectId;
  return ObjectId.isValid(value);
};

// ==================== AUTH VALIDATIONS ====================
export const validateRegistersuper_admin = [
  body('name').notEmpty().withMessage('Name is required').isLength({ min: 2, max: 100 }).trim(),
  body('email').notEmpty().withMessage('Email is required').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required').isLength({ min: 8 }),
  body('phone').optional().isString().trim()
];

export const validateLogin = [
  body('email').notEmpty().isEmail().normalizeEmail(),
  body('password').notEmpty()
];

export const validateChangePassword = [
  body('currentPassword').notEmpty(),
  body('newPassword').notEmpty().isLength({ min: 8 })
];

// ==================== CLIENT VALIDATIONS ====================
export const validateCreateClient = [
  body('customerName').notEmpty().isLength({ max: 100 }).trim(),
  body('email').notEmpty().isEmail().normalizeEmail(),
  body('password').optional().isLength({ min: 6 }),
  body('phone').optional().isString().trim(),
  body('website').optional().isURL(),
  body('membershipPlan').optional().isIn(['free', 'standard', 'premium', 'enterprise']),
  body('duration').optional().isInt({ min: 1, max: 365 }).toInt(),
  body('licenseLimit').optional().isInt({ min: 1, max: 1000 }).toInt(),
  body('autoRenewal').optional().isBoolean()
];

export const validateUpdateClient = [
  param('id').custom(isValidObjectId),
  body('customerName').optional().isLength({ max: 100 }).trim(),
  body('email').optional().isEmail().normalizeEmail(),
  body('membershipPlan').optional().isIn(['free', 'standard', 'premium', 'enterprise']),
  body('extendDays').optional().isInt({ min: 1, max: 365 }).toInt()
];

export const validateClientId = [param('id').custom(isValidObjectId)];
export const validateToggleClientStatus = [param('id').custom(isValidObjectId), body('status').isIn(['active', 'inactive'])];

export const validateListClients = [
  query('status').optional().isIn(['active', 'inactive', 'suspended']),
  query('membershipPlan').optional().isIn(['free', 'standard', 'premium', 'enterprise']),
  query('expiringSoon').optional().isIn(['true', 'false']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
];

// ==================== TEAM VALIDATIONS ====================
export const validateCreateTeamMember = [
  body('firstName').notEmpty().isLength({ max: 50 }).trim(),
  body('lastName').notEmpty().isLength({ max: 50 }).trim(),
  body('email').notEmpty().isEmail().normalizeEmail(),
  body('password').optional().isLength({ min: 6 }),
  body('teamRole').optional().isIn(['inspector', 'senior_inspector', 'lead_inspector', 'junior_inspector', 'supervisor', 'manager'])
];

export const validateUpdateTeamMember = [
  param('id').custom(isValidObjectId),
  body('firstName').optional().isLength({ max: 50 }).trim(),
  body('lastName').optional().isLength({ max: 50 }).trim(),
  body('teamRole').optional().isIn(['inspector', 'senior_inspector', 'lead_inspector', 'junior_inspector', 'supervisor', 'manager']),
  body('status').optional().isIn(['active', 'inactive', 'on_leave']),
  body('performanceScore').optional().isInt({ min: 0, max: 100 }).toInt()
];

export const validateTeamMemberId = [param('id').custom(isValidObjectId)];

export const validateListTeamMembers = [
  query('status').optional().isIn(['active', 'inactive', 'on_leave']),
  query('teamRole').optional().isIn(['inspector', 'senior_inspector', 'lead_inspector', 'junior_inspector', 'supervisor', 'manager']),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt()
];

// ==================== TEAM SELF-SERVICE ====================
export const validateUpdateMyProfile = [
  body('firstName').optional().isLength({ max: 50 }).trim(),
  body('lastName').optional().isLength({ max: 50 }).trim(),
  body('phone').optional().isString().trim(),
  body('bio').optional().isLength({ max: 500 }).trim()
];

export const validateChangeMyPassword = [
  body('currentPassword').notEmpty(),
  body('newPassword').notEmpty().isLength({ min: 8 })
];