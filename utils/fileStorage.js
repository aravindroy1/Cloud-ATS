const { BlobServiceClient } = require('@azure/storage-blob');
const { DefaultAzureCredential } = require('@azure/identity');
const fs = require('fs');
const path = require('path');

// Determine if Azure is configured
const isAzureConfigured = () => {
  return !!(
    process.env.AZURE_STORAGE_CONNECTION_STRING ||
    process.env.AZURE_STORAGE_ACCOUNT_NAME
  );
};

// Get Azure Blob Service Client
const getBlobServiceClient = () => {
  if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
    return BlobServiceClient.fromConnectionString(
      process.env.AZURE_STORAGE_CONNECTION_STRING
    );
  }

  if (process.env.AZURE_STORAGE_ACCOUNT_NAME) {
    const credential = new DefaultAzureCredential();

    return new BlobServiceClient(
      `https://${process.env.AZURE_STORAGE_ACCOUNT_NAME}.blob.core.windows.net`,
      credential
    );
  }

  return null;
};

/**
 * Upload file to Azure Blob Storage
 * Fallback to local storage if Azure fails
 */
const uploadFile = async (
  fileBuffer,
  originalName,
  mimeType
) => {

  const containerName =
    process.env.AZURE_STORAGE_CONTAINER_NAME || 'resumes';

  const fileExt =
    path.extname(originalName);

  const uniqueName =
    `${Date.now()}-${Math.round(Math.random() * 1e9)}${fileExt}`;

  if (isAzureConfigured()) {

    try {

      console.log(
        `Azure Blob Storage configured. Uploading ${originalName} as ${uniqueName}...`
      );

      const blobServiceClient =
        getBlobServiceClient();

      const containerClient =
        blobServiceClient.getContainerClient(containerName);

      const blockBlobClient =
        containerClient.getBlockBlobClient(uniqueName);

      await blockBlobClient.upload(
        fileBuffer,
        fileBuffer.length,
        {
          blobHTTPHeaders: {
            blobContentType: mimeType
          }
        }
      );

      console.log(
        `Uploaded to Azure successfully: ${blockBlobClient.url}`
      );

      return blockBlobClient.url;

    } catch (error) {

      console.error(
        'Azure Upload Error, falling back to local storage:',
        error.message
      );

    }
  }

  // Local Storage Fallback

  console.log(
    `Using Local Storage for file: ${originalName}`
  );

  const uploadDir =
    path.join(__dirname, '../public/uploads');

  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, {
      recursive: true
    });
  }

  const localFilePath =
    path.join(uploadDir, uniqueName);

  fs.writeFileSync(
    localFilePath,
    fileBuffer
  );

  return `/uploads/${uniqueName}`;
};

/**
 * Delete file from Azure Blob Storage
 * or Local Storage
 */
const deleteFile = async (fileUrl) => {

  if (!fileUrl) return;

  // Local file delete

  if (fileUrl.startsWith('/uploads/')) {

    const fileName =
      fileUrl.replace('/uploads/', '');

    const filePath =
      path.join(
        __dirname,
        '../public/uploads',
        fileName
      );

    try {

      if (fs.existsSync(filePath)) {

        fs.unlinkSync(filePath);

        console.log(
          `Deleted local file: ${filePath}`
        );

      }

    } catch (error) {

      console.error(
        `Error deleting local file ${filePath}:`,
        error.message
      );

    }

    return;
  }

  // Azure blob delete

  if (isAzureConfigured()) {

    const containerName =
      process.env.AZURE_STORAGE_CONTAINER_NAME || 'resumes';

    try {

      const blobServiceClient =
        getBlobServiceClient();

      const containerClient =
        blobServiceClient.getContainerClient(containerName);

      const urlParts =
        fileUrl.split('/');

      const blobName =
        urlParts[urlParts.length - 1];

      const blockBlobClient =
        containerClient.getBlockBlobClient(blobName);

      await blockBlobClient.deleteIfExists();

      console.log(
        `Deleted Azure blob: ${blobName}`
      );

    } catch (error) {

      console.error(
        `Error deleting Azure blob from ${fileUrl}:`,
        error.message
      );

    }
  }
};

module.exports = {
  uploadFile,
  deleteFile
};
