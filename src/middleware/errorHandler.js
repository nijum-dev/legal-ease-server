/**
 * Central error-handling middleware.
 * Catches unhandled errors, logs them, and returns a consistent JSON response.
 */
function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err);

  // Mongoose-style validation errors (if using native driver with schema validation)
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Validation error.',
      errors: err.errors || err.message,
    });
  }

  // MongoDB duplicate key error
  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      message: 'Duplicate entry. This resource already exists.',
    });
  }

  // Default 500
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'An internal server error occurred. Please try again later.',
  });
}

module.exports = { errorHandler };