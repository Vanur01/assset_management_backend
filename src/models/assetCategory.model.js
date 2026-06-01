import mongoose from 'mongoose';

const AssetCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        trim: true,
        unique: true
    },
    description: { type: String, trim: true },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
}, {
    timestamps: true
});

// Indexes
AssetCategorySchema.index({ adminId: 1, name: 1 });
AssetCategorySchema.index({ adminId: 1, isActive: 1 });
AssetCategorySchema.index({ adminId: 1, isDeleted: 1 });

const AssetCategory = mongoose.model('AssetCategory', AssetCategorySchema);
export default AssetCategory;