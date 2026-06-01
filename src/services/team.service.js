import mongoose from 'mongoose';
import crypto from 'crypto';
import User from '../models/user.model.js';
import TeamRole from '../models/teamRole.model.js';
import Department from '../models/department.model.js';
import Location from '../models/location.model.js';
import AuditLog from '../models/auditLog.model.js';
import EmailService from './email.service.js';
import NotificationService from './notification.service.js';
import { NotFoundError, ConflictError, ValidationError, AuthorizationError } from '../errors/customError.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const toLabel = v => v?.replace(/_/g, ' ')?.replace(/\b\w/g, c => c.toUpperCase()) || '';

const requireAdmin = async (adminId) => {
  const admin = await User.findOne({ _id: adminId, role: 'admin', isDeleted: false });
  if (!admin) throw new NotFoundError('Admin not found');
  return admin;
};

const requireTeamMember = async (memberId, adminId) => {
  const member = await User.findOne({ _id: memberId, role: 'team', adminId, isDeleted: false });
  if (!member) throw new NotFoundError('Team member not found');
  return member;
};

const STATUS_COLOR = { active: 'green', on_leave: 'orange', inactive: 'gray' };

// Helper to get reference document details
const getReferenceDetails = async (model, id, fieldName = 'name') => {
  if (!id) return null;
  const doc = await model.findById(id).select(fieldName).lean();
  return doc ? { id: doc._id, [fieldName]: doc[fieldName] } : null;
};

const formatMember = async (m) => {
  // Fetch reference data
  const [role, department, location] = await Promise.all([
    m.roleId ? getReferenceDetails(TeamRole, m.roleId, 'name') : null,
    m.departmentId ? getReferenceDetails(Department, m.departmentId, 'name') : null,
    m.locationId ? getReferenceDetails(Location, m.locationId, 'name') : null
  ]);

  return {
    id: m._id,
    firstName: m.firstName,
    lastName: m.lastName,
    initials: m.initials,
    email: m.email,
    role: m.roleDisplay,
    teamRole: role?.name || m.teamRole,
    teamRoleId: m.roleId,
    teamRoleDisplay: role?.name ? toLabel(role.name) : toLabel(m.teamRole),
    department: department?.name || m.department,
    departmentId: m.departmentId,
    location: location?.name || m.location,
    locationId: m.locationId,
    customRole: m.customRole,
    assignedCount: m.assignedCount,
    completedCount: m.completedCount,
    performance: `${m.performanceScore}%`,
    performanceScore: m.performanceScore,
    status: m.status,
    statusColor: STATUS_COLOR[m.status] || 'red',
    avatarUrl: m.avatarUrl,
    phone: m.phone,
    teamCreatedAt: m.teamCreatedAt,
    teamTenureDays: m.teamTenureDays,
    joinDate: m.joinDate
  };
};

const MEMBER_SELECT = '-password -refreshToken -passwordResetToken';

// ── Service ───────────────────────────────────────────────────────────────────

class TeamService {

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async createTeamMember(data, adminId, createdBy) {
    const admin = await requireAdmin(adminId);
    if (!admin.canAddUsers()) {
      throw new AuthorizationError(`License limit reached (${admin.usersUsed}/${admin.licenseLimit})`);
    }
    if (await User.exists({ email: data.email })) {
      throw new ConflictError('Email already registered');
    }

    // Validate and fetch reference documents
    let roleDoc = null, deptDoc = null, locDoc = null;

    if (data.roleId) {
      roleDoc = await TeamRole.findOne({ _id: data.roleId, adminId, isDeleted: false });
      if (!roleDoc) throw new NotFoundError('Team role not found');
    }

    if (data.departmentId) {
      deptDoc = await Department.findOne({ _id: data.departmentId, adminId, isDeleted: false });
      if (!deptDoc) throw new NotFoundError('Department not found');
    }

    if (data.locationId) {
      locDoc = await Location.findOne({ _id: data.locationId, adminId, isDeleted: false });
      if (!locDoc) throw new NotFoundError('Location not found');
    }

    const tempPassword = data.password || `${crypto.randomBytes(6).toString('hex')}@123`;
    const resetToken = crypto.randomBytes(32).toString('hex');

    const member = await User.create({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      password: tempPassword,
      phone: data.phone,
      role: 'team',
      teamRole: roleDoc?.name || data.teamRole || 'inspector',
      roleId: data.roleId || null,
      department: deptDoc?.name || data.department || 'General',
      departmentId: data.departmentId || null,
      location: locDoc?.name || data.location || 'Main Office',
      locationId: data.locationId || null,
      customRole: data.customRole || null,
      bio: data.bio,
      adminId,
      createdBy,
      teamCreatedBy: createdBy,
      teamCreatedAt: new Date(),
      status: 'active',
      joinDate: new Date(),
      passwordResetToken: crypto.createHash('sha256').update(resetToken).digest('hex'),
      passwordResetExpires: Date.now() + 3 * 24 * 60 * 60 * 1000
    });

    // Update admin usage count
    admin.usersUsed = await User.countDocuments({ adminId, role: 'team', status: 'active', isDeleted: false });
    await admin.save();

    await EmailService.sendTeamMemberWelcomeEmail(member, admin, tempPassword, resetToken, createdBy);
    await NotificationService.notifyTeamMemberCreated(member, admin, tempPassword);

    const auditNewData = {
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      teamRole: member.teamRole,
      roleId: member.roleId,
      department: member.department,
      departmentId: member.departmentId,
      location: member.location,
      locationId: member.locationId,
      teamCreatedAt: member.teamCreatedAt
    };

    await AuditLog.create({
      action: 'CREATE',
      resource: 'user',
      resourceId: member._id,
      actor: createdBy,
      actorRole: 'admin',
      description: `Team member ${member.firstName} ${member.lastName || ''} created`,
      newData: auditNewData
    });

    const response = member.toObject();
    delete response.password;
    delete response.passwordResetToken;
    response.temporaryPassword = tempPassword;
    return response;
  }

  async getAllTeamMembers(adminId, query = {}) {
    const opts = {
      sortBy: query.sortBy || 'performanceScore',
      sortOrder: query.sortOrder || 'desc',
      page: parseInt(query.page) || 1,
      limit: parseInt(query.limit) || 10,
      search: query.search || '',
      teamRole: query.teamRole || '',
      department: query.department || '',
      location: query.location || '',
      status: query.status || ''
    };

    // Build filter query
    const filter = {
      adminId: adminId,
      role: 'team',
      isDeleted: false
    };

    if (opts.search) {
      filter.$or = [
        { firstName: { $regex: opts.search, $options: 'i' } },
        { lastName: { $regex: opts.search, $options: 'i' } },
        { email: { $regex: opts.search, $options: 'i' } }
      ];
    }

    if (opts.teamRole && mongoose.Types.ObjectId.isValid(opts.teamRole)) {
      filter.roleId = opts.teamRole;
    }

    if (opts.department && mongoose.Types.ObjectId.isValid(opts.department)) {
      filter.departmentId = opts.department;
    }

    if (opts.location && mongoose.Types.ObjectId.isValid(opts.location)) {
      filter.locationId = opts.location;
    }

    if (opts.status) filter.status = opts.status;

    // Build sort object
    const sort = {};
    sort[opts.sortBy] = opts.sortOrder === 'desc' ? -1 : 1;

    // Get total count for pagination
    const total = await User.countDocuments(filter);

    // Find members with populate
    const members = await User.find(filter)
      .select(MEMBER_SELECT)
      .populate('roleId', 'name description')  // Populate team role
      .populate('departmentId', 'name description')  // Populate department
      .populate('locationId', 'name description')  // Populate location
      .populate('teamCreatedBy', 'firstName lastName email')
      .sort(sort)
      .skip((opts.page - 1) * opts.limit)
      .limit(opts.limit)
      .lean();

    // Format members
    const formattedMembers = await Promise.all(members.map(formatMember));

    // Get stats
    const stats = await User.aggregate([
      { $match: filter },
      {
        $facet: {
          active: [{ $match: { status: 'active' } }, { $count: 'count' }],
          onLeave: [{ $match: { status: 'on_leave' } }, { $count: 'count' }],
          inactive: [{ $match: { status: 'inactive' } }, { $count: 'count' }],
          avgPerformance: [
            { $match: { status: 'active', performanceScore: { $gt: 0 } } },
            { $group: { _id: null, avg: { $avg: '$performanceScore' } } }
          ],
          totalInspections: [{ $group: { _id: null, total: { $sum: '$completedCount' } } }],
          totalAssigned: [{ $group: { _id: null, total: { $sum: '$assignedCount' } } }]
        }
      }
    ]);

    // Get unique filter options from database (not from members)
    const [allRoles, allDepartments, allLocations] = await Promise.all([
      TeamRole.find({ adminId, isDeleted: false, isActive: true })
        .select('name description')
        .lean(),
      Department.find({ adminId, isDeleted: false, isActive: true })
        .select('name description')
        .lean(),
      Location.find({ adminId, isDeleted: false, isActive: true })
        .select('name description')
        .lean()
    ]);

    return {
      members: formattedMembers,
      stats: {
        total,
        active: stats[0]?.active[0]?.count || 0,
        onLeave: stats[0]?.onLeave[0]?.count || 0,
        inactive: stats[0]?.inactive[0]?.count || 0,
        avgPerformance: `${Math.round(stats[0]?.avgPerformance[0]?.avg || 0)}%`,
        totalInspections: stats[0]?.totalInspections[0]?.total || 0,
        totalAssigned: stats[0]?.totalAssigned[0]?.total || 0
      },
      filters: {
        availableRoles: allRoles.map(role => ({
          value: role._id,
          label: toLabel(role.name),
          description: role.description
        })),
        availableDepartments: allDepartments.map(dept => ({
          value: dept._id,
          label: dept.name,
          description: dept.description
        })),
        availableLocations: allLocations.map(loc => ({
          value: loc._id,
          label: loc.name,
          description: loc.description
        }))
      },
      pagination: {
        page: opts.page,
        limit: opts.limit,
        total,
        pages: Math.ceil(total / opts.limit)
      }
    };
  }

  async getTeamMemberById(memberId, adminId) {

    const member = await User.findOne({ _id: memberId, role: 'team', adminId, isDeleted: false })
      .select(MEMBER_SELECT)
      .populate('teamCreatedBy', 'firstName lastName email')
      .lean();

    if (!member) throw new NotFoundError('Team member not found');

    // Fetch reference data
    const [role, department, location] = await Promise.all([
      member.roleId ? getReferenceDetails(TeamRole, member.roleId, 'name') : null,
      member.departmentId ? getReferenceDetails(Department, member.departmentId, 'name') : null,
      member.locationId ? getReferenceDetails(Location, member.locationId, 'name') : null
    ]);

    const Assignment = mongoose.model('Assignments');
    const assignments = await Assignment.find({ 'assignedToTeamMembers.userId': member._id }).lean();

    const completedCount = assignments.filter(a => ['completed', 'approved'].includes(a.status)).length;
    const activeCount = assignments.filter(a => ['pending', 'in_progress', 'assigned'].includes(a.status)).length;
    const total = completedCount + activeCount;
    const performanceScore = member.performanceScore || (total > 0 ? Math.round((completedCount / total) * 100) : 0);

    return {
      ...member,
      roleDetails: role,
      departmentDetails: department,
      locationDetails: location,
      assignedCount: activeCount,
      completedCount,
      performanceScore,
      performanceDisplay: `${performanceScore}%`,
      completionRate: total > 0 ? Math.round((completedCount / total) * 100) : 0,
      teamTenureDays: member.teamTenureDays,
      teamCreatedAtFormatted: member.teamCreatedAt
        ? new Date(member.teamCreatedAt).toLocaleDateString()
        : null
    };
  }

  async getTeamMemberDetails(memberId, adminId) {
    const member = await User.getTeamMemberDetails(memberId, adminId);
    if (!member) throw new NotFoundError('Team member not found');

    // Fetch reference data
    const [role, department, location] = await Promise.all([
      member.roleId ? getReferenceDetails(TeamRole, member.roleId, 'name') : null,
      member.departmentId ? getReferenceDetails(Department, member.departmentId, 'name') : null,
      member.locationId ? getReferenceDetails(Location, member.locationId, 'name') : null
    ]);

    return { ...member, roleDetails: role, departmentDetails: department, locationDetails: location };
  }

  async updateTeamMember(memberId, adminId, updateData, actorId) {
    const member = await requireTeamMember(memberId, adminId);

    // Store old data for audit
    const oldData = {
      status: member.status,
      teamRole: member.teamRole,
      roleId: member.roleId,
      department: member.department,
      departmentId: member.departmentId,
      location: member.location,
      locationId: member.locationId
    };

    // Handle reference ID updates
    if (updateData.roleId) {
      const roleDoc = await TeamRole.findOne({ _id: updateData.roleId, adminId, isDeleted: false });
      if (!roleDoc) throw new NotFoundError('Team role not found');
      member.roleId = updateData.roleId;
      member.teamRole = roleDoc.name;
      delete updateData.roleId;
    }

    if (updateData.departmentId) {
      const deptDoc = await Department.findOne({ _id: updateData.departmentId, adminId, isDeleted: false });
      if (!deptDoc) throw new NotFoundError('Department not found');
      member.departmentId = updateData.departmentId;
      member.department = deptDoc.name;
      delete updateData.departmentId;
    }

    if (updateData.locationId) {
      const locDoc = await Location.findOne({ _id: updateData.locationId, adminId, isDeleted: false });
      if (!locDoc) throw new NotFoundError('Location not found');
      member.locationId = updateData.locationId;
      member.location = locDoc.name;
      delete updateData.locationId;
    }

    const ALLOWED = [
      'firstName', 'lastName', 'phone', 'teamRole', 'department', 'location',
      'customRole', 'bio', 'status', 'certifications', 'address',
      'adminNotes', 'avatarUrl', 'performanceScore', 'qualityScore',
      'assignedCount', 'completedCount', 'onTimeRate'
    ];
    ALLOWED.forEach(k => { if (updateData[k] !== undefined) member[k] = updateData[k]; });
    await member.save();

    if (updateData.status === 'inactive' && oldData.status !== 'inactive') {
      const admin = await User.findById(adminId);
      await Promise.all([
        EmailService.sendTeamMemberRemovedEmail(member, admin, actorId),
        NotificationService.notifyTeamMemberDeactivated(member, admin)
      ]);
    }

    // Get new reference names for audit
    const newData = {
      status: member.status,
      teamRole: member.teamRole,
      roleId: member.roleId,
      department: member.department,
      departmentId: member.departmentId,
      location: member.location,
      locationId: member.locationId
    };

    // Fetch names for better audit readability
    if (member.roleId) {
      const roleDoc = await TeamRole.findById(member.roleId).select('name').lean();
      if (roleDoc) newData.roleName = roleDoc.name;
    }
    if (member.departmentId) {
      const deptDoc = await Department.findById(member.departmentId).select('name').lean();
      if (deptDoc) newData.departmentName = deptDoc.name;
    }
    if (member.locationId) {
      const locDoc = await Location.findById(member.locationId).select('name').lean();
      if (locDoc) newData.locationName = locDoc.name;
    }

    await AuditLog.create({
      action: 'UPDATE',
      resource: 'user',
      resourceId: member._id,
      actor: actorId,
      actorRole: 'admin',
      description: `Team member ${member.firstName} ${member.lastName || ''} updated`,
      oldData,
      newData
    });

    return this.getTeamMemberById(memberId, adminId);
  }

  async deleteTeamMember(memberId, adminId, actorId) {
    const member = await requireTeamMember(memberId, adminId);
    await member.softDelete(actorId);

    const admin = await User.findById(adminId);
    if (admin) {
      admin.usersUsed = await User.countDocuments({ adminId, role: 'team', status: 'active', isDeleted: false });
      await admin.save();
    }

    await Promise.all([
      EmailService.sendTeamMemberRemovedEmail(member, admin, actorId),
      NotificationService.notifyTeamMemberDeactivated(member, admin),
      AuditLog.create({
        action: 'SOFT_DELETE',
        resource: 'user',
        resourceId: member._id,
        actor: actorId,
        actorRole: 'admin',
        description: `Team member ${member.firstName} ${member.lastName || ''} deactivated`,
        oldData: {
          roleId: member.roleId,
          departmentId: member.departmentId,
          locationId: member.locationId
        }
      })
    ]);

    return { success: true, message: 'Team member deactivated successfully' };
  }


  // ── Team Self-Service ────────────────────────────────────────────────────────

  async getMyProfile(memberId) {
    const member = await User.findOne({ _id: memberId, role: 'team', isDeleted: false })
      .select(MEMBER_SELECT)
      .populate('adminId', 'customerName email')
      .populate('teamCreatedBy', 'firstName lastName email')
      .lean();
    if (!member) throw new NotFoundError('Team member not found');

    // Fetch reference data
    const [role, department, location] = await Promise.all([
      member.roleId ? getReferenceDetails(TeamRole, member.roleId, 'name') : null,
      member.departmentId ? getReferenceDetails(Department, member.departmentId, 'name') : null,
      member.locationId ? getReferenceDetails(Location, member.locationId, 'name') : null
    ]);

    return { ...member, roleDetails: role, departmentDetails: department, locationDetails: location };
  }

  async updateMyProfile(memberId, updateData) {
    const member = await User.findOne({ _id: memberId, role: 'team' });
    if (!member) throw new NotFoundError('Team member not found');

    ['firstName', 'lastName', 'phone', 'bio', 'address', 'avatarUrl'].forEach(k => {
      if (updateData[k] !== undefined) member[k] = updateData[k];
    });
    await member.save();
    return this.getMyProfile(memberId);
  }

  async changeMyPassword(memberId, { currentPassword, newPassword }) {
    const member = await User.findById(memberId).select('+password');
    if (!member) throw new NotFoundError('Team member not found');
    if (!(await member.comparePassword(currentPassword))) {
      throw new ValidationError([{ field: 'currentPassword', message: 'Current password is incorrect' }]);
    }
    member.password = newPassword;
    await member.save();
    return { success: true, message: 'Password changed successfully' };
  }

  getMyRecentInspections(memberId, limit = 10) {
    const Assignment = mongoose.model('Assignments');
    return Assignment.find({ 'assignedToTeamMembers.userId': memberId })
      .sort('-submittedAt').limit(limit)
      .populate('checklist', 'name')
      .populate('assets.assetId', 'assetName assetId currentLocation')
      .lean();
  }
}

export default new TeamService();