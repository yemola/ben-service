function calculateAge(dateOfBirth) {
    let dob = new Date(dateOfBirth);
    let today = new Date();

    let age = today.getFullYear() - dob.getFullYear();

    // Check if the birthday has not occurred yet this year
    let monthDiff = today.getMonth() - dob.getMonth();
    let dayDiff = today.getDate() - dob.getDate();

    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
        age--;
    }

    return age;
}

module.exports = calculateAge;

// function calculateAge(dateOfBirth) {
//     // Create a Date object from the provided date of birth
//     let dob = new Date(dateOfBirth);

//     // Get today's date
//     let today = new Date();

//     // Calculate the difference in milliseconds between today and the date of birth
//     let diffInMs = today.getTime() - dob.getTime();

//     // Convert the difference in milliseconds to years
//     let ageInYears = Math.floor(diffInMs / (1000 * 60 * 60 * 24 * 365));

//     // Account for leap years (this is not strictly necessary for most cases)
//     let days = Math.floor((diffInMs % (1000 * 60 * 60 * 24 * 365)) / (1000 * 60 * 60 * 24));
//     if (days >= 0 && hasLeapYear(dob.getFullYear() + 1) && !hasLeapYear(today.getFullYear())) {
//         ageInYears--;
//     }

//     return ageInYears;
// }

// // Helper function to check for leap year
// function hasLeapYear(year) {
//     // Return true if the year is a leap year, false otherwise
//     return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
// }


