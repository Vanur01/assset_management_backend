import mongoose from 'mongoose';

const teamRoleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Role name is required'],
        trim: true,
        lowercase: true
    },
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    description: {
        type: String,
        trim: true,
        maxlength: 200
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    isDeleted: {
        type: Boolean,
        default: false,
        index: true
    }
}, {
    timestamps: true
});

// Ensure unique role name per admin
teamRoleSchema.index({ adminId: 1, name: 1 }, { unique: true });
teamRoleSchema.index({ adminId: 1, isActive: 1 });

const TeamRole = mongoose.models.TeamRole || mongoose.model('TeamRole', teamRoleSchema);
export default TeamRole;