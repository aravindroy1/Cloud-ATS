/**
 * CloudATS SPA Frontend Controller.
 * Handles DOM interactivity, styling states, form events, and modal mapping.
 */

// Application State
let currentUser = null;
let resumesList = [];
let selectedFile = null;
let pollingInterval = null;

// DOM Cache
const appLoader = document.getElementById('app-loader');
const appContainer = document.getElementById('app-container');
const viewGuest = document.getElementById('view-guest');
const viewDashboard = document.getElementById('view-dashboard');
const userMenu = document.getElementById('user-menu');
const userDisplayName = document.getElementById('user-display-name');
const logoutBtn = document.getElementById('logout-btn');

// Theme Elements
const themeToggle = document.getElementById('theme-toggle');

// Auth Tabs & Forms
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const formLogin = document.getElementById('form-login');
const formRegister = document.getElementById('form-register');
const loginError = document.getElementById('login-error');
const registerError = document.getElementById('register-error');

// Dashboard Stats & Forms
const dashboardUserName = document.getElementById('dashboard-user-name');
const statTotal = document.getElementById('stat-total');
const statAvg = document.getElementById('stat-avg');
const statBest = document.getElementById('stat-best');

const formUpload = document.getElementById('form-upload');
const jobDescription = document.getElementById('job-description');
const resumeFileInput = document.getElementById('resume-file');
const dropZone = document.getElementById('drop-zone');
const selectedFileNameDiv = document.getElementById('selected-file-name');
const fileNameSpan = document.getElementById('file-name-span');
const clearFileBtn = document.getElementById('clear-file');
const dropZoneContent = document.querySelector('.drop-zone-content');
const uploadError = document.getElementById('upload-error');
const analyzeSubmitBtn = document.getElementById('analyze-submit-btn');

// Progress Indicator
const progressContainer = document.getElementById('upload-progress-container');
const progressFill = document.getElementById('upload-progress-fill');
const progressPercentage = document.getElementById('upload-percentage');

// History Table
const historyLoading = document.getElementById('history-loading');
const historyEmpty = document.getElementById('history-empty');
const historyTable = document.getElementById('history-table');
const historyTableBody = document.getElementById('history-table-body');

// Report Modal
const reportModal = document.getElementById('report-modal');
const modalResumeTitle = document.getElementById('modal-resume-title');
const modalScanDate = document.getElementById('modal-scan-date');
const modalGaugeFill = document.getElementById('modal-gauge-fill');
const modalGaugeText = document.getElementById('modal-gauge-text');
const modalWordCount = document.getElementById('modal-word-count');
const auditContact = document.getElementById('audit-contact');
const auditExperience = document.getElementById('audit-experience');
const auditEducation = document.getElementById('audit-education');
const auditSkills = document.getElementById('audit-skills');
const matchedCountSpan = document.getElementById('matched-count');
const missingCountSpan = document.getElementById('missing-count');
const matchedKeywordsContainer = document.getElementById('matched-keywords-container');
const missingKeywordsContainer = document.getElementById('missing-keywords-container');
const modalDownloadBtn = document.getElementById('modal-download-btn');
const closeModalBtn = document.getElementById('close-modal');
const closeModalFooterBtn = document.getElementById('modal-close-footer');

// Toast
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

/* ==========================================================================
   Initialization & Theme Logic
   ========================================================================== */
document.addEventListener('DOMContentLoaded', async () => {
  // Theme check
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Authenticate user initially
  await checkAuthentication();
  
  // Hide global spinner
  appLoader.style.display = 'none';
  appContainer.style.display = 'block';
});

// Theme toggle click handler
themeToggle.addEventListener('click', () => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
});

// Global Unauthorized Interceptor
window.addEventListener('auth-unauthorized', async () => {
  if (currentUser) {
    currentUser = null;
    stopPolling();
    try {
      await API.logout();
    } catch (e) {
      console.warn('Silent logout failed during 401 interception', e);
    }
    showToast('Session expired. Please log in again.');
    showGuestView();
  }
});

// Show Toast Notification helper
const showToast = (message, duration = 3000) => {
  toastMessage.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, duration);
};

/* ==========================================================================
   Routing / View Coordinator
   ========================================================================== */
const checkAuthentication = async () => {
  const token = localStorage.getItem('token');
  if (!token) {
    showGuestView();
    return;
  }

  try {
    const data = await API.getProfile();
    currentUser = data.user;
    showDashboardView();
  } catch (error) {
    console.warn('Auth check failed, clearing session', error.message);
    localStorage.removeItem('token');
    showGuestView();
  }
};

const showGuestView = () => {
  currentUser = null;
  stopPolling();
  viewDashboard.style.display = 'none';
  userMenu.style.display = 'none';
  viewGuest.style.display = 'grid';
};

const showDashboardView = () => {
  viewGuest.style.display = 'none';
  
  // Setup user details in header & dashboard
  userDisplayName.textContent = currentUser.fullname;
  dashboardUserName.textContent = currentUser.fullname;
  userMenu.style.display = 'flex';
  
  viewDashboard.style.display = 'block';
  
  // Load user data
  loadHistory();
};

/* ==========================================================================
   Auth Actions (Tabs, Login, Register)
   ========================================================================== */
// Switch Tabs
tabLogin.addEventListener('click', () => {
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  formLogin.classList.add('active');
  formRegister.classList.remove('active');
  loginError.style.display = 'none';
});

tabRegister.addEventListener('click', () => {
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  formRegister.classList.add('active');
  formLogin.classList.remove('active');
  registerError.style.display = 'none';
});

// Login Form Submit
formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.style.display = 'none';

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const data = await API.login(email, password);
    currentUser = data.user;
    formLogin.reset();
    showDashboardView();
    showToast(`Welcome back, ${currentUser.fullname}!`);
  } catch (err) {
    loginError.textContent = err.message;
    loginError.style.display = 'block';
  }
});

// Register Form Submit
formRegister.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerError.style.display = 'none';

  const fullname = document.getElementById('reg-fullname').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;

  try {
    const data = await API.register(fullname, email, password);
    currentUser = data.user;
    formRegister.reset();
    showDashboardView();
    showToast('Account registered successfully!');
  } catch (err) {
    registerError.textContent = err.message;
    registerError.style.display = 'block';
  }
});

// Sign Out
logoutBtn.addEventListener('click', async () => {
  stopPolling();
  await API.logout();
  showToast('Logged out successfully.');
  showGuestView();
});

/* ==========================================================================
   Drag & Drop Resume Upload Zone
   ========================================================================== */
const handleSelectedFile = (file) => {
  if (!file) return;

  // Validate type
  const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  const allowed = ['.pdf', '.docx'];
  if (!allowed.includes(extension)) {
    uploadError.textContent = 'Only PDF and DOCX files are allowed.';
    uploadError.style.display = 'block';
    selectedFile = null;
    return;
  }

  // Validate size (5MB limit)
  if (file.size > 5 * 1024 * 1024) {
    uploadError.textContent = 'File size is too large. Max limit is 5 MB.';
    uploadError.style.display = 'block';
    selectedFile = null;
    return;
  }

  // Set file
  selectedFile = file;
  uploadError.style.display = 'none';
  
  // Update view
  fileNameSpan.textContent = file.name;
  dropZoneContent.style.display = 'none';
  selectedFileNameDiv.style.display = 'flex';
};

// Listeners for drag-and-drop
['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  }, false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
  }, false);
});

dropZone.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  const file = dt.files[0];
  handleSelectedFile(file);
});

// Input change listener
resumeFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  handleSelectedFile(file);
});

// Clear Selected File
const clearSelectedFileState = () => {
  selectedFile = null;
  resumeFileInput.value = '';
  selectedFileNameDiv.style.display = 'none';
  dropZoneContent.style.display = 'block';
};
clearFileBtn.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  clearSelectedFileState();
});

// Form upload click
formUpload.addEventListener('submit', async (e) => {
  e.preventDefault();
  uploadError.style.display = 'none';

  if (!selectedFile) {
    uploadError.textContent = 'Please select a resume file first.';
    uploadError.style.display = 'block';
    return;
  }

  // Disable UI during progress
  analyzeSubmitBtn.disabled = true;
  progressContainer.style.display = 'block';
  progressFill.style.width = '0%';
  progressPercentage.textContent = '0%';

  const formData = new FormData();
  formData.append('resume', selectedFile);
  formData.append('jobDescription', jobDescription.value.trim());

  try {
    const response = await API.uploadResume(formData, (percent) => {
      progressFill.style.width = `${percent}%`;
      progressPercentage.textContent = `${percent}%`;
    });

    showToast(response.message || 'Resume uploaded successfully.');
    clearSelectedFileState();
    jobDescription.value = '';
    
    // Refresh history
    await loadHistory();
    
    // If completed immediately (local mode), open report.
    // If pending (Azure mode), show toast alert that trigger started.
    if (response.resume && response.resume.status === 'Completed') {
      openReportModal(response.resume);
    } else {
      showToast('Resume is being analyzed asynchronously. Please wait.', 4000);
    }

  } catch (err) {
    uploadError.textContent = err.message;
    uploadError.style.display = 'block';
  } finally {
    analyzeSubmitBtn.disabled = false;
    progressContainer.style.display = 'none';
  }
});

/* ==========================================================================
   History & Scan List Management
   ========================================================================== */
const loadHistory = async () => {
  historyLoading.style.display = 'flex';
  historyTable.style.display = 'none';
  historyEmpty.style.display = 'none';

  try {
    const data = await API.getResumesHistory();
    resumesList = data.resumes;

    if (resumesList.length === 0) {
      historyEmpty.style.display = 'flex';
      historyLoading.style.display = 'none';
      updateStats(0, 0, 0);
      stopPolling();
      return;
    }

    // Update stats block
    calculateAndRenderStats(resumesList);

    // Populate rows
    historyTableBody.innerHTML = '';
    resumesList.forEach(resume => {
      const row = createHistoryRow(resume);
      historyTableBody.appendChild(row);
    });

    historyLoading.style.display = 'none';
    historyTable.style.display = 'table';

    // Start/Stop polling based on whether there are pending items
    const hasPending = resumesList.some(r => r.status === 'Pending');
    if (hasPending) {
      startPolling();
    } else {
      stopPolling();
    }

  } catch (error) {
    console.error('History load error:', error);
    historyLoading.style.display = 'none';
    historyEmpty.style.textContent = 'Failed to load history list.';
    historyEmpty.style.display = 'flex';
    stopPolling();
  }
};

// Polling for updates on Pending items (Asynchronous Azure Architecture)
const startPolling = () => {
  if (pollingInterval) return; // Already polling

  console.log('Starting polling for pending items...');
  pollingInterval = setInterval(async () => {
    try {
      const data = await API.getResumesHistory();
      resumesList = data.resumes;

      // Update statistics
      calculateAndRenderStats(resumesList);

      // Re-populate rows
      historyTableBody.innerHTML = '';
      resumesList.forEach(resume => {
        const row = createHistoryRow(resume);
        historyTableBody.appendChild(row);
      });

      // Stop polling when no items are pending anymore
      const stillHasPending = resumesList.some(r => r.status === 'Pending');
      if (!stillHasPending) {
        console.log('All pending items completed. Stopping polling.');
        stopPolling();
        showToast('All resume analysis scans completed!');
      }
    } catch (err) {
      console.warn('History polling failed:', err.message);
    }
  }, 4000);
};

const stopPolling = () => {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
    console.log('Polling stopped.');
  }
};

const calculateAndRenderStats = (resumes) => {
  const completedResumes = resumes.filter(r => r.status === 'Completed');
  const total = resumes.length;
  
  const sum = completedResumes.reduce((acc, curr) => acc + curr.atsScore, 0);
  const avg = completedResumes.length > 0 ? Math.round(sum / completedResumes.length) : 0;
  const best = completedResumes.length > 0 ? Math.max(...completedResumes.map(r => r.atsScore)) : 0;

  updateStats(total, avg, best);
};

const updateStats = (total, avg, best) => {
  statTotal.textContent = total;
  statAvg.textContent = `${avg}%`;
  statBest.textContent = `${best}%`;
};

const createHistoryRow = (resume) => {
  const tr = document.createElement('tr');
  tr.id = `resume-row-${resume._id}`;

  const formattedDate = new Date(resume.uploadedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  // Render score badge based on status
  let scoreBadgeHTML = '';
  let isActionEnabled = true;

  if (resume.status === 'Pending') {
    scoreBadgeHTML = `<span class="ats-badge processing"><div class="spinner spinner-sm" style="width:10px; height:10px; border-width:1.5px; border-top-color:var(--primary); margin-right:5px; display:inline-block;"></div>Analyzing...</span>`;
    isActionEnabled = false;
  } else if (resume.status === 'Failed') {
    scoreBadgeHTML = `<span class="ats-badge critical">Failed</span>`;
    isActionEnabled = true; // Let user click view report to see error alert
  } else {
    // Completed status
    let scoreClass = 'critical';
    if (resume.atsScore >= 80) {
      scoreClass = 'excellent';
    } else if (resume.atsScore >= 60) {
      scoreClass = 'passing';
    }
    scoreBadgeHTML = `<span class="ats-badge ${scoreClass}">${resume.atsScore}%</span>`;
  }

  tr.innerHTML = `
    <td class="file-name-text" style="max-width: 250px;">
      <span class="file-icon">📄</span> ${escapeHTML(resume.fileName)}
    </td>
    <td>
      ${scoreBadgeHTML}
    </td>
    <td>${formattedDate}</td>
    <td>
      <div class="action-cell">
        <button class="btn btn-secondary btn-sm view-report-btn" ${!isActionEnabled ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>View Report</button>
        <button class="btn btn-danger btn-sm delete-resume-btn">&times;</button>
      </div>
    </td>
  `;

  // Bind View Report Click
  if (isActionEnabled) {
    tr.querySelector('.view-report-btn').addEventListener('click', () => {
      if (resume.status === 'Failed') {
        alert(`Analysis failed for this file:\n${resume.error || 'Unknown serverless execution issue.'}`);
        return;
      }
      openReportModal(resume);
    });
  }

  // Bind Delete Click
  tr.querySelector('.delete-resume-btn').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete ${resume.fileName}?`)) {
      try {
        await API.deleteResume(resume._id);
        showToast('Resume deleted successfully.');
        loadHistory();
      } catch (err) {
        showToast(`Deletion failed: ${err.message}`);
      }
    }
  });

  return tr;
};

// Prevent XSS
const escapeHTML = (str) => {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
};

/* ==========================================================================
   Report Details Modal Rendering
   ========================================================================== */
const openReportModal = (resume) => {
  modalResumeTitle.textContent = resume.fileName;
  
  const formattedDate = new Date(resume.uploadedAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  modalScanDate.textContent = `Analyzed on: ${formattedDate}`;

  // 1. Fill Radial Gauge Score
  const score = resume.atsScore;
  modalGaugeText.textContent = score;
  
  // The circle path length is 100 in stroke-dasharray context
  modalGaugeFill.setAttribute('stroke-dasharray', `${score}, 100`);

  // Color stroke based on rating
  if (score >= 80) {
    modalGaugeFill.style.stroke = 'var(--success-text)';
  } else if (score >= 60) {
    modalGaugeFill.style.stroke = 'var(--warning-text)';
  } else {
    modalGaugeFill.style.stroke = 'var(--error-text)';
  }

  // 2. Structural checks
  const results = resume.analysisResults;
  
  toggleAuditItem(auditContact, results.hasContact);
  toggleAuditItem(auditExperience, results.hasExperience);
  toggleAuditItem(auditEducation, results.hasEducation);
  toggleAuditItem(auditSkills, results.hasSkills);

  // Word count
  modalWordCount.textContent = results.wordCount || 0;

  // 3. Keywords tags
  matchedCountSpan.textContent = results.matchedKeywords.length;
  missingCountSpan.textContent = results.missingKeywords.length;

  renderKeywords(matchedKeywordsContainer, results.matchedKeywords, 'No matching keywords detected.');
  renderKeywords(missingKeywordsContainer, results.missingKeywords, 'All targeted keywords matched!');

  // 4. Download btn link
  modalDownloadBtn.href = resume.fileUrl;

  // Open modal screen
  reportModal.style.display = 'flex';
};

const toggleAuditItem = (el, isPassed) => {
  if (isPassed) {
    el.classList.add('passed');
    el.classList.remove('failed');
  } else {
    el.classList.add('failed');
    el.classList.remove('passed');
  }
};

const renderKeywords = (container, list, emptyMsgText) => {
  container.innerHTML = '';
  if (!list || list.length === 0) {
    const span = document.createElement('span');
    span.className = 'keyword-tags empty-msg';
    span.textContent = emptyMsgText;
    container.appendChild(span);
    return;
  }

  list.forEach(keyword => {
    const pill = document.createElement('span');
    pill.className = 'keyword-tag';
    pill.textContent = keyword;
    container.appendChild(pill);
  });
};

// Modal Close bindings
const closeModal = () => {
  reportModal.style.display = 'none';
};
closeModalBtn.addEventListener('click', closeModal);
closeModalFooterBtn.addEventListener('click', closeModal);

// Close on background overlay click
reportModal.addEventListener('click', (e) => {
  if (e.target === reportModal) {
    closeModal();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && reportModal.style.display === 'flex') {
    closeModal();
  }
});
