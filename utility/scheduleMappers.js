/**
 * Date formatter shared across all mapRow functions
 */
function formatDate(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * mapDeathBenefit - Standard mapper for Death Benefit templates.
 * Used by: Death Benefit, Additional Death Benefit
 */
function mapDeathBenefit(record, sheet, rowIndex, sn) {
  sheet.getCell(`A${rowIndex}`).value = sn;
  sheet.getCell(`B${rowIndex}`).value = record.PFA;
  sheet.getCell(`C${rowIndex}`).value = record.PIN;
  sheet.getCell(`D${rowIndex}`).value = record.SURNAME;
  sheet.getCell(`E${rowIndex}`).value = record.FIRSTNAME;
  sheet.getCell(`F${rowIndex}`).value = record.OTHERNAMES;
  sheet.getCell(`G${rowIndex}`).value = record.GENDER;
  sheet.getCell(`H${rowIndex}`).value = formatDate(record.DATE_OF_BIRTH);
  sheet.getCell(`I${rowIndex}`).value = formatDate(record.DATE_OF_RETIREMENT);
  sheet.getCell(`J${rowIndex}`).value = formatDate(record.DATE_OF_DEATH);
  sheet.getCell(`K${rowIndex}`).value = record.EMPLOYER_NAME;
  sheet.getCell(`L${rowIndex}`).value = record.EMPLOYER_RCNO;
  sheet.getCell(`M${rowIndex}`).value = record.SECTOR;
  sheet.getCell(`N${rowIndex}`).value = record.PFA;
  sheet.getCell(`O${rowIndex}`).value = record.AGE;
  sheet.getCell(`P${rowIndex}`).value = record.ISSUING_AUTHORITY;
  sheet.getCell(`Q${rowIndex}`).value = formatDate(record.DATE_OF_LETTER_OF_ADMINISTRATION);
  sheet.getCell(`R${rowIndex}`).value = record.ADMINISTRATIVE_NOK;
  sheet.getCell(`S${rowIndex}`).value = formatDate(record.DATE_OF_INFLOW);
  sheet.getCell(`T${rowIndex}`).value = record.RSA_BALANCE_BEFORE_INFLOW;
  sheet.getCell(`U${rowIndex}`).value = record.ADDITIONAL_INFLOW;
  sheet.getCell(`V${rowIndex}`).value = record.CURRENT_RSA_BALANCE;
  sheet.getCell(`W${rowIndex}`).value = record.TOTAL_PFC_PAYMENT;
  sheet.getCell(`X${rowIndex}`).value = formatDate(record.DATE_OF_REQUEST);
  sheet.getCell(`Y${rowIndex}`).value = formatDate(record.DATE_APPROVED);
  sheet.getCell(`Z${rowIndex}`).value = formatDate(record.DATE_FORWARDED);
  sheet.getCell(`AA${rowIndex}`).value = record.BENEFICIARY_BVN;
  sheet.getCell(`AB${rowIndex}`).value = record.BENEFICIARY_ACCOUNT_NAME;
  sheet.getCell(`AC${rowIndex}`).value = record.ACCOUNT_NUMBER;
  sheet.getCell(`AD${rowIndex}`).value = record.SORTCODE;
  sheet.getCell(`AE${rowIndex}`).value = record.BANK_NAME;
  sheet.getCell(`AF${rowIndex}`).value = record.SOURCE_ACCOUNT;
  sheet.getCell(`AG${rowIndex}`).value = record.SOURCE_ACCOUNT_NAME;
  sheet.getCell(`AH${rowIndex}`).value = record.REMARKS;
  // sheet.getRow(rowIndex).font = { name: 'Calibri', size: 10 };
}

/**
 * mapMortgage - Custom mapper for Mortgage template layout.
 */
function mapMortgage(record, sheet, rowIndex, sn) {
  sheet.getCell(`A${rowIndex}`).value = sn;
  sheet.getCell(`B${rowIndex}`).value = record.PFA;
  sheet.getCell(`C${rowIndex}`).value = record.PIN;
  sheet.getCell(`D${rowIndex}`).value = record.SURNAME;
  sheet.getCell(`E${rowIndex}`).value = record.FIRST_NAME;
  sheet.getCell(`F${rowIndex}`).value = record.MIDDLE_NAME;
  sheet.getCell(`G${rowIndex}`).value = record.GENDER;
  sheet.getCell(`H${rowIndex}`).value = formatDate(record.DATE_OF_BIRTH);
  sheet.getCell(`I${rowIndex}`).value = record.CURRENT_AGE;
  sheet.getCell(`J${rowIndex}`).value = record.EMPLOYER_NAME;
  sheet.getCell(`K${rowIndex}`).value = record.EMPLOYER_RCNO;
  sheet.getCell(`L${rowIndex}`).value = record.SECTOR;
  sheet.getCell(`M${rowIndex}`).value = formatDate(record.DATE_OF_EMPLOYMENT);
  sheet.getCell(`N${rowIndex}`).value = formatDate(record.DATE_OF_FIRST_CONTRIBUTION);
  sheet.getCell(`O${rowIndex}`).value = formatDate(record.DATE_OF_LAST_CONTRIBUTION);
  // sheet.getCell(`P${rowIndex}`).value = record.NO_OF_MONTHS_OF_CONTRIBUTION;
  // sheet.getCell(`P${rowIndex}`).value = record.PERCENTAGE_LOSS_OF_JOB_ACCESSED;
  // sheet.getCell(`W${rowIndex}`).value = record.NAME_OF_MORTGAGE_LENDER;
  // sheet.getCell(`AK${rowIndex}`).value = record.TOTAL_AMOUNT_PFC;
  sheet.getCell(`AL${rowIndex}`).value = formatDate(record.RETIREMENT_AGE);
  sheet.getCell(`AM${rowIndex}`).value = formatDate(record.RSA_REGISTRATION_DATE);
  sheet.getCell(`AN${rowIndex}`).value = formatDate(record.ECRS_RECAPTURED_DATE);
  sheet.getRow(rowIndex).font = { name: 'Calibri', size: 10 }
}

/**
 * mapTwentyFivePercent - Custom mapper for 25% Withdrawal template.
 */
function mapTwentyFivePercent(record, sheet, rowIndex, sn) {
  sheet.getCell(`A${rowIndex}`).value = sn;
  sheet.getCell(`B${rowIndex}`).value = record.PIN;
  sheet.getCell(`C${rowIndex}`).value = record.SURNAME;
  sheet.getCell(`D${rowIndex}`).value = record.FIRSTNAME;
  sheet.getCell(`E${rowIndex}`).value = record.OTHERNAMES;
  sheet.getCell(`F${rowIndex}`).value = record.GENDER;
  sheet.getCell(`G${rowIndex}`).value = formatDate(record.DATE_OF_BIRTH);
  sheet.getCell(`H${rowIndex}`).value = formatDate(record.DATE_OF_DISENGAGEMENT);
  sheet.getCell(`I${rowIndex}`).value = record.EMPLOYER_NAME;
  sheet.getCell(`J${rowIndex}`).value = record.EMPLOYER_RCNO;
  sheet.getCell(`K${rowIndex}`).value = record.SECTOR;
  sheet.getCell(`L${rowIndex}`).value = record.PFA;
  sheet.getCell(`M${rowIndex}`).value = formatDate(record.DATE_OF_PROCESS);
  sheet.getCell(`N${rowIndex}`).value = record.AGE;
  sheet.getCell(`O${rowIndex}`).value = record.PERIOD_OF_MONTHS;
  sheet.getCell(`P${rowIndex}`).value = record.REASON;
  sheet.getCell(`Q${rowIndex}`).value = record.RSA_BALANCE;
  sheet.getCell(`R${rowIndex}`).value = record.ESTIMATED_25_PERCENT;
  sheet.getCell(`S${rowIndex}`).value = formatDate(record.RSA_REGISTRATION_DATE);
  sheet.getCell(`T${rowIndex}`).value = formatDate(record.ECRS_RECAPTURED_DATE);
  sheet.getCell(`U${rowIndex}`).value = record.TOTAL_AMOUNT_PFC;
  sheet.getCell(`V${rowIndex}`).value = formatDate(record.DATE_OF_REQUEST);
  sheet.getCell(`W${rowIndex}`).value = formatDate(record.DATE_APPROVED);
  sheet.getCell(`X${rowIndex}`).value = formatDate(record.DATE_FORWARDED);
  sheet.getCell(`Y${rowIndex}`).value = record.BENEFICIARY_BVN;
  sheet.getCell(`Z${rowIndex}`).value = record.BENEFICIARY_ACCOUNT_NAME;
  sheet.getCell(`AA${rowIndex}`).value = record.ACCOUNT_NUMBER;
  sheet.getCell(`AB${rowIndex}`).value = record.SORTCODE;
  sheet.getCell(`AC${rowIndex}`).value = record.BANK_NAME;
  sheet.getCell(`AD${rowIndex}`).value = record.SOURCE_ACCOUNT;
  sheet.getCell(`AE${rowIndex}`).value = record.SOURCE_ACCOUNT_NAME;
  sheet.getCell(`AF${rowIndex}`).value = record.REMARKS;
  // sheet.getRow(rowIndex).font = { name: 'Calibri', size: 10 };
}

/**
 * mapProgramWithdrawal - Custom mapper for Programmed Withdrawal (Retirement/Prof).
 */
function mapProgramWithdrawal(record, sheet, rowIndex, sn) {
  sheet.getCell(`A${rowIndex}`).value = sn;
  sheet.getCell(`B${rowIndex}`).value = record.PIN;
  sheet.getCell(`C${rowIndex}`).value = record.SURNAME;
  sheet.getCell(`D${rowIndex}`).value = record.FIRSTNAME;
  sheet.getCell(`E${rowIndex}`).value = record.OTHERNAMES;
  sheet.getCell(`F${rowIndex}`).value = record.GENDER;
  sheet.getCell(`G${rowIndex}`).value = formatDate(record.DATE_OF_BIRTH);
  sheet.getCell(`H${rowIndex}`).value = formatDate(record.DATE_OF_RETIREMENT);
  sheet.getCell(`I${rowIndex}`).value = formatDate(record.DATE_OF_FIRST_APPOINTMENT);
  sheet.getCell(`J${rowIndex}`).value = formatDate(record.DATE_OF_COMMENCEMENT_CPS);
  sheet.getCell(`K${rowIndex}`).value = record.EMPLOYER_NAME;
  sheet.getCell(`L${rowIndex}`).value = record.EMPLOYER_RCNO;
  sheet.getCell(`M${rowIndex}`).value = record.SECTOR;
  sheet.getCell(`N${rowIndex}`).value = record.SALARY_STRUCTURE;
  sheet.getCell(`O${rowIndex}`).value = record.GRADE_LEVEL;
  sheet.getCell(`P${rowIndex}`).value = record.STEP;
  sheet.getCell(`Q${rowIndex}`).value = record.PFA;
  sheet.getCell(`R${rowIndex}`).value = formatDate(record.DATE_OF_PROGRAMMING);
  sheet.getCell(`S${rowIndex}`).value = record.ACCRUED_RIGHTS;
  sheet.getCell(`T${rowIndex}`).value = record.RSA_BALANCE;
  sheet.getCell(`U${rowIndex}`).value = record.FINAL_SALARY;
  sheet.getCell(`V${rowIndex}`).value = record.REVIEWED_FINAL_SALARY;
  sheet.getCell(`W${rowIndex}`).value = record.LUMPSUM;
  sheet.getCell(`X${rowIndex}`).value = record.PENSION;
  sheet.getCell(`Y${rowIndex}`).value = record.NO_OF_MONTHS_ARREARS;
  sheet.getCell(`Z${rowIndex}`).value = record.PENSION_ARREARS;
  sheet.getCell(`AA${rowIndex}`).value = record.FREQUENCY_OF_PAYMENT;
  sheet.getCell(`AB${rowIndex}`).value = record.NEGOTIATED_MTHS_ARREARS;
  sheet.getCell(`AC${rowIndex}`).value = record.NEGOTIATED_LUMPSUM;
  sheet.getCell(`AD${rowIndex}`).value = formatDate(record.RSA_REGISTRATION_DATE);
  sheet.getCell(`AE${rowIndex}`).value = formatDate(record.ECRS_RECAPTURED_DATE);
  sheet.getCell(`AF${rowIndex}`).value = record.TOTAL_LUMPSUM_PFC;
  sheet.getCell(`AG${rowIndex}`).value = record.TOTAL_ARREARS_PFC;
  sheet.getCell(`AH${rowIndex}`).value = formatDate(record.DATE_OF_REQUEST);
  sheet.getCell(`AI${rowIndex}`).value = formatDate(record.DATE_APPROVED);
  sheet.getCell(`AJ${rowIndex}`).value = formatDate(record.DATE_FORWARDED);
  sheet.getCell(`AK${rowIndex}`).value = record.BENEFICIARY_BVN;
  sheet.getCell(`AL${rowIndex}`).value = record.BENEFICIARY_ACCOUNT_NAME;
  sheet.getCell(`AM${rowIndex}`).value = record.ACCOUNT_NUMBER;
  sheet.getCell(`AN${rowIndex}`).value = record.SORTCODE;
  sheet.getCell(`AO${rowIndex}`).value = record.BANK_NAME;
  sheet.getCell(`AP${rowIndex}`).value = record.SOURCE_ACCOUNT;
  sheet.getCell(`AQ${rowIndex}`).value = record.SOURCE_ACCOUNT_NAME;
  sheet.getCell(`AR${rowIndex}`).value = record.REMARKS;
  // sheet.getRow(rowIndex).font = { name: 'Calibri', size: 10 };
}

/**
 * mapAVC - Custom mapper for AVC templates.
 */
function mapAVC(record, sheet, rowIndex, sn) {
  sheet.getCell(`A${rowIndex}`).value = sn;
  sheet.getCell(`B${rowIndex}`).value = record.PIN;
  sheet.getCell(`C${rowIndex}`).value = record.SURNAME;
  sheet.getCell(`D${rowIndex}`).value = record.FIRSTNAME;
  sheet.getCell(`E${rowIndex}`).value = record.OTHERNAMES;
  sheet.getCell(`F${rowIndex}`).value = record.GENDER;
  sheet.getCell(`G${rowIndex}`).value = formatDate(record.DATE_OF_BIRTH);
  sheet.getCell(`H${rowIndex}`).value = record.EMPLOYER_NAME;
  sheet.getCell(`I${rowIndex}`).value = record.EMPLOYER_RCNO;
  sheet.getCell(`J${rowIndex}`).value = record.SECTOR;
  sheet.getCell(`K${rowIndex}`).value = record.PFA;
  sheet.getCell(`L${rowIndex}`).value = record.AVC_AMOUNT;
  sheet.getCell(`M${rowIndex}`).value = formatDate(record.RSA_REGISTRATION_DATE);
  sheet.getCell(`N${rowIndex}`).value = formatDate(record.ECRS_RECAPTURED_DATE);
  sheet.getCell(`O${rowIndex}`).value = record.TOTAL_AMOUNT_PFC;
  sheet.getCell(`P${rowIndex}`).value = formatDate(record.DATE_OF_REQUEST);
  sheet.getCell(`Q${rowIndex}`).value = formatDate(record.DATE_APPROVED);
  sheet.getCell(`R${rowIndex}`).value = formatDate(record.DATE_FORWARDED);
  sheet.getCell(`S${rowIndex}`).value = record.BENEFICIARY_BVN;
  sheet.getCell(`T${rowIndex}`).value = record.BENEFICIARY_ACCOUNT_NAME;
  sheet.getCell(`U${rowIndex}`).value = record.ACCOUNT_NUMBER;
  sheet.getCell(`V${rowIndex}`).value = record.SORTCODE;
  sheet.getCell(`W${rowIndex}`).value = record.BANK_NAME;
  sheet.getCell(`X${rowIndex}`).value = record.SOURCE_ACCOUNT;
  sheet.getCell(`Y${rowIndex}`).value = record.SOURCE_ACCOUNT_NAME;
  sheet.getCell(`Z${rowIndex}`).value = record.REMARKS;
  // sheet.getRow(rowIndex).font = { name: 'Calibri', size: 10 };
}

/**
 * mapNSITF - Custom mapper for NSITF template.
 */
function mapNSITF(record, sheet, rowIndex, sn) {
  sheet.getCell(`A${rowIndex}`).value = sn;
  sheet.getCell(`B${rowIndex}`).value = record.PIN;
  sheet.getCell(`C${rowIndex}`).value = record.SURNAME;
  sheet.getCell(`D${rowIndex}`).value = record.FIRSTNAME;
  sheet.getCell(`E${rowIndex}`).value = record.OTHERNAMES;
  sheet.getCell(`F${rowIndex}`).value = record.GENDER;
  sheet.getCell(`G${rowIndex}`).value = formatDate(record.DATE_OF_BIRTH);
  sheet.getCell(`H${rowIndex}`).value = formatDate(record.DATE_OF_RETIREMENT);
  sheet.getCell(`I${rowIndex}`).value = record.EMPLOYER_NAME;
  sheet.getCell(`J${rowIndex}`).value = record.EMPLOYER_RCNO;
  sheet.getCell(`K${rowIndex}`).value = record.SECTOR;
  sheet.getCell(`L${rowIndex}`).value = record.PFA;
  sheet.getCell(`M${rowIndex}`).value = record.INITIAL_PRA_AMOUNT;
  sheet.getCell(`N${rowIndex}`).value = record.NSITF_RECEIVED_AMOUNT;
  sheet.getCell(`O${rowIndex}`).value = record.NSITF_REQUESTED_AMOUNT;
  sheet.getCell(`P${rowIndex}`).value = formatDate(record.RSA_REGISTRATION_DATE);
  sheet.getCell(`Q${rowIndex}`).value = formatDate(record.ECRS_RECAPTURED_DATE);
  sheet.getCell(`R${rowIndex}`).value = record.TOTAL_AMOUNT_PFC;
  sheet.getCell(`S${rowIndex}`).value = formatDate(record.DATE_OF_REQUEST);
  sheet.getCell(`T${rowIndex}`).value = formatDate(record.DATE_APPROVED);
  sheet.getCell(`U${rowIndex}`).value = formatDate(record.DATE_FORWARDED);
  sheet.getCell(`V${rowIndex}`).value = record.BENEFICIARY_BVN;
  sheet.getCell(`W${rowIndex}`).value = record.BENEFICIARY_ACCOUNT_NAME;
  sheet.getCell(`X${rowIndex}`).value = record.ACCOUNT_NUMBER;
  sheet.getCell(`Y${rowIndex}`).value = record.SORTCODE;
  sheet.getCell(`Z${rowIndex}`).value = record.BANK_NAME;
  sheet.getCell(`AA${rowIndex}`).value = record.SOURCE_ACCOUNT;
  sheet.getCell(`AB${rowIndex}`).value = record.SOURCE_ACCOUNT_NAME;
  sheet.getCell(`AC${rowIndex}`).value = record.REMARKS;
  // sheet.getRow(rowIndex).font = { name: 'Calibri', size: 10 };
}

/**
 * mapPensionEnhancement - Custom mapper for Pension Enhancement template.
 */
function mapPensionEnhancement(record, sheet, rowIndex, sn) {
  sheet.getCell(`A${rowIndex}`).value = sn;
  sheet.getCell(`B${rowIndex}`).value = record.PIN;
  sheet.getCell(`C${rowIndex}`).value = record.SURNAME;
  sheet.getCell(`D${rowIndex}`).value = record.FIRSTNAME;
  sheet.getCell(`E${rowIndex}`).value = record.OTHERNAMES;
  sheet.getCell(`F${rowIndex}`).value = record.GENDER;
  sheet.getCell(`G${rowIndex}`).value = formatDate(record.DATE_OF_BIRTH);
  sheet.getCell(`H${rowIndex}`).value = formatDate(record.DATE_OF_RETIREMENT);
  sheet.getCell(`I${rowIndex}`).value = record.EMPLOYER_NAME;
  sheet.getCell(`J${rowIndex}`).value = record.EMPLOYER_RCNO;
  sheet.getCell(`K${rowIndex}`).value = record.SECTOR;
  sheet.getCell(`L${rowIndex}`).value = record.PFA;
  sheet.getCell(`M${rowIndex}`).value = formatDate(record.PENSION_REVIEW_DATE);
  sheet.getCell(`N${rowIndex}`).value = record.RSA_BALANCE_2016;
  sheet.getCell(`O${rowIndex}`).value = record.CURRENT_PENSION_PENCOM;
  sheet.getCell(`P${rowIndex}`).value = record.RSA_BALANCE_SUBMISSION;
  sheet.getCell(`Q${rowIndex}`).value = record.ENHANCED_PENSION;
  sheet.getCell(`R${rowIndex}`).value = record.FREQUENCY;
  sheet.getCell(`S${rowIndex}`).value = formatDate(record.RSA_REGISTRATION_DATE);
  sheet.getCell(`T${rowIndex}`).value = formatDate(record.ECRS_RECAPTURED_DATE);
  sheet.getCell(`U${rowIndex}`).value = record.TOTAL_LUMPSUM_PFC;
  sheet.getCell(`V${rowIndex}`).value = record.TOTAL_ARREARS_PFC;
  sheet.getCell(`W${rowIndex}`).value = formatDate(record.DATE_OF_REQUEST);
  sheet.getCell(`X${rowIndex}`).value = formatDate(record.DATE_APPROVED);
  sheet.getCell(`Y${rowIndex}`).value = formatDate(record.DATE_FORWARDED);
  sheet.getCell(`Z${rowIndex}`).value = record.BENEFICIARY_BVN;
  sheet.getCell(`AA${rowIndex}`).value = record.BENEFICIARY_ACCOUNT_NAME;
  sheet.getCell(`AB${rowIndex}`).value = record.ACCOUNT_NUMBER;
  sheet.getCell(`AC${rowIndex}`).value = record.SORTCODE;
  sheet.getCell(`AD${rowIndex}`).value = record.BANK_NAME;
  sheet.getCell(`AE${rowIndex}`).value = record.SOURCE_ACCOUNT;
  sheet.getCell(`AF${rowIndex}`).value = record.SOURCE_ACCOUNT_NAME;
  sheet.getCell(`AG${rowIndex}`).value = record.REMARKS;
  // sheet.getRow(rowIndex).font = { name: 'Calibri', size: 10 };
}

/**
 * mapExhaustedRSA - Custom mapper for Exhausted RSA template.
 */
function mapExhaustedRSA(record, sheet, rowIndex, sn) {
  sheet.getCell(`A${rowIndex}`).value = sn;
  sheet.getCell(`B${rowIndex}`).value = record.PIN;
  sheet.getCell(`C${rowIndex}`).value = record.SURNAME;
  sheet.getCell(`D${rowIndex}`).value = record.FIRSTNAME;
  sheet.getCell(`E${rowIndex}`).value = record.OTHERNAMES;
  sheet.getCell(`F${rowIndex}`).value = record.GENDER;
  sheet.getCell(`G${rowIndex}`).value = formatDate(record.DATE_OF_BIRTH);
  sheet.getCell(`H${rowIndex}`).value = formatDate(record.DATE_OF_RETIREMENT);
  sheet.getCell(`I${rowIndex}`).value = record.EMPLOYER_NAME;
  sheet.getCell(`J${rowIndex}`).value = record.EMPLOYER_RCNO;
  sheet.getCell(`K${rowIndex}`).value = record.SECTOR;
  sheet.getCell(`L${rowIndex}`).value = record.PFA;
  sheet.getCell(`M${rowIndex}`).value = record.RESIDUAL_BALANCE_PAID;
  sheet.getCell(`N${rowIndex}`).value = record.AGE_AT_RETIREMENT;
  sheet.getCell(`O${rowIndex}`).value = record.CURRENT_AGE;
  sheet.getCell(`P${rowIndex}`).value = record.RSA_BALANCE_INITIAL;
  sheet.getCell(`Q${rowIndex}`).value = record.LUMPSUM_PAID_INITIAL;
  sheet.getCell(`R${rowIndex}`).value = record.PENSION_BEFORE_EXHAUSTION;
  sheet.getCell(`S${rowIndex}`).value = formatDate(record.DATE_INITIAL_APPROVAL);
  sheet.getCell(`T${rowIndex}`).value = formatDate(record.DATE_RSA_EXHAUSTION);
  sheet.getCell(`U${rowIndex}`).value = record.REASON_EXHAUSTION;
  sheet.getCell(`V${rowIndex}`).value = record.CURRENT_RSA_BALANCE;
  sheet.getCell(`W${rowIndex}`).value = record.PENSION_AFTER_EXHAUSTION;
  sheet.getCell(`X${rowIndex}`).value = record.FREQUENCY;
  sheet.getCell(`Y${rowIndex}`).value = formatDate(record.RSA_REGISTRATION_DATE);
  sheet.getCell(`Z${rowIndex}`).value = formatDate(record.ECRS_RECAPTURED_DATE);
  sheet.getCell(`AA${rowIndex}`).value = record.TOTAL_AMOUNT_PFC;
  sheet.getCell(`AB${rowIndex}`).value = formatDate(record.DATE_OF_REQUEST);
  sheet.getCell(`AC${rowIndex}`).value = formatDate(record.DATE_APPROVED);
  sheet.getCell(`AD${rowIndex}`).value = formatDate(record.DATE_FORWARDED);
  sheet.getCell(`AE${rowIndex}`).value = record.BENEFICIARY_BVN;
  sheet.getCell(`AF${rowIndex}`).value = record.BANK_NAME; // RSA Bank Name (Col AF)
  sheet.getCell(`AG${rowIndex}`).value = record.ACCOUNT_NUMBER;
  sheet.getCell(`AH${rowIndex}`).value = record.SORTCODE;
  sheet.getCell(`AI${rowIndex}`).value = record.BANK_NAME; // Bank Name again? (Col AI)
  sheet.getCell(`AJ${rowIndex}`).value = record.SOURCE_ACCOUNT;
  sheet.getCell(`AK${rowIndex}`).value = record.SOURCE_ACCOUNT_NAME;
  sheet.getCell(`AL${rowIndex}`).value = record.REMARKS;
  // sheet.getRow(rowIndex).font = { name: 'Calibri', size: 10 };
}

/**
 * mapMandatoryToVoluntary - Custom mapper for Mandatory to Voluntary transfer.
 */
function mapMandatoryToVoluntary(record, sheet, rowIndex, sn) {
  sheet.getCell(`A${rowIndex}`).value = sn;
  sheet.getCell(`B${rowIndex}`).value = record.PIN;
  sheet.getCell(`C${rowIndex}`).value = record.SURNAME;
  sheet.getCell(`D${rowIndex}`).value = record.FIRSTNAME;
  sheet.getCell(`E${rowIndex}`).value = record.OTHERNAMES;
  sheet.getCell(`F${rowIndex}`).value = record.PFA;
  sheet.getCell(`G${rowIndex}`).value = record.FIRST_EMPLOYER;
  sheet.getCell(`H${rowIndex}`).value = formatDate(record.DISENGAGEMENT_DATE);
  sheet.getCell(`I${rowIndex}`).value = record.MONTHLY_PENSION;
  sheet.getCell(`J${rowIndex}`).value = record.SECOND_EMPLOYER;
  sheet.getCell(`K${rowIndex}`).value = formatDate(record.DATE_OF_EMPLOYMENT);
  sheet.getCell(`L${rowIndex}`).value = formatDate(record.RSA_REGISTRATION_DATE);
  sheet.getCell(`M${rowIndex}`).value = formatDate(record.ECRS_RECAPTURED_DATE);
  sheet.getCell(`N${rowIndex}`).value = record.AMOUNT_TO_BE_TRANSFERRED;
  sheet.getCell(`O${rowIndex}`).value = formatDate(record.DATE_OF_REQUEST);
  sheet.getCell(`P${rowIndex}`).value = formatDate(record.DATE_APPROVED);
  sheet.getCell(`Q${rowIndex}`).value = record.REMARKS;
  // sheet.getRow(rowIndex).font = { name: 'Calibri', size: 10 };
}

/**
 * mapAnnuity - Custom mapper for Annuity template.
 */
function mapAnnuity(record, sheet, rowIndex, sn) {
  sheet.getCell(`A${rowIndex}`).value = sn;
  sheet.getCell(`B${rowIndex}`).value = record.PIN;
  sheet.getCell(`C${rowIndex}`).value = record.SURNAME;
  sheet.getCell(`D${rowIndex}`).value = record.FIRSTNAME;
  sheet.getCell(`E${rowIndex}`).value = record.OTHERNAMES;
  sheet.getCell(`F${rowIndex}`).value = record.GENDER;
  sheet.getCell(`G${rowIndex}`).value = formatDate(record.DATE_OF_BIRTH);
  sheet.getCell(`H${rowIndex}`).value = formatDate(record.DATE_OF_RETIREMENT);
  sheet.getCell(`I${rowIndex}`).value = formatDate(record.DATE_OF_FIRST_APPOINTMENT);
  sheet.getCell(`J${rowIndex}`).value = formatDate(record.DATE_OF_COMMENCEMENT_CPS);
  sheet.getCell(`K${rowIndex}`).value = record.EMPLOYER_NAME;
  sheet.getCell(`L${rowIndex}`).value = record.EMPLOYER_RCNO;
  sheet.getCell(`M${rowIndex}`).value = record.SECTOR;
  sheet.getCell(`N${rowIndex}`).value = record.SALARY_STRUCTURE;
  sheet.getCell(`O${rowIndex}`).value = record.GRADE_LEVEL;
  sheet.getCell(`P${rowIndex}`).value = record.STEP;
  sheet.getCell(`Q${rowIndex}`).value = record.PFA;
  sheet.getCell(`R${rowIndex}`).value = formatDate(record.DATE_OF_PROGRAMMING);
  sheet.getCell(`S${rowIndex}`).value = record.ACCRUED_RIGHTS;
  sheet.getCell(`T${rowIndex}`).value = record.RSA_BALANCE;
  sheet.getCell(`U${rowIndex}`).value = record.FINAL_SALARY;
  sheet.getCell(`V${rowIndex}`).value = record.REVIEWED_FINAL_SALARY;
  sheet.getCell(`W${rowIndex}`).value = record.LUMPSUM;
  sheet.getCell(`X${rowIndex}`).value = record.PENSION;
  sheet.getCell(`Y${rowIndex}`).value = record.NO_OF_MONTHS_ARREARS;
  sheet.getCell(`Z${rowIndex}`).value = record.PENSION_ARREARS;
  sheet.getCell(`AA${rowIndex}`).value = record.PREMIUM;
  sheet.getCell(`AB${rowIndex}`).value = record.MONTHLY_ANNUITY;
  sheet.getCell(`AC${rowIndex}`).value = record.NAME_OF_RLA_PROVIDER;
  sheet.getCell(`AD${rowIndex}`).value = formatDate(record.ANNUITY_COMMENCEMENT_DATE);
  sheet.getCell(`AE${rowIndex}`).value = record.FREQUENCY_OF_PAYMENT;
  sheet.getCell(`AF${rowIndex}`).value = record.NEGOTIATED_MTHS_ARREARS;
  sheet.getCell(`AG${rowIndex}`).value = record.NEGOTIATED_LUMPSUM;
  sheet.getCell(`AH${rowIndex}`).value = record.CURRENT_RSA_BALANCE;
  sheet.getCell(`AI${rowIndex}`).value = record.RESIDUAL_BALANCE;
  sheet.getCell(`AJ${rowIndex}`).value = formatDate(record.RSA_REGISTRATION_DATE);
  sheet.getCell(`AK${rowIndex}`).value = formatDate(record.ECRS_RECAPTURED_DATE);
  sheet.getCell(`AL${rowIndex}`).value = record.TOTAL_LUMPSUM_PFC;
  sheet.getCell(`AM${rowIndex}`).value = record.TOTAL_ARREARS_PFC;
  sheet.getCell(`AN${rowIndex}`).value = record.TOTAL_AMOUNT_INSURANCE;
  sheet.getCell(`AO${rowIndex}`).value = formatDate(record.DATE_OF_REQUEST);
  sheet.getCell(`AP${rowIndex}`).value = formatDate(record.DATE_APPROVED);
  sheet.getCell(`AQ${rowIndex}`).value = formatDate(record.DATE_FORWARDED);
  sheet.getCell(`AR${rowIndex}`).value = record.BENEFICIARY_BVN;
  sheet.getCell(`AS${rowIndex}`).value = record.BENEFICIARY_ACCOUNT_NAME;
  sheet.getCell(`AT${rowIndex}`).value = record.ACCOUNT_NUMBER;
  sheet.getCell(`AU${rowIndex}`).value = record.SORTCODE;
  sheet.getCell(`AV${rowIndex}`).value = record.BANK_NAME;
  sheet.getCell(`AW${rowIndex}`).value = record.INSURANCE_ACCOUNT_NUMBER;
  sheet.getCell(`AX${rowIndex}`).value = record.INSURANCE_SORTCODE;
  sheet.getCell(`AY${rowIndex}`).value = record.INSURANCE_BANK_NAME;
  sheet.getCell(`AZ${rowIndex}`).value = record.SOURCE_ACCOUNT;
  sheet.getCell(`BA${rowIndex}`).value = record.SOURCE_ACCOUNT_NAME;
  sheet.getCell(`BB${rowIndex}`).value = record.REMARKS;
  // sheet.getRow(rowIndex).font = { name: 'Calibri', size: 10 };
}

/**
 * mapEnBloc - Custom mapper for EnBloc template.
 */
function mapEnBloc(record, sheet, rowIndex, sn) {
  sheet.getCell(`A${rowIndex}`).value = sn;
  sheet.getCell(`B${rowIndex}`).value = record.PIN;
  sheet.getCell(`C${rowIndex}`).value = record.SURNAME;
  sheet.getCell(`D${rowIndex}`).value = record.FIRSTNAME;
  sheet.getCell(`E${rowIndex}`).value = record.OTHERNAMES;
  sheet.getCell(`F${rowIndex}`).value = record.GENDER;
  sheet.getCell(`G${rowIndex}`).value = formatDate(record.DATE_OF_BIRTH);
  sheet.getCell(`H${rowIndex}`).value = formatDate(record.DATE_OF_RETIREMENT);
  sheet.getCell(`I${rowIndex}`).value = formatDate(record.DATE_OF_FIRST_EMPLOYMENT);
  sheet.getCell(`J${rowIndex}`).value = formatDate(record.DATE_OF_COMMENCEMENT_CPS);
  sheet.getCell(`K${rowIndex}`).value = record.EMPLOYER_NAME;
  sheet.getCell(`L${rowIndex}`).value = record.EMPLOYER_RCNO;
  sheet.getCell(`M${rowIndex}`).value = record.SECTOR;
  sheet.getCell(`N${rowIndex}`).value = record.SALARY_STRUCTURE;
  sheet.getCell(`O${rowIndex}`).value = record.GRADE_LEVEL;
  sheet.getCell(`P${rowIndex}`).value = record.STEP;
  sheet.getCell(`Q${rowIndex}`).value = record.PFA;
  sheet.getCell(`R${rowIndex}`).value = formatDate(record.DATE_OF_PROGRAMMING);
  sheet.getCell(`S${rowIndex}`).value = record.ACCRUED_RIGHTS;
  sheet.getCell(`T${rowIndex}`).value = record.RSA_BALANCE;
  sheet.getCell(`U${rowIndex}`).value = record.FINAL_SALARY;
  sheet.getCell(`V${rowIndex}`).value = record.REVIEWED_FINAL_SALARY;
  sheet.getCell(`W${rowIndex}`).value = record.LUMPSUM;
  sheet.getCell(`X${rowIndex}`).value = record.PENSION;
  sheet.getCell(`Y${rowIndex}`).value = record.NO_OF_MONTHS_ARREARS;
  sheet.getCell(`Z${rowIndex}`).value = record.PENSION_ARREARS;
  sheet.getCell(`AA${rowIndex}`).value = record.CURRENT_RSA_BALANCE;
  sheet.getCell(`AB${rowIndex}`).value = record.MONTHLY_PENSION;
  sheet.getCell(`AC${rowIndex}`).value = record.ENBLOC_PAYMENT;
  sheet.getCell(`AD${rowIndex}`).value = record.FREQUENCY_OF_PAYMENT;
  sheet.getCell(`AE${rowIndex}`).value = record.NEGOTIATED_MTHS_ARREARS;
  sheet.getCell(`AF${rowIndex}`).value = record.NEGOTIATED_LUMPSUM;
  sheet.getCell(`AG${rowIndex}`).value = formatDate(record.RSA_REGISTRATION_DATE);
  sheet.getCell(`AH${rowIndex}`).value = formatDate(record.ECRS_RECAPTURED_DATE);
  sheet.getCell(`AI${rowIndex}`).value = record.TOTAL_AMOUNT_PFC;
  sheet.getCell(`AJ${rowIndex}`).value = formatDate(record.DATE_OF_REQUEST);
  sheet.getCell(`AK${rowIndex}`).value = formatDate(record.DATE_APPROVED);
  sheet.getCell(`AL${rowIndex}`).value = formatDate(record.DATE_FORWARDED);
  sheet.getCell(`AM${rowIndex}`).value = record.BENEFICIARY_BVN;
  sheet.getCell(`AN${rowIndex}`).value = record.BANK_NAME;
  sheet.getCell(`AO${rowIndex}`).value = record.ACCOUNT_NUMBER;
  sheet.getCell(`AP${rowIndex}`).value = record.SORTCODE;
  sheet.getCell(`AQ${rowIndex}`).value = record.BANK_NAME; // Again? (Col AQ)
  sheet.getCell(`AR${rowIndex}`).value = record.SOURCE_ACCOUNT;
  sheet.getCell(`AS${rowIndex}`).value = record.SOURCE_ACCOUNT_NAME;
  sheet.getCell(`AT${rowIndex}`).value = record.REMARKS;
  // sheet.getRow(rowIndex).font = { name: 'Calibri', size: 10 };
}

/**
 * mapMinPWToEnbloc - Custom mapper for Minimum PW to Enbloc template.
 */
function mapMinPWToEnbloc(record, sheet, rowIndex, sn) {
  sheet.getCell(`A${rowIndex}`).value = sn;
  sheet.getCell(`B${rowIndex}`).value = record.PIN;
  sheet.getCell(`C${rowIndex}`).value = record.SURNAME;
  sheet.getCell(`D${rowIndex}`).value = record.FIRSTNAME;
  sheet.getCell(`E${rowIndex}`).value = record.OTHERNAMES;
  sheet.getCell(`F${rowIndex}`).value = record.GENDER;
  sheet.getCell(`G${rowIndex}`).value = formatDate(record.DATE_OF_BIRTH);
  sheet.getCell(`H${rowIndex}`).value = formatDate(record.DATE_OF_RETIREMENT);
  sheet.getCell(`I${rowIndex}`).value = record.AGE_AT_RETIREMENT;
  sheet.getCell(`J${rowIndex}`).value = record.CURRENT_AGE;
  sheet.getCell(`K${rowIndex}`).value = record.EMPLOYER_NAME;
  sheet.getCell(`L${rowIndex}`).value = record.EMPLOYER_RCNO;
  sheet.getCell(`M${rowIndex}`).value = record.SECTOR;
  sheet.getCell(`N${rowIndex}`).value = record.PFA;
  sheet.getCell(`O${rowIndex}`).value = record.RSA_BALANCE_INITIAL;
  sheet.getCell(`P${rowIndex}`).value = record.FINAL_SALARY_INITIAL;
  sheet.getCell(`Q${rowIndex}`).value = record.LUMPSUM_PAID_INITIAL;
  sheet.getCell(`R${rowIndex}`).value = formatDate(record.DATE_INITIAL_APPROVAL);
  sheet.getCell(`S${rowIndex}`).value = record.CURRENT_RSA_BALANCE;
  sheet.getCell(`T${rowIndex}`).value = record.CURRENT_MONTHLY_PENSION;
  sheet.getCell(`U${rowIndex}`).value = record.FREQUENCY_OF_PAYMENT;
  sheet.getCell(`V${rowIndex}`).value = formatDate(record.RSA_REGISTRATION_DATE);
  sheet.getCell(`W${rowIndex}`).value = formatDate(record.ECRS_RECAPTURED_DATE);
  sheet.getCell(`X${rowIndex}`).value = record.TOTAL_AMOUNT_PFC;
  sheet.getCell(`Y${rowIndex}`).value = formatDate(record.DATE_OF_REQUEST);
  sheet.getCell(`Z${rowIndex}`).value = formatDate(record.DATE_APPROVED);
  sheet.getCell(`AA${rowIndex}`).value = formatDate(record.DATE_FORWARDED);
  sheet.getCell(`AB${rowIndex}`).value = record.BENEFICIARY_BVN;
  sheet.getCell(`AC${rowIndex}`).value = record.BANK_NAME;
  sheet.getCell(`AD${rowIndex}`).value = record.ACCOUNT_NUMBER;
  sheet.getCell(`AE${rowIndex}`).value = record.SORTCODE;
  sheet.getCell(`AF${rowIndex}`).value = record.BANK_NAME; // Again?
  sheet.getCell(`AG${rowIndex}`).value = record.SOURCE_ACCOUNT;
  sheet.getCell(`AH${rowIndex}`).value = record.SOURCE_ACCOUNT_NAME;
  sheet.getCell(`AI${rowIndex}`).value = record.REMARKS;
  // sheet.getRow(rowIndex).font = { name: 'Calibri', size: 10 };
}

module.exports = {
  mapDeathBenefit,
  mapMortgage,
  mapTwentyFivePercent,
  mapProgramWithdrawal,
  mapAVC,
  mapNSITF,
  mapPensionEnhancement,
  mapExhaustedRSA,
  mapMandatoryToVoluntary,
  mapAnnuity,
  mapEnBloc,
  mapMinPWToEnbloc
};
