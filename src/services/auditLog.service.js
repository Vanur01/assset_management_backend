// services/auditLog.service.js
import AuditLog from '../models/auditLog.model.js';
import mongoose from 'mongoose';

class AuditLogService {
  
  /**
   * Create audit log entry
   */
  async log(req, data) {
    try {
      const auditLog = await AuditLog.create({
        action: data.action,
        resource: data.resource,
        resourceId: data.resourceId,
        actor: req.userId,
        actorRole: req.userRole,
        actorEmail: req.userEmail,
        description: data.description,
        status: data.status || 'success',
        ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: req.headers['user-agent'],
        changes: data.changes || null
      });
      
      console.log(`[AUDIT] ${data.action} on ${data.resource} by ${req.userRole} (${req.userEmail})`);
      return auditLog;
    } catch (error) {
      console.error('Failed to create audit log:', error);
      return null;
    }
  }

  /**
   * Get audit logs (Role-based)
   */
  async getLogs(req, filters = {}, page = 1, limit = 20) {
    try {
      const { userRole, userId, adminId } = req;
      const query = {};
      
      // Apply filters
      if (filters.action) query.action = filters.action;
      if (filters.resource) query.resource = filters.resource;
      if (filters.status) query.status = filters.status;
      
      // Date range
      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
      }
      
      // Search
      if (filters.search) {
        query.$or = [
          { description: { $regex: filters.search, $options: 'i' } },
          { actorEmail: { $regex: filters.search, $options: 'i' } }
        ];
      }
      
      // Role-based access
      if (userRole === 'team') {
        query.actor = userId;
      } else if (userRole === 'admin') {
        query.$or = [
          { actor: userId },
          { actorRole: 'team', actor: { $ne: null } } // admins see their team members
        ];
      }
      // super_admin sees all
      
      const skip = (page - 1) * limit;
      
      const [logs, total] = await Promise.all([
        AuditLog.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate('actor', 'name email')
          .lean(),
        AuditLog.countDocuments(query)
      ]);
      
      return {
        success: true,
        logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get statistics
   */
  async getStats(req) {
    try {
      const { userRole, userId } = req;
      const matchStage = {};
      
      if (userRole === 'team') matchStage.actor = userId;
      if (userRole === 'admin') matchStage.actorRole = { $in: ['admin', 'team'] };
      
      const stats = await AuditLog.aggregate([
        { $match: matchStage },
        {
          $facet: {
            total: [{ $count: 'count' }],
            byAction: [
              { $group: { _id: '$action', count: { $sum: 1 } } },
              { $sort: { count: -1 } }
            ],
            byResource: [
              { $group: { _id: '$resource', count: { $sum: 1 } } },
              { $sort: { count: -1 } }
            ],
            today: [
              {
                $match: {
                  createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
                }
              },
              { $count: 'count' }
            ]
          }
        }
      ]);
      
      return {
        success: true,
        stats: {
          total: stats[0].total[0]?.count || 0,
          byAction: stats[0].byAction,
          byResource: stats[0].byResource,
          today: stats[0].today[0]?.count || 0
        }
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

export default new AuditLogService();