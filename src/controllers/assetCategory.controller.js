import AssetCategoryService from '../services/assetCategory.service.js';

class AssetCategoryController {

    // Create Category (Admin only)
    createCategory = async (req, res) => {
        try {
            const { userRole, userId, adminId } = req;
            const { name, description } = req.body;

            if (!name) {
                return res.status(400).json({ success: false, error: 'Category name is required' });
            }

            const category = await AssetCategoryService.createCategory(
                { name, description },
                adminId,
                userId,
                userRole
            );

            res.status(201).json({ success: true, data: category });
        } catch (error) {
            res.status(400).json({ success: false, error: error.message });
        }
    };

    // Get All Categories
    getCategories = async (req, res) => {
        try {
            const { adminId } = req;
            const { page = 1, limit = 50 } = req.query;

            const result = await AssetCategoryService.getCategories(
                adminId,
                parseInt(page),
                parseInt(limit)
            );

            res.status(200).json({ success: true, ...result });
        } catch (error) {
            res.status(400).json({ success: false, error: error.message });
        }
    };

    // Get Single Category
    getCategoryById = async (req, res) => {
        try {
            const { adminId } = req;
            const { id } = req.params;

            const category = await AssetCategoryService.getCategoryById(id, adminId);

            res.status(200).json({ success: true, data: category });
        } catch (error) {
            res.status(400).json({ success: false, error: error.message });
        }
    };

    // Update Category
    updateCategory = async (req, res) => {
        try {
            const { userRole, userId, adminId } = req;
            const { id } = req.params;
            const { name, description, isActive } = req.body;

            const category = await AssetCategoryService.updateCategory(
                id,
                { name, description, isActive },
                adminId,
                userId,
                userRole
            );

            res.status(200).json({ success: true, data: category });
        } catch (error) {
            res.status(400).json({ success: false, error: error.message });
        }
    };

    // Delete Category (Soft delete)
    deleteCategory = async (req, res) => {
        try {
            const { userRole, userId, adminId } = req;
            const { id } = req.params;

            const result = await AssetCategoryService.deleteCategory(
                id,
                adminId,
                userId,
                userRole
            );

            res.status(200).json({ success: true, message: result.message });
        } catch (error) {
            res.status(400).json({ success: false, error: error.message });
        }
    };
}

export default new AssetCategoryController();