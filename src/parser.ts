export const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let currentField = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (insideQuotes && line[i + 1] === '"') {
        currentField += '"';
        i++; // Skip the next quote
      } else {
        // Toggle the start or end of a quoted field
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      // Treat comma as a field separator
      result.push(currentField);
      currentField = "";
    } else {
      // Add the character as part of the current field
      currentField += char;
    }
  }

  // Add the last field to the result
  result.push(currentField);
  return result;
};
