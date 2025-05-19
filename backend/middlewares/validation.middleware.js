const validator = require('email-validator');
const dns = require('dns');
const { promisify } = require('util');

// Promisify DNS resolver to use with async/await
const resolveMx = promisify(dns.resolveMx);

// Function to check if a domain has valid MX records (indicating it can receive emails)
const hasMxRecords = async (domain) => {
  try {
    const mxRecords = await resolveMx(domain);
    return mxRecords && mxRecords.length > 0;
  } catch (error) {
    // If DNS resolution fails, domain may not exist or doesn't have MX records
    return false;
  }
};

// Middleware to validate email format and existence
exports.validateEmail = async (req, res, next) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }
  
  // Basic format validation using email-validator
  if (!validator.validate(email)) {
    return res.status(400).json({ message: 'Please enter a valid email address' });
  }
  
  // Validate against common disposable email domains
  const disposableDomains = [
    'mailinator.com', 'tempmail.com', 'throwawaymail.com', 'mailcatch.com', 
    'yopmail.com', 'guerrillamail.com', 'sharklasers.com', 'trashmail.com',
    'temp-mail.org', 'fakeinbox.com', 'tempinbox.com', 'temp-mail.ru',
    'dispostable.com', 'mailnesia.com', 'mintemail.com', 'mailinator.net',
    'tempr.email', '10minutemail.com', 'mailforspam.com', 'spamavert.com',
    'tempmail.net', 'getnada.com', 'tempm.com', 'burnermail.io'
  ];
  
  const emailDomain = email.split('@')[1];
  
  if (disposableDomains.includes(emailDomain)) {
    return res.status(400).json({ 
      message: 'Please use a real email address. Disposable or temporary email addresses are not allowed.' 
    });
  }
  
  // Check if the domain actually has MX records (can receive emails)
  try {
    const hasMx = await hasMxRecords(emailDomain);
    if (!hasMx) {
      return res.status(400).json({ 
        message: 'Please use a valid email address with a real email domain.' 
      });
    }
  } catch (error) {
    console.error('MX record validation error:', error);
    // If there's an error in checking MX records, continue with the request
    // We don't want to block users if our validation has an issue
  }
  
  // If all validations pass, proceed to the next middleware
  next();
};

// Middleware to validate required fields for registration
exports.validateRegistration = (req, res, next) => {
  const { name, email, password } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'Name, email and password are required' });
  }
  
  if (password.length < 6) {
    return res.status(400).json({ message: 'Password must be at least 6 characters long' });
  }
  
  next();
};
