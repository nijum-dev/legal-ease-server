const express = require('express');
const { ObjectId } = require('mongodb');
const { authenticate, requireRole } = require('../middleware/auth');
const { validateCommentText, validateRating } = require('../utils/validate');

const router = express.Router();

/**
 * GET /api/comments/mine
 * Returns all comments authored by the authenticated user.
 * Populated with which lawyer profile each comment was left on.
 */
router.get('/mine', authenticate, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const commentsCollection = db.collection('comments');
    const lawyersCollection = db.collection('lawyers');

    const comments = await commentsCollection
      .find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    // Enrich with lawyer details
    const enriched = await Promise.all(
      comments.map(async (comment) => {
        let lawyerName = comment.lawyerName || 'Unknown Lawyer';

        if (comment.lawyerId) {
          try {
            const lawyer = await lawyersCollection.findOne(
              { _id: new ObjectId(comment.lawyerId) },
              { projection: { name: 1 } }
            );
            if (lawyer) {
              lawyerName = lawyer.name || lawyerName;
            }
          } catch (err) {
            // Ignore invalid ObjectId
          }
        }

        return {
          id: comment._id,
          lawyerId: comment.lawyerId,
          lawyerName,
          comment: comment.comment,
          rating: comment.rating || 0,
          createdAt: comment.createdAt,
          updatedAt: comment.updatedAt,
        };
      })
    );

    res.json({
      success: true,
      data: enriched,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/comments
 * Creates a new comment on a lawyer profile.
 */
router.post('/', authenticate, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const commentsCollection = db.collection('comments');

    const { lawyerId, lawyerName, comment, rating } = req.body;

    // Validate text
    const textError = validateCommentText(comment);
    if (textError) {
      return res.status(400).json({ success: false, message: textError });
    }

    // Validate rating (optional)
    const ratingError = validateRating(rating);
    if (ratingError) {
      return res.status(400).json({ success: false, message: ratingError });
    }

    if (!lawyerId) {
      return res.status(400).json({
        success: false,
        message: 'lawyerId is required.',
      });
    }

    const newComment = {
      userId: req.user.id,
      userName: req.user.name || 'Anonymous',
      lawyerId,
      lawyerName: lawyerName || 'Unknown Lawyer',
      comment: comment.trim(),
      rating: rating !== undefined ? Number(rating) : 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await commentsCollection.insertOne(newComment);

    res.status(201).json({
      success: true,
      data: { id: result.insertedId, ...newComment },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/comments/:id
 * Updates a comment's text and/or rating.
 * Ownership verification: only the comment author can update.
 */
router.patch('/:id', authenticate, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const commentsCollection = db.collection('comments');

    const { id } = req.params;
    const { comment, rating } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, message: 'Comment not found.' });
    }

    // Fetch the comment first for ownership check
    const existing = await commentsCollection.findOne({ _id: new ObjectId(id) });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Comment not found.' });
    }

    // Ownership check
    if (existing.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit your own comments.',
      });
    }

    const updateFields = { updatedAt: new Date().toISOString() };

    if (comment !== undefined) {
      const textError = validateCommentText(comment);
      if (textError) {
        return res.status(400).json({ success: false, message: textError });
      }
      updateFields.comment = comment.trim();
    }

    if (rating !== undefined) {
      const ratingError = validateRating(rating);
      if (ratingError) {
        return res.status(400).json({ success: false, message: ratingError });
      }
      updateFields.rating = Number(rating);
    }

    if (Object.keys(updateFields).length === 1) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update. Provide comment or rating.',
      });
    }

    await commentsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    const updated = await commentsCollection.findOne({ _id: new ObjectId(id) });

    res.json({
      success: true,
      data: {
        id: updated._id,
        comment: updated.comment,
        rating: updated.rating,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/comments/:id
 * Deletes a comment. Ownership verification required.
 */
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const commentsCollection = db.collection('comments');

    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(404).json({ success: false, message: 'Comment not found.' });
    }

    // Fetch for ownership check
    const existing = await commentsCollection.findOne({ _id: new ObjectId(id) });
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Comment not found.' });
    }

    // Ownership check
    if (existing.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own comments.',
      });
    }

    await commentsCollection.deleteOne({ _id: new ObjectId(id) });

    res.json({
      success: true,
      message: 'Comment deleted successfully.',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;