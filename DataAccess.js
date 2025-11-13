/**
 * @file DataAccess.gs
 * @description Handles all direct data access from Google Sheets and caching logic.
 */

/**
 * Gets the spreadsheet ID from Script Properties.
 * To set this value, run: PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', 'your-spreadsheet-id')
 * @returns {string} The spreadsheet ID
 * @throws {Error} If SPREADSHEET_ID is not configured in Script Properties
 */
function getSpreadsheetId() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) {
    throw new Error('SPREADSHEET_ID not configured in Script Properties. Please set it using PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", "your-spreadsheet-id")');
  }
  return spreadsheetId;
}

/**
 * Validates that a sheet name is safe and in the allowed list.
 * This prevents potential security issues from accessing unintended sheets.
 * @param {string} sheetName - The name of the sheet to validate
 * @returns {boolean} True if the sheet name is valid
 * @throws {Error} If the sheet name is invalid or not in the allowed list
 */
function validateSheetName(sheetName) {
  const ALLOWED_SHEETS = [
    'Task',
    'Project',
    'Employee',
    'TaskStatus',
    'TaskType',
    'Location',
    'ProjectStatus'
  ];

  if (!sheetName || typeof sheetName !== 'string') {
    throw new Error('Invalid sheet name: must be a non-empty string');
  }

  const trimmedName = sheetName.trim();

  if (trimmedName.length === 0 || trimmedName.length > 100) {
    throw new Error('Invalid sheet name: length must be between 1 and 100 characters');
  }

  // Check if sheet name contains only alphanumeric characters, spaces, underscores, and hyphens
  if (!/^[a-zA-Z0-9\s_-]+$/.test(trimmedName)) {
    throw new Error('Invalid sheet name: contains illegal characters');
  }

  if (!ALLOWED_SHEETS.includes(trimmedName)) {
    throw new Error(`Sheet "${trimmedName}" is not in the allowed sheets list`);
  }

  return true;
}

/**
 * Validates and sanitizes a value to ensure it's safe for use.
 * @param {*} value - The value to validate
 * @param {string} fieldName - The name of the field being validated
 * @returns {*} The sanitized value
 */
function validateAndSanitizeValue(value, fieldName) {
  // Handle null, undefined, or empty values
  if (value === null || value === undefined || value === '') {
    return '';
  }

  // Convert to string for validation
  const strValue = String(value);

  // Check for excessively long values (potential DoS)
  if (strValue.length > 10000) {
    console.warn(`Value for field "${fieldName}" exceeds maximum length, truncating`);
    return strValue.substring(0, 10000);
  }

  return value;
}

// --- Caching Configuration ---
const CACHE_EXPIRATION_SECONDS = 3600; // Cache data for 1 hour (3600 seconds)
const CACHE_SERVICE = CacheService.getScriptCache();

/**
 * A generic function to read a sheet and convert its data into an array of objects.
 * Assumes the first row of the sheet is the header row.
 * פונקציה גנרית לקריאת גיליון והמרתו למערך של אובייקטים.
 * @param {string} sheetName - The name of the sheet (tab) to read.
 * @param {string} spreadsheetId - The ID of the Google Sheets file.
 * @returns {Array<Object>} An array of objects, where each object represents a row.
 */
function sheetToObjects(sheetName, spreadsheetId) {
  try {
    // Validate sheet name before accessing
    validateSheetName(sheetName);

    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      console.error(`Sheet "${sheetName}" not found in spreadsheet.`);
      return [];
    }
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();

    if (values.length < 2) {
      return []; // Not enough data to process (needs header + at least one data row)
    }

    const headers = values.shift().map(header => header.trim()); // Get header row and trim whitespace

    const data = values.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        if (header) { // Only add property if header is not empty
          obj[header] = validateAndSanitizeValue(row[index], header);
        }
      });
      return obj;
    });

    // Filter rows based on the 'ID' column to ensure data integrity.
    return data.filter(obj => obj.ID && obj.ID.toString().length > 0);

  } catch (e) {
    // Log detailed error server-side for debugging
    console.error(`Failed to read sheet: ${sheetName}. Error: ${e.toString()}`);
    // Don't expose sensitive error details - throw a generic error
    throw new Error('Unable to access data. Please check configuration and try again.');
  }
}

/**
 * A generic utility function to convert an array of objects into a map for fast lookups.
 * פונקציית עזר להמרת מערך למפת חיפוש מהירה (אובייקט).
 * @param {Array<Object>} array - The array to convert.
 * @param {string} keyField - The name of the property to use as the key for the map.
 * @returns {Object} A map-like object for O(1) lookups.
 */
function arrayToMap(array, keyField) {
  const map = {};
  array.forEach(item => {
    if (item && item[keyField]) {
      map[item[keyField]] = item;
    }
  });
  return map;
}


/**
 * A robust function that fetches a single sheet, converts it to a map,
 * and can optionally cache the result.
 * פונקציה יעילה הקוראת גיליון, ממירה אותו למפה, ומנהלת שמירה במטמון.
 * @param {string} sheetName - The name of the sheet to fetch (e.g., 'Project', 'Employee').
 * @param {string} keyField - The column name to use as the key for the map (e.g., 'ID').
 * @param {boolean} [useCache=true] - Optional. Set to false to bypass caching for this sheet.
 * @returns {Object} A map of the sheet's data, retrieved from cache or freshly fetched.
 */
function getSheetAsMapWithCache(sheetName, keyField, useCache = true) {
  // If caching is enabled for this sheet, try to retrieve from cache first.
  if (useCache) {
    const cacheKey = `map_${sheetName}_v1`; // A unique key for each sheet
    const cached = CACHE_SERVICE.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  }

  // If not using cache, or if item is not in cache, fetch fresh data.
  const sheetData = sheetToObjects(sheetName, getSpreadsheetId());
  const dataMap = arrayToMap(sheetData, keyField);

  // If caching is enabled, try to store the new data.
  if (useCache) {
    try {
      const cacheKey = `map_${sheetName}_v1`;
      CACHE_SERVICE.put(cacheKey, JSON.stringify(dataMap), CACHE_EXPIRATION_SECONDS);
    } catch (e) {
      // If caching fails (e.g., data is too large), log the error but continue.
      // This is logged server-side only and doesn't affect the operation
      console.error(`Could not cache sheet: ${sheetName}. Data might be too large.`);
    }
  }

  return dataMap;
}
