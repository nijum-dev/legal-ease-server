const { jwtVerify } = require('jose-cjs');

/**
 * Middleware: Verifies the better-auth session token from the Authorization header.
 * Attaches `req.user = { id, role }` on success.
 * Rejects with 401 if missing/invalid/expired.
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please provide a valid Bearer token.',
      });
    }

    const token = authHeader.split(' ')[1];
    const secret = new TextEncoder().encode(process.env.BETTER_AUTH_SECRET);

    const { payload } = await jwtVerify(token, secret);

    if (!payload || !payload.sub) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token payload.',
      });
    }

    // Attach user info from the token
    req.user = {
      id: payload.sub,
      role: payload.role || 'user',
      email: payload.email || null,
      name: payload.name || null,
    };

    next();
  } catch (err) {
    if (err.code === 'ERR_JWT_EXPIRED') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired. Please sign in again.',
      });
    }
    if (err.code === 'ERR_JWS_INVALID') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token signature.',
      });
    }
    console.error('Auth middleware error:', err);
    return res.status(401).json({
      success: false,
      message: 'Authentication failed.',
    });
  }
}

/**
 * Middleware factory: Restricts access to specific roles.
 * Must be used after `authenticate`.
 * @param  {...string} roles - Allowed roles (e.g. 'user', 'lawyer', 'admin')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role(s): ${roles.join(', ')}.`,
      });
    }

    next();
  };
}

module.exports = { authenticate, requireRole };