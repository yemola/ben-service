function formatReviewHistory(reviews) {
  const formatted = reviews.map((entry, index, arr) => {
    const currentDate = new Date(entry.review_date);
    const formattedDate = currentDate.toLocaleString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    let timeSpent = null;

    if (index > 0) {
      const prevDate = new Date(arr[index - 1].review_date);
      const diffMs = currentDate.getTime() - prevDate.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);

      const days = Math.floor(diffMinutes / 1440);
      const hours = Math.floor((diffMinutes % 1440) / 60);
      const minutes = diffMinutes % 60;

      const parts = [];
      if (days > 0) parts.push(`${days}d`);
      if (hours > 0) parts.push(`${hours}h`);
      if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

      timeSpent = parts.join(" ");
    }

    return {
      review_date: formattedDate,
      prev_reviewer: entry.prev_reviewer,
      comment: entry.comment,
      time_spent: timeSpent,
    };
  });

  return formatted;
}


module.exports = formatReviewHistory;