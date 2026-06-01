import mongoose from 'mongoose';

const NotificationSchema = new mongoose.Schema({
    // Recipient
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    recipientRole: {
        type: String,
        enum: ['super_admin', 'admin', 'team'],
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    senderModel: { type: String, default: 'User' },
    title: {
        type: String,
        required: true,
        trim: true
    },
    message: {
        type: String,
        required: true,
        trim: true
    },
    type: {
        type: String,
        enum: [
            'team_created',
            'team_deactivated',
            'client_created',
            'client_deactivated',
            'subscription_expiring',
            'inactivity_reminder',
            'password_reset',
            'contact_inquiry',
            'assignment_created',
            'inspection_completed',
            'system_alert'
        ],
        required: true,
        index: true
    },

    // Priority
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },

    // Read status
    isRead: {
        type: Boolean,
        default: false,
        index: true
    },
    readAt: Date,

    // Action link (optional)
    actionLink: {
        type: String,
        trim: true
    },

    // Related entities
    relatedEntityId: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'relatedEntityModel'
    },
    relatedEntityModel: {
        type: String
    },

    // Metadata
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },

    // Expiry
    expiresAt: {
        type: Date,
        default: () => new Date(+new Date() + 30 * 24 * 60 * 60 * 1000) // 30 days
    },

    // Reference fields
    referenceId: { type: String, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByModel: { type: String, default: 'User' }

}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for efficient queries
NotificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ type: 1, createdAt: -1 });
NotificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-delete expired

// Virtual for formatted time
NotificationSchema.virtual('timeAgo').get(function () {
    const diff = Date.now() - this.createdAt;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    return `${days} day${days > 1 ? 's' : ''} ago`;
});

// Method to mark as read
NotificationSchema.methods.markAsRead = async function () {
    if (!this.isRead) {
        this.isRead = true;
        this.readAt = new Date();
        await this.save();
    }
    return this;
};

// Static method to get unread count
NotificationSchema.statics.getUnreadCount = async function (userId) {
    return this.countDocuments({ recipient: userId, isRead: false });
};

// Static method to bulk mark as read
NotificationSchema.statics.markAllAsRead = async function (userId) {
    return this.updateMany(
        { recipient: userId, isRead: false },
        { isRead: true, readAt: new Date() }
    );
};

const Notification = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
export default Notification;