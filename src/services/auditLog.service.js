// services/auditLog.service.js
import AuditLog from '../models/auditLog.model.js';
import mongoose from 'mongoose';

class AuditLogService {
  
  toObjectId(id) {
    if (!id) return null;
    if (id instanceof mongoose.Types.ObjectId) return id;
    if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
      return new mongoose.Types.ObjectId(id);
    }
    return null;
  }

  /**
   * Create an audit log entry
   */
  async createAuditLog({
    action,
    resource,
    resourceId,
    resourceName = null,
    actor,
    actorRole,
    actorEmail,
    adminId = null,
    teamId = null,
    oldData = null,
    newData = null,
    changedFields = [],
    ipAddress = null,
    userAgent = null,
    description = null,
    status = 'success',
    errorMessage = null,
    referenceId = null,
    metadata = {}
  }) {
    try {
      // Remove sensitive fields from data
      const sanitizeData = (data) => {
        if (!data) return null;
        const sensitiveFields = ['password', 'accessToken', 'refreshToken', 'secretKey', 'twoFactorSecret'];
        const sanitized = JSON.parse(JSON.stringify(data));
        sensitiveFields.forEach(field => delete sanitized[field]);
        return sanitized;
      };
      
      const auditLog = await AuditLog.create({
        action,
        resource,
        resourceId: this.toObjectId(resourceId),
        resourceName,
        actor: this.toObjectId(actor),
        actorRole,
        actorEmail,
        adminId: this.toObjectId(adminId),
        teamId: this.toObjectId(teamId),
        oldData: sanitizeData(oldData),
        newData: sanitizeData(newData),
        changedFields,
        ipAddress,
        userAgent,
        description,
        status,
        errorMessage,
        referenceId,
        metadata
      });
      
      console.log(`[AUDIT] ${action} on ${resource} by ${actorRole} (${actorEmail}) - ${status}`);
      return auditLog;
    } catch (error) {
      console.error('Failed to create audit log:', error);
      return null;
    }
  }

  /**
   * Compare two objects and return changed fields
   */
  compareChanges(oldObj, newObj, ignoreFields = []) {
    const changes = [];
    const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);
    
    for (const key of allKeys) {
      if (ignoreFields.includes(key)) continue;
      
      const oldValue = oldObj?.[key];
      const newValue = newObj?.[key];
      
      // Handle MongoDB ObjectIds and dates
      const oldStr = oldValue?.toString?.() || oldValue;
      const newStr = newValue?.toString?.() || newValue;
      
      if (oldStr !== newStr) {
        changes.push({
          field: key,
          oldValue: oldValue,
          newValue: newValue
        });
      }
    }
    
    return changes;
  }

  /**
   * Get audit logs with filtering and pagination (Role-based)
   * - super_admin: sees all logs
   * - admin: sees own logs + team members' logs under them
   * - team: sees only their own logs
   */
  async getAuditLogs(filters = {}, page = 1, limit = 20, userRole = null, userId = null, adminId = null) {
    try {
      const query = {};
      
      // Apply filters
      if (filters.action) query.action = filters.action;
      if (filters.resource) query.resource = filters.resource;
      if (filters.actorRole) query.actorRole = filters.actorRole;
      if (filters.status) query.status = filters.status;
      if (filters.resourceId) query.resourceId = this.toObjectId(filters.resourceId);
      
      // Date range filter
      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
      }
      
      // Search in description, resourceName, or actorEmail
      if (filters.search) {
        query.$or = [
          { description: { $regex: filters.search, $options: 'i' } },
          { resourceName: { $regex: filters.search, $options: 'i' } },
          { actorEmail: { $regex: filters.search, $options: 'i' } },
          { referenceId: { $regex: filters.search, $options: 'i' } }
        ];
      }
      
      // Role-based access control
      if (userRole === 'team') {
        // Team members can only see their own actions
        query.actor = this.toObjectId(userId);
      } else if (userRole === 'admin') {
        // Admins can see their organization's logs (their own + their team members)
        query.$or = [
          { actor: this.toObjectId(userId) },
          { adminId: this.toObjectId(adminId) }
        ];
      }
      // Super admins see everything (no additional filter)
      
      const skip = (page - 1) * limit;
      
      // Build population paths - only populate fields that exist in schema
      const populateOptions = [];
      
      // Only populate 'actor' if it's a reference in the schema
      if (this.isReferenceField('actor')) {
        populateOptions.push({ path: 'actor', select: 'name email role' });
      }
      
      // Only populate 'adminId' if it's a reference in the schema
      if (this.isReferenceField('adminId')) {
        populateOptions.push({ path: 'adminId', select: 'name email role' });
      }
      
      const [auditLogs, total] = await Promise.all([
        AuditLog.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate(populateOptions)
          .lean(),
        AuditLog.countDocuments(query)
      ]);
      
      return {
        success: true,
        auditLogs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Helper method to check if a field is a reference in the schema
   */
  isReferenceField(fieldName) {
    try {
      const schemaPath = AuditLog.schema.paths[fieldName];
      return schemaPath && 
             schemaPath.instance === 'ObjectID' && 
             schemaPath.options && 
             schemaPath.options.ref;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get audit trail for a specific resource
   */
  async getResourceAuditTrail(resourceId, resource, limit = 50) {
    try {
      const populateOptions = [];
      
      if (this.isReferenceField('actor')) {
        populateOptions.push({ path: 'actor', select: 'name email role' });
      }
      
      const auditLogs = await AuditLog.find({ 
        resourceId: this.toObjectId(resourceId), 
        resource 
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate(populateOptions)
        .lean();
      
      return {
        success: true,
        auditLogs,
        count: auditLogs.length
      };
    } catch (error) {
      console.error('Error fetching resource audit trail:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get audit statistics (Role-based)
   */
  async getAuditStatistics(userRole = null, userId = null, adminId = null) {
    try {
      const matchStage = {};
      
      if (userRole === 'team') {
        matchStage.actor = this.toObjectId(userId);
      } else if (userRole === 'admin') {
        matchStage.$or = [
          { actor: this.toObjectId(userId) },
          { adminId: this.toObjectId(adminId) }
        ];
      }
      
      const stats = await AuditLog.aggregate([
        { $match: matchStage },
        {
          $facet: {
            totalActions: [{ $count: 'count' }],
            actionsByType: [
              { $group: { _id: '$action', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 20 }
            ],
            actionsByResource: [
              { $group: { _id: '$resource', count: { $sum: 1 } } },
              { $sort: { count: -1 } },
              { $limit: 20 }
            ],
            actionsByRole: [
              { $group: { _id: '$actorRole', count: { $sum: 1 } } },
              { $sort: { count: -1 } }
            ],
            actionsToday: [
              {
                $match: {
                  createdAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
                }
              },
              { $count: 'count' }
            ],
            actionsLast7Days: [
              {
                $match: {
                  createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
                }
              },
              {
                $group: {
                  _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                  count: { $sum: 1 }
                }
              },
              { $sort: { _id: 1 } }
            ],
            uniqueActors: [
              { $group: { _id: '$actor' } },
              { $count: 'count' }
            ],
            recentActivity: [
              { $sort: { createdAt: -1 } },
              { $limit: 10 }
            ]
          }
        }
      ]);
      
      // Fetch actor details separately for recent activity if needed
      let recentActivityWithDetails = stats[0].recentActivity || [];
      
      // If we need actor details, fetch them separately to avoid population issues
      if (recentActivityWithDetails.length > 0 && this.isReferenceField('actor')) {
        const actorIds = recentActivityWithDetails.map(activity => activity.actor).filter(id => id);
        if (actorIds.length > 0) {
          const User = mongoose.model('User');
          const actors = await User.find({ _id: { $in: actorIds } })
            .select('name email role')
            .lean();
          
          const actorMap = new Map(actors.map(actor => [actor._id.toString(), actor]));
          
          recentActivityWithDetails = recentActivityWithDetails.map(activity => ({
            ...activity,
            actorDetails: activity.actor ? actorMap.get(activity.actor.toString()) : null
          }));
        }
      }
      
      return {
        success: true,
        stats: {
          totalActions: stats[0].totalActions[0]?.count || 0,
          actionsByType: stats[0].actionsByType,
          actionsByResource: stats[0].actionsByResource,
          actionsByRole: stats[0].actionsByRole,
          actionsToday: stats[0].actionsToday[0]?.count || 0,
          actionsLast7Days: stats[0].actionsLast7Days,
          uniqueActors: stats[0].uniqueActors[0]?.count || 0,
          recentActivity: recentActivityWithDetails
        }
      };
    } catch (error) {
      console.error('Error fetching audit statistics:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Export audit logs
   */
  async exportAuditLogs(filters = {}, userRole = null, userId = null, adminId = null, format = 'csv') {
    try {
      const query = {};
      
      if (filters.action) query.action = filters.action;
      if (filters.resource) query.resource = filters.resource;
      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
      }
      
      if (userRole === 'team') {
        query.actor = this.toObjectId(userId);
      } else if (userRole === 'admin') {
        query.$or = [
          { actor: this.toObjectId(userId) },
          { adminId: this.toObjectId(adminId) }
        ];
      }
      
      const auditLogs = await AuditLog.find(query)
        .sort({ createdAt: -1 })
        .limit(10000)
        .lean();
      
      return {
        success: true,
        auditLogs
      };
    } catch (error) {
      console.error('Error exporting audit logs:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get current user's own activity
   */
  async getUserActivity(userId, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;
      
      const [auditLogs, total] = await Promise.all([
        AuditLog.find({ actor: this.toObjectId(userId) })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        AuditLog.countDocuments({ actor: this.toObjectId(userId) })
      ]);
      
      return {
        success: true,
        auditLogs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching user activity:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get organization activity (for admins to see their team's activity)
   */
  async getOrganizationActivity(adminId, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;
      
      const [auditLogs, total] = await Promise.all([
        AuditLog.find({ adminId: this.toObjectId(adminId) })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        AuditLog.countDocuments({ adminId: this.toObjectId(adminId) })
      ]);
      
      // Fetch actor details separately if needed
      if (auditLogs.length > 0 && this.isReferenceField('actor')) {
        const actorIds = auditLogs.map(log => log.actor).filter(id => id);
        if (actorIds.length > 0) {
          const User = mongoose.model('User');
          const actors = await User.find({ _id: { $in: actorIds } })
            .select('name email role')
            .lean();
          
          const actorMap = new Map(actors.map(actor => [actor._id.toString(), actor]));
          
          auditLogs.forEach(log => {
            if (log.actor) {
              log.actorDetails = actorMap.get(log.actor.toString());
            }
          });
        }
      }
      
      return {
        success: true,
        auditLogs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching organization activity:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Alternative: Get audit logs with strictPopulate option disabled
   * Use this if you want to populate even if fields aren't in schema
   */
  async getAuditLogsWithStrictPopulate(filters = {}, page = 1, limit = 20, userRole = null, userId = null, adminId = null) {
    try {
      const query = {};
      
      // Apply filters (same as above)
      if (filters.action) query.action = filters.action;
      if (filters.resource) query.resource = filters.resource;
      if (filters.actorRole) query.actorRole = filters.actorRole;
      if (filters.status) query.status = filters.status;
      if (filters.resourceId) query.resourceId = this.toObjectId(filters.resourceId);
      
      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
        if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
      }
      
      if (filters.search) {
        query.$or = [
          { description: { $regex: filters.search, $options: 'i' } },
          { resourceName: { $regex: filters.search, $options: 'i' } },
          { actorEmail: { $regex: filters.search, $options: 'i' } },
          { referenceId: { $regex: filters.search, $options: 'i' } }
        ];
      }
      
      if (userRole === 'team') {
        query.actor = this.toObjectId(userId);
      } else if (userRole === 'admin') {
        query.$or = [
          { actor: this.toObjectId(userId) },
          { adminId: this.toObjectId(adminId) }
        ];
      }
      
      const skip = (page - 1) * limit;
      
      const [auditLogs, total] = await Promise.all([
        AuditLog.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .populate({ path: 'actor', select: 'name email role', strictPopulate: false })
          .populate({ path: 'adminId', select: 'name email role', strictPopulate: false })
          .lean(),
        AuditLog.countDocuments(query)
      ]);
      
      return {
        success: true,
        auditLogs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      console.error('Error fetching audit logs:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default new AuditLogService();