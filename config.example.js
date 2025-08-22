// Example config for local development (do NOT commit your real API keys)
// Copy this file to `config.js` and fill in your values. Keep `config.js` out of git.
//
// Security notes:
// - `config.js` is listed in .gitignore so it won't be committed.
// - For production in Apps Script, prefer PropertiesService (Script/Document) for secrets.

// YouTube Data API v3 key for local testing (Node unit tests). Optional in Apps Script (uses PropertiesService instead).
var API_KEY = "YOUR_YOUTUBE_API_KEY_HERE";

// Optionally, export for Node-based tests
if (typeof module !== 'undefined') {
  module.exports = { API_KEY };
}
