import axios from 'axios';

const gemini = axios.create({
  baseURL: 'https://generativelanguage.googleapis.com/v1beta',
  headers: {
    'X-goog-api-key': process.env.EXPO_PUBLIC_GEMINI_API_KEY,
    'Content-Type': 'application/json',
  },
});

export default gemini;
