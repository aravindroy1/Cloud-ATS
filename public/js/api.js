/**
 * Client API utility to communicate with the Node/Express backend.
 * Uses Fetch API and XMLHttpRequest (for upload progress tracking).
 */

const BASE_URL = '/api';

// Helper to get headers (includes JWT token if stored in localStorage)
const getHeaders = (contentType = 'application/json') => {
  const headers = {};
  if (contentType) {
    headers['Content-Type'] = contentType;
  }
  
  const token = localStorage.getItem('token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  return headers;
};

const handleResponse = async (response) => {
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('token');
      window.dispatchEvent(new CustomEvent('auth-unauthorized'));
    }
    throw new Error(data.message || 'API request failed');
  }
  return data;
};

const API = {
  // Authentication APIs
  register: async (fullname, email, password) => {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: getHeaders('application/json'),
      body: JSON.stringify({ fullname, email, password })
    });
    const data = await handleResponse(res);
    if (data.token) {
      localStorage.setItem('token', data.token);
    }
    return data;
  },

  login: async (email, password) => {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: getHeaders('application/json'),
      body: JSON.stringify({ email, password })
    });
    const data = await handleResponse(res);
    if (data.token) {
      localStorage.setItem('token', data.token);
    }
    return data;
  },

  logout: async () => {
    try {
      await fetch(`${BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: getHeaders('application/json')
      });
    } catch (e) {
      console.warn('Logout endpoint failed, clearing token locally', e);
    }
    localStorage.removeItem('token');
  },

  getProfile: async () => {
    const res = await fetch(`${BASE_URL}/auth/me`, {
      method: 'GET',
      headers: getHeaders('application/json')
    });
    return handleResponse(res);
  },

  // Resumes APIs
  getResumesHistory: async () => {
    const res = await fetch(`${BASE_URL}/resumes/history`, {
      method: 'GET',
      headers: getHeaders('application/json')
    });
    return handleResponse(res);
  },

  deleteResume: async (id) => {
    const res = await fetch(`${BASE_URL}/resumes/${id}`, {
      method: 'DELETE',
      headers: getHeaders('application/json')
    });
    return handleResponse(res);
  },

  /**
   * Uploads a resume using XMLHttpRequest to track upload progress.
   * @param {FormData} formData Contains file and optional job description
   * @param {function} onProgress Callback for upload progress: (percent) => {}
   */
  uploadResume: (formData, onProgress) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${BASE_URL}/resumes/upload`, true);

      // Set Authorization header
      const token = localStorage.getItem('token');
      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      // Track progress
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          onProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        let responseData = {};
        try {
          responseData = JSON.parse(xhr.responseText);
        } catch (e) {
          responseData = { success: false, message: 'Invalid response format from server' };
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(responseData);
        } else {
          reject(new Error(responseData.message || 'Resume upload failed'));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Network error during file upload'));
      };

      xhr.send(formData);
    });
  }
};
