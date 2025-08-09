import fs from 'fs-extra';
import xlsx from 'xlsx';
import path from 'path';

const args = process.argv.slice(2);
const excelPath = args[0] || 'translations.xlsx';
const outputDir = args[1] || '../apps/desktop/public/locales';
if (!fs.existsSync(excelPath)) {
  console.error(`❌ Excel file not found: ${excelPath}`);
  process.exit(1);
}
const workbook = xlsx.readFile(excelPath);

workbook.SheetNames.forEach(namespace => {
  const sheet = workbook.Sheets[namespace];
  const jsonData = xlsx.utils.sheet_to_json(sheet);

  if (jsonData.length === 0) return;

  const languages = Object.keys(jsonData[0]).filter(col => col !== 'key');

  languages.forEach(lang => {
    const langDir = path.join(outputDir, lang);
    fs.ensureDirSync(langDir);

    const translations = {};
    jsonData.forEach(row => {
      translations[row.key] = row[lang] || '';
    });

    const jsonPath = path.join(langDir, `${namespace}.json`);
    fs.writeJsonSync(jsonPath, translations, { spaces: 2, encoding: 'utf-8' });

    console.log(`✅ Generated: ${jsonPath}`);
  });
});

console.log('🎉 All translation files generated successfully!');
