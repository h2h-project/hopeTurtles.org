// Minimal in-memory, per-IP rate limiter. Enough to keep an open endpoint that
// spawns a process from being hammered; not a substitute for a real limiter in
// front of a multi-instance deployment.

const buckets = new Map();

// Drop expired buckets occasionally so the map cannot grow forever.
const prune = (now) => {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
};

export const rateLimit = ({
  windowMs = 15 * 60 * 1000,
  max = 30,
  key = 'default',
  message = 'Too many requests. Please wait a moment and try again.'
} = {}) => (req, res, next) => {
  const now = Date.now();
  if (buckets.size > 5000) prune(now);

  const id = `${key}:${req.ip}`;
  const bucket = buckets.get(id);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(id, { count: 1, resetAt: now + windowMs });
    return next();
  }

  bucket.count += 1;
  if (bucket.count > max) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({ success: false, message, retryAfter });
  }

  return next();
};

export default rateLimit;
