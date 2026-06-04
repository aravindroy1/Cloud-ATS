const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect } = require('./auth');
const Resume = require('../models/Resume');
const db = require('../config/db');
const { extractText } = require('../utils/parser');
const { analyzeResume } = require('../utils/atsAnalyzer');
const { uploadFile, deleteFile, isAzureConfigured } = require('../utils/fileStorage');

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

// In-memory data store for fallback mode (when MongoDB is offline)
const memoryResumes = [];

// @route   POST /api/resumes/upload
// @desc    Upload a resume file, trigger processing (async on Azure, sync on local fallback)
// @access  Private
router.post('/upload', protect, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a file' });
    }

    const { originalname, buffer, mimetype, size } = req.file;
    const { jobDescription } = req.body; // Optional job description

    // File type validations
    const fileExt = path.extname(originalname).toLowerCase();
    if (!allowedExtensions.includes(fileExt) || !allowedMimeTypes.includes(mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Unsupported file type. Only PDF and DOCX files are allowed.'
      });
    }

    const userIdStr = req.user._id.toString();

    // -------------------------------------------------------------
    // AZURE DECOUPLED FLOW (ASYNCHRONOUS PROD ARCHITECTURE)
    // -------------------------------------------------------------
    if (isAzureConfigured()) {
      console.log(`[Azure Flow] Uploading file for async analysis. User: ${req.user.fullname}`);

      // Encode metadata safely
      const metadata = {
        userid: userIdStr,
        filename: encodeURIComponent(originalname),
        jobdescription: Buffer.from(jobDescription || '').toString('base64')
      };

      // Upload to Azure Blob Storage
      const fileUrl = await uploadFile(buffer, originalname, mimetype, metadata);

      const resumeData = {
        userId: req.user._id,
        fileName: originalname,
        fileUrl,
        status: 'Pending',
        atsScore: 0,
        analysisResults: {
          hasSkills: false,
          hasEducation: false,
          hasExperience: false,
          hasContact: false,
          matchedKeywords: [],
          missingKeywords: [],
          wordCount: 0
        }
      };

      if (db.isConnected()) {
        const resume = await Resume.create(resumeData);
        return res.status(201).json({
          success: true,
          message: 'Resume uploaded successfully. Processing started.',
          resume
        });
      } else {
        // Memory fallback (even in Azure mode, if Mongo is offline)
        const memResume = {
          _id: 'mem_res_' + Math.random().toString(36).substring(2, 11),
          ...resumeData,
          uploadedAt: new Date()
        };
        memoryResumes.push(memResume);
        return res.status(201).json({
          success: true,
          message: 'Resume uploaded successfully (Memory fallback). Processing started.',
          resume: memResume
        });
      }
    }

    // -------------------------------------------------------------
    // LOCAL FALLBACK FLOW (SYNCHRONOUS DEVELOPMENT ARCHITECTURE)
    // -------------------------------------------------------------
    console.log(`[Local Flow] Analyzing file synchronously. User: ${req.user.fullname}`);

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
        message: 'Could not extract any text from the uploaded file.'
      });
    }

    // Perform scoring immediately
    const analysis = analyzeResume(textContent, jobDescription || '');

    // Upload to local storage
    const fileUrl = await uploadFile(buffer, originalname, mimetype);

    const resumeData = {
      userId: req.user._id,
      fileName: originalname,
      fileUrl,
      status: 'Completed',
      atsScore: analysis.atsScore,
      analysisResults: analysis.analysisResults
    };

    if (db.isConnected()) {
      const resume = await Resume.create(resumeData);
      return res.status(201).json({
        success: true,
        message: 'Resume analyzed and saved successfully (Local Flow)',
        resume
      });
    } else {
      const memResume = {
        _id: 'mem_res_' + Math.random().toString(36).substring(2, 11),
        ...resumeData,
        uploadedAt: new Date()
      };
      memoryResumes.push(memResume);
      return res.status(201).json({
        success: true,
        message: 'Resume analyzed and saved successfully (Local Memory Flow)',
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

      // Delete the file from storage
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
