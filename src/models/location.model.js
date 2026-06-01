import mongoose from 'mongoose';

const locationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Location name is required'],
        trim: true
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

locationSchema.index({ adminId: 1, name: 1 }, { unique: true });
locationSchema.index({ adminId: 1, isActive: 1 });

const Location = mongoose.models.Location || mongoose.model('Location', locationSchema);
export default Location;