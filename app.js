// Get references to DOM elements
const file1Input = document.getElementById("file1Input");
const file2Input = document.getElementById("file2Input");
const keyColumnsInput = document.getElementById("keyColumnsInput");
const labelColumnInput = document.getElementById("labelColumnInput");
const crossCheckBtn = document.getElementById("crossCheckBtn");
const messageBox = document.getElementById("messageBox");
const resultsSection = document.getElementById("resultsSection");
const resultsSummary = document.getElementById("resultsSummary");
const downloadMatchedSection = document.getElementById(
  "downloadMatchedSection"
);
const downloadMatchedBtn = document.getElementById("downloadMatchedBtn");
const downloadMissingSection = document.getElementById(
  "downloadMissingSection"
);
const downloadMissingBtn = document.getElementById("downloadMissingBtn");
const missingContentsDisplay = document.getElementById(
  "missingContentsDisplay"
);
const buttonText = document.getElementById("buttonText");
const loadingSpinner = document.getElementById("loadingSpinner");

let globalFoundInFile2 = []; // To store matched data for download
let globalMissingInFile2 = []; // To store missing data for download
let globalFileTypeForComparison = ""; // To store the type for download

/**
 * Displays a message in the message box.
 * @param {string} message The message to display.
 * @param {boolean} isError True if it's an error message, false for success/info.
 */
function showMessage(message, isError = true) {
  messageBox.textContent = message;
  messageBox.classList.remove(
    "hidden",
    "bg-green-50",
    "text-green-700",
    "border-green-400",
    "bg-red-50",
    "text-red-700",
    "border-red-400"
  );
  if (isError) {
    messageBox.classList.add("bg-red-50", "text-red-700", "border-red-400");
  } else {
    messageBox.classList.add(
      "bg-green-50",
      "text-green-700",
      "border-green-400"
    );
  }
  messageBox.classList.add("show"); // Use 'show' class for display
}

/**
 * Hides the message box.
 */
function hideMessage() {
  messageBox.classList.remove("show");
  messageBox.textContent = "";
}

/**
 * Shows the loading indicator.
 */
function showLoading() {
  buttonText.textContent = "Processing...";
  loadingSpinner.classList.remove("hidden");
  loadingSpinner.classList.add("show");
  crossCheckBtn.disabled = true;
}

/**
 * Hides the loading indicator.
 */
function hideLoading() {
  buttonText.textContent = "Cross-Check Files";
  loadingSpinner.classList.remove("show");
  loadingSpinner.classList.add("hidden");
  crossCheckBtn.disabled = false;
}

/**
 * Formats a JavaScript Date object into a YYYY-MM-DD string.
 * @param {Date} date The Date object to format.
 * @returns {string} The formatted date string.
 */
function formatDate(date) {
  if (!(date instanceof Date) || isNaN(date)) {
    return ""; // Return empty string for invalid dates
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0"); // Months are 0-indexed
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Reads the content of a file.
 * @param {File} file The file object.
 * @returns {Promise<Array<Object>|Array<string>>} A promise that resolves with the parsed data.
 */
async function readFileContent(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const data = e.target.result;
      const fileName = file.name;

      if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        try {
          // Parse Excel file with cellDates: true to get Date objects for dates
          const workbook = XLSX.read(data, {
            type: "array",
            cellDates: true,
          });
          const sheetName = workbook.SheetNames[0]; // Get the first sheet
          const worksheet = workbook.Sheets[sheetName];
          // Convert sheet to JSON array of objects (each object is a row)
          const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

          if (json.length === 0) {
            resolve([]); // Empty Excel file
            return;
          }

          const headers = json[0];
          const rows = json.slice(1).map((row) => {
            const obj = {};
            headers.forEach((header, index) => {
              let value = row[index];
              // If value is a Date object, format it
              if (value instanceof Date) {
                value = formatDate(value);
              }
              obj[header] = value;
            });
            return obj;
          });
          resolve(rows);
        } catch (error) {
          reject(`Error parsing Excel file '${fileName}': ${error.message}`);
        }
      } else if (fileName.endsWith(".txt") || fileName.endsWith(".csv")) {
        // Read as plain text, split by lines
        resolve(data.split(/\r?\n/).filter((line) => line.trim() !== ""));
      } else {
        reject(
          `Unsupported file type: ${fileName}. Please select .xlsx, .xls, .txt, or .csv files.`
        );
      }
    };

    reader.onerror = (e) => {
      reject(`Error reading file '${file.name}': ${e.target.error}`);
    };

    // Read file based on type
    if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      reader.readAsArrayBuffer(file); // Excel files need array buffer
    } else {
      reader.readAsText(file); // Text/CSV files read as text
    }
  });
}

/**
 * Generates a unique key string for a row based on specified key columns.
 * @param {Object} row The row object.
 * @param {Array<string>} keyColumns The array of column names to use as keys.
 * @returns {string} A concatenated string of key values.
 */
function generateRowKey(row, keyColumns) {
  if (
    !row ||
    typeof row !== "object" ||
    !keyColumns ||
    keyColumns.length === 0
  ) {
    return JSON.stringify(row); // Fallback to full row string if keys are not provided or row is not an object
  }
  try {
    // Ensure all key values are treated as strings for consistent comparison
    return keyColumns.map((key) => String(row[key] || "")).join("|");
  } catch (e) {
    console.warn(
      "Could not generate row key for row:",
      row,
      "with keys:",
      keyColumns,
      "Error:",
      e
    );
    return JSON.stringify(row); // Fallback if a key is missing or causes an error
  }
}

/**
 * Compares two datasets (Excel rows or text lines) using specified key columns.
 * @param {Array<Object>|Array<string>} data1 Contents of File 1.
 * @param {Array<Object>|Array<string>} data2 Contents of File 2.
 * @param {string} fileType 'excel' or 'text'.
 * @param {Array<string>} keyColumns Array of column names to use as keys for Excel comparison.
 * @param {string} labelColumn Name of the column in File 2 to extract as 'Label Name'.
 * @returns {Object} An object containing found and missing contents.
 */
function compareContents(data1, data2, fileType, keyColumns, labelColumn) {
  const foundInFile2 = [];
  const missingInFile2 = [];

  // Create a map for efficient lookup of data2 based on keys
  const data2Map = new Map();
  if (fileType === "excel") {
    for (const row2 of data2) {
      const key = generateRowKey(row2, keyColumns);
      data2Map.set(key, row2); // Store the full row object
    }
  } else {
    // text
    for (const item2 of data2) {
      data2Map.set(item2, item2);
    }
  }

  for (const item1 of data1) {
    let item1Key;
    if (fileType === "excel") {
      item1Key = generateRowKey(item1, keyColumns);
    } else {
      // text
      item1Key = item1;
    }

    if (data2Map.has(item1Key)) {
      const matchedRow2 = data2Map.get(item1Key);
      // Create a copy of item1 and add the Label Name
      const matchedItem = { ...item1 };
      if (
        fileType === "excel" &&
        labelColumn &&
        matchedRow2 &&
        matchedRow2.hasOwnProperty(labelColumn)
      ) {
        matchedItem["Label Name"] = matchedRow2[labelColumn];
      } else if (
        fileType === "excel" &&
        labelColumn &&
        (!matchedRow2 || !matchedRow2.hasOwnProperty(labelColumn))
      ) {
        // If labelColumn is specified but not found in matched row2, indicate it
        matchedItem["Label Name"] = "N/A (Label Not Found)";
      }
      foundInFile2.push(matchedItem);
    } else {
      missingInFile2.push(item1);
    }
  }

  return { foundInFile2, missingInFile2 };
}

/**
 * Generates and downloads an Excel file from an array of data.
 * @param {Array<Object>|Array<string>} data The data to write to the Excel file.
 * @param {string} filename The name of the file to download.
 * @param {string} dataType 'excel' if data is array of objects, 'text' if array of strings.
 */
function downloadExcel(data, filename, dataType) {
  let ws;
  if (dataType === "excel") {
    // For Excel data (array of objects), directly use sheet_from_json
    ws = XLSX.utils.json_to_sheet(data);
  } else {
    // For text data (array of strings), convert to array of arrays first
    const dataAsArrays = data.map((item) => [item]); // Each line becomes a row with one column
    ws = XLSX.utils.aoa_to_sheet(dataAsArrays);
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Contents"); // Sheet name
  XLSX.writeFile(wb, filename);
}

// Event listener for the cross-check button
crossCheckBtn.addEventListener("click", async () => {
  hideMessage(); // Clear previous messages
  resultsSection.classList.add("hidden"); // Hide previous results
  downloadMatchedSection.classList.add("hidden"); // Hide matched download button
  downloadMissingSection.classList.add("hidden"); // Hide missing download button
  missingContentsDisplay.innerHTML = ""; // Clear previous contents

  const file1 = file1Input.files[0];
  const file2 = file2Input.files[0];
  const keyColumnsRaw = keyColumnsInput.value.trim();
  const labelColumn = labelColumnInput.value.trim();

  if (!file1 || !file2) {
    showMessage("Please select both File 1 and File 2.");
    return;
  }

  // Determine file types
  const file1Name = file1.name;
  const file2Name = file2.name;

  const isFile1Excel =
    file1Name.endsWith(".xlsx") || file1Name.endsWith(".xls");
  const isFile1Text = file1Name.endsWith(".txt") || file1Name.endsWith(".csv");
  const isFile2Excel =
    file2Name.endsWith(".xlsx") || file2Name.endsWith(".xls");
  const isFile2Text = file2Name.endsWith(".txt") || file2Name.endsWith(".csv");

  // Validate compatible file types
  if (!((isFile1Excel && isFile2Excel) || (isFile1Text && isFile2Text))) {
    showMessage(
      "Both files must be of the same type (both Excel or both plain text/CSV)."
    );
    return;
  }

  // Validate key columns and label column for Excel files
  let keyColumns = [];
  if (isFile1Excel) {
    if (!keyColumnsRaw) {
      showMessage(
        "Please provide Key Columns for Excel file comparison (e.g., UPC,ISRC)."
      );
      return;
    }
    keyColumns = keyColumnsRaw
      .split(",")
      .map((col) => col.trim())
      .filter((col) => col !== "");
    if (keyColumns.length === 0) {
      showMessage(
        "Key Columns cannot be empty. Please provide valid column names."
      );
      return;
    }
  }

  showLoading(); // Show loading indicator

  try {
    // Read contents of both files
    const data1 = await readFileContent(file1);
    const data2 = await readFileContent(file2);

    if (data1.length === 0) {
      showMessage("File 1 is empty. Nothing to cross-check.", false);
      hideLoading();
      return;
    }
    if (data2.length === 0) {
      showMessage("File 2 is empty. No contents to compare against.", false);
      hideLoading();
      return;
    }

    globalFileTypeForComparison = isFile1Excel ? "excel" : "text";
    const { foundInFile2, missingInFile2 } = compareContents(
      data1,
      data2,
      globalFileTypeForComparison,
      keyColumns,
      labelColumn
    );

    // Store found and missing data globally for download
    globalFoundInFile2 = foundInFile2;
    globalMissingInFile2 = missingInFile2;

    // Display results summary
    resultsSummary.innerHTML = `
              <p class="text-lg font-semibold">File 1 ('${file1.name}') contains ${data1.length} contents.</p>
              <p class="text-lg font-semibold">Out of these, <span class="text-green-600">${foundInFile2.length}</span> contents from File 1 were found in File 2 ('${file2.name}').</p>
              <p class="text-lg font-semibold">The remaining <span class="text-red-600">${missingInFile2.length}</span> contents from File 1 were NOT found in File 2.</p>
          `;

    // Show download button for matched contents if applicable
    if (globalFoundInFile2.length > 0) {
      downloadMatchedSection.classList.remove("hidden");
    } else {
      downloadMatchedSection.classList.add("hidden");
    }

    // Show download button for missing contents if applicable
    if (globalMissingInFile2.length > 0) {
      downloadMissingSection.classList.remove("hidden");
      // Also display missing contents on screen if there are any
      missingContentsDisplay.innerHTML = `
                  <pre class="p-4 bg-gray-50 rounded-md border border-gray-200">${missingInFile2
                    .map((item) =>
                      globalFileTypeForComparison === "excel"
                        ? JSON.stringify(item)
                        : item
                    )
                    .join("\n")}</pre>
              `;
    } else {
      downloadMissingSection.classList.add("hidden");
      missingContentsDisplay.innerHTML = `
                  <p class="text-green-700 font-semibold">All contents from File 1 were found in File 2. Great!</p>
              `;
    }

    resultsSection.classList.remove("hidden");
    showMessage(
      "Cross-check completed successfully! Download your matched and missing data.",
      false
    ); // Green success message
  } catch (error) {
    console.error("Cross-check error:", error);
    showMessage(`An error occurred: ${error}`);
  } finally {
    hideLoading(); // Always hide loading indicator
  }
});

// Event listener for the download matched button
downloadMatchedBtn.addEventListener("click", () => {
  if (globalFoundInFile2.length > 0) {
    const filename = `matched_contents_${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;
    downloadExcel(globalFoundInFile2, filename, globalFileTypeForComparison);
  } else {
    showMessage("No matched contents to download.", false);
  }
});

// Event listener for the download missing button
downloadMissingBtn.addEventListener("click", () => {
  if (globalMissingInFile2.length > 0) {
    const filename = `missing_contents_${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`;
    downloadExcel(globalMissingInFile2, filename, globalFileTypeForComparison);
  } else {
    showMessage("No missing contents to download.", false);
  }
});
