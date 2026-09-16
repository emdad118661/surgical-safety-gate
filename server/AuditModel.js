const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  patientId: String,
  patientName: String,
  verifiedBy: { type: String, default: "Dr. Smith (Simulated)" },
  timestamp: { type: Date, default: Date.now },
  status: String, // e.g., "Passed Safety Gate"
  plateletCount: Number,
  hasAllergies: Boolean,
});

module.exports = mongoose.model('AuditLog', auditLogSchema);