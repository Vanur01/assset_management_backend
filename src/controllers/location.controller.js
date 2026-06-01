import LocationService from '../services/location.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.js';

class LocationController {

    createLocation = asyncHandler(async (req, res) => {
        const location = await LocationService.createLocation(
            req.body,
            req.user._id,
            req.user._id
        );
        sendResponse(res, 201, 'Location created successfully', { location });
    });

    getAllLocations = asyncHandler(async (req, res) => {
        const result = await LocationService.getAllLocations(req.user._id, req.query);
        sendResponse(res, 200, 'Locations fetched successfully', result);
    });

    getLocationById = asyncHandler(async (req, res) => {
        const location = await LocationService.getLocationById(req.params.id, req.user._id);
        sendResponse(res, 200, 'Location fetched successfully', { location });
    });

    updateLocation = asyncHandler(async (req, res) => {
        const location = await LocationService.updateLocation(
            req.params.id,
            req.user._id,
            req.body,
            req.user._id  // updatedBy
        );
        sendResponse(res, 200, 'Location updated successfully', { location });
    });

    deleteLocation = asyncHandler(async (req, res) => {
        const result = await LocationService.deleteLocation(
            req.params.id,
            req.user._id,
            req.user._id  // deletedBy
        );
        sendResponse(res, 200, result.message, result);
    });
}

export default new LocationController();