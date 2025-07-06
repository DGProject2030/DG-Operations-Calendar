/**
 * @file DataAccess.gs
 * @description Handles all direct data access from Google Sheets and caching logic.
 */

// A single constant for the spreadsheet ID, since all sheets are in the same file.
const SPREADSHEET_ID = '1GlL6Mot0Z8tcb4MYJQW1nnsgzBKuKOgBiYMsnwMbKMg';

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
    const ss = SpreadsheetApp.openById(spreadsheetId);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      console.error(`Sheet "${sheetName}" not found in spreadsheet with ID "${spreadsheetId}".`);
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
          obj[header] = row[index];
        }
      });
      return obj;
    });

    // Filter rows based on the 'ID' column to ensure data integrity.
    return data.filter(obj => obj.ID && obj.ID.toString().length > 0);
    
  } catch (e) {
    console.error(`Failed to read sheet: ${sheetName}. Error: ${e.toString()}`);
    return [];
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
  const sheetData = sheetToObjects(sheetName, SPREADSHEET_ID);
  const dataMap = arrayToMap(sheetData, keyField);

  // If caching is enabled, try to store the new data.
  if (useCache) {
    try {
      const cacheKey = `map_${sheetName}_v1`;
      CACHE_SERVICE.put(cacheKey, JSON.stringify(dataMap), CACHE_EXPIRATION_SECONDS);
    } catch (e) {
      // If caching fails (e.g., data is too large), log the error but continue.
      console.error(`Could not cache sheet: ${sheetName}. Data might be too large. Error: ${e.message}`);
    }
  }

  return dataMap;
}
