# Multi-Fund Portfolio & RSA Statement Template (Backend)

This is a standalone module containing the Handlebars template and CSS for the multi-page Portfolio & RSA Statement matching the official statement design.

---

## Directory Structure

```
adhoc_statement_v2/
├── templates/
│   └── statement.hbs          # Main Handlebars template
├── public/
│   └── css/
│       └── statement.css      # Print & layout stylesheet
├── sample/
│   └── sample-data.json       # Sample data payload blueprint
├── render-example.cjs         # Node.js Playwright script to render PDF
├── generate-preview.cjs       # Helper script to compile preview.html
├── preview.html               # Compiled HTML preview (open in browser)
└── README.md
```

---

## Backend Usage

1. Copy this entire `adhoc_statement_v2` folder into your backend project (`npl-mobile-api`).
2. Install dependencies:
   ```bash
   npm install handlebars playwright
   ```
3. To generate a PDF in your controller:
   ```javascript
   const fs = require('fs');
   const path = require('path');
   const Handlebars = require('handlebars');
   const { chromium } = require('playwright');

   async function generateStatementPdf(statementData) {
     const templatePath = path.join(__dirname, 'templates', 'statement.hbs');
     const cssPath = path.join(__dirname, 'public', 'css', 'statement.css');

     const templateSource = fs.readFileSync(templatePath, 'utf8');
     const cssContent = fs.readFileSync(cssPath, 'utf8');
     const template = Handlebars.compile(templateSource);

     let html = template(statementData);
     html = html.replace(
       '<link rel="stylesheet" href="../public/css/statement.css" />',
       `<style>${cssContent}</style>`
     );

     const browser = await chromium.launch({ headless: true });
     const page = await browser.newPage();
     await page.setContent(html, { waitUntil: 'networkidle' });
     const pdfBuffer = await page.pdf({
       format: 'A4',
       printBackground: true,
       margin: { top: '8mm', bottom: '10mm', left: '10mm', right: '10mm' }
     });
     await browser.close();

     return pdfBuffer;
   }
   ```
