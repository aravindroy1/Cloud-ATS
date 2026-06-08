require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { connectDB } = require('./config/db');
const { loadSecrets } = require('./config/keyvault');

const app = express();

// Standard middlewares
app.use(cors({
  origin: true, // Allow client origin mapping
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Serve Static Frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Serve local uploads if Azure is not configured (Local storage fallback folder)
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Routes
const { router: authRouter } = require('./routes/auth');
const resumesRouter = require('./routes/resumes');

app.use('/api/auth', authRouter);
app.use('/api/resumes', resumesRouter);

// Fallback index.html for Single Page App routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Custom error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);

  // Catch Multer limit errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'File upload size exceeded. Maximum limit is 5 MB.'
    });
  }

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

const PORT = process.env.PORT || 8080;

// Wrap in async to load secrets first
const startServer = async () => {
  try {
    await loadSecrets();
    await connectDB();
    
    const server = app.listen(PORT, () => {
      console.log(`===================================================`);
      console.log(` Resume Analyzer Server Running in ${process.env.NODE_ENV || 'development'} mode`);
      console.log(` Local URL: http://localhost:${PORT}`);
      console.log(`===================================================`);
    });

    // Graceful shutdown
    process.on('unhandledRejection', (err) => {
      console.error(`Unhandled Rejection Error: ${err.message}`);
      // Close server & exit process
      server.close(() => process.exit(1));
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

// Graceful shutdown
process.on('unhandledRejection', (err) => {
  console.error(`Unhandled Rejection Error: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});
