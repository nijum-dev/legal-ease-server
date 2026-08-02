const express = require('express');
const { ObjectId } = require('mongodb');
const { authenticate } = require('../middleware/auth');
const { validateName } = require('../utils/validate');

const router = express.Router();

/**
 * GET /api/users/me
 * Returns the authenticated user's profile.
 * Excludes sensitive fields (password hash, tokens).
 */
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const usersCollection = db.collection('user');

    const user = await usersCollection.findOne(
      { _id: new ObjectId(req.user.id) },
      {
        projection: {
          password: 0,
          passwordHash: 0,
          token: 0,
          tokens: 0,
          __v: 0,
        },
      }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    res.json({
      success: true,
      data: {
        id: user._id,
        name: user.name,
        email: user.email,
        image: user.image || null,
        role: user.role || 'user',
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/users/me
 * Updates the authenticated user's full name and/or profile picture.
 * Validates name server-side. Image is accepted as a base64 data URL
 * (since the frontend already handles the upload via imgBB or similar).
 */
router.patch('/me', authenticate, async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const usersCollection = db.collection('user');

    const { name, image } = req.body;
    const updateFields = {};

    // Validate name if provided
    if (name !== undefined) {
      const nameError = validateName(name);
      if (nameError) {
        return res.status(400).json({
          success: false,
          message: nameError,
        });
      }
      updateFields.name = name.trim();
    }

    // Validate image if provided (must be a string URL or base64)
    if (image !== undefined) {
      if (typeof image !== 'string' || image.length > 5 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: 'Invalid image. Must be a valid URL or base64 string under 5MB.',
        });
      }
      updateFields.image = image;
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update. Provide at least name or image.',
      });
    }

    const result = await usersCollection.findOneAndUpdate(
      { _id: new ObjectId(req.user.id) },
      { $set: updateFields },
      {
        returnDocument: 'after',
        projection: {
          password: 0,
          passwordHash: 0,
          token: 0,
          tokens: 0,
          __v: 0,
        },
      }
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    res.json({
      success: true,
      data: {
        id: result._id,
        name: result.name,
        email: result.email,
        image: result.image || null,
        role: result.role || 'user',
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;