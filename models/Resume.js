const mongoose = require('mongoose');

const ResumeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  atsScore: {
    type: Number,
    required: true
  },
  analysisResults: {
    hasSkills: { type: Boolean, default: false },
    hasEducation: { type: Boolean, default: false },
    hasExperience: { type: Boolean, default: false },
    hasContact: { type: Boolean, default: false },
    matchedKeywords: { type: [String], default: [] },
    missingKeywords: { type: [String], default: [] },
    wordCount: { type: Number, default: 0 }
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Resume', ResumeSchema);
