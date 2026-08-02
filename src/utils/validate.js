/**
 * Simple server-side validation helpers.
 * No external validation library needed — keeps dependencies minimal.
 */

function validateName(name) {
  if (typeof name !== 'string') return 'Full name must be a string.';
  const trimmed = name.trim();
  if (!trimmed) return 'Full name is required.';
  if (trimmed.length < 1) return 'Full name is required.';
  if (trimmed.length > 100) return 'Full name must be 100 characters or fewer.';
  return null;
}

function validateCommentText(text) {
  if (typeof text !== 'string') return 'Comment text must be a string.';
  const trimmed = text.trim();
  if (!trimmed) return 'Comment cannot be empty.';
  if (trimmed.length > 2000) return 'Comment must be 2000 characters or fewer.';
  return null;
}

function validateRating(rating) {
  if (rating === undefined || rating === null) return null; // optional
  const num = Number(rating);
  if (!Number.isInteger(num) || num < 1 || num > 5) {
    return 'Rating must be an integer between 1 and 5.';
  }
  return null;
}

function validatePagination(query) {
  let page = parseInt(query.page, 10) || 1;
  let limit = parseInt(query.limit, 10) || 10;

  if (page < 1) page = 1;
  if (limit < 1) limit = 1;
  if (limit > 50) limit = 50;

  return { page, limit, skip: (page - 1) * limit };
}

module.exports = { validateName, validateCommentText, validateRating, validatePagination };