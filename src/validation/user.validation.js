import { body, param, query, validationResult } from 'express-validator';

// ==================== HELPER FUNCTION ====================
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

// ==================== AUTH VALIDATIONS ====================

export const validateRegisterSuperAdmin = [
  body('name')
    .notEmpty().withMessage('Name is required')
    .isString().withMessage('Name must be a string')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters')
    .trim(),
  
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  
  body('phone')
    .optional()
    .isString().withMessage('Phone must be a string')
    .matches(/^[0-9+\-\s()]{10,20}$/).withMessage('Please provide a valid phone number'),
  
  handleValidationErrors
];

export const validateLogin = [
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('password')
    .notEmpty().withMessage('Password is required'),
  
  handleValidationErrors
];

export const validateChangePassword = [
  body('currentPassword')
    .notEmpty().withMessage('Current password is required'),
  
  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  
  body('confirmPassword')
    .notEmpty().withMessage('Please confirm your new password')
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage('Passwords do not match'),
  
  handleValidationErrors
];

export const validateForgotPassword = [
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  handleValidationErrors
];

export const validateResetPassword = [
  body('token')
    .notEmpty().withMessage('Reset token is required'),
  
  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
  
  body('confirmPassword')
    .notEmpty().withMessage('Please confirm your new password')
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage('Passwords do not match'),
  
  handleValidationErrors
];

// ==================== CLIENT VALIDATIONS ====================

export const validateCreateClient = [
  body('customerName')
    .notEmpty().withMessage('Customer name is required')
    .isString().withMessage('Customer name must be a string')
    .isLength({ min: 2, max: 100 }).withMessage('Customer name must be between 2 and 100 characters')
    .trim(),
  
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('password')
    .optional()
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .withMessage('Password must contain uppercase, lowercase, number and special character'),
  
  body('phone')
    .optional()
    .isString().withMessage('Phone must be a string')
    .matches(/^[0-9+\-\s()]{10,20}$/).withMessage('Please provide a valid phone number'),
  
  body('website')
    .optional()
    .isURL().withMessage('Please provide a valid website URL'),
  
  body('membershipPlan')
    .optional()
    .isIn(['free', 'standard', 'premium', 'enterprise']).withMessage('Invalid membership plan'),
  
  body('licenseLimit')
    .optional()
    .isInt({ min: 1, max: 1000 }).withMessage('License limit must be between 1 and 1000'),
  
  body('storageLimit')
    .optional()
    .isInt({ min: 1, max: 1000 }).withMessage('Storage limit must be between 1 and 1000 GB'),
  
  body('apiCallLimit')
    .optional()
    .isInt({ min: 1000, max: 1000000 }).withMessage('API call limit must be between 1000 and 1,000,000'),
  
  body('duration')
    .optional()
    .isInt({ min: 1, max: 365 }).withMessage('Duration must be between 1 and 365 days'),
  
  body('autoRenewal')
    .optional()
    .isBoolean().withMessage('Auto renewal must be a boolean'),
  
  body('address')
    .optional()
    .isObject().withMessage('Address must be an object'),
  
  body('address.street')
    .optional()
    .isString().trim(),
  
  body('address.city')
    .optional()
    .isString().trim(),
  
  body('address.state')
    .optional()
    .isString().trim(),
  
  body('address.zipCode')
    .optional()
    .isString().trim(),
  
  body('address.country')
    .optional()
    .isString().trim(),
  
  body('notes')
    .optional()
    .isString().trim(),
  
  handleValidationErrors
];

export const validateUpdateClient = [
  param('id')
    .notEmpty().withMessage('Client ID is required')
    .isMongoId().withMessage('Invalid client ID format'),
  
  body('customerName')
    .optional()
    .isString().withMessage('Customer name must be a string')
    .isLength({ min: 2, max: 100 }).withMessage('Customer name must be between 2 and 100 characters')
    .trim(),
  
  body('email')
    .optional()
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('phone')
    .optional()
    .isString().withMessage('Phone must be a string')
    .matches(/^[0-9+\-\s()]{10,20}$/).withMessage('Please provide a valid phone number'),
  
  body('website')
    .optional()
    .isURL().withMessage('Please provide a valid website URL'),
  
  body('membershipPlan')
    .optional()
    .isIn(['free', 'standard', 'premium', 'enterprise']).withMessage('Invalid membership plan'),
  
  body('licenseLimit')
    .optional()
    .isInt({ min: 1, max: 1000 }).withMessage('License limit must be between 1 and 1000'),
  
  body('storageLimit')
    .optional()
    .isInt({ min: 1, max: 1000 }).withMessage('Storage limit must be between 1 and 1000 GB'),
  
  body('apiCallLimit')
    .optional()
    .isInt({ min: 1000, max: 1000000 }).withMessage('API call limit must be between 1000 and 1,000,000'),
  
  body('extendDays')
    .optional()
    .isInt({ min: 1, max: 365 }).withMessage('Extend days must be between 1 and 365'),
  
  body('status')
    .optional()
    .isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status'),
  
  body('autoRenewal')
    .optional()
    .isBoolean().withMessage('Auto renewal must be a boolean'),
  
  body('notes')
    .optional()
    .isString().trim(),
  
  handleValidationErrors
];

export const validateClientId = [
  param('id')
    .notEmpty().withMessage('Client ID is required')
    .isMongoId().withMessage('Invalid client ID format'),
  
  handleValidationErrors
];

export const validateToggleClientStatus = [
  param('id')
    .notEmpty().withMessage('Client ID is required')
    .isMongoId().withMessage('Invalid client ID format'),
  
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(['active', 'inactive']).withMessage('Status must be either "active" or "inactive"'),
  
  handleValidationErrors
];

export const validateListClients = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer')
    .toInt(),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
    .toInt(),
  
  query('status')
    .optional()
    .isIn(['active', 'inactive', 'suspended']).withMessage('Invalid status'),
  
  query('membershipPlan')
    .optional()
    .isIn(['free', 'standard', 'premium', 'enterprise']).withMessage('Invalid membership plan'),
  
  query('search')
    .optional()
    .isString().trim(),
  
  query('expiringSoon')
    .optional()
    .isBoolean().withMessage('expiringSoon must be a boolean'),
  
  query('sortBy')
    .optional()
    .isIn(['createdAt', 'customerName', 'email', 'subscriptionEndDate', 'status']).withMessage('Invalid sort field'),
  
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
  
  handleValidationErrors
];

// ==================== ENHANCED TEAM VALIDATIONS ====================

export const validateCreateTeamMember = [
  body('firstName')
    .notEmpty().withMessage('First name is required')
    .isString().withMessage('First name must be a string')
    .isLength({ min: 1, max: 50 }).withMessage('First name must be between 1 and 50 characters')
    .trim(),
  
  body('lastName')
    .optional()
    .isString().withMessage('Last name must be a string')
    .isLength({ max: 50 }).withMessage('Last name cannot exceed 50 characters')
    .trim(),
  
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('password')
    .optional()
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .withMessage('Password must contain uppercase, lowercase, number and special character'),
  
  body('phone')
    .optional()
    .isString().withMessage('Phone must be a string')
    .matches(/^[0-9+\-\s()]{10,20}$/).withMessage('Please provide a valid phone number'),
  
  // Enhanced team fields
  body('teamRole')
    .optional()
    .isString().withMessage('Team role must be a string')
    .isLength({ min: 2, max: 50 }).withMessage('Team role must be between 2 and 50 characters')
    .trim()
    .matches(/^[a-zA-Z\s_]+$/).withMessage('Team role can only contain letters, spaces, and underscores'),
  
  body('department')
    .optional()
    .isString().withMessage('Department must be a string')
    .isLength({ min: 2, max: 100 }).withMessage('Department must be between 2 and 100 characters')
    .trim(),
  
  body('location')
    .optional()
    .isString().withMessage('Location must be a string')
    .isLength({ min: 2, max: 100 }).withMessage('Location must be between 2 and 100 characters')
    .trim(),
  
  body('customRole')
    .optional()
    .isString().withMessage('Custom role must be a string')
    .isLength({ max: 50 }).withMessage('Custom role cannot exceed 50 characters')
    .trim(),
  
  body('bio')
    .optional()
    .isString().withMessage('Bio must be a string')
    .isLength({ max: 500 }).withMessage('Bio cannot exceed 500 characters'),
  
  body('address')
    .optional()
    .isObject().withMessage('Address must be an object'),
  
  body('address.street')
    .optional()
    .isString().trim(),
  
  body('address.city')
    .optional()
    .isString().trim(),
  
  body('address.state')
    .optional()
    .isString().trim(),
  
  body('address.zipCode')
    .optional()
    .isString().trim(),
  
  body('address.country')
    .optional()
    .isString().trim(),
  
  body('certifications')
    .optional()
    .isArray().withMessage('Certifications must be an array'),
  
  body('certifications.*.name')
    .optional()
    .isString().withMessage('Certification name must be a string'),
  
  body('certifications.*.issuedDate')
    .optional()
    .isISO8601().withMessage('Invalid issued date format'),
  
  body('certifications.*.expiryDate')
    .optional()
    .isISO8601().withMessage('Invalid expiry date format')
    .custom((value) => {
      if (value && new Date(value) < new Date()) {
        throw new Error('Expiry date cannot be in the past');
      }
      return true;
    }),
  
  body('certifications.*.issuingAuthority')
    .optional()
    .isString().trim(),
  
  body('certifications.*.certificateUrl')
    .optional()
    .isURL().withMessage('Certificate URL must be a valid URL'),
  
  handleValidationErrors
];

export const validateUpdateTeamMember = [
  param('id')
    .notEmpty().withMessage('Team member ID is required')
    .isMongoId().withMessage('Invalid team member ID format'),
  
  body('firstName')
    .optional()
    .isString().withMessage('First name must be a string')
    .isLength({ min: 1, max: 50 }).withMessage('First name must be between 1 and 50 characters')
    .trim(),
  
  body('lastName')
    .optional()
    .isString().withMessage('Last name must be a string')
    .isLength({ max: 50 }).withMessage('Last name cannot exceed 50 characters')
    .trim(),
  
  body('email')
    .optional()
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('phone')
    .optional()
    .isString().withMessage('Phone must be a string')
    .matches(/^[0-9+\-\s()]{10,20}$/).withMessage('Please provide a valid phone number'),
  
  // Enhanced team fields
  body('teamRole')
    .optional()
    .isString().withMessage('Team role must be a string')
    .isLength({ min: 2, max: 50 }).withMessage('Team role must be between 2 and 50 characters')
    .trim()
    .matches(/^[a-zA-Z\s_]+$/).withMessage('Team role can only contain letters, spaces, and underscores'),
  
  body('department')
    .optional()
    .isString().withMessage('Department must be a string')
    .isLength({ min: 2, max: 100 }).withMessage('Department must be between 2 and 100 characters')
    .trim(),
  
  body('location')
    .optional()
    .isString().withMessage('Location must be a string')
    .isLength({ min: 2, max: 100 }).withMessage('Location must be between 2 and 100 characters')
    .trim(),
  
  body('customRole')
    .optional()
    .isString().withMessage('Custom role must be a string')
    .isLength({ max: 50 }).withMessage('Custom role cannot exceed 50 characters')
    .trim(),
  
  body('bio')
    .optional()
    .isString().withMessage('Bio must be a string')
    .isLength({ max: 500 }).withMessage('Bio cannot exceed 500 characters'),
  
  body('status')
    .optional()
    .isIn(['active', 'inactive', 'on_leave', 'suspended']).withMessage('Invalid status'),
  
  body('performanceScore')
    .optional()
    .isInt({ min: 0, max: 100 }).withMessage('Performance score must be between 0 and 100'),
  
  body('qualityScore')
    .optional()
    .isFloat({ min: 0, max: 5 }).withMessage('Quality score must be between 0 and 5'),
  
  body('assignedCount')
    .optional()
    .isInt({ min: 0 }).withMessage('Assigned count must be a non-negative integer'),
  
  body('completedCount')
    .optional()
    .isInt({ min: 0 }).withMessage('Completed count must be a non-negative integer')
    .custom((value, { req }) => {
      if (req.body.assignedCount !== undefined && value > req.body.assignedCount) {
        throw new Error('Completed count cannot exceed assigned count');
      }
      return true;
    }),
  
  body('onTimeRate')
    .optional()
    .isFloat({ min: 0, max: 100 }).withMessage('On-time rate must be between 0 and 100'),
  
  body('adminNotes')
    .optional()
    .isString().withMessage('Admin notes must be a string')
    .isLength({ max: 1000 }).withMessage('Admin notes cannot exceed 1000 characters'),
  
  body('address')
    .optional()
    .isObject().withMessage('Address must be an object'),
  
  body('address.street')
    .optional()
    .isString().trim(),
  
  body('address.city')
    .optional()
    .isString().trim(),
  
  body('address.state')
    .optional()
    .isString().trim(),
  
  body('address.zipCode')
    .optional()
    .isString().trim(),
  
  body('address.country')
    .optional()
    .isString().trim(),
  
  body('certifications')
    .optional()
    .isArray().withMessage('Certifications must be an array'),
  
  body('certifications.*.name')
    .optional()
    .isString().withMessage('Certification name must be a string'),
  
  body('certifications.*.issuedDate')
    .optional()
    .isISO8601().withMessage('Invalid issued date format'),
  
  body('certifications.*.expiryDate')
    .optional()
    .isISO8601().withMessage('Invalid expiry date format')
    .custom((value) => {
      if (value && new Date(value) < new Date()) {
        throw new Error('Expiry date cannot be in the past');
      }
      return true;
    }),
  
  body('certifications.*.issuingAuthority')
    .optional()
    .isString().trim(),
  
  body('certifications.*.certificateUrl')
    .optional()
    .isURL().withMessage('Certificate URL must be a valid URL'),
  
  handleValidationErrors
];

export const validateTeamMemberId = [
  param('id')
    .notEmpty().withMessage('Team member ID is required')
    .isMongoId().withMessage('Invalid team member ID format'),
  
  handleValidationErrors
];

export const validateListTeamMembers = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer')
    .toInt(),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
    .toInt(),
  
  query('search')
    .optional()
    .isString().trim()
    .isLength({ max: 100 }).withMessage('Search term cannot exceed 100 characters'),
  
  query('status')
    .optional()
    .isIn(['active', 'inactive', 'on_leave', 'suspended', 'all']).withMessage('Invalid status'),
  
  query('teamRole')
    .optional()
    .isString().trim()
    .isLength({ max: 50 }).withMessage('Team role filter cannot exceed 50 characters'),
  
  query('department')
    .optional()
    .isString().trim()
    .isLength({ max: 100 }).withMessage('Department filter cannot exceed 100 characters'),
  
  query('location')
    .optional()
    .isString().trim()
    .isLength({ max: 100 }).withMessage('Location filter cannot exceed 100 characters'),
  
  query('customRole')
    .optional()
    .isString().trim(),
  
  query('sortBy')
    .optional()
    .isIn(['firstName', 'lastName', 'email', 'status', 'performanceScore', 'completedCount', 'assignedCount', 'joinDate', 'teamCreatedAt', 'teamRole', 'department', 'location'])
    .withMessage('Invalid sort field'),
  
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
  
  query('minPerformance')
    .optional()
    .isInt({ min: 0, max: 100 }).withMessage('Minimum performance must be between 0 and 100')
    .toInt(),
  
  query('maxPerformance')
    .optional()
    .isInt({ min: 0, max: 100 }).withMessage('Maximum performance must be between 0 and 100')
    .toInt()
    .custom((value, { req }) => {
      if (req.query.minPerformance && value < parseInt(req.query.minPerformance)) {
        throw new Error('Maximum performance cannot be less than minimum performance');
      }
      return true;
    }),
  
  handleValidationErrors
];

// ==================== BULK OPERATIONS VALIDATIONS ====================

export const validateBulkUpdateTeamMembers = [
  body('memberIds')
    .notEmpty().withMessage('Member IDs are required')
    .isArray().withMessage('Member IDs must be an array')
    .custom((value) => {
      if (value.length === 0) {
        throw new Error('At least one member ID is required');
      }
      if (value.length > 50) {
        throw new Error('Cannot update more than 50 members at once');
      }
      return true;
    }),
  
  body('memberIds.*')
    .isMongoId().withMessage('Invalid member ID format'),
  
  body('updateData')
    .notEmpty().withMessage('Update data is required')
    .isObject().withMessage('Update data must be an object'),
  
  body('updateData.status')
    .optional()
    .isIn(['active', 'inactive', 'on_leave', 'suspended']).withMessage('Invalid status'),
  
  body('updateData.department')
    .optional()
    .isString().trim()
    .isLength({ min: 2, max: 100 }).withMessage('Department must be between 2 and 100 characters'),
  
  body('updateData.location')
    .optional()
    .isString().trim()
    .isLength({ min: 2, max: 100 }).withMessage('Location must be between 2 and 100 characters'),
  
  body('updateData.teamRole')
    .optional()
    .isString().trim()
    .isLength({ min: 2, max: 50 }).withMessage('Team role must be between 2 and 50 characters'),
  
  handleValidationErrors
];

// ==================== CUSTOM OPTIONS MANAGEMENT VALIDATIONS ====================

export const validateAddCustomTeamRole = [
  body('role')
    .notEmpty().withMessage('Role name is required')
    .isString().withMessage('Role name must be a string')
    .isLength({ min: 2, max: 50 }).withMessage('Role name must be between 2 and 50 characters')
    .trim()
    .matches(/^[a-zA-Z\s_]+$/).withMessage('Role name can only contain letters, spaces, and underscores')
    .custom((value) => {
      // Prevent reserved role names
      const reservedRoles = ['admin', 'super_admin', 'team', 'inspector', 'senior_inspector', 'junior_inspector', 'lead_inspector', 'supervisor'];
      if (reservedRoles.includes(value.toLowerCase())) {
        throw new Error('This role name is reserved and cannot be used as a custom role');
      }
      return true;
    }),
  
  handleValidationErrors
];

export const validateAddCustomDepartment = [
  body('department')
    .notEmpty().withMessage('Department name is required')
    .isString().withMessage('Department name must be a string')
    .isLength({ min: 2, max: 100 }).withMessage('Department name must be between 2 and 100 characters')
    .trim()
    .matches(/^[a-zA-Z0-9\s\-&]+$/).withMessage('Department name can only contain letters, numbers, spaces, hyphens, and ampersands'),
  
  handleValidationErrors
];

export const validateAddCustomLocation = [
  body('location')
    .notEmpty().withMessage('Location name is required')
    .isString().withMessage('Location name must be a string')
    .isLength({ min: 2, max: 100 }).withMessage('Location name must be between 2 and 100 characters')
    .trim()
    .matches(/^[a-zA-Z0-9\s\-,#.]+$/).withMessage('Location name can only contain letters, numbers, spaces, hyphens, commas, periods, and hash symbols'),
  
  handleValidationErrors
];

// ==================== TEAM SELF-SERVICE VALIDATIONS ====================

export const validateUpdateMyProfile = [
  body('firstName')
    .optional()
    .isString().withMessage('First name must be a string')
    .isLength({ min: 1, max: 50 }).withMessage('First name must be between 1 and 50 characters')
    .trim(),
  
  body('lastName')
    .optional()
    .isString().withMessage('Last name must be a string')
    .isLength({ max: 50 }).withMessage('Last name cannot exceed 50 characters')
    .trim(),
  
  body('phone')
    .optional()
    .isString().withMessage('Phone must be a string')
    .matches(/^[0-9+\-\s()]{10,20}$/).withMessage('Please provide a valid phone number'),
  
  // Note: Team members cannot change their own teamRole, department, or location
  // Only admins can change those fields
  
  body('bio')
    .optional()
    .isString().withMessage('Bio must be a string')
    .isLength({ max: 500 }).withMessage('Bio cannot exceed 500 characters'),
  
  body('avatarUrl')
    .optional()
    .isURL().withMessage('Avatar URL must be a valid URL'),
  
  body('address')
    .optional()
    .isObject().withMessage('Address must be an object'),
  
  body('address.street')
    .optional()
    .isString().trim(),
  
  body('address.city')
    .optional()
    .isString().trim(),
  
  body('address.state')
    .optional()
    .isString().trim(),
  
  body('address.zipCode')
    .optional()
    .isString().trim(),
  
  body('address.country')
    .optional()
    .isString().trim(),
  
  handleValidationErrors
];

export const validateChangeMyPassword = [
  body('currentPassword')
    .notEmpty().withMessage('Current password is required'),
  
  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8 }).withMessage('New password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
    .custom((value, { req }) => {
      if (value === req.body.currentPassword) {
        throw new Error('New password must be different from current password');
      }
      return true;
    }),
  
  body('confirmPassword')
    .notEmpty().withMessage('Please confirm your new password')
    .custom((value, { req }) => value === req.body.newPassword)
    .withMessage('Passwords do not match'),
  
  handleValidationErrors
];

// ==================== CONTACT VALIDATIONS ====================

export const validateCreateContact = [
  body('fullName')
    .notEmpty().withMessage('Full name is required')
    .isString().withMessage('Full name must be a string')
    .isLength({ min: 2, max: 100 }).withMessage('Full name must be between 2 and 100 characters')
    .trim(),
  
  body('email')
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('phone')
    .optional()
    .isString().withMessage('Phone must be a string')
    .matches(/^[0-9+\-\s()]{10,20}$/).withMessage('Please provide a valid phone number'),
  
  body('message')
    .notEmpty().withMessage('Message is required')
    .isString().withMessage('Message must be a string')
    .isLength({ min: 10, max: 5000 }).withMessage('Message must be between 10 and 5000 characters'),
  
  handleValidationErrors
];

export const validateContactId = [
  param('id')
    .notEmpty().withMessage('Contact ID is required')
    .isMongoId().withMessage('Invalid contact ID format'),
  
  handleValidationErrors
];

export const validateListContacts = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer')
    .toInt(),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
    .toInt(),
  
  query('search')
    .optional()
    .isString().trim(),
  
  handleValidationErrors
];

// ==================== NOTIFICATION VALIDATIONS ====================

export const validateNotificationId = [
  param('id')
    .notEmpty().withMessage('Notification ID is required')
    .isMongoId().withMessage('Invalid notification ID format'),
  
  handleValidationErrors
];

export const validateListNotifications = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer')
    .toInt(),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
    .toInt(),
  
  query('unreadOnly')
    .optional()
    .isBoolean().withMessage('unreadOnly must be a boolean'),
  
  query('type')
    .optional()
    .isString().trim(),
  
  handleValidationErrors
];

