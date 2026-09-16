const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// 1. MongoDB connection set up
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/surgical_safety';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected: Surgical Audit Trail is Active'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));

// 2. audit log schema (Audit Trail Schema)
// In accordance with HIPAA guidelines, it will log who checked what data and when.
const auditLogSchema = new mongoose.Schema({
  patientId: { type: String, required: true },
  patientName: String,
  verifiedBy: { type: String, default: "Dr. Smith (OR Surgeon)" },
  timestamp: { type: Date, default: Date.now },
  safetyStatus: { type: String, default: 'Passed' },
  clinicalData: {
    plateletCount: Number,
    isPlateletSafe: Boolean,
    hasAllergies: Boolean,
    allergyList: [String]
  },
  checklistStatus: { type: String, default: "Completed" }
});

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

// 3. API Routes (Routes)

// Basic check
app.get('/', (req, res) => {
  res.send("Surgical Safety Gate Backend API is running...");
});

// API for saving audit logs (POST Request)
app.post('/api/audit', async (req, res) => {
  try {
    const { 
      patientId, 
      patientName, 
      plateletCount, 
      isPlateletSafe, 
      hasAllergies, 
      allergyList 
    } = req.body;

    const newAuditEntry = new AuditLog({
      patientId,
      patientName,
      safetyStatus: (isPlateletSafe && !hasAllergies) ? 'Safe for Surgery' : 'Requires Review',
      clinicalData: {
        plateletCount,
        isPlateletSafe,
        hasAllergies,
        allergyList
      }
    });

    const savedLog = await newAuditEntry.save();
    
    res.status(201).json({
      success: true,
      message: "Audit trail record created for hospital compliance.",
      logId: savedLog._id
    });
  } catch (error) {
    console.error("Audit Error:", error);
    res.status(500).json({ success: false, message: "Server Error: Could not save audit log." });
  }
});

// Viewing the audit history of a specific patient (GET Request)
app.get('/api/audit/:patientId', async (req, res) => {
  try {
    const history = await AuditLog.find({ patientId: req.params.patientId }).sort({ timestamp: -1 });
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. server listening
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`🚀 Backend Server running on http://localhost:${PORT}`);
});