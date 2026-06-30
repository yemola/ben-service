function calculateBusinessTime(start, end, options = {}) {
  // Config
  const {
    workdayStart = 8,   // 8:00
    workdayEnd = 17,    // 17:00
    breakHours = [{ start: 12, end: 13 }], // 1-hour lunch by default
    holidays = []       // array of 'YYYY-MM-DD'
  } = options;

  let totalMinutes = 0;
  let current = new Date(start);

  while (current < end) {
    const day = current.getDay(); // 0=Sun, 6=Sat
    const yyyyMMdd = current.toISOString().split("T")[0];

    // Skip weekends & holidays
    if (day !== 0 && day !== 6 && !holidays.includes(yyyyMMdd)) {
      const workStart = new Date(current);
      workStart.setHours(workdayStart, 0, 0, 0);

      const workEnd = new Date(current);
      workEnd.setHours(workdayEnd, 0, 0, 0);

      // Effective start and end for this day
      const effectiveStart = current < workStart ? workStart : current;
      const effectiveEnd = end < workEnd ? end : workEnd;

      if (effectiveStart < effectiveEnd) {
        let minutes = (effectiveEnd - effectiveStart) / (1000 * 60);

        // Subtract breaks (if overlap)
        breakHours.forEach(b => {
          const breakStart = new Date(current);
          breakStart.setHours(b.start, 0, 0, 0);
          const breakEnd = new Date(current);
          breakEnd.setHours(b.end, 0, 0, 0);

          const overlapStart = effectiveStart > breakStart ? effectiveStart : breakStart;
          const overlapEnd = effectiveEnd < breakEnd ? effectiveEnd : breakEnd;

          if (overlapStart < overlapEnd) {
            minutes -= (overlapEnd - overlapStart) / (1000 * 60);
          }
        });

        totalMinutes += minutes;
      }
    }

    // move to next day
    current.setDate(current.getDate() + 1);
    current.setHours(0, 0, 0, 0);
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);

  return { workHours: hours, workMinutes: minutes, totalMinutes };
}

module.exports = calculateBusinessTime;