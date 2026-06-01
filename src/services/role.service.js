import TeamRole from '../models/teamRole.model.js';
import User from '../models/user.model.js';
import AuditLog from '../models/auditLog.model.js';
import {
    NotFoundError,
    ConflictError,
    ValidationError
} from '../errors/customError.js';

class RoleService {

    async createRole(data, adminId, createdBy) {
        const existingRole = await TeamRole.findOne({
            name: data.name.toLowerCase(),
            adminId,
            isDeleted: false
        });

        if (existingRole) {
            throw new ConflictError(
                `Role "${data.name}" already exists for this organization`
            );
        }

        const role = await TeamRole.create({
            name: data.name.toLowerCase(),
            adminId,
            description: data.description || '',
            isActive: data.isActive !== undefined ? data.isActive : true,
            createdBy
        });

        await AuditLog.create({
            action: 'ROLE_CREATED',
            resource: 'role',
            resourceId: role._id,
            actor: createdBy,
            actorRole: 'admin',
            description: `Role "${role.name}" created`
        });

        return role;
    }

    async getAllRoles(adminId, query = {}) {
        const {
            page = 1,
            limit = 10,
            search = '',
            isActive
        } = query;

        const filter = {
            adminId,
            isDeleted: false
        };

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }

        if (isActive !== undefined) {
            filter.isActive = isActive === 'true';
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);

        const [roles, total] = await Promise.all([
            TeamRole.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),

            TeamRole.countDocuments(filter)
        ]);

        const rolesWithCounts = await Promise.all(
            roles.map(async (role) => {
                const memberCount = await User.countDocuments({
                    adminId,
                    teamRole: role._id,
                    role: 'team',
                    isDeleted: false
                });

                return {
                    ...role,
                    memberCount,
                    displayName: role.name
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, c => c.toUpperCase())
                };
            })
        );

        return {
            roles: rolesWithCounts,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        };
    }

    async getRoleById(roleId, adminId) {
        const role = await TeamRole.findOne({
            _id: roleId,
            adminId,
            isDeleted: false
        }).lean();

        if (!role) {
            throw new NotFoundError('Role not found');
        }

        const memberCount = await User.countDocuments({
            adminId,
            teamRole: role._id,
            role: 'team',
            isDeleted: false
        });

        return {
            ...role,
            memberCount,
            displayName: role.name
                .replace(/_/g, ' ')
                .replace(/\b\w/g, c => c.toUpperCase())
        };
    }

    async updateRole(roleId, adminId, updateData) {
        const role = await TeamRole.findOne({
            _id: roleId,
            adminId,
            isDeleted: false
        });

        if (!role) {
            throw new NotFoundError('Role not found');
        }

        const oldValues = {
            name: role.name,
            description: role.description,
            isActive: role.isActive
        };

        if (
            updateData.name &&
            updateData.name.toLowerCase() !== role.name
        ) {
            const existingRole = await TeamRole.findOne({
                name: updateData.name.toLowerCase(),
                adminId,
                isDeleted: false,
                _id: { $ne: roleId }
            });

            if (existingRole) {
                throw new ConflictError(
                    `Role "${updateData.name}" already exists for this organization`
                );
            }

            role.name = updateData.name.toLowerCase();
        }

        if (updateData.description !== undefined) {
            role.description = updateData.description;
        }

        if (updateData.isActive !== undefined) {
            role.isActive = updateData.isActive;
        }

        await role.save();

        await AuditLog.create({
            action: 'ROLE_UPDATED',
            resource: 'role',
            resourceId: role._id,
            actor: adminId,
            actorRole: 'admin',
            description: `Role "${role.name}" updated`,
            metadata: {
                before: oldValues,
                after: {
                    name: role.name,
                    description: role.description,
                    isActive: role.isActive
                }
            }
        });

        return this.getRoleById(roleId, adminId);
    }

    async deleteRole(roleId, adminId) {
        const role = await TeamRole.findOne({
            _id: roleId,
            adminId,
            isDeleted: false
        });

        if (!role) {
            throw new NotFoundError('Role not found');
        }

        const memberCount = await User.countDocuments({
            adminId,
            teamRole: role._id,
            role: 'team',
            isDeleted: false
        });

        role.isDeleted = true;
        await role.save();

        await AuditLog.create({
            action: 'ROLE_DELETED',
            resource: 'role',
            resourceId: role._id,
            actor: adminId,
            actorRole: 'admin',
            description: `Role "${role.name}" deleted`
        });

        return {
            success: true,
            message: 'Role deleted successfully'
        };
    }

}

export default new RoleService();