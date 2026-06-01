const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect } = require('./auth');
const Resume = require('../models/Resume');
const db = require('../config/db');
const { extractText } = require('../utils/parser');
const { analyzeResume } = require('../utils/atsAnalyzer');
const { uploadFile, deleteFile } = require('../utils/fileStorage');

// Multer setup with 5MB file limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB
});

// Helper validation for file types
const allowedExtensions = ['.pdf', '.docx'];
const allowedMimeTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

// In-memory data store for fallback mode
const memoryResumes = [];

// @route   POST /api/resumes/upload
// @desc    Upload a resume file, extract text, evaluate ATS metrics, and save
// @access  Private
router.post('/upload', protect, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a file' });
    }

    const { originalname, buffer, mimetype, size } = req.file;
    const { jobDescription } = req.body; // Optional job description to match keywords against

    // File type validations
    const fileExt = path.extname(originalname).toLowerCase();
    if (!allowedExtensions.includes(fileExt) || !allowedMimeTypes.includes(mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Unsupported file type. Only PDF and DOCX files are allowed.'
      });
    }

    console.log(`Processing upload for user ${req.user.fullname}: ${originalname} (${(size / 1024 / 1024).toFixed(2)} MB)`);

    // 1. Extract text from PDF / DOCX
    let textContent = '';
    try {
      textContent = await extractText(buffer, originalname);
    } catch (parseErr) {
      return res.status(422).json({
        success: false,
        message: `File parsing error: ${parseErr.message}`
      });
    }

    if (!textContent || textContent.trim().length === 0) {
      return res.status(422).json({
        success: false,
        message: 'Could not extract any text from the uploaded file. Ensure it is not empty or image-only.'
      });
    }

    // 2. Perform ATS scoring & analysis
    const analysis = analyzeResume(textContent, jobDescription || '');

    // 3. Upload file to Cloud Storage (or Local Storage fallback)
    let fileUrl = '';
    try {
      fileUrl = await uploadFile(buffer, originalname, mimetype);
    } catch (storageErr) {
      return res.status(500).json({
        success: false,
        message: `Failed to upload file to storage: ${storageErr.message}`
      });
    }

    // 4. Save to Database / Memory
    const resumeData = {
      userId: req.user._id,
      fileName: originalname,
      fileUrl,
      atsScore: analysis.atsScore,
      analysisResults: analysis.analysisResults
    };

    if (db.isConnected()) {
      const resume = await Resume.create(resumeData);
      return res.status(201).json({
        success: true,
        message: 'Resume analyzed and saved successfully',
        resume
      });
    } else {
      // Memory Fallback Save
      const memResume = {
        _id: 'mem_res_' + Math.random().toString(36).substring(2, 11),
        ...resumeData,
        uploadedAt: new Date()
      };
      memoryResumes.push(memResume);
      
      return res.status(201).json({
        success: true,
        message: 'Resume analyzed and saved successfully (In-Memory Fallback)',
        resume: memResume
      });
    }

  } catch (error) {
    console.error('Resume processing error:', error);
    res.status(500).json({ success: false, message: 'Server error during resume processing' });
  }
});

// @route   GET /api/resumes/history
// @desc    Get all resume uploads and analyses for the logged-in user
// @access  Private
router.get('/history', protect, async (req, res) => {
  try {
    if (db.isConnected()) {
      const resumes = await Resume.find({ userId: req.user._id }).sort({ uploadedAt: -1 });
      return res.status(200).json({
        success: true,
        count: resumes.length,
        resumes
      });
    } else {
      // Memory Fallback Fetch (Sorted by uploadedAt descending)
      const resumes = memoryResumes
        .filter(r => r.userId.toString() === req.user._id.toString())
        .sort((a, b) => b.uploadedAt - a.uploadedAt);
      
      return res.status(200).json({
        success: true,
        count: resumes.length,
        resumes
      });
    }
  } catch (error) {
    console.error('Failed to fetch resumes history:', error);
    res.status(500).json({ success: false, message: 'Server error fetching resumes history' });
  }
});

// @route   DELETE /api/resumes/:id
// @desc    Delete a resume from database and storage
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    if (db.isConnected()) {
      const resume = await Resume.findById(req.params.id);

      if (!resume) {
        return res.status(404).json({ success: false, message: 'Resume not found' });
      }

      // Verify ownership
      if (resume.userId.toString() !== req.user._id.toString()) {
        return res.status(401).json({ success: false, message: 'Not authorized to delete this resume' });
      }

      // Delete the file from storage (Azure Blob or local filesystem)
      await deleteFile(resume.fileUrl);

      // Delete from MongoDB
      await resume.deleteOne();

      return res.status(200).json({
        success: true,
        message: 'Resume deleted successfully'
      });
    } else {
      // Memory Fallback Delete
      const index = memoryResumes.findIndex(r => r._id === req.params.id);
      
      if (index === -1) {
        return res.status(404).json({ success: false, message: 'Resume not found' });
      }

      const resume = memoryResumes[index];
      
      // Verify ownership
      if (resume.userId.toString() !== req.user._id.toString()) {
        return res.status(401).json({ success: false, message: 'Not authorized to delete this resume' });
      }

      // Delete file from local/cloud storage
      await deleteFile(resume.fileUrl);

      // Remove from memory
      memoryResumes.splice(index, 1);

      return res.status(200).json({
        success: true,
        message: 'Resume deleted successfully (In-Memory Fallback)'
      });
    }
  } catch (error) {
    console.error('Delete resume error:', error);
    res.status(500).json({ success: false, message: 'Server error deleting resume' });
  }
});

module.exports = router;
