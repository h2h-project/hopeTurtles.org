import crypto from "crypto";
import path from "path";
import {
  runGenerator,
  EcojoinerRequestError,
} from "../utils/ecojoinerGenerator.js";
import {
  persistDesignFiles,
  removeDesignFiles,
} from "../utils/ecojoinerDesignFiles.js";
import ecojoinerProfilesModel from "../models/ecojoinerProfilesModel.js";
import ecojoinerDesignsModel from "../models/ecojoinerDesignsModel.js";
import photosModel from "../models/photosModel.js";

const getCurrentUserId = (req) =>
  req.session?.user?.buwanaId ?? req.session?.user?.id ?? null;

// Validation errors are a normal outcome of the form, not a server fault, so
// they answer with 422 and a list the page can render field-by-field.
const handle = async (req, res, next, { dryRun }) => {
  try {
    const manifest = await runGenerator(req.body, { dryRun, lang: res.locals.lang });
    return res.json({ success: true, data: manifest });
  } catch (error) {
    if (error instanceof EcojoinerRequestError) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        errors: error.errors,
      });
    }
    return next(error);
  }
};

// Step 1 of the page flow: derive and show dimensions, write nothing.
export const validateEcojoiner = (req, res, next) =>
  handle(req, res, next, { dryRun: true });

// Step 2: write the job folder and return download URLs.
export const generateEcojoiner = (req, res, next) =>
  handle(req, res, next, { dryRun: false });

// ── Bottle profiles ─────────────────────────────────────────────────────────

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

// Shared by profile create and every design save. Mirrors the required/
// optional fields validated in utils/ecojoinerGenerator.js::mapFormFields()
// plus `label`, which only the saved profile needs. `requireLabel` is false
// when saving a design against an already-named, existing profile.
const parseProfileFields = (body = {}, { requireLabel = true } = {}) => {
  const errors = [];
  const label = String(body.label ?? "").trim();
  const brand = String(body.brand ?? "").trim();
  if (requireLabel && !label)
    errors.push("Please give this bottle profile a name.");
  if (!brand) errors.push("Please tell us the bottle brand.");

  const numbers = {};
  for (const [field, target] of [
    ["volume", "volume_ml"],
    ["diameter", "diameter_mm"],
    ["cap", "cap_mm"],
    ["collar", "collar_mm"],
    ["topTapper", "top_tapper_mm"],
    ["thickness", "thickness_mm"],
  ]) {
    const parsed = toNumberOrNull(body[field]);
    if (parsed === null) errors.push(`Missing value: ${field}.`);
    else if (Number.isNaN(parsed)) errors.push(`${field} must be a number.`);
    else numbers[target] = parsed;
  }

  const optional = {};
  const height = toNumberOrNull(body.height);
  if (height !== null && !Number.isNaN(height)) optional.height_mm = height;
  const bottomTapper = toNumberOrNull(body.bottomTapper);
  if (bottomTapper !== null && !Number.isNaN(bottomTapper))
    optional.bottom_tapper_mm = bottomTapper;
  if (body.material) optional.material = String(body.material);
  const portFitMm = toNumberOrNull(body.portFitMm);
  optional.port_fit_mm =
    portFitMm !== null && !Number.isNaN(portFitMm) ? portFitMm : 0;

  if (errors.length) {
    throw new EcojoinerRequestError(
      "Please check the bottle profile values.",
      errors,
    );
  }

  // Omit an empty label rather than sending '' — baseModel's create/update
  // only drop `undefined` values, so an empty string would otherwise blank
  // out an existing profile's name when saving against it.
  return { ...(label ? { label } : {}), brand, ...numbers, ...optional };
};

// ecojoiner_designs_tb.formats and .profile_snapshot are native MySQL JSON
// columns. Depending on the mysql2 code path, a JSON column can come back
// either pre-parsed (object/array) or as raw text — this codebase already
// treats that as unreliable elsewhere (see turtlesController.js's raw_data
// handling). Only call JSON.parse when we actually got a string; otherwise
// the value is already the parsed shape.
const parseIfString = (value, fallback) => {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const attachPhoto = async ({ relatedType, relatedId, uploadedBy, file }) => {
  if (!file) return null;
  const photo = await photosModel.create({
    related_type: relatedType,
    related_id: relatedId,
    uploaded_by: uploadedBy,
    url: path.posix.join("/uploads", file.filename),
  });
  return photo.photo_id;
};

export const listProfiles = async (req, res, next) => {
  try {
    const buwanaId = getCurrentUserId(req);
    const profiles = await ecojoinerProfilesModel.getForUser(buwanaId);
    return res.json({ success: true, data: profiles });
  } catch (error) {
    return next(error);
  }
};

export const createProfile = async (req, res, next) => {
  try {
    const buwanaId = getCurrentUserId(req);
    const fields = parseProfileFields(req.body);
    const profile = await ecojoinerProfilesModel.create({
      buwana_id: buwanaId,
      ...fields,
    });

    const bottlePhotoId = await attachPhoto({
      relatedType: "ecojoiner_bottle_profile",
      relatedId: profile.profile_id,
      uploadedBy: buwanaId,
      file: req.file,
    }).catch((error) => {
      console.error("Failed to attach bottle profile photo", error);
      return null;
    });
    if (bottlePhotoId) {
      await ecojoinerProfilesModel.update(profile.profile_id, {
        bottle_photo_id: bottlePhotoId,
      });
    }

    const saved = await ecojoinerProfilesModel.getByIdForUser(
      profile.profile_id,
      buwanaId,
    );
    return res.json({ success: true, data: saved });
  } catch (error) {
    if (error instanceof EcojoinerRequestError) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message, errors: error.errors });
    }
    return next(error);
  }
};

export const updateProfile = async (req, res, next) => {
  try {
    const buwanaId = getCurrentUserId(req);
    const profileId = Number(req.params.id);
    const existing = await ecojoinerProfilesModel.getByIdForUser(
      profileId,
      buwanaId,
    );
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Bottle profile not found." });
    }
    const fields = parseProfileFields(req.body, { requireLabel: false });
    await ecojoinerProfilesModel.update(profileId, fields);

    const bottlePhotoId = await attachPhoto({
      relatedType: "ecojoiner_bottle_profile",
      relatedId: profileId,
      uploadedBy: buwanaId,
      file: req.file,
    }).catch((error) => {
      console.error("Failed to attach bottle profile photo", error);
      return null;
    });
    if (bottlePhotoId) {
      await ecojoinerProfilesModel.update(profileId, {
        bottle_photo_id: bottlePhotoId,
      });
    }

    const saved = await ecojoinerProfilesModel.getByIdForUser(
      profileId,
      buwanaId,
    );
    return res.json({ success: true, data: saved });
  } catch (error) {
    if (error instanceof EcojoinerRequestError) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message, errors: error.errors });
    }
    return next(error);
  }
};

export const deleteProfile = async (req, res, next) => {
  try {
    const buwanaId = getCurrentUserId(req);
    const profileId = Number(req.params.id);
    const profile = await ecojoinerProfilesModel.getByIdForUser(
      profileId,
      buwanaId,
    );
    if (!profile) {
      return res
        .status(404)
        .json({ success: false, message: "Bottle profile not found." });
    }
    await ecojoinerProfilesModel.remove(profileId);
    return res.json({ success: true, data: null });
  } catch (error) {
    return next(error);
  }
};

// ── Designs ─────────────────────────────────────────────────────────────────

const shareUrlFor = (req, token) => {
  if (!token) return null;
  return `${req.protocol}://${req.get("host")}/api/ecojoiner/designs/shared/${token}`;
};

const parseJsonField = (value, fallback) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const listDesigns = async (req, res, next) => {
  try {
    const buwanaId = getCurrentUserId(req);
    const designs = await ecojoinerDesignsModel.getForUser(buwanaId);
    const withShareUrl = designs.map((design) => ({
      ...design,
      share_url:
        design.visibility === "public"
          ? shareUrlFor(req, design.share_token)
          : null,
    }));
    return res.json({ success: true, data: withShareUrl });
  } catch (error) {
    return next(error);
  }
};

export const listPublicDesigns = async (req, res, next) => {
  try {
    const buwanaId = getCurrentUserId(req);
    const designs = await ecojoinerDesignsModel.getPublic(buwanaId);
    const anonymized = designs.map((design) => {
      const rest = { ...design };
      delete rest.buwana_id;
      return rest;
    });
    return res.json({ success: true, data: anonymized });
  } catch (error) {
    return next(error);
  }
};

// Loads a design for the generate page's "Load a saved ecojoiner design"
// picker. Owned designs load normally; a design owned by someone else only
// loads when it's public, and comes back flagged `is_owner: false` so the
// client knows re-saving must create a new design rather than overwrite it.
export const getDesign = async (req, res, next) => {
  try {
    const buwanaId = getCurrentUserId(req);
    const designId = Number(req.params.id);
    let design = await ecojoinerDesignsModel.getByIdForUser(
      designId,
      buwanaId,
    );
    const isOwner = Boolean(design);
    if (!design) {
      design = await ecojoinerDesignsModel.getById(designId);
      if (!design || design.visibility !== "public") {
        return res
          .status(404)
          .json({ success: false, message: "Design not found." });
      }
    }
    const data = { ...design, is_owner: isOwner };
    if (!isOwner) delete data.buwana_id;
    data.share_url =
      design.visibility === "public"
        ? shareUrlFor(req, design.share_token)
        : null;
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

// The one unauthenticated read in this file — reachable via an unguessable
// share_token only, and only while the design is visibility='public'
// (see models/ecojoinerDesignsModel.js::getByShareToken). Deliberately omits
// buwana_id/ownership details from the response.
export const getSharedDesign = async (req, res, next) => {
  try {
    const design = await ecojoinerDesignsModel.getByShareToken(
      req.params.token,
    );
    if (!design) {
      return res
        .status(404)
        .json({ success: false, message: "This design is not available." });
    }
    const publicDesign = { ...design };
    delete publicDesign.buwana_id;
    return res.json({ success: true, data: publicDesign });
  } catch (error) {
    return next(error);
  }
};

export const createDesign = async (req, res, next) => {
  try {
    const buwanaId = getCurrentUserId(req);
    const body = req.body || {};
    const files = req.files ?? {};
    const bottlePhotoFile = Array.isArray(files.bottle_photo)
      ? files.bottle_photo[0]
      : null;
    const ecojoinerPhotoFile = Array.isArray(files.ecojoiner_photo)
      ? files.ecojoiner_photo[0]
      : null;

    // Resolve exactly one of: an existing saved profile, or fields for a new one.
    let profileId = null;
    let profileSnapshot;
    const requestedProfileId = toNumberOrNull(body.profile_id);
    if (requestedProfileId) {
      // Reusing a saved profile — still re-parse the fields the client just
      // submitted (not a re-fetch of the stored row) so the snapshot reflects
      // whatever the user has on screen right now, and update the profile
      // row to match (the whole point of "reuse" is to keep it current).
      const existing = await ecojoinerProfilesModel.getByIdForUser(
        requestedProfileId,
        buwanaId,
      );
      if (!existing) {
        return res
          .status(404)
          .json({ success: false, message: "Bottle profile not found." });
      }
      const fields = parseProfileFields(body, { requireLabel: false });
      await ecojoinerProfilesModel.update(requestedProfileId, fields);

      if (bottlePhotoFile) {
        const bottlePhotoId = await attachPhoto({
          relatedType: "ecojoiner_bottle_profile",
          relatedId: requestedProfileId,
          uploadedBy: buwanaId,
          file: bottlePhotoFile,
        }).catch((error) => {
          console.error("Failed to attach bottle profile photo", error);
          return null;
        });
        if (bottlePhotoId)
          await ecojoinerProfilesModel.update(requestedProfileId, {
            bottle_photo_id: bottlePhotoId,
          });
      }
      profileId = requestedProfileId;
      profileSnapshot = await ecojoinerProfilesModel.getByIdForUser(
        profileId,
        buwanaId,
      );
    } else if (body.label && body.brand) {
      const fields = parseProfileFields(body);
      const created = await ecojoinerProfilesModel.create({
        buwana_id: buwanaId,
        ...fields,
      });
      const bottlePhotoId = await attachPhoto({
        relatedType: "ecojoiner_bottle_profile",
        relatedId: created.profile_id,
        uploadedBy: buwanaId,
        file: bottlePhotoFile,
      }).catch((error) => {
        console.error("Failed to attach bottle profile photo", error);
        return null;
      });
      if (bottlePhotoId)
        await ecojoinerProfilesModel.update(created.profile_id, {
          bottle_photo_id: bottlePhotoId,
        });
      profileId = created.profile_id;
      profileSnapshot = await ecojoinerProfilesModel.getByIdForUser(
        profileId,
        buwanaId,
      );
    } else {
      return res.status(400).json({
        success: false,
        message:
          "Choose a saved bottle profile or fill in the bottle details to save a new one.",
      });
    }

    const formats = parseJsonField(body.formats, []);
    const jobSlug = body.job_id ? String(body.job_id) : null;
    const manifestFiles = parseJsonField(body.files, []);
    const visibility = body.visibility === "public" ? "public" : "private";

    const design = await ecojoinerDesignsModel.create({
      buwana_id: buwanaId,
      profile_id: profileId,
      profile_snapshot: JSON.stringify(profileSnapshot),
      ecojoiner_type: body.ecojoinerType ? String(body.ecojoinerType) : "6fc",
      formats: JSON.stringify(formats),
      status: jobSlug ? "generated" : "draft",
      visibility,
      share_token:
        visibility === "public"
          ? crypto.randomBytes(16).toString("base64url")
          : null,
      job_id: jobSlug,
    });

    const ecojoinerPhotoId = await attachPhoto({
      relatedType: "ecojoiner_design",
      relatedId: design.design_id,
      uploadedBy: buwanaId,
      file: ecojoinerPhotoFile,
    }).catch((error) => {
      console.error("Failed to attach ecojoiner photo", error);
      return null;
    });
    if (ecojoinerPhotoId) {
      await ecojoinerDesignsModel.update(design.design_id, {
        ecojoiner_photo_id: ecojoinerPhotoId,
      });
    }

    if (jobSlug && Array.isArray(manifestFiles) && manifestFiles.length) {
      try {
        const persisted = await persistDesignFiles(
          jobSlug,
          design.design_id,
          manifestFiles,
        );
        await ecojoinerDesignsModel.update(design.design_id, {
          file_manifest: JSON.stringify(persisted),
          generated_at: new Date(),
          job_id: null,
        });
      } catch (error) {
        console.error("Failed to persist ecojoiner design files", error);
        // The design row still exists as a draft-ish record; surface the
        // failure so the client knows the files were not actually saved.
        return res.status(500).json({
          success: false,
          message:
            "Your design was saved, but its files could not be copied. Please try generating again.",
        });
      }
    }

    const saved = await ecojoinerDesignsModel.getByIdForUser(
      design.design_id,
      buwanaId,
    );
    return res.json({
      success: true,
      data: {
        design_id: saved.design_id,
        status: saved.status,
        visibility: saved.visibility,
        share_url:
          saved.visibility === "public"
            ? shareUrlFor(req, saved.share_token)
            : null,
      },
    });
  } catch (error) {
    if (error instanceof EcojoinerRequestError) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message, errors: error.errors });
    }
    return next(error);
  }
};

// Re-saving a design that's already loaded and owned by the requester —
// mirrors createDesign's "reusing a saved profile" branch, but updates the
// existing design row in place instead of creating a new one.
export const updateDesign = async (req, res, next) => {
  try {
    const buwanaId = getCurrentUserId(req);
    const designId = Number(req.params.id);
    const existing = await ecojoinerDesignsModel.getByIdForUser(
      designId,
      buwanaId,
    );
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Design not found." });
    }

    const body = req.body || {};
    const files = req.files ?? {};
    const bottlePhotoFile = Array.isArray(files.bottle_photo)
      ? files.bottle_photo[0]
      : null;
    const ecojoinerPhotoFile = Array.isArray(files.ecojoiner_photo)
      ? files.ecojoiner_photo[0]
      : null;

    let profileSnapshot = parseIfString(existing.profile_snapshot, {});
    if (existing.profile_id) {
      const fields = parseProfileFields(body, { requireLabel: false });
      await ecojoinerProfilesModel.update(existing.profile_id, fields);

      if (bottlePhotoFile) {
        const bottlePhotoId = await attachPhoto({
          relatedType: "ecojoiner_bottle_profile",
          relatedId: existing.profile_id,
          uploadedBy: buwanaId,
          file: bottlePhotoFile,
        }).catch((error) => {
          console.error("Failed to attach bottle profile photo", error);
          return null;
        });
        if (bottlePhotoId)
          await ecojoinerProfilesModel.update(existing.profile_id, {
            bottle_photo_id: bottlePhotoId,
          });
      }
      profileSnapshot = await ecojoinerProfilesModel.getByIdForUser(
        existing.profile_id,
        buwanaId,
      );
    }

    const formats = parseJsonField(
      body.formats,
      parseIfString(existing.formats, []),
    );
    const jobSlug = body.job_id ? String(body.job_id) : null;
    const manifestFiles = parseJsonField(body.files, []);
    const visibility = body.visibility === "public" ? "public" : "private";

    const updates = {
      profile_snapshot: JSON.stringify(profileSnapshot),
      ecojoiner_type: body.ecojoinerType
        ? String(body.ecojoinerType)
        : existing.ecojoiner_type,
      formats: JSON.stringify(formats),
      visibility,
    };
    if (visibility === "public" && !existing.share_token) {
      updates.share_token = crypto.randomBytes(16).toString("base64url");
    }
    if (jobSlug) updates.status = "generated";
    await ecojoinerDesignsModel.update(designId, updates);

    const ecojoinerPhotoId = await attachPhoto({
      relatedType: "ecojoiner_design",
      relatedId: designId,
      uploadedBy: buwanaId,
      file: ecojoinerPhotoFile,
    }).catch((error) => {
      console.error("Failed to attach ecojoiner photo", error);
      return null;
    });
    if (ecojoinerPhotoId) {
      await ecojoinerDesignsModel.update(designId, {
        ecojoiner_photo_id: ecojoinerPhotoId,
      });
    }

    if (jobSlug && Array.isArray(manifestFiles) && manifestFiles.length) {
      try {
        const persisted = await persistDesignFiles(
          jobSlug,
          designId,
          manifestFiles,
        );
        await ecojoinerDesignsModel.update(designId, {
          file_manifest: JSON.stringify(persisted),
          generated_at: new Date(),
          job_id: null,
        });
      } catch (error) {
        console.error("Failed to persist ecojoiner design files", error);
        return res.status(500).json({
          success: false,
          message:
            "Your design was saved, but its files could not be copied. Please try generating again.",
        });
      }
    }

    const saved = await ecojoinerDesignsModel.getByIdForUser(
      designId,
      buwanaId,
    );
    return res.json({
      success: true,
      data: {
        design_id: saved.design_id,
        status: saved.status,
        visibility: saved.visibility,
        share_url:
          saved.visibility === "public"
            ? shareUrlFor(req, saved.share_token)
            : null,
      },
    });
  } catch (error) {
    if (error instanceof EcojoinerRequestError) {
      return res
        .status(error.status)
        .json({ success: false, message: error.message, errors: error.errors });
    }
    return next(error);
  }
};

export const deleteDesign = async (req, res, next) => {
  try {
    const buwanaId = getCurrentUserId(req);
    const designId = Number(req.params.id);
    const design = await ecojoinerDesignsModel.getByIdForUser(
      designId,
      buwanaId,
    );
    if (!design) {
      return res
        .status(404)
        .json({ success: false, message: "Design not found." });
    }
    await ecojoinerDesignsModel.remove(designId);
    await removeDesignFiles(designId);
    return res.json({ success: true, data: null });
  } catch (error) {
    return next(error);
  }
};

export const updateDesignVisibility = async (req, res, next) => {
  try {
    const buwanaId = getCurrentUserId(req);
    const designId = Number(req.params.id);
    const design = await ecojoinerDesignsModel.getByIdForUser(
      designId,
      buwanaId,
    );
    if (!design) {
      return res
        .status(404)
        .json({ success: false, message: "Design not found." });
    }
    const visibility = req.body?.visibility === "public" ? "public" : "private";
    const updates = { visibility };
    if (visibility === "public" && !design.share_token) {
      updates.share_token = crypto.randomBytes(16).toString("base64url");
    }
    const updated = await ecojoinerDesignsModel.update(designId, updates);
    return res.json({
      success: true,
      data: {
        design_id: updated.design_id,
        visibility: updated.visibility,
        share_url:
          updated.visibility === "public"
            ? shareUrlFor(req, updated.share_token)
            : null,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export default {
  validateEcojoiner,
  generateEcojoiner,
  listProfiles,
  createProfile,
  updateProfile,
  deleteProfile,
  listDesigns,
  listPublicDesigns,
  getDesign,
  getSharedDesign,
  createDesign,
  updateDesign,
  deleteDesign,
  updateDesignVisibility,
};
