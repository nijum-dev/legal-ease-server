const express = require('express');
const { ObjectId } = require('mongodb');
const { authenticate, requireRole } = require('../middleware/auth');
const { validatePagination } = require('../utils/validate');

const router = express.Router();

/**
 * GET /api/hiring-requests/mine
 * Returns all hiring requests where the authenticated user is the "user" party.
 * Populated with lawyer name and specialisation.
 * Supports pagination via ?page=1&limit=10.
 * Sorted by most recent hiring date first.
 * Read-only for the user — status is set by the lawyer.
 */
router.get('/mine', authenticate, requireRole('user', 'lawyer', 'admin'), async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const hiresCollection = db.collection('hires');
    const lawyersCollection = db.collection('lawyers');

    const { page, limit, skip } = validatePagination(req.query);

    // Build query: only the user's own hiring requests
    const query = { userId: req.user.id };

    // Get total count for pagination
    const total = await hiresCollection.countDocuments(query);

    // Fetch hires sorted by most recent first
    const hires = await hiresCollection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    // Populate lawyer details for each hire
    const enrichedHires = await Promise.all(
      hires.map(async (hire) => {
        let lawyerName = hire.lawyerName || 'Unknown Lawyer';
        let specialization = hire.specialization || '';

        // Try to look up the lawyer from the lawyers collection
        if (hire.lawyerId) {
          try {
            const lawyer = await lawyersCollection.findOne(
              { _id: new ObjectId(hire.lawyerId) },
              { projection: { name: 1, category: 1 } }
            );
            if (lawyer) {
              lawyerName = lawyer.name || lawyerName;
              specialization = lawyer.category || specialization;
            }
          } catch (err) {
            // If ObjectId is invalid, just use stored values
          }
        }

        return {
          id: hire._id,
          lawyerId: hire.lawyerId,
          lawyerName,
          specialization,
          fee: hire.fee || 0,
          status: hire.status || 'pending',
          hiringDate: hire.createdAt,
          createdAt: hire.createdAt,
          updatedAt: hire.updatedAt,
        };
      })
    );

    res.json({
      success: true,
      data: enrichedHires,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/hiring-requests
 * Creates a new hiring request from the authenticated user to a lawyer.
 */
router.post('/', authenticate, requireRole('user'), async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const hiresCollection = db.collection('hires');

    const { lawyerId, lawyerName, specialization, fee } = req.body;

    if (!lawyerId) {
      return res.status(400).json({
        success: false,
        message: 'lawyerId is required.',
      });
    }

    const hire = {
      userId: req.user.id,
      userName: req.user.name || 'Unknown',
      lawyerId,
      lawyerName: lawyerName || 'Unknown Lawyer',
      specialization: specialization || '',
      fee: typeof fee === 'number' ? fee : parseFloat(fee) || 0,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await hiresCollection.insertOne(hire);

    res.status(201).json({
      success: true,
      data: { id: result.insertedId, ...hire },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/hiring-requests/lawyer-mine
 * Returns all hiring requests where the authenticated lawyer is the target.
 */
router.get('/lawyer-mine', authenticate, requireRole('lawyer'), async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const hiresCollection = db.collection('hires');
    const { page, limit, skip } = validatePagination(req.query);

    const query = { lawyerId: req.user.id };

    const total = await hiresCollection.countDocuments(query);
    const hires = await hiresCollection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const formattedHires = hires.map(hire => ({
      id: hire._id,
      userId: hire.userId,
      userName: hire.userName || 'Unknown Client',
      message: hire.message || '',
      fee: hire.fee || 0,
      status: hire.status || 'pending',
      specialization: hire.specialization || '',
      hiringDate: hire.createdAt,
      createdAt: hire.createdAt,
      updatedAt: hire.updatedAt,
    }));

    res.json({
      success: true,
      data: formattedHires,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/hiring-requests/:id/status
 * Lawyer accepts or rejects a hiring request
 */
router.patch('/:id/status', authenticate, requireRole('lawyer'), async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const hiresCollection = db.collection('hires');
    const { id } = req.params;
    const { status } = req.body;

    if (!['accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid request ID' });
    }

    const hire = await hiresCollection.findOne({ _id: new ObjectId(id) });
    if (!hire) {
      return res.status(404).json({ success: false, message: 'Hiring request not found' });
    }

    if (hire.lawyerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied: You do not own this request' });
    }

    if (hire.status !== 'pending') {
      return res.status(409).json({ success: false, message: 'Request has already been processed' });
    }

    const updatedDoc = {
      $set: {
        status,
        updatedAt: new Date().toISOString(),
      },
    };

    const result = await hiresCollection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      updatedDoc,
      { returnDocument: 'after' }
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;