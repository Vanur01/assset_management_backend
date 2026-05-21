import User from '../models/user.model.js';
import Asset from '../models/asset.model.js';
import Assignment from '../models/AssignedChecklist.model.js';
import Contact from '../models/contact.model.js'
import crypto from 'crypto';
import mongoose from 'mongoose';
import ExcelJS from 'exceljs';
import {
    AuthenticationError,
    ValidationError,
    NotFoundError,
    AuthorizationError,
    ConflictError
} from '../errors/customError.js';

class UserService {
    // ==================== AUTHENTICATION METHODS ====================

    async registersuper_admin(data) {
        const existingUser = await User.findOne({ email: data.email });
        if (existingUser) throw new ConflictError('Email already registered');

        const super_admin = await User.create({
            name: data.name,
            email: data.email,
            password: data.password,
            phone: data.phone || null,
            role: 'super_admin',
            status: 'active',
            permissions: ['*']
        });

        const accessToken = super_admin.generateAuthToken();
        const refreshToken = super_admin.generateRefreshToken();
        super_admin.refreshToken = refreshToken;
        await super_admin.save();

        return { user: this.formatUserResponse(super_admin), accessToken, refreshToken };
    }

    async login({ email, password }) {
        const user = await User.findOne({ email }).select('+password');
        if (!user) throw new AuthenticationError('Invalid email or password');
        if (user.isDeleted) throw new AuthenticationError('Account not found');
        if (user.status !== 'active') {
            throw new AuthenticationError('Account is not active');
        }

        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) throw new AuthenticationError('Invalid email or password');

        user.lastLogin = new Date();
        user.lastActiveAt = new Date();
        if (user.role === 'team') user.lastLoginDate = new Date();

        const accessToken = user.generateAuthToken();
        const refreshToken = user.generateRefreshToken();
        user.refreshToken = refreshToken;
        await user.save();

        return { accessToken, refreshToken, user: this.formatUserResponse(user) };
    }

    async logout(userId) {
        await User.findByIdAndUpdate(userId, { $unset: { refreshToken: 1, token: 1 } });
        return true;
    }

    async getCurrentUser(userId) {
        const user = await User.findById(userId).lean();
        if (!user) throw new NotFoundError('User not found');
        return this.formatUserResponse(user);
    }

    async changePassword(userId, currentPassword, newPassword) {
        const user = await User.findById(userId).select('+password');
        if (!user) throw new NotFoundError('User not found');

        const isValid = await user.comparePassword(currentPassword);
        if (!isValid) throw new ValidationError([{ field: 'currentPassword', message: 'Current password is incorrect' }]);

        user.password = newPassword;
        user.refreshToken = undefined;
        await user.save();
        return true;
    }

    async updateLastActive(userId) {
        await User.findByIdAndUpdate(userId, { lastActiveAt: new Date(), lastLogin: new Date() });
        return true;
    }

    // ==================== CLIENT MANAGEMENT (Super Admin Only) ====================

    async createClient(data, createdBy) {
        const existing = await User.findOne({ email: data.email });
        if (existing) throw new ConflictError('Email already registered');

        const tempPassword = data.password || crypto.randomBytes(8).toString('hex');
        const durationDays = data.duration || 30;
        const subscriptionEndDate = new Date();
        subscriptionEndDate.setDate(subscriptionEndDate.getDate() + durationDays);

        const client = await User.create({
            customerName: data.customerName,
            email: data.email,
            password: tempPassword,
            phone: data.phone,
            website: data.website,
            address: data.address,
            role: 'admin',
            status: 'active',
            membershipPlan: data.membershipPlan || 'standard',
            subscriptionEndDate,
            licenseLimit: data.licenseLimit || 10,
            storageLimit: data.storageLimit || 10,
            apiCallLimit: data.apiCallLimit || 10000,
            notes: data.notes,
            createdBy,
            settings: { autoRenewal: data.autoRenewal !== false }
        });

        const response = client.toObject();
        delete response.password;
        if (!data.password) response.temporaryPassword = tempPassword;
        return response;
    }

    async getAllClients(filters = {}) {
        const { status, membershipPlan, search, expiringSoon, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = filters;
        const query = { role: 'admin', isDeleted: false };
        if (status) query.status = status;
        if (membershipPlan) query.membershipPlan = membershipPlan;
        if (search) {
            query.$or = [
                { customerName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        if (expiringSoon === 'true') {
            const thirtyDaysFromNow = new Date();
            thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
            query.subscriptionEndDate = { $lte: thirtyDaysFromNow, $gt: new Date() };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

        const [clients, total] = await Promise.all([
            User.find(query).select('-password -refreshToken').sort(sort).skip(skip).limit(parseInt(limit)).lean(),
            User.countDocuments(query)
        ]);

        const clientsWithStats = await Promise.all(clients.map(async (client) => {
            const teamCount = await User.countDocuments({ adminId: client._id, role: 'team', isDeleted: false });
            const assetCount = await Asset.countDocuments({ adminId: client._id, isDeleted: false });
            return {
                ...client,
                daysRemaining: client.daysRemaining,
                usagePercentage: client.usagePercentage || Math.round((teamCount / client.licenseLimit) * 100),
                stats: { teamCount, assetCount }
            };
        }));

        const summary = {
            total,
            totalCustomers: total,
            activeCustomers: clients.filter(c => c.status === 'active').length,
            expiringSoon: clientsWithStats.filter(c => c.daysRemaining <= 30 && c.daysRemaining > 0).length,
            byPlan: {
                free: clients.filter(c => c.membershipPlan === 'free').length,
                standard: clients.filter(c => c.membershipPlan === 'standard').length,
                premium: clients.filter(c => c.membershipPlan === 'premium').length,
                enterprise: clients.filter(c => c.membershipPlan === 'enterprise').length
            }
        };

        return { clients: clientsWithStats, summary, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } };
    }

    async getClientById(clientId) {
        const client = await User.findOne({ _id: clientId, role: 'admin', isDeleted: false }).select('-password -refreshToken').lean();
        if (!client) throw new NotFoundError('Client not found');

        const [teamCount, activeTeamCount, assetCount] = await Promise.all([
            User.countDocuments({ adminId: clientId, role: 'team', isDeleted: false }),
            User.countDocuments({ adminId: clientId, role: 'team', status: 'active', isDeleted: false }),
            Asset.countDocuments({ adminId: clientId, isDeleted: false })
        ]);

        return {
            ...client,
            daysRemaining: client.daysRemaining,
            usagePercentage: client.usagePercentage,
            storagePercentage: client.storagePercentage,
            apiUsagePercentage: client.apiUsagePercentage,
            stats: { team: { total: teamCount, active: activeTeamCount }, assets: assetCount }
        };
    }

    async updateClient(clientId, updateData) {
        const client = await User.findOne({
            _id: clientId,
            role: 'admin'
        });

        if (!client) {
            throw new NotFoundError('Client not found');
        }

        // Check email uniqueness
        if (updateData.email && updateData.email !== client.email) {
            const existing = await User.findOne({
                email: updateData.email
            });

            if (existing) {
                throw new ConflictError('Email already in use');
            }
        }

        if (updateData.extendDays) {
            const baseDate = client.subscriptionEndDate
                ? new Date(client.subscriptionEndDate)
                : new Date();

            baseDate.setDate(baseDate.getDate() + Number(updateData.extendDays));
            updateData.subscriptionEndDate = baseDate;
            delete updateData.extendDays;
        }

        Object.assign(client, updateData);
        await client.save();
        const response = client.toObject();
        delete response.password;

        return response;
    }

    async deleteClient(clientId, permanent = false) {
        const client = await User.findOne({ _id: clientId, role: 'admin' });
        if (!client) throw new NotFoundError('Client not found');

        if (permanent) {
            await client.deleteOne();
            return { message: 'Client permanently deleted' };
        } else {
            await client.softDelete(client.createdBy);
            return { message: 'Client deactivated' };
        }
    }

    async toggleClientStatus(clientId, status) {
        if (!['active', 'inactive'].includes(status)) {
            throw new ValidationError([{ field: 'status', message: 'Status must be either "active" or "inactive"' }]);
        }
        const client = await User.findOne({ _id: clientId, role: 'admin' });
        if (!client) throw new NotFoundError('Client not found');
        if (client.status === status) throw new ConflictError(`Client is already ${status === 'active' ? 'active' : 'inactive'}`);

        client.status = status;
        if (status === 'inactive') {
            await User.updateMany({ adminId: clientId, role: 'team', isDeleted: false }, { status: 'inactive' });
        }
        await client.save();
        return { success: true, message: `Client ${status === 'active' ? 'activated' : 'deactivated'} successfully` };
    }

    async toggleAutoRenewal(clientId, enabled) {
        const client = await User.findOne({ _id: clientId, role: 'admin' });
        if (!client) throw new NotFoundError('Client not found');
        if (!client.settings) client.settings = {};
        client.settings.autoRenewal = enabled;
        await client.save();
        return { autoRenewal: enabled };
    }

    async getSubscriptionReport(filters = {}) {
        const { startDate, endDate, membershipPlan, status } = filters;
        const query = { role: 'admin', isDeleted: false };
        if (membershipPlan) query.membershipPlan = membershipPlan;
        if (status) query.status = status;
        if (startDate || endDate) {
            query.subscriptionEndDate = {};
            if (startDate) query.subscriptionEndDate.$gte = new Date(startDate);
            if (endDate) query.subscriptionEndDate.$lte = new Date(endDate);
        }

        const clients = await User.find(query).select('customerName email membershipPlan subscriptionStartDate subscriptionEndDate status licenseLimit usersUsed').lean();
        return clients;
    }

    async exportSubscriptionReport(filters = {}) {
        const clients = await this.getSubscriptionReport(filters);
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Subscription Report');

        worksheet.columns = [
            { header: 'Customer Name', key: 'customerName', width: 30 },
            { header: 'Email', key: 'email', width: 35 },
            { header: 'Plan', key: 'membershipPlan', width: 15 },
            { header: 'Start Date', key: 'subscriptionStartDate', width: 15 },
            { header: 'End Date', key: 'subscriptionEndDate', width: 15 },
            { header: 'Days Remaining', key: 'daysRemaining', width: 15 },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'Licenses Used', key: 'usersUsed', width: 15 },
            { header: 'License Limit', key: 'licenseLimit', width: 15 }
        ];

        clients.forEach(client => {
            worksheet.addRow({
                customerName: client.customerName,
                email: client.email,
                membershipPlan: client.membershipPlan,
                subscriptionStartDate: client.subscriptionStartDate?.toISOString().split('T')[0],
                subscriptionEndDate: client.subscriptionEndDate?.toISOString().split('T')[0],
                daysRemaining: client.daysRemaining,
                status: client.status,
                usersUsed: client.usersUsed,
                licenseLimit: client.licenseLimit
            });
        });

        return workbook;
    }

    async getAdminDashboardStats(adminId) {
        const admin = await User.findOne({ _id: adminId, role: 'admin' });
        if (!admin) throw new NotFoundError('Admin not found');

        const teamMembers = await User.find({ adminId, role: 'team', isDeleted: false });
        const assets = await Asset.find({ adminId, isDeleted: false });
        const recentSubmissions = await Assignment.find({ assignedBy: adminId, status: 'submitted' }).sort('-submittedAt').limit(5).populate('primaryMember', 'name email').lean();

        return {
            overview: {
                totalTeamMembers: teamMembers.length,
                activeTeamMembers: teamMembers.filter(t => t.status === 'active').length,
                totalAssets: assets.length,
                activeChecklists: admin.activeChecklistCount || 0,
                totalSubmissions: admin.submissionsCount || 0
            },
            subscription: {
                plan: admin.membershipPlan,
                daysRemaining: admin.daysRemaining,
                usagePercentage: admin.usagePercentage,
                licenseLimit: admin.licenseLimit,
                licensesUsed: admin.usersUsed,
                autoRenewal: admin.settings?.autoRenewal !== false
            },
            usage: {
                storage: { used: admin.storageUsed || 0, limit: admin.storageLimit || 10, percentage: admin.storagePercentage },
                api: { used: admin.apiCallsThisMonth || 0, limit: admin.apiCallLimit || 10000, percentage: admin.apiUsagePercentage }
            },
            recentSubmissions
        };
    }

    // ==================== TEAM MANAGEMENT (Admin Only) ====================

    async createTeamMember(data, adminId, createdBy) {
        const admin = await User.findOne({ _id: adminId, role: 'admin' });
        if (!admin) throw new NotFoundError('Admin not found');
        if (!admin.canAddUsers(1)) throw new AuthorizationError(`License limit reached (${admin.usersUsed}/${admin.licenseLimit})`);

        const existing = await User.findOne({ email: data.email });
        if (existing) throw new ConflictError('Email already registered');

        const tempPassword = data.password || crypto.randomBytes(6).toString('hex') + '@123';

        const member = await User.create({
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            password: tempPassword,
            phone: data.phone,
            role: 'team',
            teamRole: data.teamRole || 'inspector',
            department: data.department,
            location: data.location,
            address: data.address,
            bio: data.bio,
            adminId,
            createdBy,
            status: 'active',
            joinDate: new Date(),
            certifications: data.certifications || []
        });

        admin.usersUsed = await User.countDocuments({ adminId, role: 'team', status: 'active', isDeleted: false });
        await admin.save();

        const response = member.toObject();
        delete response.password;
        response.temporaryPassword = tempPassword;
        return response;
    }

    async getAllTeamMembers(adminId, query = {}) {
        const { status, teamRole, search, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = query;
        const filter = { adminId, role: 'team', isDeleted: false };
        if (status) filter.status = status;
        if (teamRole) filter.teamRole = teamRole;
        if (search) {
            filter.$or = [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

        const [members, total] = await Promise.all([
            User.find(filter).sort(sort).skip(skip).limit(parseInt(limit)).lean(),
            User.countDocuments(filter)
        ]);

        const formattedMembers = members.map(m => ({
            id: m._id,
            initials: m.initials,
            fullName: m.fullName,
            email: m.email,
            role: m.teamRole,
            roleDisplay: m.roleDisplay,
            department: m.department,
            assignedCount: m.assignedCount || 0,
            completedCount: m.completedCount || 0,
            performanceScore: m.performanceScore || 0,
            performancePercentage: `${Math.round(m.performanceScore || 0)}%`,
            status: m.status,
            avatarUrl: m.avatarUrl
        }));

        const stats = await this.getTeamStats(adminId);
        return { members: formattedMembers, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }, stats };
    }

    async getTeamMemberById(memberId, adminId) {
        const member = await User.findOne({ _id: memberId, role: 'team', adminId, isDeleted: false }).select('-password -refreshToken -token').lean();
        if (!member) throw new NotFoundError('Team member not found');
        return this.formatUserResponse(member);
    }

    async getTeamMemberDetails(memberId, adminId) {
        // Fetch team member with basic info
        const member = await User.findOne({
            _id: memberId,
            role: 'team',
            adminId,
            isDeleted: false
        }).select('-password -refreshToken -token').lean();

        if (!member) throw new NotFoundError('Team member not found');

        // Get recent completed inspections
        const recentInspections = await Assignment.find({
            primaryMember: memberId,
            status: 'completed'
        })
            .sort('-submittedAt')
            .limit(10)
            .populate('checklist', 'name description category')
            .populate('assetId', 'assetName assetId currentLocation assetCategory')
            .lean();

        // Get assigned assets (pending/in_progress)
        const assignedAssets = await Assignment.find({
            primaryMember: memberId,
            status: { $ne: 'completed' }
        })
            .populate('assetId', 'assetName assetId currentLocation assetCategory status healthScore')
            .lean();

        // Get scheduled tasks for future dates
        const scheduledTasks = await Assignment.find({
            primaryMember: memberId,
            status: { $in: ['pending', 'in_progress'] },
            dueDate: { $gte: new Date() }
        })
            .sort('dueDate')
            .limit(10)
            .populate('checklist', 'name category')
            .populate('assetId', 'assetName assetId currentLocation')
            .lean();

        // Get current month performance data
        const currentDate = new Date();
        const currentMonth = currentDate.toLocaleString('default', { month: 'short' });
        const currentYear = currentDate.getFullYear();

        const thisMonthData = member.monthlyPerformance?.find(
            mp => mp.month === currentMonth && mp.year === currentYear
        );

        // Process assignments to include asset details properly
        const processedAssignedAssets = assignedAssets.map(assignment => ({
            assignmentId: assignment._id,
            status: assignment.status,
            dueDate: assignment.dueDate,
            checklistName: assignment.checklist?.name || 'N/A',
            asset: assignment.assetId || {
                assetName: assignment.assetName || 'Unknown Asset',
                assetId: assignment.assetId || 'N/A',
                currentLocation: 'Unknown'
            }
        }));

        const processedScheduledTasks = scheduledTasks.map(task => ({
            taskId: task._id,
            status: task.status,
            dueDate: task.dueDate,
            checklistName: task.checklist?.name || 'N/A',
            assetName: task.assetId?.assetName || task.asset || 'Unknown Asset',
            assetId: task.assetId?.assetId || 'N/A',
            location: task.assetId?.currentLocation || 'Unknown'
        }));

        // Calculate additional stats if not present
        const completionRate = member.completionRate ||
            (member.completedCount > 0 ?
                (member.completedCount / (member.assignedCount || 1)) * 100 : 0);

        // Format response
        return {
            personalInfo: {
                id: member._id,
                firstName: member.firstName,
                lastName: member.lastName,
                email: member.email,
                phone: member.phone,
                role: member.teamRole || 'Inspector',
                profileImage: member.profileImage || null,
                joinDate: member.joinDate,
                location: member.address?.city || member.location || 'Not specified',
                status: member.status
            },
            stats: {
                totalInspections: member.completedCount || 0,
                assignedCount: member.assignedCount || 0,
                thisMonth: thisMonthData?.inspections || member.inspectionsThisMonth || 0,
                onTimeRate: member.onTimeRate || 0,
                qualityScore: member.qualityScore || 0,
                performanceScore: member.performanceScore || 0,
                completionRate: Math.round(completionRate)
            },
            monthlyPerformance: this.processMonthlyPerformance(member.monthlyPerformance || []),
            certifications: member.certifications || [],
            contactInfo: {
                email: member.email,
                phone: member.phone,
                address: member.address || null
            },
            recentInspections: recentInspections.map(inspection => ({
                id: inspection._id,
                assetName: inspection.assetId?.assetName || inspection.asset || 'Unknown',
                assetId: inspection.assetId?.assetId || 'N/A',
                checklistName: inspection.checklist?.name || 'N/A',
                location: inspection.assetId?.currentLocation || 'Unknown',
                completedAt: inspection.completedAt || inspection.submittedAt,
                status: inspection.status,
                qualityScore: inspection.overallRating || null
            })),
            assignedAssets: processedAssignedAssets,
            scheduledTasks: processedScheduledTasks,
            taskSummary: await this.getTaskSummary(memberId),
            lastActive: member.lastActiveAt || member.lastLogin || member.updatedAt
        };
    }

    // Define processMonthlyPerformance as a class method
    processMonthlyPerformance(performanceData) {
        if (!performanceData || performanceData.length === 0) {
            // Return mock data for demonstration if no data exists
            return this.generateMockPerformanceData();
        }

        // Sort by year and month (newest first)
        const monthsOrder = {
            Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
            Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12
        };

        const sorted = [...performanceData].sort((a, b) => {
            if (a.year !== b.year) return b.year - a.year;
            return monthsOrder[b.month] - monthsOrder[a.month];
        });

        // Take last 6 months and reverse to show chronological order
        const last6Months = sorted.slice(0, 6).reverse();

        return last6Months.map(item => ({
            month: `${item.month} ${item.year}`,
            inspections: item.inspections || 0,
            qualityScore: item.qualityScore || 4.5,
            onTimeRate: item.onTimeRate || 95,
            performanceScore: item.performanceScore || 85
        }));
    }

    // Helper method to generate mock performance data
    generateMockPerformanceData() {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth();

        // Generate last 6 months of data (including current month)
        const last6Months = [];
        for (let i = 5; i >= 0; i--) {
            const monthIndex = (currentMonth - i + 12) % 12;
            const month = months[monthIndex];
            const year = currentMonth - i < 0 ? currentYear - 1 : currentYear;

            last6Months.push({
                month: `${month} ${year}`,
                inspections: 15 + Math.floor(Math.random() * 15),
                qualityScore: Number((4.2 + Math.random() * 0.8).toFixed(1)),
                onTimeRate: 90 + Math.floor(Math.random() * 10),
                performanceScore: 80 + Math.floor(Math.random() * 15)
            });
        }

        return last6Months;
    }

    async getTaskSummary(memberId) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const endOfWeek = new Date(today);
        endOfWeek.setDate(endOfWeek.getDate() + 7);

        const tasks = await Assignment.find({
            primaryMember: memberId,
            status: { $in: ['pending', 'in_progress'] },
            dueDate: { $gte: today }
        });

        const dueToday = tasks.filter(t => {
            const dueDate = new Date(t.dueDate);
            dueDate.setHours(0, 0, 0, 0);
            return dueDate.getTime() === today.getTime();
        }).length;

        const dueTomorrow = tasks.filter(t => {
            const dueDate = new Date(t.dueDate);
            dueDate.setHours(0, 0, 0, 0);
            return dueDate.getTime() === tomorrow.getTime();
        }).length;

        const dueThisWeek = tasks.filter(t => {
            const dueDate = new Date(t.dueDate);
            return dueDate >= today && dueDate <= endOfWeek;
        }).length;

        return {
            dueToday,
            dueTomorrow,
            dueThisWeek,
            totalPending: tasks.length,
            upcomingTasks: tasks.slice(0, 5).map(task => ({
                id: task._id,
                assetName: task.assetId?.assetName || task.asset || 'Unknown',
                dueDate: task.dueDate,
                status: task.status
            }))
        };
    }


    async updateTeamMember(memberId, adminId, updateData) {
        const member = await User.findOne({ _id: memberId, role: 'team', adminId });
        if (!member) throw new NotFoundError('Team member not found');

        const allowed = ['firstName', 'lastName', 'phone', 'teamRole', 'department', 'location', 'address', 'bio', 'status', 'certifications', 'adminNotes', 'avatarUrl', 'performanceScore', 'qualityScore', 'assignedCount', 'completedCount', 'onTimeRate'];
        allowed.forEach(key => { if (updateData[key] !== undefined) member[key] = updateData[key]; });

        await member.save();
        return this.getTeamMemberById(memberId, adminId);
    }

    async deleteTeamMember(memberId, adminId, permanent = false) {
        const member = await User.findOne({ _id: memberId, role: 'team', adminId });
        if (!member) throw new NotFoundError('Team member not found');

        if (permanent) {
            await User.findByIdAndDelete(memberId);
            const message = 'Team member permanently deleted';
        } else {
            await member.softDelete(adminId);
        }

        const admin = await User.findById(adminId);
        if (admin) {
            admin.usersUsed = await User.countDocuments({ adminId, role: 'team', status: 'active', isDeleted: false });
            await admin.save();
        }
        return { success: true, message: permanent ? 'Team member permanently deleted' : 'Team member deactivated' };
    }

    async getTeamStats(adminId) {
        const stats = await User.aggregate([
            { $match: { adminId: new mongoose.Types.ObjectId(adminId), role: 'team', isDeleted: false } },
            {
                $facet: {
                    total: [{ $count: 'count' }],
                    active: [{ $match: { status: 'active' } }, { $count: 'count' }],
                    onLeave: [{ $match: { status: 'on_leave' } }, { $count: 'count' }],
                    byRole: [{ $group: { _id: '$teamRole', count: { $sum: 1 } } }],
                    avgPerformance: [{ $match: { status: 'active', performanceScore: { $gt: 0 } } }, { $group: { _id: null, avg: { $avg: '$performanceScore' } } }],
                    topPerformers: [{ $match: { status: 'active', performanceScore: { $gt: 0 } } }, { $sort: { performanceScore: -1 } }, { $limit: 5 }, { $project: { name: { $concat: ['$firstName', ' ', '$lastName'] }, initials: { $concat: [{ $substr: ['$firstName', 0, 1] }, { $substr: ['$lastName', 0, 1] }] }, performanceScore: 1, role: '$teamRole' } }]
                }
            }
        ]);

        return {
            total: stats[0]?.total[0]?.count || 0,
            active: stats[0]?.active[0]?.count || 0,
            onLeave: stats[0]?.onLeave[0]?.count || 0,
            byRole: stats[0]?.byRole?.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {}) || {},
            avgPerformance: Math.round(stats[0]?.avgPerformance[0]?.avg || 0),
            topPerformers: stats[0]?.topPerformers || []
        };
    }

    // ==================== TEAM SELF-SERVICE ====================

    async getMyProfile(memberId) {
        console.log("fetching id...", memberId)
        const member = await User.findOne({ _id: memberId, role: 'team', isDeleted: false }).select('-password -refreshToken -token').populate('adminId', 'customerName email');
        if (!member) throw new NotFoundError('Team member not found');
        return this.formatUserResponse(member);
    }

    async updateMyProfile(memberId, updateData) {
        const member = await User.findOne({ _id: memberId, role: 'team' });
        if (!member) throw new NotFoundError('Team member not found');

        const allowed = ['firstName', 'lastName', 'phone', 'location', 'address', 'bio', 'department', 'avatarUrl'];
        allowed.forEach(key => { if (updateData[key] !== undefined) member[key] = updateData[key]; });

        await member.save();
        return this.getMyProfile(memberId);
    }

    async changeMyPassword(memberId, { currentPassword, newPassword }) {
        const member = await User.findById(memberId).select('+password');
        if (!member) throw new NotFoundError('Team member not found');

        const isMatch = await member.comparePassword(currentPassword);
        if (!isMatch) throw new ValidationError([{ field: 'currentPassword', message: 'Current password is incorrect' }]);

        member.password = newPassword;
        await member.save();
        return { success: true, message: 'Password changed successfully' };
    }

    async getMyRecentInspections(memberId, limit = 10) {
        return await Assignment.find({ primaryMember: memberId }).sort('-submittedAt').limit(limit).populate('checklist', 'name').populate('assetId', 'assetName assetId currentLocation').lean();
    }

    async getMyAssignedAssets(memberId) {
        return await Assignment.find({ primaryMember: memberId }).populate('assetId', 'assetName assetId currentLocation assetCategory').lean();
    }

    async getMyScheduledTasks(memberId) {
        return await Assignment.find({ primaryMember: memberId }).sort('dueDate').populate('checklist', 'name').populate('assetId', 'assetName assetId').lean();
    }

    // ==================== HELPER METHODS ====================

    formatUserResponse(user) {
        const base = { id: user._id, email: user.email, role: user.role, status: user.status, avatarUrl: user.avatarUrl, createdAt: user.createdAt, updatedAt: user.updatedAt };

        switch (user.role) {
            case 'super_admin': return { ...base, name: user.name, permissions: user.permissions || ['*'] };
            case 'admin':
                return {
                    ...base, name: user.customerName, customerName: user.customerName, phone: user.phone, website: user.website,
                    address: user.address, membershipPlan: user.membershipPlan, daysRemaining: user.daysRemaining,
                    usagePercentage: user.usagePercentage, storagePercentage: user.storagePercentage,
                    apiUsagePercentage: user.apiUsagePercentage, licenseLimit: user.licenseLimit, usersUsed: user.usersUsed,
                    subscriptionStartDate: user.subscriptionStartDate, subscriptionEndDate: user.subscriptionEndDate,
                    storageUsed: user.storageUsed, storageLimit: user.storageLimit, apiCallsThisMonth: user.apiCallsThisMonth,
                    apiCallLimit: user.apiCallLimit, submissionsCount: user.submissionsCount, activeChecklistCount: user.activeChecklistCount,
                    lastActiveAt: user.lastActiveAt, notes: user.notes, settings: user.settings, autoRenewal: user.settings?.autoRenewal !== false
                };
            case 'team':
                return {
                    ...base, firstName: user.firstName, lastName: user.lastName, fullName: user.fullName, initials: user.initials,
                    phone: user.phone, teamRole: user.teamRole, roleDisplay: user.roleDisplay, department: user.department,
                    location: user.location, address: user.address, bio: user.bio, joinDate: user.joinDate, lastLoginDate: user.lastLoginDate,
                    lastActiveAt: user.lastActiveAt, adminId: user.adminId, organization: user.adminId?.customerName,
                    stats: {
                        totalInspections: user.completedCount || 0, assignedCount: user.assignedCount || 0,
                        onTimeRate: user.onTimeRate || 0, qualityScore: user.qualityScore || 0,
                        performanceScore: user.performanceScore || 0, completionRate: user.completionRate || 0,
                        inspectionsThisMonth: user.inspectionsThisMonth || 0
                    },
                    certifications: user.certifications || [], monthlyPerformance: (user.monthlyPerformance || []).sort((a, b) => {
                        const months = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
                        return (b.year - a.year) || (months[b.month] - months[a.month]);
                    }).slice(0, 6).reverse(), adminNotes: user.adminNotes
                };
            default: return base;
        }
    }


    async createContact(data) {
        const {
            fullName,
            email,
            phone,
            message,
        } = data;

        const contacts = await Contact.create({
            fullName,
            email,
            phone,
            message,
        });

        return contacts._doc;
    }

    // ─────────────────────────────────────────────────────────────
    // Get All Contact Messages
    // ─────────────────────────────────────────────────────────────
    async getAllContacts(filters = {}) {
        const {
            page = 1,
            limit = 10,
            search = "",
        } = filters;

        const query = {};

        // Search
        if (search) {
            query.$or = [
                { fullName: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { phone: { $regex: search, $options: "i" } },
            ];
        }

        const skip = (page - 1) * limit;

        const [contacts, total] = await Promise.all([
            Contact.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),

            Contact.countDocuments(query),
        ]);

        return {
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                contacts
            },
        };
    }

    // ─────────────────────────────────────────────────────────────
    // Get Contact By ID
    // ─────────────────────────────────────────────────────────────
    async getContactById(contactId) {
        const contact = await Contact.findById(contactId);

        if (!contact) {
            throw new NotFoundError("Contact message not found");
        }

        return contact._doc;
    }

    async deleteContact(contactId) {
        const contact = await Contact.findById(contactId);

        if (!contact) {
            throw new NotFoundError("Contact message not found");
        }

        await Contact.findByIdAndDelete(contactId);
        return {
            success: true,
            message: "Contact deleted successfully",
        };
    }

}

export default new UserService();