export function exportToExcel(sheets, fileName) {
  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const ws = XLSX.utils.json_to_sheet(sheet.data, { header: sheet.headers });
    if (sheet.colWidths) {
      ws['!cols'] = sheet.colWidths.map(w => ({ wch: w }));
    }
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }

  XLSX.writeFile(wb, fileName || 'export.xlsx');
}

export function importFromExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const result = {};
        for (const sheetName of wb.SheetNames) {
          const ws = wb.Sheets[sheetName];
          result[sheetName] = XLSX.utils.sheet_to_json(ws, { defval: '' });
        }
        resolve(result);
      } catch (err) {
        reject(new Error('文件解析失败，请确认是有效的 Excel 文件。'));
      }
    };
    reader.onerror = () => reject(new Error('文件读取失败。'));
    reader.readAsArrayBuffer(file);
  });
}

export function validateImport(data, fieldMap, requiredFields) {
  const errors = [];
  const valid = [];

  if (!Array.isArray(data)) {
    return { valid, errors: [{ row: 0, msg: '数据格式错误，需要表格数据。' }] };
  }

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rowErrors = [];

    for (const field of requiredFields) {
      const excelCol = fieldMap[field] || field;
      if (!row[excelCol] && row[excelCol] !== 0) {
        rowErrors.push(`缺少必填字段: ${field}`);
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ row: i + 2, msg: rowErrors.join('; ') });
    } else {
      valid.push(row);
    }
  }

  return { valid, errors };
}

export function mapImportData(data, fieldMap) {
  return data.map(row => {
    const mapped = {};
    for (const [targetField, excelCol] of Object.entries(fieldMap)) {
      mapped[targetField] = row[excelCol] !== undefined ? row[excelCol] : '';
    }
    return mapped;
  });
}

export function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
