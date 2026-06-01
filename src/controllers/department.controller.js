import DepartmentService from '../services/department.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.js';

class DepartmentController {

    createDepartment = asyncHandler(async (req, res) => {
        const department = await DepartmentService.createDepartment(req.body, req.user._id, req.user._id);
        sendResponse(res, 201, 'Department created successfully', { department });
    });

    getAllDepartments = asyncHandler(async (req, res) => {
        const result = await DepartmentService.getAllDepartments(req.user._id, req.query);
        sendResponse(res, 200, 'Departments fetched successfully', result);
    });

    getDepartmentById = asyncHandler(async (req, res) => {
        const department = await DepartmentService.getDepartmentById(req.params.id, req.user._id);
        sendResponse(res, 200, 'Department fetched successfully', { department });
    });

    updateDepartment = asyncHandler(async (req, res) => {
        const department = await DepartmentService.updateDepartment(req.params.id, req.user._id, req.body);
        sendResponse(res, 200, 'Department updated successfully', { department });
    });

    deleteDepartment = asyncHandler(async (req, res) => {
        const result = await DepartmentService.deleteDepartment(req.params.id, req.user._id);
        sendResponse(res, 200, result.message, result);
    });
}

export default new DepartmentController();