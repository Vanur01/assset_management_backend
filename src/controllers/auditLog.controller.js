// controllers/auditLog.controller.js
import auditLogService from '../services/auditLog.service.js';

class AuditLogController {
  
  /**
   * Get audit logs with filters (Role-based)
   * - super_admin: sees all logs
   * - admin: sees own logs + team members' logs
   * - team: sees only their own logs
   */
  getAuditLogs = async (req, res) => {
    try {
      const { userRole, userId, adminId } = req;
      const {
        page = 1,
        limit = 20,
        action,
        resource,
        actorRole,
        status,
        resourceId,
        startDate,
        endDate,
        search
      } = req.query;
      
      const filters = {
        action,
        resource,
        actorRole,
        status,
        resourceId,
        startDate,
        endDate,
        search
      };
      
      // Remove undefined filters
      Object.keys(filters).forEach(key => 
        filters[key] === undefined && delete filters[key]
      );
      
      const result = await auditLogService.getAuditLogs(
        filters,
        parseInt(page),
        parseInt(limit),
        userRole,
        userId,
        adminId
      );
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error || 'Failed to fetch audit logs'
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'Audit logs fetched successfully',
        auditLogs: result.auditLogs,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Error in getAuditLogs:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  };
  
  /**
   * Get audit statistics (Role-based)
   * - super_admin: statistics from all logs
   * - admin: statistics from their organization (own + team)
   * - team: statistics from their own activity only
   */
  getAuditStatistics = async (req, res) => {
    try {
      const { userRole, userId, adminId } = req;
      
      const result = await auditLogService.getAuditStatistics(userRole, userId, adminId);
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error || 'Failed to fetch audit statistics'
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'Audit statistics fetched successfully',
        stats: result.stats
      });
    } catch (error) {
      console.error('Error in getAuditStatistics:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  };
  
  /**
   * Get audit trail for a specific resource
   * Access is determined by the resource's own permission system
   */
  getResourceAuditTrail = async (req, res) => {
    try {
      const { resourceId, resource } = req.params;
      const { limit = 50 } = req.query;
      
      // Note: Additional permission checks for the specific resource 
      // should be performed by the calling service/middleware
      
      const result = await auditLogService.getResourceAuditTrail(
        resourceId,
        resource,
        parseInt(limit)
      );
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error || 'Failed to fetch resource audit trail'
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'Resource audit trail fetched successfully',
        auditLogs: result.auditLogs,
        count: result.count
      });
    } catch (error) {
      console.error('Error in getResourceAuditTrail:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  };
  
  /**
   * Export audit logs
   * Role-based export (same permissions as getAuditLogs)
   */
  exportAuditLogs = async (req, res) => {
    try {
      const { userRole, userId, adminId } = req;
      const { format = 'csv', action, resource, startDate, endDate } = req.query;
      
      const filters = { action, resource, startDate, endDate };
      Object.keys(filters).forEach(key => 
        filters[key] === undefined && delete filters[key]
      );
      
      const result = await auditLogService.exportAuditLogs(
        filters, 
        userRole, 
        userId, 
        adminId,
        format
      );
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error || 'Failed to export audit logs'
        });
      }
      
      if (format === 'csv') {
        const csvHeaders = [
          'Timestamp', 'Action', 'Resource', 'Resource Name', 'Resource ID',
          'Actor Email', 'Actor Role', 'Description', 'Status', 'IP Address',
          'Changed Fields', 'Reference ID'
        ];
        
        const csvRows = result.auditLogs.map(log => [
          log.createdAt,
          log.action,
          log.resource,
          log.resourceName || '',
          log.resourceId || '',
          log.actorEmail,
          log.actorRole,
          log.description || '',
          log.status,
          log.ipAddress || '',
          (log.changedFields || []).join('; '),
          log.referenceId || ''
        ]);
        
        const csvContent = [
          csvHeaders.join(','),
          ...csvRows.map(row => row.map(cell => {
            // Escape quotes and wrap in quotes if contains comma or quote
            const cellStr = String(cell || '');
            if (cellStr.includes(',') || cellStr.includes('"')) {
              return `"${cellStr.replace(/"/g, '""')}"`;
            }
            return cellStr;
          }).join(','))
        ].join('\n');
        
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=audit-logs-${Date.now()}.csv`);
        return res.send(csvContent);
      }
      
      // JSON format
      res.status(200).json({
        success: true,
        message: 'Audit logs exported successfully',
        auditLogs: result.auditLogs,
        count: result.auditLogs.length
      });
    } catch (error) {
      console.error('Error in exportAuditLogs:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  };
  
  /**
   * Get current user's own activity
   * Convenience endpoint for users to see their own actions
   */
  getMyActivity = async (req, res) => {
    try {
      const { userId } = req;
      const { page = 1, limit = 20 } = req.query;
      
      const result = await auditLogService.getUserActivity(
        userId,
        parseInt(page),
        parseInt(limit)
      );
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error || 'Failed to fetch your activity'
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'Your activity fetched successfully',
        auditLogs: result.auditLogs,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Error in getMyActivity:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  };
  
  /**
   * Get organization activity (Admin only)
   * Admins can see all activity from their organization (their own + team members)
   */
  getOrganizationActivity = async (req, res) => {
    try {
      const { userRole, adminId } = req;
      
      // Extra security check - though route already has allowRoles('admin')
      if (userRole !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Only admins can view organization activity.'
        });
      }
      
      const { page = 1, limit = 20 } = req.query;
      
      const result = await auditLogService.getOrganizationActivity(
        adminId,
        parseInt(page),
        parseInt(limit)
      );
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error || 'Failed to fetch organization activity'
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'Organization activity fetched successfully',
        auditLogs: result.auditLogs,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Error in getOrganizationActivity:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  };
  
  /**
   * Get activity summary for dashboard
   * Returns summarized activity data for dashboards
   */
  getActivitySummary = async (req, res) => {
    try {
      const { userRole, userId, adminId } = req;
      const { days = 7 } = req.query;
      
      // Use statistics endpoint but format for dashboard
      const result = await auditLogService.getAuditStatistics(userRole, userId, adminId);
      
      if (!result.success) {
        return res.status(400).json({
          success: false,
          message: result.error || 'Failed to fetch activity summary'
        });
      }
      
      // Format for dashboard display
      const summary = {
        totalActions: result.stats.totalActions,
        actionsToday: result.stats.actionsToday,
        uniqueActors: result.stats.uniqueActors,
        topActions: result.stats.actionsByType.slice(0, 5),
        topResources: result.stats.actionsByResource.slice(0, 5),
        activityByRole: result.stats.actionsByRole,
        recentActivity: result.stats.recentActivity.slice(0, 5),
        dailyBreakdown: result.stats.actionsLast7Days || []
      };
      
      res.status(200).json({
        success: true,
        message: 'Activity summary fetched successfully',
        summary
      });
    } catch (error) {
      console.error('Error in getActivitySummary:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message
      });
    }
  };
}

export default new AuditLogController();