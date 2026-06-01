import express from 'express';
import DepartmentController from '../controllers/department.controller.js';
import { authenticate, allowRoles } from '../middlewares/verifyToken.js';

const router = express.Router();

router.use(authenticate);
router.use(allowRoles('admin', 'super_admin'));

router.route('/')
    .post(DepartmentController.createDepartment)
    .get(DepartmentController.getAllDepartments);

router.route('/:id')
    .get(DepartmentController.getDepartmentById)
    .put(DepartmentController.updateDepartment)
    .delete(DepartmentController.deleteDepartment);

export default router;