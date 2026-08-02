const express = require('express');
const { ObjectId } = require('mongodb');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/lawyers/me
 * Returns the authenticated lawyer's own profile
 */
router.get('/me', authenticate, requireRole('lawyer'), async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const usersCollection = db.collection('users');
    const lawyersCollection = db.collection('lawyers');

    // Fetch base user
    const user = await usersCollection.findOne(
      { _id: new ObjectId(req.user.id) },
      { projection: { name: 1, email: 1, image: 1 } }
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Fetch lawyer profile
    // Note: the lawyer profile might use the same _id as user, or user.id as a string. 
    // Assuming lawyer profile is linked via _id or userId field. Let's try _id first or create it if missing.
    // Usually, in this DB, lawyers are in the 'lawyers' collection, either with _id = userId or userId = userId.
    // We will query by userId (as string) or _id (as ObjectId).
    let lawyer = await lawyersCollection.findOne({ 
      $or: [
        { _id: new ObjectId(req.user.id) },
        { userId: req.user.id }
      ]
    });

    if (!lawyer) {
      lawyer = {}; // Empty profile if not created yet
    }

    res.json({
      success: true,
      data: {
        id: req.user.id,
        name: user.name,
        email: user.email,
        image: lawyer.image || user.image,
        bio: lawyer.bio || '',
        fee: lawyer.fee || 0,
        specialization: lawyer.specialization || lawyer.category || '',
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/lawyers/me
 * Updates bio, fee, specialization, and/or profile image URL.
 */
router.patch('/me', authenticate, requireRole('lawyer'), async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const lawyersCollection = db.collection('lawyers');
    
    const { bio, fee, specialization, image } = req.body;

    // Validate fee
    const parsedFee = parseFloat(fee);
    if (fee !== undefined && (isNaN(parsedFee) || parsedFee < 0)) {
      return res.status(400).json({ success: false, message: 'Fee must be a non-negative number' });
    }

    // Validate bio
    if (bio !== undefined && bio.length > 2000) {
      return res.status(400).json({ success: false, message: 'Bio is too long (max 2000 characters)' });
    }

    // Basic validation for specialization
    const validSpecializations = [
      'Corporate Law', 'Criminal Defense', 'Family Law', 
      'Immigration Law', 'Intellectual Property', 'Real Estate Law',
      'Corporate', 'Criminal', 'Family', 'Immigration', 'Real Estate'
    ];
    if (specialization !== undefined && !validSpecializations.includes(specialization)) {
      return res.status(400).json({ success: false, message: 'Specialization must be a valid platform category' });
    }

    // Validate image URL roughly
    if (image !== undefined && image !== null) {
      if (image !== '' && !image.startsWith('http')) {
        return res.status(400).json({ success: false, message: 'Invalid image URL format' });
      }
    }

    const updateFields = {};
    if (bio !== undefined) updateFields.bio = bio;
    if (fee !== undefined) updateFields.fee = parsedFee;
    if (specialization !== undefined) {
      updateFields.specialization = specialization;
      updateFields.category = specialization; // fallback for older schema
    }
    if (image !== undefined) updateFields.image = image;

    updateFields.updatedAt = new Date().toISOString();

    // Find the lawyer doc
    const existingLawyer = await lawyersCollection.findOne({
      $or: [
        { _id: new ObjectId(req.user.id) },
        { userId: req.user.id }
      ]
    });

    let result;
    if (!existingLawyer) {
      // Create new profile for lawyer
      const newLawyer = {
        userId: req.user.id,
        name: req.user.name,
        ...updateFields,
        createdAt: new Date().toISOString(),
      };
      const insertRes = await lawyersCollection.insertOne(newLawyer);
      result = await lawyersCollection.findOne({ _id: insertRes.insertedId });
    } else {
      result = await lawyersCollection.findOneAndUpdate(
        { _id: existingLawyer._id },
        { $set: updateFields },
        { returnDocument: 'after' }
      );
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
