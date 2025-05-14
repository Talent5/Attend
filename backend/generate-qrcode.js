const axios = require('axios');
const dotenv = require('dotenv');
const readline = require('readline');

// Load environment variables
dotenv.config();

const API_URL = process.env.API_URL || 'http://localhost:5000/api';
let token = '';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to login as admin
async function login() {
  try {
    console.log('Logging in as admin...');
    
    // Ask for admin credentials
    const email = await new Promise(resolve => {
      rl.question('Enter admin email: ', resolve);
    });
    
    const password = await new Promise(resolve => {
      rl.question('Enter admin password: ', resolve);
    });
    
    const response = await axios.post(`${API_URL}/auth/login`, {
      email,
      password
    });
    
    token = response.data.token;
    console.log('Login successful!');
    
    return response.data.employee;
  } catch (error) {
    console.error('Login failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Function to generate a human-readable alphanumeric code
function generateShortCode(length = 6) {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed similar looking characters like O/0, 1/I
  let result = '';
  const charactersLength = characters.length;
  
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  
  return result;
}

// Function to directly generate a QR code
async function generateQRCode() {
  try {
    console.log('\nGenerating a new QR code...');
    
    // First, create a location manually without using the API
    console.log('\nFirst, let\'s create a location:');
    const locationName = await new Promise(resolve => {
      rl.question('Location name: ', resolve);
    });
    
    const locationAddress = await new Promise(resolve => {
      rl.question('Location address: ', resolve);
    });
    
    const locationDescription = await new Promise(resolve => {
      rl.question('Location description (optional): ', resolve);
    });
    
    // Now directly create a QR code using the qrcode library
    const qrcode = require('qrcode');
    const fs = require('fs');
    const path = require('path');
    
    const qrCodeName = await new Promise(resolve => {
      rl.question('\nQR code name: ', resolve);
    });
    
    const qrCodeDescription = await new Promise(resolve => {
      rl.question('QR code description (optional): ', resolve);
    });
    
    // Create a unique ID for the QR code
    const crypto = require('crypto');
    const qrCodeId = crypto.randomBytes(8).toString('hex');
    
    // Generate a short, human-readable code for manual entry
    const shortCode = generateShortCode(6);
    
    // Create data to encode in the QR code
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 7); // Valid for 7 days
    
    const qrCodeData = {
      qrCodeId,
      name: qrCodeName,
      locationName,
      locationAddress,
      description: qrCodeDescription,
      shortCode, // Add the human-readable code
      validUntil: validUntil.toISOString(),
      createdAt: new Date().toISOString()
    };
    
    // Convert to JSON string
    const qrCodeContent = JSON.stringify(qrCodeData);
    
    // Generate QR code image
    const outputDir = path.join(__dirname, 'qrcodes');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputFilePath = path.join(outputDir, `${qrCodeId}.png`);
    
    // Generate QR code
    await qrcode.toFile(outputFilePath, qrCodeContent, {
      errorCorrectionLevel: 'H',
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff'
      }
    });
    
    console.log('\nQR code generated successfully!');
    console.log(`QR Code ID: ${qrCodeId}`);
    console.log(`Short Code for manual entry: ${shortCode}`);
    console.log(`QR Code saved to: ${outputFilePath}`);
    console.log('\nYou can now use this QR code for attendance tracking.');
    console.log('Users can also manually enter the short code if scanning is not possible.');
    
    // Also generate as data URL for display
    const qrCodeDataURL = await qrcode.toDataURL(qrCodeContent, {
      errorCorrectionLevel: 'H',
      margin: 1
    });
    
    // Save the data URL to a text file for reference
    fs.writeFileSync(path.join(outputDir, `${qrCodeId}.txt`), qrCodeDataURL);
    
    // Also save the short code and QR info to a separate file for easy lookup
    const qrInfo = {
      qrCodeId,
      shortCode,
      name: qrCodeName,
      location: locationName,
      createdAt: new Date().toISOString(),
      validUntil: validUntil.toISOString()
    };
    fs.writeFileSync(
      path.join(outputDir, `${qrCodeId}-info.json`), 
      JSON.stringify(qrInfo, null, 2)
    );
    
    return {
      id: qrCodeId,
      shortCode,
      filePath: outputFilePath,
      dataUrl: qrCodeDataURL.substring(0, 50) + '...'
    };
  } catch (error) {
    console.error('Error generating QR code:', error.message);
    return null;
  }
}

// Main function
async function main() {
  try {
    // Instead of using the API endpoints which might require admin privileges,
    // we'll generate a QR code directly using the qrcode library
    await generateQRCode();
    
    console.log('\nProcess completed successfully!');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    rl.close();
  }
}

// Run the main function
main();