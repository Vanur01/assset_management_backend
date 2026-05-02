import { query } from 'express-validator';

export const validateDashboardFilters = [
  query('dateRange')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Date range must be between 1 and 365 days')
    .toInt(),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid date'),
  query('chartType')
    .optional()
    .isIn(['revenueTrend', 'clientGrowth', 'subscriptionDistribution', 'topPerformers', 'inspectionTrend', 'assetDistribution', 'teamPerformance'])
    .withMessage('Invalid chart type'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt()
];

export const validateExportDashboard = [
  query('format')
    .optional()
    .isIn(['json', 'csv', 'excel'])
    .withMessage('Format must be json, csv, or excel')
];