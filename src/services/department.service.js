import mongoose from 'mongoose';
import Department from '../models/department.model.js';
import User from '../models/user.model.js';
import { NotFoundError, ConflictError, ValidationError } from '../errors/customError.js';

class DepartmentService {

    async createDepartment(data, adminId, createdBy) {
        const existingDept = await Department.findOne({
            name: data.name,
            adminId,
            isDeleted: false
        });

        if (existingDept) {
            throw new ConflictError(`Department "${data.name}" already exists for this organization`);
        }

        const department = await Department.create({
            name: data.name,
            adminId,
            description: data.description || '',
            isActive: data.isActive !== undefined ? data.isActive : true,
            createdBy
        });

        return department;
    }

    async getAllDepartments(adminId, query = {}) {
        const { page = 1, limit = 10, search = '', isActive } = query;

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

        if (isActive !== undefined) filter.isActive = isActive === 'true';

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);

        const [departments, total] = await Promise.all([
            Department.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Department.countDocuments(filter)
        ]);

        const deptsWithCounts = await Promise.all(departments.map(async (dept) => {
            const memberCount = await User.countDocuments({
                adminId,
                department: dept._id,
                role: 'team',
                isDeleted: false
            });

            return {
                ...dept,
                memberCount
            };
        }));

        return {
            departments: deptsWithCounts,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        };
    }

    async getDepartmentById(deptId, adminId) {
        const department = await Department.findOne({
            _id: deptId,
            adminId,
            isDeleted: false
        }).lean();

        if (!department) {
            throw new NotFoundError('Department not found');
        }

        const memberCount = await User.countDocuments({
            adminId,
            department: department._id,
            role: 'team',
            isDeleted: false
        });

        return {
            ...department,
            memberCount
        };
    }

    async updateDepartment(deptId, adminId, updateData) {
        const department = await Department.findOne({
            _id: deptId,
            adminId,
            isDeleted: false
        });

        if (!department) {
            throw new NotFoundError('Department not found');
        }

        if (updateData.name && updateData.name !== department.name) {
            const existingDept = await Department.findOne({
                name: updateData.name,
                adminId,
                isDeleted: false,
                _id: { $ne: deptId }
            });

            if (existingDept) {
                throw new ConflictError(`Department "${updateData.name}" already exists for this organization`);
            }
            department.name = updateData.name;
        }

        if (updateData.description !== undefined) department.description = updateData.description;
        if (updateData.isActive !== undefined) department.isActive = updateData.isActive;

        await department.save();

        return this.getDepartmentById(deptId, adminId);
    }

    async deleteDepartment(deptId, adminId) {
        const department = await Department.findOne({
            _id: deptId,
            adminId,
            isDeleted: false
        });

        if (!department) {
            throw new NotFoundError('Department not found');
        }

        const memberCount = await User.countDocuments({
            adminId,
            department: department._id,
            role: 'team',
            isDeleted: false
        });

        if (memberCount > 0) {
            throw new ValidationError([{
                field: 'department',
                message: `Cannot delete department with ${memberCount} assigned team member(s). Reassign or deactivate members first.`
            }]);
        }

        department.isDeleted = true;
        await department.save();

        return { success: true, message: 'Department deleted successfully' };
    }
}

export default new DepartmentService();