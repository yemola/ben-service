// Run with: node generate-preview.cjs
const fs = require('fs');
const path = require('path');

function buildPreview() {
  const templatePath = path.join(__dirname, 'templates', 'statement.hbs');
  const dataPath = path.join(__dirname, 'sample', 'sample-data.json');
  const cssPath = path.join(__dirname, 'public', 'css', 'statement.css');
  const outputPath = path.join(__dirname, 'preview.html');

  let templateSource = fs.readFileSync(templatePath, 'utf8');
  const cssContent = fs.readFileSync(cssPath, 'utf8');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  let html = templateSource;

  // Replace simple variables
  html = html.replace(/\{\{period\.printedAt\}\}/g, data.period.printedAt);
  html = html.replace(/\{\{period\.dateFrom\}\}/g, data.period.dateFrom);
  html = html.replace(/\{\{period\.dateTo\}\}/g, data.period.dateTo);
  html = html.replace(/\{\{personalInfo\.accountName\}\}/g, data.personalInfo.accountName);
  html = html.replace(/\{\{personalInfo\.pin\}\}/g, data.personalInfo.pin);
  html = html.replace(/\{\{personalInfo\.employer\}\}/g, data.personalInfo.employer);
  html = html.replace(/\{\{portfolio\.totalCpsPpp\}\}/g, data.portfolio.totalCpsPpp);
  html = html.replace(/\{\{portfolio\.combinedGainLoss\}\}/g, data.portfolio.combinedGainLoss);
  html = html.replace(/\{\{portfolio\.totalFcyFundVii\}\}/g, data.portfolio.totalFcyFundVii);
  html = html.replace(/\{\{portfolio\.fcyGainLoss\}\}/g, data.portfolio.fcyGainLoss);
  html = html.replace(/\{\{schemes\.rsa\.currentValue\}\}/g, data.schemes.rsa.currentValue);
  html = html.replace(/\{\{schemes\.microPension\.currentValue\}\}/g, data.schemes.microPension.currentValue);
  html = html.replace(/\{\{schemes\.foreignCurrency\.currentValue\}\}/g, data.schemes.foreignCurrency.currentValue);

  html = html.replace(/\{\{rsaFund\.totalMandatory\}\}/g, data.rsaFund.totalMandatory);
  html = html.replace(/\{\{rsaFund\.gainLoss\}\}/g, data.rsaFund.gainLoss);
  html = html.replace(/\{\{rsaFund\.adminFee\}\}/g, data.rsaFund.adminFee);
  html = html.replace(/\{\{rsaFund\.currentValue\}\}/g, data.rsaFund.currentValue);
  html = html.replace(/\{\{rsaFund\.withdrawal\}\}/g, data.rsaFund.withdrawal);

  html = html.replace(/\{\{personalPension\.totalMandatory\}\}/g, data.personalPension.totalMandatory);
  html = html.replace(/\{\{personalPension\.gainLoss\}\}/g, data.personalPension.gainLoss);
  html = html.replace(/\{\{personalPension\.adminFee\}\}/g, data.personalPension.adminFee);
  html = html.replace(/\{\{personalPension\.currentValue\}\}/g, data.personalPension.currentValue);
  html = html.replace(/\{\{personalPension\.withdrawal\}\}/g, data.personalPension.withdrawal);

  html = html.replace(/\{\{dollarFund\.totalMandatory\}\}/g, data.dollarFund.totalMandatory);
  html = html.replace(/\{\{dollarFund\.gainLoss\}\}/g, data.dollarFund.gainLoss);
  html = html.replace(/\{\{dollarFund\.adminFee\}\}/g, data.dollarFund.adminFee);
  html = html.replace(/\{\{dollarFund\.currentValue\}\}/g, data.dollarFund.currentValue);
  html = html.replace(/\{\{dollarFund\.withdrawal\}\}/g, data.dollarFund.withdrawal);

  html = html.replace(/\{\{signatory\.name\}\}/g, data.signatory.name);
  html = html.replace(/\{\{signatory\.title\}\}/g, data.signatory.title);

  // Render transactions table for RSA Fund
  const txnRows = data.rsaFund.transactions.map(t => `
    <tr>
      <td>${t.transDate}</td>
      <td>${t.period}</td>
      <td>${t.description}</td>
      <td class="text-right">${t.employee}</td>
      <td class="text-right">${t.employer}</td>
      <td class="text-right">${t.otherCont}</td>
      <td class="text-right">${t.withdrawal}</td>
      <td class="text-right">${t.fees}</td>
      <td class="text-right">${t.total}</td>
    </tr>
  `).join('\n');

  html = html.replace(/\{\{#if rsaFund\.transactions\.length\}\}[\s\S]*?\{\{\/if\}\}/, txnRows);
  html = html.replace(/\{\{#if personalPension\.transactions\.length\}\}[\s\S]*?\{\{\/if\}\}/, '<tr><td colspan="9" class="empty-txn-msg">No transaction history recorded for this period.</td></tr>');
  html = html.replace(/\{\{#if dollarFund\.transactions\.length\}\}[\s\S]*?\{\{\/if\}\}/, '<tr><td colspan="9" class="empty-txn-msg">No transaction history recorded for this period.</td></tr>');

  html = html.replace(/\{\{#if logoUrl\}\}[\s\S]*?\{\{else\}\}/g, '');
  html = html.replace(/\{\{#if stampUrl\}\}[\s\S]*?\{\{else\}\}/g, '');
  html = html.replace(/\{\{#if signatureUrl\}\}[\s\S]*?\{\{else\}\}/g, '');
  html = html.replace(/\{\{#if bannerUrl\}\}[\s\S]*?\{\{else\}\}/g, '');
  html = html.replace(/\{\{\/if\}\}/g, '');

  html = html.replace(
    '<link rel="stylesheet" href="../public/css/statement.css" />',
    `<style>\n${cssContent}\n</style>`
  );

  fs.writeFileSync(outputPath, html, 'utf8');
  console.log(`Preview generated at: ${outputPath}`);
}

buildPreview();
