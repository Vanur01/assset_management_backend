import mongoose from 'mongoose';
import Location from '../models/location.model.js';
import User from '../models/user.model.js';
import AuditLog from '../models/auditLog.model.js';
import { NotFoundError, ConflictError, ValidationError } from '../errors/customError.js';

class LocationService {

    async createLocation(data, adminId, createdBy) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const existingLoc = await Location.findOne({
                name: data.name,
                adminId,
                isDeleted: false
            }).session(session);

            if (existingLoc) {
                throw new ConflictError(`Location "${data.name}" already exists for this organization`);
            }

            const location = await Location.create([{
                name: data.name,
                adminId,
                description: data.description || '',
                isActive: data.isActive !== undefined ? data.isActive : true,
                createdBy
            }], { session });

            const createdLocation = location[0];

            // Create audit log
            await AuditLog.create([{
                action: 'LOCATION_CREATED',
                resource: 'location',
                resourceId: createdLocation._id,
                actor: createdBy,
                actorRole: 'admin',
                description: `Location "${createdLocation.name}" created successfully`,
            }], { session });

            await session.commitTransaction();
            return createdLocation;
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    async getAllLocations(adminId, query = {}) {
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

        const [locations, total] = await Promise.all([
            Location.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Location.countDocuments(filter)
        ]);

        const locsWithCounts = await Promise.all(locations.map(async (loc) => {
            const memberCount = await User.countDocuments({
                adminId,
                location: loc._id,
                role: 'team',
                isDeleted: false
            });

            return {
                ...loc,
                memberCount
            };
        }));

        return {
            locations: locsWithCounts,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        };
    }

    async getLocationById(locId, adminId) {
        const location = await Location.findOne({
            _id: locId,
            adminId,
            isDeleted: false
        }).lean();

        if (!location) {
            throw new NotFoundError('Location not found');
        }

        const memberCount = await User.countDocuments({
            adminId,
            location: location._id,
            role: 'team',
            isDeleted: false
        });

        return {
            ...location,
            memberCount
        };
    }

    async updateLocation(locId, adminId, updateData, updatedBy) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const location = await Location.findOne({
                _id: locId,
                adminId,
                isDeleted: false
            }).session(session);

            if (!location) {
                throw new NotFoundError('Location not found');
            }

            // Capture before state for audit log
            const beforeChanges = {
                name: location.name,
                description: location.description,
                isActive: location.isActive
            };

            if (updateData.name && updateData.name !== location.name) {
                const existingLoc = await Location.findOne({
                    name: updateData.name,
                    adminId,
                    isDeleted: false,
                    _id: { $ne: locId }
                }).session(session);

                if (existingLoc) {
                    throw new ConflictError(`Location "${updateData.name}" already exists for this organization`);
                }
                location.name = updateData.name;
            }

            if (updateData.description !== undefined) location.description = updateData.description;
            if (updateData.isActive !== undefined) location.isActive = updateData.isActive;

            await location.save({ session });

            // Capture after state for audit log
            const afterChanges = {
                name: location.name,
                description: location.description,
                isActive: location.isActive
            };

            // Create audit log if changes were made
            if (JSON.stringify(beforeChanges) !== JSON.stringify(afterChanges)) {
                await AuditLog.create([{
                    action: 'LOCATION_UPDATED',
                    resource: 'location',
                    resourceId: location._id,
                    actor: updatedBy,
                    actorRole: 'admin',
                    description: `Location "${location.name}" updated successfully`,
                }], { session });
            }

            await session.commitTransaction();
            return this.getLocationById(locId, adminId);
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    async deleteLocation(locId, adminId, deletedBy) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            const location = await Location.findOne({
                _id: locId,
                adminId,
                isDeleted: false
            }).session(session);

            if (!location) {
                throw new NotFoundError('Location not found');
            }

            const memberCount = await User.countDocuments({
                adminId,
                location: location._id,
                role: 'team',
                isDeleted: false
            }).session(session);

            if (memberCount > 0) {
                throw new ValidationError([{
                    field: 'location',
                    message: `Cannot delete location with ${memberCount} assigned team member(s). Reassign or deactivate members first.`
                }]);
            }

            location.isDeleted = true;
            await location.save({ session });

            // Create audit log
            await AuditLog.create([{
                action: 'LOCATION_DELETED',
                resource: 'location',
                resourceId: location._id,
                actor: deletedBy,
                actorRole: 'admin',
                description: `Location "${location.name}" deleted successfully`,
            }], { session });

            await session.commitTransaction();
            return { success: true, message: 'Location deleted successfully' };
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }
}

export default new LocationService();