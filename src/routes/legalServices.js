const express = require('express');
const { ObjectId } = require('mongodb');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/legal-services/mine
 * List the authenticated lawyer's own services.
 */
router.get('/mine', authenticate, requireRole('lawyer'), async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const servicesCollection = db.collection('legal_services');

    const services = await servicesCollection
      .find({ lawyerId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();

    // Map _id to id for frontend consistency if needed, but let's just return raw docs for now
    res.json({
      success: true,
      data: services,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/legal-services
 * Create a new service owned by the authenticated lawyer.
 */
router.post('/', authenticate, requireRole('lawyer'), async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const servicesCollection = db.collection('legal_services');

    const { title, description, fee } = req.body;

    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ success: false, message: 'Title is required' });
    }

    const parsedFee = parseFloat(fee);
    if (fee !== undefined && (isNaN(parsedFee) || parsedFee < 0)) {
      return res.status(400).json({ success: false, message: 'Fee must be a non-negative number' });
    }

    const newService = {
      lawyerId: req.user.id,
      title: title.trim(),
      description: description || '',
      fee: parsedFee || 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await servicesCollection.insertOne(newService);

    res.status(201).json({
      success: true,
      data: { _id: result.insertedId, ...newService },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/legal-services/:id
 * Update a service; verify ownership.
 */
router.patch('/:id', authenticate, requireRole('lawyer'), async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const servicesCollection = db.collection('legal_services');
    const { id } = req.params;
    const { title, description, fee } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid service ID' });
    }

    const service = await servicesCollection.findOne({ _id: new ObjectId(id) });
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    if (service.lawyerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied: You do not own this service' });
    }

    const updateFields = { updatedAt: new Date().toISOString() };

    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim() === '') {
        return res.status(400).json({ success: false, message: 'Title cannot be empty' });
      }
      updateFields.title = title.trim();
    }

    if (description !== undefined) {
      updateFields.description = description;
    }

    if (fee !== undefined) {
      const parsedFee = parseFloat(fee);
      if (isNaN(parsedFee) || parsedFee < 0) {
        return res.status(400).json({ success: false, message: 'Fee must be a non-negative number' });
      }
      updateFields.fee = parsedFee;
    }

    const result = await servicesCollection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updateFields },
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

/**
 * DELETE /api/legal-services/:id
 * Delete a service; verify ownership.
 */
router.delete('/:id', authenticate, requireRole('lawyer'), async (req, res, next) => {
  try {
    const db = req.app.locals.db;
    const servicesCollection = db.collection('legal_services');
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid service ID' });
    }

    const service = await servicesCollection.findOne({ _id: new ObjectId(id) });
    if (!service) {
      return res.status(404).json({ success: false, message: 'Service not found' });
    }

    if (service.lawyerId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied: You do not own this service' });
    }

    await servicesCollection.deleteOne({ _id: new ObjectId(id) });

    res.json({
      success: true,
      message: 'Service deleted successfully',
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
