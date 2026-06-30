function extractOrderNum(filename) {
    const match = filename.match(/^(\d+)_/);
    return match ? parseInt(match[1], 10) : null;
}

module.exports = extractOrderNum;