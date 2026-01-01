export const parseCSVRecords = (csv: string): string[][] => {
  const input = csv.replace(/^\uFEFF/, "");
  if (input.length === 0) return [];

  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let rowHasData = false;

  const pushRow = () => {
    row.push(field);
    if (rowHasData) {
      records.push(row);
    }
    row = [];
    field = "";
    rowHasData = false;
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];

    if (ch === '"') {
      rowHasData = true;
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === ",") {
      rowHasData = true;
      row.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && next === "\n") i++;
      pushRow();
      continue;
    }

    rowHasData = true;
    field += ch;
  }

  if (rowHasData) {
    pushRow();
  }

  return records;
};
