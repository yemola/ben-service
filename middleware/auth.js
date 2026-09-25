const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  
  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'Access Denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1]; // Format is "Bearer <token>"

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access Denied. Invalid token format.' });
  }

  try {
    const verified = jwt.verify(token, process.env.JWT_SEC);
    if (verified.account_type === 'pmi' || verified.purpose === 'pmi-password') {
      return res.status(403).json({ message: 'This endpoint requires a staff session.' });
    }
    req.user = verified; // Attach user info to the request
    next(); // Move to the next middleware or route handler
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Invalid or expired token.' });
  }
};

module.exports = verifyToken;
