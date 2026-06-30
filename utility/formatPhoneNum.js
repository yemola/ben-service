function formatPhoneNumber(phoneNumber) {
    if (typeof phoneNumber !== 'string') {
        return null; // Handle invalid input type
    }

    phoneNumber = phoneNumber.trim(); // Remove leading/trailing whitespace

    if (!phoneNumber) {
        return null; // Handle empty string
    }

    if (phoneNumber.startsWith("0")) {
        if (phoneNumber.length === 11) { // Standard Nigerian mobile number length
            return "234" + phoneNumber.slice(1);
        } else {
            return null; // Invalid Nigerian number length
        }
    } else if (phoneNumber.startsWith("+234")) { // Already in international format
        return phoneNumber.slice(1); //Remove the +
    } else if (phoneNumber.length === 10 && phoneNumber.startsWith(("7", "8", "9"))) { //Handles cases where the leading zero is missing.
        return "234" + phoneNumber;
    } else if (phoneNumber.length === 13 && phoneNumber.startsWith("234")) { //Handles cases where the leading zero is missing.
        return phoneNumber;
    } else {
        return null; // Handle other invalid formats
    }
}



module.exports = formatPhoneNumber;
