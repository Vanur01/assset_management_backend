import ClientService from '../services/client.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendResponse } from '../utils/response.js';

class ClientController {
  createClient = asyncHandler(async (req, res) => {
    const result = await ClientService.createClient(req.body, req.user._id);
    return sendResponse(res, 201, 'Client created successfully', { client: result });
  });

  getAllClients = asyncHandler(async (req, res) => {
    const result = await ClientService.getAllClients(req.query);
    return sendResponse(res, 200, 'Clients fetched successfully', result);
  });

  getClientById = asyncHandler(async (req, res) => {
    const client = await ClientService.getClientById(req.params.id);
    return sendResponse(res, 200, 'Client fetched successfully', { client });
  });

  updateClient = asyncHandler(async (req, res) => {
    const client = await ClientService.updateClient(req.params.id, req.body, req.user._id);
    return sendResponse(res, 200, 'Client updated successfully', { client });
  });

  deleteClient = asyncHandler(async (req, res) => {
    const result = await ClientService.deleteClient(req.params.id, req.user._id);
    return sendResponse(res, 200, result.message);
  });

  toggleClientStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const result = await ClientService.toggleClientStatus(req.params.id, status, req.user._id);
    return sendResponse(res, 200, result.message);
  });

  toggleAutoRenewal = asyncHandler(async (req, res) => {
    const { enabled } = req.body;
    const result = await ClientService.toggleAutoRenewal(req.params.id, enabled);
    return sendResponse(res, 200, `Auto-renewal ${enabled ? 'enabled' : 'disabled'} successfully`, result);
  });
}

export default new ClientController();