function normalizePin(pin) {
    const normalized = pin.trim();
  
    const startsWithValidPrefix = /^(0|\+?234|20|pen)/i.test(normalized);
  
    if (!startsWithValidPrefix) {
      return 'PEN' + normalized;
    }
  
    return normalized;
  }
  

  module.exports = normalizePin;