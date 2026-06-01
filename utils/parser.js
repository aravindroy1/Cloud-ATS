const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const path = require('path');

/**
 * Extracts plain text from a file buffer based on the file extension.
 * @param {Buffer} fileBuffer File buffer
 * @param {string} originalName Original name of the file (to determine type)
 * @returns {Promise<string>} Extracted plain text
 */
const extractText = async (fileBuffer, originalName) => {
  const ext = path.extname(originalName).toLowerCase();

  try {
    if (ext === '.pdf') {
      const data = await pdfParse(fileBuffer);
      return data.text;
    } else if (ext === '.docx') {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return result.value;
    } else if (ext === '.doc') {
      throw new Error('.doc format is not supported. Please convert to .docx or .pdf.');
    } else {
      throw new Error(`Unsupported file extension: ${ext}`);
    }
  } catch (error) {
    console.error(`Error parsing file ${originalName}:`, error.message);
    throw new Error(`Failed to extract text from resume: ${error.message}`);
  }
};

module.exports = {
  extractText
};
