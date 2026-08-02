import hubsModel from '../models/hubsModel.js';
import turtlesModel from '../models/turtlesModel.js';

const normalizeHubPayload = (payload = {}) => {
  const normalized = { ...payload };

  ['coordinator_id', 'mission_id'].forEach((field) => {
    if (normalized[field] === '') {
      normalized[field] = null;
    } else if (normalized[field] !== null && normalized[field] !== undefined) {
      const numericValue = Number(normalized[field]);
      normalized[field] = Number.isNaN(numericValue) ? normalized[field] : numericValue;
    }
  });

  ['lat', 'lng'].forEach((field) => {
    if (normalized[field] === '') {
      normalized[field] = null;
    } else if (normalized[field] !== null && normalized[field] !== undefined) {
      const numericValue = Number(normalized[field]);
      normalized[field] = Number.isNaN(numericValue) ? normalized[field] : numericValue;
    }
  });

  if (normalized.status === '') {
    normalized.status = undefined;
  }

  if (normalized.mailing_address === '') {
    normalized.mailing_address = null;
  }

  return normalized;
};

export const getHubs = async (req, res, next) => {
  try {
    const hubs = await hubsModel.getAll();
    return res.json({ success: true, data: hubs });
  } catch (error) {
    return next(error);
  }
};

export const getHubTurtles = async (req, res, next) => {
  try {
    const hubId = Number(req.params.id);
    if (!Number.isFinite(hubId)) {
      return res.status(400).json({ success: false, message: 'Invalid hub identifier.' });
    }

    const turtles = await turtlesModel.getForHub(hubId);
    return res.json({ success: true, data: turtles });
  } catch (error) {
    return next(error);
  }
};

export const createHub = async (req, res, next) => {
  try {
    const hub = await hubsModel.create(normalizeHubPayload(req.body));
    return res.status(201).json({ success: true, data: hub });
  } catch (error) {
    return next(error);
  }
};

export const updateHub = async (req, res, next) => {
  try {
    const hub = await hubsModel.update(req.params.id, normalizeHubPayload(req.body));
    return res.json({ success: true, data: hub });
  } catch (error) {
    return next(error);
  }
};

export const deleteHub = async (req, res, next) => {
  try {
    await hubsModel.remove(req.params.id);
    return res.json({ success: true, data: null, message: 'Hub removed' });
  } catch (error) {
    return next(error);
  }
};

export default {
  getHubs,
  getHubTurtles,
  createHub,
  updateHub,
  deleteHub
};
