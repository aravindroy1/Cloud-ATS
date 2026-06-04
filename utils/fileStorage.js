const { BlobServiceClient } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');
const fs = require('fs');
const path = require('path');

// Determine if Azure is configured
const isAzureConfigured = () => {
  return !!(process.env.AZURE_STORAGE_CONNECTION_STRING || process.env.AZURE_STORAGE_ACCOUNT_NAME);
};

// Get Azure Blob Service Client
const getBlobServiceClient = () => {
  if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
    return BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
  } else if (process.env.AZURE_STORAGE_ACCOUNT_NAME) {
    const credential = new DefaultAzureCredential();
    return new BlobServiceClient(
      `https://${process.env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
      credential
    );
  }
  return null;
};

/**
 * Uploads a file buffer to Azure Blob Storage or local fallback directory.
 * @param {Buffer} fileBuffer The file content buffer
 * @param {string} originalName Original name of the file
 * @param {string} mimeType File mime type
 * @param {Object} [metadata] Optional metadata key-value strings to attach (Azure only)
 * @returns {Promise<{blobName: string, url: string}>} The blob name and URL of the uploaded file
 */
const uploadFile = async (fileBuffer, originalName, mimeType, metadata = {}) => {
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'resumes';
  const fileExt = path.extname(originalName);
  const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExt}`;

  if (isAzureConfigured()) {
    try {
      console.log(`Azure Blob Storage configured. Uploading ${originalName} as ${uniqueName} with metadata...`);
      const blobServiceClient = getBlobServiceClient();
      const containerClient = blobServiceClient.getContainerClient(containerName);
      
      // Ensure the container exists
      await containerClient.createIfNotExists({
        access: 'blob'
      });

      const blockBlobClient = containerClient.getBlockBlobClient(uniqueName);
      
      // Upload with headers and metadata
      await blockBlobClient.upload(fileBuffer, fileBuffer.length, {
        blobHTTPHeaders: { blobContentType: mimeType },
        metadata: metadata
      });

      console.log(`Uploaded to Azure successfully: ${blockBlobClient.url}`);
      return {
        blobName: uniqueName,
        url: blockBlobClient.url
      };
    } catch (error) {
      console.error('Azure Upload Error, falling back to local storage:', error.message);
      // Fall through to local storage if Azure fails
    }
  }

  // Local Storage Fallback
  console.log(`Using Local Storage for file: ${originalName}`);
  const uploadDir = path.join(__dirname, '../public/uploads');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const localFilePath = path.join(uploadDir, uniqueName);
  fs.writeFileSync(localFilePath, fileBuffer);

  // Return a relative URL that the express app serves statically
  return {
    blobName: uniqueName,
    url: `/uploads/${uniqueName}`
  };
};

/**
 * Deletes a file from Azure Blob Storage or local storage.
 * @param {string} fileUrl The URL stored in the database
 * @param {string} [blobName] The unique name of the blob file
 */
const deleteFile = async (fileUrl, blobName = null) => {
  if (!fileUrl) return;

  // Local file delete
  if (fileUrl.startsWith('/uploads/') || (!isAzureConfigured() && blobName)) {
    const fileName = blobName || fileUrl.replace('/uploads/', '');
    const filePath = path.join(__dirname, '../public/uploads', fileName);
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`Deleted local file: ${filePath}`);
      }
    } catch (error) {
      console.error(`Error deleting local file ${filePath}:`, error.message);
    }
    
    if (!isAzureConfigured()) return; // Stop here if Azure isn't configured
  }

  // Azure blob delete
  if (isAzureConfigured()) {
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'resumes';
    try {
      const blobServiceClient = getBlobServiceClient();
      const containerClient = blobServiceClient.getContainerClient(containerName);
      
      // Use blobName directly if available, otherwise parse from URL
      const targetBlobName = blobName || fileUrl.split('/').pop();

      const blockBlobClient = containerClient.getBlockBlobClient(targetBlobName);
      await blockBlobClient.deleteIfExists();
      console.log(`Deleted Azure blob: ${targetBlobName}`);
    } catch (error) {
      console.error(`Error deleting Azure blob from ${fileUrl} (blobName: ${blobName}):`, error.message);
    }
  }
};

module.exports = {
  uploadFile,
  deleteFile,
  isAzureConfigured,
  getBlobServiceClient
};
