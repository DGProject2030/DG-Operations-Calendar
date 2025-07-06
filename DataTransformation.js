/**
 * @file DataTransformation.gs
 * @description Handles the business logic of joining, filtering, and transforming data for the calendar.
 */

/**
 * Translates an English color name to its corresponding hex code.
 * @param {string} colorName - The name of the color (e.g., "red", "blue").
 * @param {string} defaultHex - The hex code to return if the name is not found.
 * @returns {string} The hex code for the color.
 */
function mapColorNameToHex(colorName, defaultHex) {
  if (!colorName || typeof colorName !== 'string') {
    return defaultHex;
  }
  
  const name = colorName.trim().toLowerCase();
  
  switch (name) {
    case 'red': return '#FF0000';
    case 'blue': return '#0000FF';
    case 'green': return '#008000';
    case 'black': return '#000000';
    case 'white': return '#FFFFFF';
    case 'orange': return '#FFA500';
    case 'purple': return '#800080';
    case 'yellow': return '#FFFF00';
    case 'grey':
    case 'gray': return '#808080';
    default: return defaultHex;
  }
}


/**
 * Enriches raw task objects with related data from supporting tables and filters them.
 * @param {Array<Object>} tasks - The raw array of task objects from the 'Task' sheet.
 * @param {Object} supportingData - The object containing maps of all supporting data.
 * @returns {Array<Object>} An array of enriched and filtered event objects.
 */
function enrichEventsWithSupportingData(tasks, supportingData) {
  if (!tasks || !supportingData) return [];

  const enriched = tasks.map(task => {
    const enrichedEvent = { ...task };

    // --- JOIN LOGIC ---
    const projectData = (task.Project && supportingData.projects[task.Project.toString().trim()]) ? supportingData.projects[task.Project.toString().trim()] : {};
    const projectStatusData = (projectData.ProjectStatus && supportingData.projectStatuses[projectData.ProjectStatus.toString().trim()]) ? supportingData.projectStatuses[projectData.ProjectStatus.toString().trim()] : {};
    const taskTypeData = (task.TaskType && supportingData.taskTypes[task.TaskType.toString().trim()]) ? supportingData.taskTypes[task.TaskType.toString().trim()] : {};
    const taskStatusData = (task.TaskStatus && supportingData.taskStatuses[task.TaskStatus.toString().trim()]) ? supportingData.taskStatuses[task.TaskStatus.toString().trim()] : {};
    const locationData = (projectData.Location && supportingData.locations[projectData.Location.toString().trim()]) ? supportingData.locations[projectData.Location.toString().trim()] : {};
    const taskManagerData = (task.TaskManager && supportingData.employees[task.TaskManager.toString().trim()]) ? supportingData.employees[task.TaskManager.toString().trim()] : {};
    const projectManagerData = (projectData.ProjectManager && supportingData.employees[projectData.ProjectManager.toString().trim()]) ? supportingData.employees[projectData.ProjectManager.toString().trim()] : {};

    // --- ADDING ENRICHED PROPERTIES ---
    enrichedEvent.projectName = projectData.name || '';
    enrichedEvent.projectStatus = projectStatusData.Status || '';
    enrichedEvent.projectFolder = projectData.folder || '';
    // FIX: Trim the task type name to prevent issues with whitespace
    enrichedEvent.taskTypeName = (taskTypeData.hebrew || task.Task || '').trim(); 
    enrichedEvent.taskStatusHebrew = (taskStatusData.hebrew || taskStatusData.TaskStatus || '').trim();
    enrichedEvent.locationName = locationData.name || '';
    enrichedEvent.taskManagerName = `${taskManagerData.fName || ''} ${taskManagerData.sName || ''}`.trim();
    enrichedEvent.projectManagerName = `${projectManagerData.fName || ''} ${projectManagerData.sName || ''}`.trim();

    // --- ADDING COLOR PROPERTIES ---
    enrichedEvent.backgroundColor = mapColorNameToHex(taskStatusData.color, '#3498db'); // Default blue
    enrichedEvent.textColor = mapColorNameToHex(taskTypeData.color, '#FFFFFF'); // Default white

    return enrichedEvent;
  });

  // --- FILTERING LOGIC ---
  const filtered = enriched.filter(event => {
    const projectStatus = event.projectStatus.trim().toLowerCase();
    const taskStatus = event.taskStatusHebrew.trim().toLowerCase();
    const inactiveProjectStatuses = ['מבוטל', 'אופציונלי', 'טנטטיבי', 'נדחה', 'canceled', 'cancelled', 'tentative'];
    const inactiveTaskStatuses = ['מבוטל', 'נדחה', 'canceled', 'cancelled'];
    if (inactiveProjectStatuses.includes(projectStatus)) return false;
    if (inactiveTaskStatuses.includes(taskStatus)) return false;
    return true;
  });

  return filtered;
}

/**
 * Transforms the enriched event objects into the final format required by the FullCalendar library.
 * @param {Array<Object>} enrichedEvents - The array of enriched and filtered event objects.
 * @returns {Array<Object>} An array of objects formatted for FullCalendar.
 */
function transformEventsForCalendar(enrichedEvents) {
  if (!enrichedEvents) return [];

  return enrichedEvents.map(event => {
    const start = formatDateTimeForCalendar(event.dateIn, event.timeIn);
    const end = formatDateTimeForCalendar(event.dateOut, event.timeOut);
    if (!start) return null;

    const isCalendarEvent = event.taskTypeName === 'ארוע לוח שנה';

    return {
      id: event.ID,
      title: buildEventTitle(event),
      start: start,
      end: end,
      allDay: isCalendarEvent || !event.timeIn,
      backgroundColor: event.backgroundColor,
      textColor: event.textColor,
      borderColor: event.backgroundColor,
      classNames: isCalendarEvent ? ['calendar-event'] : [],
      extendedProps: {
        description: event.TaskNotes || '',
        status: event.taskStatusHebrew || 'לא הוגדר',
        project: event.projectName || 'ללא פרויקט',
        user: event.projectManagerName || 'לא שויך',
        folderLink: event.projectFolder || '',
        taskTypeName: event.taskTypeName || '' 
      }
    };
  }).filter(event => event !== null);
}

/**
 * Builds the detailed, human-readable title for the calendar event.
 * @param {Object} event - The enriched event object.
 * @returns {string} The formatted event title.
 */
function buildEventTitle(event) {
    if (event.taskTypeName === 'ארוע לוח שנה') {
      return event.projectName || '';
    }

    let titleParts = [];
    if (event.taskTypeName) titleParts.push(event.taskTypeName);
    if (event.projectName) titleParts.push(event.projectName);
    if (event.locationName) titleParts.push(event.locationName);
    if (event.taskManagerName) titleParts.push(event.taskManagerName);
    return titleParts.join(' - ');
}


/**
 * Formats date and time from the sheet into a valid ISO 8601 string that FullCalendar can parse.
 * @param {Date|string|number} datePart - The date value from the sheet.
 * @param {Date|string|number} timePart - The time value from the sheet.
 * @returns {string|null} A valid ISO 8601 string or null if date is invalid.
 */
function formatDateTimeForCalendar(datePart, timePart) {
  if (!datePart) return null;
  const date = new Date(datePart);
  if (isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  if (timePart) {
    const time = new Date(timePart);
    if (!isNaN(time.getTime())) {
      const hours = time.getHours();
      const minutes = time.getMinutes();
      return new Date(year, month, day, hours, minutes).toISOString();
    }
  }
  
  return new Date(year, month, day).toISOString().split('T')[0];
}
