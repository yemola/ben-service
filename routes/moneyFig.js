function formatAsCurrency(amountStr) {
    // Convert the string to a number
    const amount = parseFloat(amountStr);

    // Format the number as Nigerian Naira currency
    return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}

module.exports = formatAsCurrency;