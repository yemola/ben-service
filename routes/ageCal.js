function calculateAge(dateOfBirth) {
    if (!dateOfBirth) {
        return null;
    }

    // SQL Server dates arrive as Date objects; preserve their UTC calendar date.
    if (dateOfBirth instanceof Date && Number.isNaN(dateOfBirth.getTime())) {
        return null;
    }

    const dateString = (dateOfBirth instanceof Date
        ? dateOfBirth.toISOString()
        : String(dateOfBirth)).slice(0, 10);
    const [birthYear, birthMonth, birthDay] = dateString
        .split("-")
        .map(Number);

    if (!birthYear || !birthMonth || !birthDay) {
        return null;
    }

    const today = new Date();

    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    const currentDay = today.getDate();

    let age = currentYear - birthYear;

    const birthdayHasNotOccurred =
        currentMonth < birthMonth ||
        (currentMonth === birthMonth && currentDay < birthDay);

    if (birthdayHasNotOccurred) {
        age--;
    }

    return age;
}

module.exports = calculateAge;




// function calculateAge(dateOfBirth) {
//     let dob = new Date(dateOfBirth);
//     let today = new Date();

//     let age = today.getFullYear() - dob.getFullYear();

//     // Check if the birthday has not occurred yet this year
//     let monthDiff = today.getMonth() - dob.getMonth();
//     let dayDiff = today.getDate() - dob.getDate();

//     if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
//         age--;
//     }

//     return age;
// }

// module.exports = calculateAge;




