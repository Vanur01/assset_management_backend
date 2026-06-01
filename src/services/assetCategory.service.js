import mongoose from 'mongoose';
import AssetCategory from '../models/assetCategory.model.js';
import Asset from '../models/asset.model.js';
import AuditLog from '../models/auditLog.model.js';

class AssetCategoryService {

    // Helper: Convert to ObjectId
    toObjectId(id) {
        if (!id) return null;
        if (id instanceof mongoose.Types.ObjectId) return id;
        if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
            return new mongoose.Types.ObjectId(id);
        }
        return null;
    }

    // ==================== CREATE CATEGORY ====================
    async createCategory(categoryData, adminId, userId, userRole) {
        try {
            const { name, description } = categoryData;

            // Check if category with same name exists for this admin
            const existingCategory = await AssetCategory.findOne({
                adminId: this.toObjectId(adminId),
                name: { $regex: new RegExp(`^${name}$`, 'i') },
                isDeleted: false
            });

            if (existingCategory) {
                throw new Error('Category with this name already exists');
            }

            const category = new AssetCategory({
                name: name.trim(),
                description: description || '',
                adminId: this.toObjectId(adminId),
                createdBy: this.toObjectId(userId),
                isActive: true,
                isDeleted: false
            });

            await category.save();

            // Create audit log
            await AuditLog.create({
                action: 'CATEGORY_CREATE',
                resource: 'category',
                resourceId: category._id,
                actor: userId,
                actorRole: userRole,
                description: `Created asset category: ${name}`,
                changes: { after: { name, description } }
            });

            return category;
        } catch (error) {
            throw error;
        }
    }

    // ==================== GET ALL CATEGORIES ====================
    async getCategories(adminId, page = 1, limit = 50) {
        try {
            let query = { isDeleted: false, adminId: this.toObjectId(adminId) };

            const skip = (page - 1) * limit;

            const [categories, total] = await Promise.all([
                AssetCategory.find(query)
                    .populate('createdBy', 'firstName lastName email name')
                    .sort({ name: 1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                AssetCategory.countDocuments(query)
            ]);

            return {
                categories,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            throw error;
        }
    }

    // ==================== GET SINGLE CATEGORY ====================
    async getCategoryById(categoryId, adminId) {
        try {
            const category = await AssetCategory.findOne({
                _id: this.toObjectId(categoryId),
                adminId: this.toObjectId(adminId),
                isDeleted: false
            }).populate('createdBy', 'firstName lastName email name').lean();

            if (!category) {
                throw new Error('Category not found');
            }

            return category;
        } catch (error) {
            throw error;
        }
    }

    // ==================== UPDATE CATEGORY ====================
    async updateCategory(categoryId, updateData, adminId, userId, userRole) {
        try {
            const category = await AssetCategory.findOne({
                _id: this.toObjectId(categoryId),
                adminId: this.toObjectId(adminId),
                isDeleted: false
            });

            if (!category) {
                throw new Error('Category not found');
            }

            const before = category.toObject();

            // Check name uniqueness if being updated
            if (updateData.name && updateData.name !== category.name) {
                const existingCategory = await AssetCategory.findOne({
                    adminId: this.toObjectId(adminId),
                    name: { $regex: new RegExp(`^${updateData.name}$`, 'i') },
                    isDeleted: false,
                    _id: { $ne: category._id }
                });

                if (existingCategory) {
                    throw new Error('Category with this name already exists');
                }
                category.name = updateData.name.trim();
            }

            // Update fields
            if (updateData.description !== undefined) {
                category.description = updateData.description;
            }

            if (updateData.isActive !== undefined) {
                category.isActive = updateData.isActive;
            }

            await category.save();

            // Create audit log
            await AuditLog.create({
                action: 'CATEGORY_UPDATE',
                resource: 'category',
                resourceId: category._id,
                actor: userId,
                actorRole: userRole,
                description: `Updated asset category: ${category.name}`,
                changes: { before, after: category.toObject() }
            });

            return category;
        } catch (error) {
            throw error;
        }
    }

    // ==================== DELETE CATEGORY (Soft Delete) ====================
    async deleteCategory(categoryId, adminId, userId, userRole) {
        try {
            const category = await AssetCategory.findOne({
                _id: this.toObjectId(categoryId),
                adminId: this.toObjectId(adminId),
                isDeleted: false
            });

            if (!category) {
                throw new Error('Category not found');
            }

            // Check if category is being used
            const assetCount = await Asset.countDocuments({
                assetCategoryId: category._id,
                isDeleted: false,
                adminId: this.toObjectId(adminId)
            });

            if (assetCount > 0) {
                throw new Error(`Cannot delete category. It is being used by ${assetCount} asset(s).`);
            }

            // Soft delete
            category.isDeleted = true;
            await category.save();

            // Create audit log
            await AuditLog.create({
                action: 'CATEGORY_DELETE',
                resource: 'category',
                resourceId: category._id,
                actor: userId,
                actorRole: userRole,
                description: `Deleted asset category: ${category.name}`
            });

            return {
                success: true,
                message: 'Category deleted successfully',
                categoryId: category._id
            };
        } catch (error) {
            throw error;
        }
    }
}

export default new AssetCategoryService();