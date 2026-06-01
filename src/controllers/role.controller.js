import RoleService from '../services/role.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.js';

class RoleController {

    createRole = asyncHandler(async (req, res) => {
        const auditContext = {
            actorRole: req.user?.role,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
        };

        const role = await RoleService.createRole(
            req.body,
            req.user.adminId || req.user._id,
            req.user._id,
            auditContext
        );

        sendResponse(res, 201, 'Role created successfully', { role });
    });

    getAllRoles = asyncHandler(async (req, res) => {
        const adminId = req.user.adminId || req.user._id;
        const result = await RoleService.getAllRoles(adminId, req.query);
        sendResponse(res, 200, 'Roles fetched successfully', result);
    });

    getRoleById = asyncHandler(async (req, res) => {
        const adminId = req.user.adminId || req.user._id;
        const role = await RoleService.getRoleById(req.params.id, adminId);
        sendResponse(res, 200, 'Role fetched successfully', { role });
    });

    updateRole = asyncHandler(async (req, res) => {
        const adminId = req.user.adminId || req.user._id;

        const auditContext = {
            actor: req.user._id,
            actorRole: req.user?.role,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
        };

        const role = await RoleService.updateRole(
            req.params.id,
            adminId,
            req.body,
            auditContext
        );

        sendResponse(res, 200, 'Role updated successfully', { role });
    });

    deleteRole = asyncHandler(async (req, res) => {
        const adminId = req.user.adminId || req.user._id;

        const auditContext = {
            actor: req.user._id,
            actorRole: req.user?.role,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
        };

        const result = await RoleService.deleteRole(
            req.params.id,
            adminId,
            auditContext
        );

        sendResponse(res, 200, result.message, result);
    });
}

export default new RoleController();