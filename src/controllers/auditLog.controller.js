// controllers/auditLog.controller.js
import auditLogService from '../services/auditLog.service.js';

class AuditLogController {
  
  getAuditLogs = async (req, res) => {
    try {
      const { page = 1, limit = 20, action, resource, status, startDate, endDate, search } = req.query;
      
      const filters = { action, resource, status, startDate, endDate, search };
      Object.keys(filters).forEach(key => filters[key] === undefined && delete filters[key]);
      
      const result = await auditLogService.getLogs(
        req,
        filters,
        parseInt(page),
        parseInt(limit)
      );
      
      if (!result.success) {
        return res.status(400).json({ success: false, message: result.error });
      }
      
      res.json({
        success: true,
        logs: result.logs,
        pagination: result.pagination
      });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
  
  getAuditStatistics = async (req, res) => {
    try {
      const result = await auditLogService.getStats(req);
      
      if (!result.success) {
        return res.status(400).json({ success: false, message: result.error });
      }
      
      res.json({ success: true, stats: result.stats });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  };
}

export default new AuditLogController();