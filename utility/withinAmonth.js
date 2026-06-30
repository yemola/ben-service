function isWithin6Months(dateTime) {
    // Parse the provided date and time string into a Date object
    const inputDate = new Date(dateTime);

    // Get the current date and time
    const currentDate = new Date();

    // Calculate the difference in time (in milliseconds) between the two dates
    const timeDifference = currentDate - inputDate;

    // Convert the time difference from milliseconds to days
    const daysDifference = timeDifference / (1000 * 60 * 60 * 24);

    // Check if the difference is less than or equal to 30 days
    return daysDifference <= 90;
}

// Example usage
const exampleDateTime = '2024-08-23T09:21:29.997Z';
const result = isWithin6Months(exampleDateTime);
console.log(result); // Output will be true or false based on the current date

module.exports = isWithin6Months;