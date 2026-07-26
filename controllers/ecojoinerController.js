import { runGenerator, EcojoinerRequestError } from '../utils/ecojoinerGenerator.js';

// Validation errors are a normal outcome of the form, not a server fault, so
// they answer with 422 and a list the page can render field-by-field.
const handle = async (req, res, next, { dryRun }) => {
  try {
    const manifest = await runGenerator(req.body, { dryRun });
    return res.json({ success: true, data: manifest });
  } catch (error) {
    if (error instanceof EcojoinerRequestError) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        errors: error.errors
      });
    }
    return next(error);
  }
};

// Step 1 of the page flow: derive and show dimensions, write nothing.
export const validateEcojoiner = (req, res, next) => handle(req, res, next, { dryRun: true });

// Step 2: write the job folder and return download URLs.
export const generateEcojoiner = (req, res, next) => handle(req, res, next, { dryRun: false });

export default { validateEcojoiner, generateEcojoiner };
