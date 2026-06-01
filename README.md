# Cloud-ATS: Azure-Ready Resume Analyzer

Cloud-ATS is a modern, full-stack web application that extracts text from PDF and DOCX resumes, checks structural layout sections (Skills, Education, Experience, Contact Details), runs keyword density auditing, and generates an Applicant Tracking System (ATS) score out of 100.

## 🚀 Features
- **User Authentication**: Secure signup and login using hashed passwords (`bcryptjs`) and session tokens (`jsonwebtoken`).
- **Drag & Drop Upload**: Upload resumes up to 5MB (validated backend and frontend). Supports `.pdf` and `.docx`.
- **Custom Job Description Match**: Compare resume text against any specific job description for tailored keyword matches.
- **Detailed ATS Audit Modal**: Visual progress ring, structural check badges, word count, and keyword pill breakdown.
- **Responsive Azure-Style Dashboard**: Sleek dark-mode interface with responsive layout and dynamic stats tracking.
- **In-Memory Fallback**: Runs instantly out-of-the-box in local development even if MongoDB is not installed.
- **Azure Ready**: Integrated with Azure Blob Storage (supports connection strings and passwordless **Managed Identity**) and Azure App Service (Windows/Linux configurations).

## 🛠️ Tech Stack
- **Frontend**: HTML5, CSS3, JavaScript (Single Page Application architecture)
- **Backend**: Node.js, Express
- **Database**: MongoDB (Mongoose)
- **File Parsing**: `pdf-parse`, `mammoth`
- **Cloud Storage**: `@azure/storage-blob`, `@azure/identity`

---

## 💻 Local Quickstart

### Prerequisites
- Node.js LTS (version 20+)

### Setup Instructions
1. Clone the repository and navigate to the directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and fill in custom details (optional):
   ```bash
   cp .env.example .env
   ```
4. Start the server:
   ```bash
   npm start
   ```
5. Open your browser and navigate to: **[http://localhost:8080](http://localhost:8080)**.

---

## ☁️ Azure Deployment

### 1. Azure App Service Compatibility
The project includes a [web.config](web.config) file, which is required for Windows-based Azure App Service hosts running IIS with `iisnode`. For Linux-based App Service configurations, the start command utilizes standard npm scripts.

### 2. Environmental Variables Configuration
In Azure App Service under **Settings > Configuration**, add the following App Settings:
- `PORT`: App Service will set this dynamically.
- `MONGO_URI`: MongoDB or Azure Cosmos DB for MongoDB API connection string.
- `JWT_SECRET`: A secure key to sign tokens.
- `AZURE_STORAGE_CONTAINER_NAME`: The blob container name (defaults to `resumes`).
- **Azure Blob Storage Credentials (Choose one)**:
  - *Option A (Connection String)*: `AZURE_STORAGE_CONNECTION_STRING`
  - *Option B (Managed Identity)*: Enable a system-assigned Managed Identity on the Web App, grant it the **Storage Blob Data Contributor** role on the storage account, and set `AZURE_STORAGE_ACCOUNT_NAME`.
