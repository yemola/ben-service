// npm install handlebars playwright
// Run with: node render-example.cjs
const fs = require('fs');
const path = require('path');
const Handlebars = require('handlebars');
const { chromium } = require('playwright');

async function renderPdf() {
  const templatePath = path.join(__dirname, 'templates', 'statement.hbs');
  const dataPath = path.join(__dirname, 'sample', 'sample-data.json');
  const cssPath = path.join(__dirname, 'public', 'css', 'statement.css');
  const outputPath = path.join(__dirname, 'statement-sample.pdf');

  const templateSource = fs.readFileSync(templatePath, 'utf8');
  const cssContent = fs.readFileSync(cssPath, 'utf8');
  const template = Handlebars.compile(templateSource);
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  let html = template(data);
  html = html.replace(
    '<link rel="stylesheet" href="../public/css/statement.css" />',
    `<style>${cssContent}</style>`
  );

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '8mm',
      bottom: '10mm',
      left: '10mm',
      right: '10mm'
    }
  });
  await browser.close();

  console.log(`Successfully generated statement PDF to: ${outputPath}`);
}

renderPdf().catch(console.error);
