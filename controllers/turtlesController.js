import crypto from 'crypto';
import path from 'path';
import turtlesModel from '../models/turtlesModel.js';
import telemetryModel from '../models/telemetryModel.js';
import photosModel from '../models/photosModel.js';
import missionsModel from '../models/missionsModel.js';

const allowedTurtleStatuses = new Set(['awaiting_serial', 'idle', 'en_route', 'arrived', 'lost']);

const createTurtleSecret = () => {
  const secret = crypto.randomBytes(32).toString('hex');
  const secretHash = crypto.createHash('sha256').update(secret).digest('hex');
  return { secret, secretHash };
};

const normalizeStatus = (status, { fallback = 'idle' } = {}) => {
  if (!status) {
    return fallback;
  }
  const normalized = String(status).toLowerCase();
  return allowedTurtleStatuses.has(normalized) ? normalized : fallback;
};

const toNullableInteger = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return null;
  }
  return Math.trunc(numericValue);
};

const toUploadUrl = (filename) => (filename ? path.posix.join('/uploads', filename) : null);

const getUploadedPhotoFiles = (req) => {
  if (!req) {
    return { primary: null, thumbnail: null };
  }
  const primary = req.profilePhotoFile || req.file || (req.files?.profile_photo?.[0] ?? null);
  const thumbnail = req.profilePhotoThumbnailFile || (req.files?.profile_photo_thumbnail?.[0] ?? null);
  return { primary, thumbnail };
};

const attachProfilePhoto = async (req, turtle) => {
  if (!turtle) {
    return turtle;
  }

  const { primary, thumbnail } = getUploadedPhotoFiles(req);
  if (!primary) {
    return turtle;
  }

  try {
    const uploadedByRaw = req.session?.user?.buwanaId ?? req.session?.user?.id ?? null;
    const uploadedByNumber =
      uploadedByRaw !== null && uploadedByRaw !== undefined ? Number(uploadedByRaw) : null;
    const primaryUrl = toUploadUrl(primary.filename);
    const thumbnailUrl = toUploadUrl(thumbnail?.filename) || primaryUrl;
    const photo = await photosModel.create({
      related_type: 'turtle',
      related_id: turtle.turtle_id,
      uploaded_by: Number.isFinite(uploadedByNumber) ? uploadedByNumber : null,
      url: primaryUrl,
      thumbnail_url: thumbnailUrl
    });
    const turtleWithPhoto = await turtlesModel.update(turtle.turtle_id, {
      profile_photo_id: photo.photo_id
    });
    turtleWithPhoto.profile_photo_url = photo.url;
    turtleWithPhoto.profile_photo_thumbnail_url = photo.thumbnail_url;
    return turtleWithPhoto;
  } catch (photoError) {
    console.error('Failed to attach profile photo to turtle', photoError);
    return turtle;
  }
};

export const getTurtles = async (req, res, next) => {
  try {
    const turtles = await turtlesModel.getAllDetailed();
    return res.json({ success: true, data: turtles });
  } catch (error) {
    return next(error);
  }
};

export const getTurtleById = async (req, res, next) => {
  try {
    const turtle = await turtlesModel.getById(req.params.id);
    if (!turtle) {
      return res.status(404).json({ success: false, message: 'Turtle not found' });
    }
    return res.json({ success: true, data: turtle });
  } catch (error) {
    return next(error);
  }
};

export const createTurtle = async (req, res, next) => {
  try {
    const { secret, secretHash } = createTurtleSecret();
    const turtle = await turtlesModel.create({ ...req.body, secret_hash: secretHash });
    const turtleWithPhoto = await attachProfilePhoto(req, turtle);

    return res.status(201).json({ success: true, data: turtleWithPhoto, secret });
  } catch (error) {
    return next(error);
  }
};

export const launchManagedTurtle = async (req, res, next) => {
  try {
    const currentUser = req.session?.user || null;
    const managerIdRaw = currentUser?.buwanaId ?? currentUser?.id ?? null;

    if (!managerIdRaw) {
      return res
        .status(403)
        .json({ success: false, message: 'You are not authorised to launch turtles.' });
    }

    const name = (req.body?.name || '').trim();
    if (!name) {
      return res.status(400).json({ success: false, message: 'Turtle name is required.' });
    }

    const { secret, secretHash } = createTurtleSecret();
    const status = normalizeStatus('awaiting_serial', { fallback: 'awaiting_serial' });
    const missionId = toNullableInteger(req.body?.mission_id);
    const hubId = toNullableInteger(req.body?.hub_id);
    const boatId = toNullableInteger(req.body?.boat_id);
    const numericManagerId = toNullableInteger(managerIdRaw);
    const turtleManager = numericManagerId ?? managerIdRaw;

    const payload = {
      name,
      status,
      mission_id: missionId,
      hub_id: hubId,
      boat_id: boatId,
      turtle_manager: turtleManager,
      secret_hash: secretHash
    };

    const turtle = await turtlesModel.create(payload);
    const turtleWithPhoto = await attachProfilePhoto(req, turtle);

    return res.status(201).json({ success: true, data: turtleWithPhoto, secret });
  } catch (error) {
    return next(error);
  }
};

export const updateTurtle = async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : null;
    const statusRaw = typeof req.body?.status === 'string' ? req.body.status.trim() : '';
    const missionId = toNullableInteger(req.body?.mission_id);
    const hubId = toNullableInteger(req.body?.hub_id);
    const boatId = toNullableInteger(req.body?.boat_id);
    const payload = {
      name: name || null,
      status: statusRaw ? normalizeStatus(statusRaw) : null,
      mission_id: missionId,
      hub_id: hubId,
      boat_id: boatId
    };

    const turtle = await turtlesModel.update(req.params.id, payload);
    const turtleWithPhoto = await attachProfilePhoto(req, turtle);
    return res.json({ success: true, data: turtleWithPhoto });
  } catch (error) {
    return next(error);
  }
};

export const regenerateTurtleSecret = async (req, res, next) => {
  try {
    const turtleId = req.params.id;
    const turtle = await turtlesModel.getById(turtleId);
    if (!turtle) {
      return res.status(404).json({ success: false, message: 'Turtle not found' });
    }

    const currentUser = req.session?.user || null;
    const isAdmin = currentUser?.role === 'admin';
    const managerIdRaw = currentUser?.buwanaId ?? currentUser?.id ?? null;
    const hasManagerId = managerIdRaw !== undefined && managerIdRaw !== null && managerIdRaw !== '';
    const turtleHasManager =
      turtle.turtle_manager !== undefined && turtle.turtle_manager !== null && turtle.turtle_manager !== '';
    const managesTurtle =
      hasManagerId && turtleHasManager && String(turtle.turtle_manager) === String(managerIdRaw);

    if (!isAdmin && !managesTurtle) {
      return res.status(403).json({ success: false, message: 'Additional privileges required' });
    }

    const { secret, secretHash } = createTurtleSecret();
    const updated = await turtlesModel.update(turtleId, { secret_hash: secretHash });

    return res.json({ success: true, data: updated, secret });
  } catch (error) {
    return next(error);
  }
};

export const getTurtleLive = async (req, res, next) => {
  try {
    const turtleId = req.params.id;
    const turtle = await turtlesModel.getById(turtleId);
    if (!turtle) {
      return res.status(404).json({ success: false, message: 'Turtle not found' });
    }

    const currentUser = req.session?.user || null;
    const isAdmin = currentUser?.role === 'admin';
    const managerIdRaw = currentUser?.buwanaId ?? currentUser?.id ?? null;
    const hasManagerId = managerIdRaw !== undefined && managerIdRaw !== null && managerIdRaw !== '';
    const turtleHasManager =
      turtle.turtle_manager !== undefined && turtle.turtle_manager !== null && turtle.turtle_manager !== '';
    const managesTurtle =
      hasManagerId && turtleHasManager && String(turtle.turtle_manager) === String(managerIdRaw);

    if (!isAdmin && !managesTurtle) {
      return res.status(403).json({ success: false, message: 'Additional privileges required' });
    }

    const reading = await telemetryModel.getLatestForTurtle(turtleId);
    let values = null;
    if (reading?.raw_data) {
      const raw =
        typeof reading.raw_data === 'string' ? JSON.parse(reading.raw_data) : reading.raw_data;
      values = raw?.values ?? raw ?? null;
    }

    return res.json({
      success: true,
      data: {
        turtle: {
          turtle_id: turtle.turtle_id,
          name: turtle.name,
          status: turtle.status,
          last_lat: turtle.last_lat,
          last_lng: turtle.last_lng,
          last_update: turtle.last_update,
          solar_charge: turtle.solar_charge
        },
        reading: reading
          ? {
              timestamp: reading.timestamp,
              latitude: reading.latitude,
              longitude: reading.longitude,
              battery_voltage: reading.battery_voltage,
              temp_c: reading.temp_c,
              connection: reading.connection,
              values
            }
          : null
      }
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteTurtle = async (req, res, next) => {
  try {
    await turtlesModel.remove(req.params.id);
    return res.json({ success: true, data: null, message: 'Turtle removed' });
  } catch (error) {
    return next(error);
  }
};

export const renderTurtlePage = async (req, res, next) => {
  try {
    const turtle = await turtlesModel.getById(req.params.id);
    if (!turtle) {
      return res.status(404).render('error', {
        pageTitle: 'Turtle not found',
        message: 'The requested turtle could not be located.'
      });
    }
    const telemetry = await telemetryModel.getByTurtleId(req.params.id, 100);
    const photos = await photosModel.getForEntity('turtle', req.params.id);
    const mission = turtle.mission_id
      ? await missionsModel.getById(turtle.mission_id)
      : null;
    return res.render('turtle', {
      pageTitle: turtle.name,
      turtle,
      telemetry,
      photos,
      mission
    });
  } catch (error) {
    return next(error);
  }
};

export default {
  getTurtles,
  getTurtleById,
  createTurtle,
  launchManagedTurtle,
  updateTurtle,
  regenerateTurtleSecret,
  getTurtleLive,
  deleteTurtle,
  renderTurtlePage
};
