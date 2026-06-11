// validators/checklist.validator.js
import { body, param, query, validationResult } from 'express-validator';
import mongoose from 'mongoose';



// ObjectId validator
const isValidObjectId = (value) => {
  if (!value) return true;
  return mongoose.Types.ObjectId.isValid(value);
};

// Date validator for future dates
const isFutureDate = (value) => {
  const date = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date >= today;
};

// ==================== CHECKLIST VALIDATORS ====================

export const validateCreateChecklist = [
  body('name')
    .trim()
    .notEmpty().withMessage('Checklist name is required')
    .isLength({ min: 3, max: 200 }).withMessage('Name must be between 3 and 200 characters'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 5000 }).withMessage('Description cannot exceed 5000 characters'),
  
  body('category')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Category cannot exceed 100 characters'),
  
  body('subcategory')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Subcategory cannot exceed 100 characters'),
  
  body('tags')
    .optional()
    .isArray().withMessage('Tags must be an array'),
  
  body('tags.*')
    .optional()
    .isString().withMessage('Each tag must be a string'),
  
  body('type')
    .optional()
    .isIn(['global', 'custom', 'clone']).withMessage('Invalid checklist type'),
  
  body('sections')
    .optional()
    .isArray().withMessage('Sections must be array'),
  
  body('sections.*.sectionTitle')
    .if(body('sections').exists())
    .trim()
    .notEmpty().withMessage('Section title is required'),
  
  body('sections.*.order')
    .optional()
    .isInt({ min: 0 }).withMessage('Order must be a positive integer'),
  
  body('sections.*.fields')
    .if(body('sections').exists())
    .isArray().withMessage('Fields must be array'),
  
  body('sections.*.fields.*.label')
    .if(body('sections').exists())
    .trim()
    .notEmpty().withMessage('Field label is required'),
  
  body('sections.*.fields.*.fieldType')
    .if(body('sections').exists())
    .isIn(['text_input', 'text_area', 'dropdown', 'checkbox', 'rating', 
           'signature', 'date_picker', 'image_upload', 'file_upload', 
           'number_input', 'email_input', 'phone_input', 'multi_select', 'slider'])
    .withMessage('Invalid field type'),
  
  body('sections.*.fields.*.isRequired')
    .optional()
    .isBoolean().withMessage('isRequired must be boolean'),
  
  body('sections.*.fields.*.options')
    .if(body('sections.*.fields.*.fieldType').isIn(['dropdown', 'multi_select']))
    .isArray().withMessage('Options array required for dropdown/multi_select')
    .notEmpty().withMessage('At least one option required'),
  
  body('sections.*.fields.*.checkboxItems')
    .if(body('sections.*.fields.*.fieldType').equals('checkbox'))
    .isArray().withMessage('Checkbox items array required')
    .notEmpty().withMessage('At least one checkbox item required'),
  
  body('sections.*.fields.*.ratingMax')
    .if(body('sections.*.fields.*.fieldType').equals('rating'))
    .optional()
    .isInt({ min: 1, max: 10 }).withMessage('Rating max must be between 1 and 10'),
  
  body('settings')
    .optional()
    .isObject().withMessage('Settings must be an object'),
  
  handleValidationErrors
];

export const validateUpdateChecklist = [
  param('id')
    .custom(isValidObjectId).withMessage('Invalid checklist ID'),
  
  body('name')
    .optional()
    .trim()
    .isLength({ min: 3, max: 200 }).withMessage('Name must be between 3 and 200 characters'),
  
  body('status')
    .optional()
    .isIn(['active', 'inactive', 'archived', 'deleted']).withMessage('Invalid status'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 5000 }).withMessage('Description cannot exceed 5000 characters'),
  
  handleValidationErrors
];

export const validateCloneChecklist = [
  param('id')
    .custom(isValidObjectId).withMessage('Invalid checklist ID'),
  
  body('newName')
    .optional()
    .trim()
    .isLength({ min: 3, max: 200 }).withMessage('New name must be between 3 and 200 characters'),
  
  handleValidationErrors
];

export const validateGetChecklists = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  
  query('type')
    .optional()
    .isIn(['global', 'custom', 'clone']).withMessage('Invalid type'),
  
  query('status')
    .optional()
    .isIn(['active', 'inactive', 'archived']).withMessage('Invalid status'),
  
  handleValidationErrors
];

// ==================== SUBMISSION VALIDATORS ====================

export const validateSubmitResponse = [
  param('id')
    .custom(isValidObjectId).withMessage('Invalid checklist ID'),
  
  body('responses')
    .isArray().withMessage('Responses must be an array'),
  
  body('responses.*.fieldId')
    .notEmpty().withMessage('Field ID is required for each response')
    .custom(isValidObjectId).withMessage('Invalid field ID'),
  
  body('responses.*.value')
    .optional(),
  
  body('completionTime')
    .optional()
    .isInt({ min: 0 }).withMessage('Completion time must be a positive number'),
  
  body('ipAddress')
    .optional()
    .isIP().withMessage('Invalid IP address'),
  
  body('offlineId')
    .optional()
    .isString().withMessage('Offline ID must be a string'),
  
  handleValidationErrors
];

export const validateGetSubmissions = [
  param('id')
    .custom(isValidObjectId).withMessage('Invalid checklist ID'),
  
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  
  query('status')
    .optional()
    .isIn(['draft', 'completed', 'reviewed', 'rejected']).withMessage('Invalid status'),
  
  handleValidationErrors
];

// ==================== ASSIGNMENT VALIDATORS ====================

export const validateAssignToAdmin = [
  body('checklistId')
    .notEmpty().withMessage('Checklist ID is required')
    .custom(isValidObjectId).withMessage('Invalid checklist ID'),
  
  body('adminId')
    .notEmpty().withMessage('Admin ID is required')
    .custom(isValidObjectId).withMessage('Invalid admin ID'),
  
  body('dueDate')
    .notEmpty().withMessage('Due date is required')
    .isISO8601().withMessage('Invalid date format')
    .custom(isFutureDate).withMessage('Due date cannot be in the past'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid priority'),
  
  body('notes')
    .optional()
    .isLength({ max: 1000 }).withMessage('Notes cannot exceed 1000 characters'),
  
  handleValidationErrors
];

export const validateAssignToTeam = [
  body('checklistId')
    .notEmpty().withMessage('Checklist ID is required')
    .custom(isValidObjectId).withMessage('Invalid checklist ID'),
  
  body('teamMemberIds')
    .isArray().withMessage('Team member IDs must be an array')
    .notEmpty().withMessage('At least one team member is required'),
  
  body('teamMemberIds.*')
    .custom(isValidObjectId).withMessage('Invalid team member ID'),
  
  body('assetId')
    .optional()
    .custom(isValidObjectId).withMessage('Invalid asset ID'),
  
  body('dueDate')
    .notEmpty().withMessage('Due date is required')
    .isISO8601().withMessage('Invalid date format')
    .custom(isFutureDate).withMessage('Due date cannot be in the past'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid priority'),
  
  body('notes')
    .optional()
    .isLength({ max: 1000 }).withMessage('Notes cannot exceed 1000 characters'),
  
  handleValidationErrors
];

export const validateUpdateAssignment = [
  param('id')
    .custom(isValidObjectId).withMessage('Invalid assignment ID'),
  
  body('dueDate')
    .optional()
    .isISO8601().withMessage('Invalid date format')
    .custom(isFutureDate).withMessage('Due date cannot be in the past'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid priority'),
  
  body('status')
    .optional()
    .isIn(['pending', 'in_progress', 'submitted', 'under_review', 'approved', 'rejected', 'completed', 'overdue'])
    .withMessage('Invalid status'),
  
  body('notes')
    .optional()
    .isLength({ max: 1000 }).withMessage('Notes cannot exceed 1000 characters'),
  
  handleValidationErrors
];

export const validateReviewSubmission = [
  param('id')
    .custom(isValidObjectId).withMessage('Invalid assignment ID'),
  
  body('action')
    .notEmpty().withMessage('Action is required')
    .isIn(['approve', 'reject']).withMessage('Action must be approve or reject'),
  
  body('rejectionReason')
    .if(body('action').equals('reject'))
    .notEmpty().withMessage('Rejection reason is required when rejecting')
    .isLength({ min: 5, max: 1000 }).withMessage('Rejection reason must be between 5 and 1000 characters'),
  
  body('reviewComments')
    .optional()
    .isLength({ max: 2000 }).withMessage('Review comments cannot exceed 2000 characters'),
  
  handleValidationErrors
];

export const validateSubmitInspection = [
  param('id')
    .custom(isValidObjectId).withMessage('Invalid assignment ID'),
  
  body('responses')
    .optional()
    .isArray().withMessage('Responses must be an array'),
  
  body('responses.*.fieldId')
    .if(body('responses').exists())
    .notEmpty().withMessage('Field ID is required')
    .custom(isValidObjectId).withMessage('Invalid field ID'),
  
  body('overallRating')
    .optional()
    .isInt({ min: 1, max: 5 }).withMessage('Overall rating must be between 1 and 5'),
  
  body('inspectorNotes')
    .optional()
    .isLength({ max: 2000 }).withMessage('Inspector notes cannot exceed 2000 characters'),
  
  handleValidationErrors
];

export const validateSaveDraft = [
  param('id')
    .custom(isValidObjectId).withMessage('Invalid assignment ID'),
  
  body('responses')
    .optional()
    .isArray().withMessage('Responses must be an array'),
  
  body('inspectorNotes')
    .optional()
    .isLength({ max: 2000 }).withMessage('Inspector notes cannot exceed 2000 characters'),
  
  handleValidationErrors
];

// ==================== REASSIGNMENT VALIDATORS ====================

export const validateReassignToAdmin = [
  param('id')
    .custom(isValidObjectId).withMessage('Invalid assignment ID'),
  
  body('adminId')
    .notEmpty().withMessage('Admin ID is required')
    .custom(isValidObjectId).withMessage('Invalid admin ID'),
  
  body('dueDate')
    .optional()
    .isISO8601().withMessage('Invalid date format')
    .custom(isFutureDate).withMessage('Due date cannot be in the past'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid priority'),
  
  body('reason')
    .optional()
    .isLength({ max: 500 }).withMessage('Reason cannot exceed 500 characters'),
  
  handleValidationErrors
];

export const validateReassignToTeam = [
  param('id')
    .custom(isValidObjectId).withMessage('Invalid assignment ID'),
  
  body('teamMemberIds')
    .isArray().withMessage('Team member IDs must be an array')
    .notEmpty().withMessage('At least one team member is required'),
  
  body('teamMemberIds.*')
    .custom(isValidObjectId).withMessage('Invalid team member ID'),
  
  body('assetIds')
    .optional()
    .isArray().withMessage('Asset IDs must be an array'),
  
  body('assetIds.*')
    .optional()
    .custom(isValidObjectId).withMessage('Invalid asset ID'),
  
  body('dueDate')
    .optional()
    .isISO8601().withMessage('Invalid date format')
    .custom(isFutureDate).withMessage('Due date cannot be in the past'),
  
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid priority'),
  
  body('reason')
    .optional()
    .isLength({ max: 500 }).withMessage('Reason cannot exceed 500 characters'),
  
  handleValidationErrors
];

// ==================== TEAM MEMBER VALIDATORS ====================

export const validateUpdateTeamMemberStatus = [
  param('id')
    .custom(isValidObjectId).withMessage('Invalid assignment ID'),
  
  param('teamMemberId')
    .custom(isValidObjectId).withMessage('Invalid team member ID'),
  
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(['pending', 'accepted', 'in_progress', 'completed', 'rejected'])
    .withMessage('Invalid status'),
  
  handleValidationErrors
];

// ==================== REQUEST VALIDATORS ====================

export const validateCreateRequest = [
  body('checklistName')
    .trim()
    .notEmpty().withMessage('Checklist name is required')
    .isLength({ min: 3, max: 200 }).withMessage('Checklist name must be between 3 and 200 characters'),
  
  body('category')
    .trim()
    .notEmpty().withMessage('Category is required')
    .isLength({ min: 2, max: 100 }).withMessage('Category must be between 2 and 100 characters'),
  
  body('detailedDescription')
    .trim()
    .notEmpty().withMessage('Detailed description is required')
    .isLength({ min: 20, max: 5000 }).withMessage('Description must be between 20 and 5000 characters'),
  
  body('businessJustification')
    .trim()
    .notEmpty().withMessage('Business justification is required')
    .isLength({ min: 20, max: 2000 }).withMessage('Business justification must be between 20 and 2000 characters'),
  
  body('urgencyLevel')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid urgency level'),
  
  body('expectedUsageFrequency')
    .optional()
    .isIn(['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'as_needed'])
    .withMessage('Invalid usage frequency'),
  
  body('numberOfTeamMembers')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Number of team members must be between 1 and 100'),
  
  body('additionalNotes')
    .optional()
    .isLength({ max: 1000 }).withMessage('Additional notes cannot exceed 1000 characters'),
  
  handleValidationErrors
];

export const validateReviewRequest = [
  param('id')
    .custom(isValidObjectId).withMessage('Invalid request ID'),
  
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(['approved', 'rejected', 'under_review', 'in_progress']).withMessage('Invalid status'),
  
  body('rejectionReason')
    .if(body('status').equals('rejected'))
    .notEmpty().withMessage('Rejection reason is required when rejecting')
    .isLength({ min: 5, max: 1000 }).withMessage('Rejection reason must be between 5 and 1000 characters'),
  
  body('resultingChecklistId')
    .if(body('status').equals('approved'))
    .optional()
    .custom(isValidObjectId).withMessage('Invalid resulting checklist ID'),
  
  body('resultingChecklistName')
    .if(body('status').equals('approved'))
    .optional()
    .isLength({ max: 200 }).withMessage('Checklist name cannot exceed 200 characters'),
  
  body('comments')
    .optional()
    .isLength({ max: 1000 }).withMessage('Comments cannot exceed 1000 characters'),
  
  handleValidationErrors
];

export const validateGetRequests = [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  
  query('status')
    .optional()
    .isIn(['pending', 'approved', 'rejected', 'under_review', 'in_progress'])
    .withMessage('Invalid status'),
  
  query('urgencyLevel')
    .optional()
    .isIn(['low', 'medium', 'high', 'critical']).withMessage('Invalid urgency level'),
  
  handleValidationErrors
];

// ==================== ASSET VALIDATORS ====================

export const validateAddAsset = [
  param('id')
    .custom(isValidObjectId).withMessage('Invalid assignment ID'),
  
  body('assetId')
    .notEmpty().withMessage('Asset ID is required')
    .custom(isValidObjectId).withMessage('Invalid asset ID'),
  
  handleValidationErrors
];

// ==================== BULK OPERATION VALIDATORS ====================

export const validateBulkUpdate = [
  body('assignmentIds')
    .isArray().withMessage('Assignment IDs must be an array')
    .notEmpty().withMessage('At least one assignment ID is required'),
  
  body('assignmentIds.*')
    .custom(isValidObjectId).withMessage('Invalid assignment ID'),
  
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(['pending', 'in_progress', 'submitted', 'approved', 'rejected', 'completed'])
    .withMessage('Invalid status'),
  
  handleValidationErrors
];