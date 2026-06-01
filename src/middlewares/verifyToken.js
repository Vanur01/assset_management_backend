import jwt from 'jsonwebtoken';
import { AuthorizationError } from '../errors/customError.js';
import User from '../models/user.model.js';

export const ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  TEAM: 'team'
};

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return next(new AuthorizationError('Authorization token required', 401));
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded?._id || !decoded?.role) {
      return next(new AuthorizationError('Invalid token payload', 401));
    }
    console.log("users....", decoded?._id)

    const user = await User.findById(decoded._id).lean();

    if (!user || user.isDeleted) {
      return next(new AuthorizationError('User not found', 401));
    }

    if (user.status !== 'active') {
      return next(new AuthorizationError('Account is not active', 401));
    }

    if (user.role === 'admin' && user.subscriptionEndDate && user.subscriptionEndDate < new Date()) {
      return next(new AuthorizationError('Subscription has expired. Please renew.', 403));
    }

    req.token = token;
    req.user = user;
    req.userRole = user.role; 
    req.userId = user._id;
    req.adminId = user.role === ROLES.TEAM ? user.adminId : user._id;
    req.teamMemberId = user.role === ROLES.TEAM ? user._id : null;
        console.log("fddhdh")

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return next(new AuthorizationError('Token expired', 401));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(new AuthorizationError('Invalid token', 401));
    }
    next(new AuthorizationError('Authentication failed', 401));
  }
};

export const allowRoles = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return next(new AuthorizationError('Authentication required', 401));
  }
  if (!req.userRole) {
    return next(new AuthorizationError('User role not found', 401));
  }
  if (!allowedRoles.includes(req.userRole)) {
    return next(new AuthorizationError(`Access denied. Allowed roles: ${allowedRoles.join(', ')}`, 403));
  }
  next();
};

export const hasPermission = (permission) => (req, res, next) => {
  if (!req.user) {
    return next(new AuthorizationError('Authentication required', 401));
  }
  
  const userPermissions = req.user.permissions || [];
  
  if (userPermissions.includes('*') || userPermissions.includes(permission)) {
    return next();
  }
  
  return next(new AuthorizationError(`Permission denied. Required: ${permission}`, 403));
};