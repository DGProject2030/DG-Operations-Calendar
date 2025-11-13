# Security Setup Guide

This document explains the security improvements implemented and how to configure them.

## Required Configuration

### 1. Set Up Script Properties

The application now uses Script Properties to store sensitive configuration values instead of hardcoding them in the source code.

**To configure the SPREADSHEET_ID:**

1. Open your Google Apps Script project
2. Go to **Project Settings** (gear icon in the left sidebar)
3. Scroll down to **Script Properties**
4. Click **Add script property**
5. Add the following property:
   - **Property**: `SPREADSHEET_ID`
   - **Value**: `1GlL6Mot0Z8tcb4MYJQW1nnsgzBKuKOgBiYMsnwMbKMg` (or your spreadsheet ID)

Alternatively, you can set it programmatically by running this code once in the Script Editor:

```javascript
function setupScriptProperties() {
  PropertiesService.getScriptProperties().setProperty(
    'SPREADSHEET_ID',
    '1GlL6Mot0Z8tcb4MYJQW1nnsgzBKuKOgBiYMsnwMbKMg'
  );
  Logger.log('Script properties configured successfully');
}
```

## Security Improvements Implemented

### 1. X-Frame-Options Protection
- **Changed from**: `XFrameOptionsMode.ALLOWALL`
- **Changed to**: `XFrameOptionsMode.DENY`
- **Benefit**: Prevents clickjacking attacks by disallowing the app to be embedded in iframes

### 2. Externalized Configuration
- **Change**: Moved `SPREADSHEET_ID` from hardcoded constant to Script Properties
- **Benefit**: Sensitive IDs are no longer visible in source code
- **Location**: DataAccess.js - `getSpreadsheetId()` function

### 3. Input Validation
- **Added**: Sheet name validation with allowed list
- **Added**: Value sanitization for all sheet data
- **Benefit**: Prevents unauthorized access to sheets and protects against malicious data
- **Location**: DataAccess.js - `validateSheetName()` and `validateAndSanitizeValue()` functions

**Allowed sheets:**
- Task
- Project
- Employee
- TaskStatus
- TaskType
- Location
- ProjectStatus

### 4. Error Message Sanitization
- **Change**: Error messages no longer expose internal details to clients
- **Benefit**: Prevents information disclosure about system internals, file paths, and stack traces
- **Implementation**: Detailed errors are logged server-side only; generic messages are shown to users

## Testing the Setup

After configuring Script Properties, test the application:

1. Deploy the web app
2. Access it with an authorized account
3. Verify calendar data loads correctly
4. Check the browser console for any errors

If you see an error about "SPREADSHEET_ID not configured", verify the Script Property was set correctly.

## Maintenance Notes

- Review Script Properties periodically
- Update the allowed sheets list in `validateSheetName()` if new sheets are added
- Monitor server logs for security-related errors
- Keep authorization domain (`AUTHORIZED_DOMAIN` in Code.js) up to date
