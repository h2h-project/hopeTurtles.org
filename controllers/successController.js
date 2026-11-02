import path from 'path';
import successModel from '../models/successModel.js';
import turtlesModel from '../models/turtlesModel.js';
import { normalizeFinCode } from '../utils/finCode.js';

export const getSuccessLog = async (req, res, next) => {
  try {
    const successEntries = await successModel.getRecent(24);
    return res.json({ success: true, data: successEntries });
  } catch (error) {
    return next(error);
  }
};

// GET /api/success/turtle/:code — confirm the 4-character code a finder
// reads off a turtle's fin is a real turtle before the report form is shown.
export const lookupFoundTurtle = async (req, res, next) => {
  try {
    const finCode = normalizeFinCode(req.params.code);
    if (!finCode) {
      return res
        .status(400)
        .json({ success: false, message: "Please enter the 4-character code on the turtle's fin." });
    }
    const turtle = await turtlesModel.getPublicIdentityByFinCode(finCode);
    if (!turtle) {
      return res.status(404).json({ success: false, message: 'No turtle found with that code.' });
    }
    return res.json({ success: true, data: turtle });
  } catch (error) {
    return next(error);
  }
};

export const createSuccessEntry = async (req, res, next) => {
  try {
    const { turtle_id, thank_you_message, location_lat, location_lng, date_found } = req.body;
    if (turtle_id && !(await turtlesModel.exists(Number(turtle_id)))) {
      return res.status(400).json({ success: false, message: 'Unknown turtle number.' });
    }
    const photos = [];
    if (req.file) {
      photos.push(path.join('/uploads', path.basename(req.file.path)));
    }
    const payload = {
      turtle_id: turtle_id ? Number(turtle_id) : null,
      thank_you_message,
      location_lat: location_lat ? Number(location_lat) : null,
      location_lng: location_lng ? Number(location_lng) : null,
      date_found: date_found || new Date(),
      photos: JSON.stringify(photos)
    };
    const created = await successModel.create(payload);
    return res.status(201).json({ success: true, data: created, message: 'Success logged' });
  } catch (error) {
    return next(error);
  }
};

export const renderSuccessPage = async (req, res, next) => {
  try {
    const entries = await successModel.getRecent(50);
    const turtles = await turtlesModel.getAll();
    return res.render('success', {
      pageTitle: 'Success Log',
      entries,
      turtles
    });
  } catch (error) {
    return next(error);
  }
};

export default {
  getSuccessLog,
  lookupFoundTurtle,
  createSuccessEntry,
  renderSuccessPage
};
