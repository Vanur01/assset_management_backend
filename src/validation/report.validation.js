import { body, query } from 'express-validator';

export const validateReportFilters = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid date'),
  query('format')
    .optional()
    .isIn(['json', 'excel', 'pdf'])
    .withMessage('Format must be json, excel, or pdf'),
  query('status')
    .optional()
    .isString(),
  query('category')
    .optional()
    .isString(),
  query('membershipPlan')
    .optional()
    .isIn(['free', 'standard', 'premium', 'enterprise']),
  query('teamRole')
    .optional()
    .isIn(['inspector', 'senior_inspector', 'lead_inspector', 'junior_inspector', 'supervisor', 'manager']),
  query('checklistId')
    .optional()
    .isMongoId(),
  query('assignedTo')
    .optional()
    .isMongoId()
];

export const validateCustomReport = [
  body('reportName')
    .notEmpty()
    .withMessage('Report name is required'),
  body('dataSources')
    .isArray({ min: 1 })
    .withMessage('At least one data source is required'),
  body('dataSources.*')
    .isIn(['clients', 'assets', 'inspections', 'team', 'checklists'])
    .withMessage('Invalid data source'),
  body('dateRange')
    .optional()
    .isObject(),
  body('dateRange.startDate')
    .optional()
    .isISO8601(),
  body('dateRange.endDate')
    .optional()
    .isISO8601(),
  body('metrics')
    .optional()
    .isArray(),
  body('groupBy')
    .optional()
    .isString(),
  body('format')
    .optional()
    .isIn(['json', 'excel', 'pdf'])
];