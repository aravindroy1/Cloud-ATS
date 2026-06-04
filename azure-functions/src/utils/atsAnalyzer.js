/**
 * Analyzes resume text for ATS compatibility.
 * Checks for core sections, contact information, and matches keywords.
 */

// Common stop words to ignore when extracting keywords from a job description
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'arent',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'cant', 'cannot', 'could', 'couldnt', 'did', 'didnt', 'do', 'does', 'doesnt', 'doing', 'dont', 'down',
  'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadnt', 'has', 'hasnt', 'have', 'havent',
  'having', 'he', 'hed', 'hell', 'hes', 'her', 'here', 'heres', 'hers', 'herself', 'him', 'himself',
  'his', 'how', 'hows', 'i', 'id', 'ill', 'im', 'ive', 'if', 'in', 'into', 'is', 'isnt', 'it', 'its',
  'itself', 'lets', 'me', 'more', 'most', 'mustnt', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off',
  'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', 'shant', 'she', 'shed', 'shell', 'shes', 'should', 'shouldnt', 'so', 'some', 'such', 'than',
  'that', 'thats', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'theres', 'these',
  'they', 'theyd', 'theyll', 'theyre', 'theyve', 'this', 'those', 'through', 'to', 'too', 'under',
  'until', 'up', 'very', 'was', 'wasnt', 'we', 'wed', 'well', 'were', 'weve', 'werent', 'what', 'whats',
  'when', 'whens', 'where', 'wheres', 'which', 'while', 'who', 'whos', 'whom', 'why', 'whys', 'with',
  'wont', 'would', 'wouldnt', 'you', 'youd', 'youll', 'youre', 'youve', 'your', 'yours', 'yourself',
  'yourselves', 'the', 'will', 'must', 'we', 'our', 'us', 'skills', 'experience', 'education', 'job',
  'requirements', 'preferred', 'qualifications', 'duties', 'responsibilities', 'role', 'team', 'work'
]);

// Default keywords used if no job description is provided
const DEFAULT_KEYWORDS = [
  'javascript', 'python', 'java', 'react', 'node', 'sql', 'nosql', 'git', 'docker', 'kubernetes',
  'aws', 'azure', 'agile', 'scrum', 'project management', 'software engineering', 'development',
  'design', 'testing', 'communication', 'leadership', 'collaboration', 'problem solving',
  'analytics', 'html', 'css', 'api', 'rest', 'devops', 'typescript', 'ci/cd'
];

/**
 * Extracts key terms from a string (job description).
 * @param {string} text 
 * @returns {string[]} List of unique keywords
 */
const extractKeywordsFromJobDescription = (text) => {
  if (!text) return DEFAULT_KEYWORDS;

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9+#.\s]/g, ' ') // keep letters, numbers, +, #, . (like C++, C#, .NET)
    .split(/\s+/);

  const candidates = new Set();
  
  words.forEach(word => {
    if (word.length >= 3 && !STOP_WORDS.has(word) && isNaN(word)) {
      candidates.add(word);
    }
  });

  const list = Array.from(candidates);
  return list.length > 0 ? list.slice(0, 15) : DEFAULT_KEYWORDS;
};

/**
 * Perform parsing and analysis on the resume text.
 * @param {string} text The resume text content
 * @param {string} [jobDescription] Optional job description text to match against
 */
const analyzeResume = (text, jobDescription = '') => {
  const normalizedText = text.toLowerCase();
  
  const words = normalizedText.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  let score = 0;
  
  // 1. Contact Information Check (15 points max)
  let hasContact = false;
  let contactScore = 0;

  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const hasEmail = emailRegex.test(text);
  if (hasEmail) contactScore += 5;

  const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
  const hasPhone = phoneRegex.test(text);
  if (hasPhone) contactScore += 5;

  const portfolioRegex = /(linkedin\.com|github\.com|portfolio|website|http[s]?:\/\/)/g;
  const hasPortfolio = portfolioRegex.test(normalizedText);
  if (hasPortfolio) contactScore += 5;

  if (contactScore > 0) {
    hasContact = true;
  }
  score += contactScore;

  // 2. Education Section Check (20 points)
  const educationKeywords = ['education', 'degree', 'university', 'bachelor', 'master', 'college', 'phd', 'academic', 'major', 'gpa', 'diploma'];
  const hasEducation = educationKeywords.some(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    return regex.test(normalizedText);
  });
  if (hasEducation) score += 20;

  // 3. Experience Section Check (25 points)
  const experienceKeywords = ['experience', 'employment', 'history', 'work', 'job', 'professional', 'career', 'internship', 'responsibilities', 'achievements'];
  const hasExperience = experienceKeywords.some(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    return regex.test(normalizedText);
  });
  if (hasExperience) score += 25;

  // 4. Skills Section Check (20 points)
  const skillsKeywords = ['skills', 'technologies', 'languages', 'tools', 'competencies', 'expertise', 'specialties', 'stack', 'proficiencies'];
  const hasSkills = skillsKeywords.some(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    return regex.test(normalizedText);
  });
  if (hasSkills) score += 20;

  // 5. Keyword Matching (20 points max)
  const targetKeywords = extractKeywordsFromJobDescription(jobDescription);
  const matchedKeywords = [];
  const missingKeywords = [];

  targetKeywords.forEach(keyword => {
    const escaped = keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    
    if (regex.test(normalizedText)) {
      matchedKeywords.push(keyword);
    } else {
      missingKeywords.push(keyword);
    }
  });

  let keywordScore = 0;
  if (targetKeywords.length > 0) {
    const matchRatio = matchedKeywords.length / targetKeywords.length;
    keywordScore = Math.round(matchRatio * 20);
  }
  score += keywordScore;

  const finalScore = Math.max(0, Math.min(100, score));

  return {
    atsScore: finalScore,
    analysisResults: {
      hasSkills,
      hasEducation,
      hasExperience,
      hasContact,
      matchedKeywords,
      missingKeywords,
      wordCount
    }
  };
};

module.exports = {
  analyzeResume
};
