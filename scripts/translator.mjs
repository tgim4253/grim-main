import fs from 'fs-extra';
import path from 'path';
import ExcelJS from 'exceljs';

const args = process.argv.slice(2);
const excelPath = args[0] || 'translations.xlsx';
const outputDir = args[1] || '../apps/desktop/public/locales';
if (!fs.existsSync(excelPath)) {
  console.error(`❌ Excel file not found: ${String(excelPath)}`);
  process.exit(1);
}

const workbook = new ExcelJS.Workbook();

/**
 * ExcelJS is MIT-licensed and provides workbook parsing compatible with the
 * previous xlsx.readFile/sheet_to_json pipeline while keeping us GPL friendly.
 */
try {
  await workbook.xlsx.readFile(excelPath);
} catch (error) {
  console.error('❌ Failed to read Excel workbook with ExcelJS:', error);
  process.exit(1);
}

workbook.worksheets.forEach(worksheet => {
  const namespace = worksheet.name;

  const headerByColumn = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const header = cell?.text ?? '';
    if (header) {
      headerByColumn[colNumber] = header;
    }
  });

  if (headerByColumn.length === 0) {
    return;
  }

  const jsonData = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const rowData = {};
    let hasContent = false;

    headerByColumn.forEach((header, colNumber) => {
      if (!header) return;

      const cellText = row.getCell(colNumber).text ?? '';
      if (cellText !== '') {
        hasContent = true;
      }
      rowData[header] = cellText;
    });

    if (hasContent) {
      jsonData.push(rowData);
    }
  });

  if (jsonData.length === 0) return;

  const languages = [...new Set(headerByColumn.filter(header => header && header !== 'key'))];

  if (languages.length === 0) return;

  languages.forEach(lang => {
    const langDir = path.join(outputDir, lang);
    fs.ensureDirSync(langDir);

    const translations = {};
    jsonData.forEach(row => {
      if (!row.key) return;
      translations[row.key] = row[lang] || '';
    });

    if (Object.keys(translations).length === 0) return;

    const jsonPath = path.join(langDir, `${String(namespace)}.json`);
    fs.writeJsonSync(jsonPath, translations, { spaces: 2, encoding: 'utf-8' });

    console.log(`✅ Generated: ${String(jsonPath)}`);
  });
});

console.log('🎉 All translation files generated successfully!');
