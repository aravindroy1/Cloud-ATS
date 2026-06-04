const { app } = require('@azure/functions');
const { BlobServiceClient } = require('@azure/storage-blob');
const { DocumentAnalysisClient, AzureKeyCredential } = require('@azure/ai-form-recognizer');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

const Resume = require('../models/Resume');
const User = require('../models/User');
const { analyzeResume } = require('../utils/atsAnalyzer');

// Global Mongoose Connection Helper
const connectDb = async (context) => {
  if (mongoose.connection.readyState === 1) {
    return;
  }
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/resume-analyzer';
  context.log(`Connecting function to MongoDB at: ${mongoUri.replace(/:[^@/]+@/, ':****@')}`);
  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 15000, // give Cosmos DB enough time to handshake
    tlsAllowInvalidCertificates: true, // bypass local CA certificate trust issues
    directConnection: true // bypass replica-set host discovery resolution failures
  });
};

// Nodemailer SMTP Email Helper
const sendEmailNotification = async (context, email, fullname, filename, score) => {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  
  if (!host || !user || !pass) {
    context.log('SMTP Credentials are not configured. Skipping email notification.');
    return;
  }

  const port = parseInt(process.env.SMTP_PORT || '587');
  const from = process.env.SMTP_FROM || 'no-reply@cloudats.com';

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  const scoreColor = score >= 80 ? '#107c41' : (score >= 60 ? '#d83b01' : '#a80000');

  const mailOptions = {
    from,
    to: email,
    subject: `CloudATS: Analysis Complete for ${filename}`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff; color: #1e293b;">
        <div style="text-align: center; border-bottom: 2px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 20px;">
          <h2 style="color: #0078d4; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">CloudATS</h2>
          <p style="margin: 5px 0 0 0; color: #64748b; font-size: 14px;">Automated Resume Scorer</p>
        </div>
        
        <p style="font-size: 16px; line-height: 1.6;">Hello <strong>${fullname}</strong>,</p>
        <p style="font-size: 16px; line-height: 1.6;">Your resume, <strong>${filename}</strong>, has been successfully processed and scored against target Applicant Tracking System standards.</p>
        
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 20px; border-radius: 8px; margin: 25px 0; text-align: center;">
          <span style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; display: block; margin-bottom: 5px;">Your Match Rating</span>
          <span style="font-size: 54px; font-weight: 800; color: ${scoreColor}; line-height: 1;">${score}%</span>
        </div>

        <p style="font-size: 15px; line-height: 1.6; color: #475569;">To view the full details, including a structural checkmark breakdown, keyword matches, and targeted improvements, please visit your dashboard.</p>
        
        <div style="text-align: center; margin: 30px 0 10px 0;">
          <a href="${process.env.APP_DASHBOARD_URL || 'http://localhost:8080'}" style="background-color: #0078d4; color: #ffffff; padding: 12px 28px; border-radius: 6px; font-size: 15px; font-weight: 700; text-decoration: none; display: inline-block; transition: background-color 0.2s;">Open Dashboard</a>
        </div>
        
        <div style="margin-top: 35px; border-top: 1px solid #f1f5f9; padding-top: 15px; text-align: center; font-size: 11px; color: #94a3b8;">
          <p style="margin: 0;">This is an automated system email notification. Please do not reply directly to this address.</p>
        </div>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    context.log(`Notification email successfully sent. MessageId: ${info.messageId}`);
  } catch (err) {
    context.error('Nodemailer SMTP Transmission Failure:', err.message);
  }
};

// Azure Functions Blob Trigger Registry
app.storageBlob('resumeBlobTrigger', {
  path: 'resumes/{name}',
  connection: 'AZURE_STORAGE_CONNECTION_STRING',
  handler: async (blob, context) => {
    const blobName = context.triggerMetadata.name; // Unique blobName key (e.g. 1717462000-1234567.pdf)
    context.log(`Processing Blob Trigger Event: "${blobName}" (${blob.length} bytes)`);

    try {
      // 1. Establish Database Connection
      await connectDb(context);

      // 2. Load properties & custom metadata from storage blob
      const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
      const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'resumes';
      
      let userId = '';
      let fileName = blobName; // Default display name to blobName
      let jobDescription = '';

      if (connectionString) {
        context.log(`Connecting to Azure Storage to fetch metadata for blob: ${blobName}`);
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const blobClient = containerClient.getBlobClient(blobName);
        
        const properties = await blobClient.getProperties();
        const metadata = properties.metadata || {};
        
        userId = metadata.userid || '';
        fileName = metadata.filename ? decodeURIComponent(metadata.filename) : blobName;
        jobDescription = metadata.jobdescription 
          ? Buffer.from(metadata.jobdescription, 'base64').toString('utf8')
          : '';
      } else {
        context.log('Warning: Storage Connection String missing. Running in local test simulation mode.');
      }

      if (!userId) {
        context.log('Warning: No "userid" metadata found. Unable to associate resume to a user. Aborting database update.');
        return;
      }

      // 3. Document Analysis via Azure AI Document Intelligence OCR
      const docIntelEndpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT;
      const docIntelKey = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY;
      
      let extractedText = '';

      if (docIntelEndpoint && docIntelKey) {
        context.log(`Analyzing document with Document Intelligence endpoint: ${docIntelEndpoint}`);
        const docIntelClient = new DocumentAnalysisClient(
          docIntelEndpoint,
          new AzureKeyCredential(docIntelKey)
        );

        // Analyze raw buffer using Prebuilt Read OCR layout engine
        const poller = await docIntelClient.beginAnalyzeDocument("prebuilt-read", blob);
        const result = await poller.pollUntilDone();
        extractedText = result.content || '';
        context.log(`OCR complete. Extracted ${extractedText.length} characters.`);
      } else {
        context.log('Warning: Azure AI Document Intelligence keys missing. Converting blob buffer straight to text string.');
        extractedText = blob.toString('utf8');
      }

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('Document content could not be parsed. The text extraction is empty.');
      }

      // 4. Score Resume Text
      context.log(`Auditing resume against job description (JD length: ${jobDescription.length} chars)`);
      const analysis = analyzeResume(extractedText, jobDescription);

      // 5. Update Database Record matching on unique blobName (Private Access secure match)
      let resume = await Resume.findOne({ blobName: blobName });

      if (resume) {
        resume.atsScore = analysis.atsScore;
        resume.analysisResults = analysis.analysisResults;
        resume.status = 'Completed';
        resume.error = null;
        await resume.save();
        context.log(`Database record updated successfully. Resume ID: ${resume._id}, Score: ${analysis.atsScore}%`);
      } else {
        context.log('Warning: Placeholder record not found. Creating a new completed resume record.');
        const newResume = new Resume({
          userId: new mongoose.Types.ObjectId(userId),
          fileName,
          blobName,
          fileUrl: '', // Secure download URL proxy populated below
          status: 'Completed',
          atsScore: analysis.atsScore,
          analysisResults: analysis.analysisResults
        });
        
        newResume.fileUrl = `/api/resumes/${newResume._id}/download`;
        await newResume.save();
        context.log(`Created new completed resume record. ID: ${newResume._id}`);
      }

      // 6. Retrieve User Details and Trigger SMTP Email
      const user = await User.findById(userId);
      if (user && user.email) {
        context.log(`Triggering SMTP email alert to user: ${user.email}`);
        await sendEmailNotification(context, user.email, user.fullname, fileName, analysis.atsScore);
      } else {
        context.log(`Skipping email: User matching ID ${userId} could not be resolved.`);
      }

    } catch (error) {
      context.error(`Azure Function execution failed: ${error.message}`);
      
      // Update DB to failed state if possible
      try {
        await connectDb(context);
        const resumes = await Resume.find({ blobName: blobName, status: 'Pending' });
        
        for (const resItem of resumes) {
          resItem.status = 'Failed';
          resItem.error = error.message;
          await resItem.save();
          context.log(`Marked resume record ${resItem._id} as Failed`);
        }
      } catch (dbErr) {
        context.error(`Failed to record error state in DB: ${dbErr.message}`);
      }
    }
  }
});
