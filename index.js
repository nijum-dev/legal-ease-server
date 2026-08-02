const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { errorHandler } = require('./src/middleware/errorHandler');

// Route imports
const profileRoutes = require('./src/routes/profile');
const hiringRequestRoutes = require('./src/routes/hiringRequests');
const commentRoutes = require('./src/routes/comments');
const lawyerRoutes = require('./src/routes/lawyers');
const legalServiceRoutes = require('./src/routes/legalServices');

dotenv.config();

const uri = process.env.MONGO_DB_URI;
const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' })); 

// MongoDB client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    const db = client.db('legal_ease');
    
    // Make db accessible to route handlers via app.locals
    app.locals.db = db;

    const lawyerCollection = db.collection('lawyers');

    // ─── Existing endpoints ───────────────────────────────────────
    app.get('/', (req, res) => {
      res.json({ message: 'LegalEase API is running.' });
    });

    app.get('/lawyers', async (req, res) => {
      try {
        const result = await lawyerCollection.find().toArray();
        res.json(result);
      } catch (err) {
        console.error('Error fetching lawyers:', err);
        res.status(500).json({ error: 'Failed to fetch lawyers' });
      }
    });

    app.get('/lawyers/:id', async (req, res) => {
      try {
        const { ObjectId } = require('mongodb');
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(404).json({ error: 'Lawyer not found' });
        }
        const lawyer = await lawyerCollection.findOne({ _id: new ObjectId(id) });
        if (!lawyer) {
          return res.status(404).json({ error: 'Lawyer not found' });
        }
        res.json(lawyer);
      } catch (err) {
        console.error('Error fetching lawyer by ID:', err);
        res.status(500).json({ error: 'Failed to fetch lawyer' });
      }
    });

    // ─── User dashboard API routes ────────────────────────────────
    app.use('/api/users', profileRoutes);
    app.use('/api/hiring-requests', hiringRequestRoutes);
    app.use('/api/comments', commentRoutes);
    app.use('/api/lawyers', lawyerRoutes);
    app.use('/api/legal-services', legalServiceRoutes);

    // ─── Error handler (must be last) ─────────────────────────────
    app.use(errorHandler);

    // Ping to confirm connection
    await client.db('admin').command({ ping: 1 });
    console.log('Connected to MongoDB!');

    app.listen(port, () => {
      console.log(`LegalEase API server listening on port ${port}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

run().catch(console.dir);