// Netlify serverless function for color extraction
const fetch = require('node-fetch');
const { createCanvas, Image } = require('canvas');

exports.handler = async function(event, context) {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
  
  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }
  
  // For GET requests, extract imageUrl from query parameters
  // For POST requests, extract imageUrl from the request body
  let imageUrl;
  
  if (event.httpMethod === 'GET') {
    imageUrl = event.queryStringParameters?.imageUrl;
  } else if (event.httpMethod === 'POST') {
    try {
      const body = JSON.parse(event.body);
      imageUrl = body.imageUrl;
    } catch (error) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }
  }
  
  // Check if imageUrl is provided
  if (!imageUrl) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Image URL is required' })
    };
  }
  
  try {
    // Fetch the image
    const response = await fetch(imageUrl);
    
    if (!response.ok) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Failed to fetch image' })
      };
    }
    
    const imageBuffer = await response.buffer();
    
    // Process the image
    const img = new Image();
    img.onload = () => {}; // Need this for node-canvas
    
    // Load image from buffer
    img.src = imageBuffer;
    
    // Create canvas and draw image
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    
    // Extract primary color
    const primaryColor = findPrimaryColor(imageData);
    
    // Generate additional color information
    const hexColor = rgbToHex(primaryColor.r, primaryColor.g, primaryColor.b);
    const hslColor = rgbToHsl(primaryColor.r, primaryColor.g, primaryColor.b);
    
    // Return the result
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        imageUrl,
        primaryColor: {
          rgb: `rgb(${primaryColor.r}, ${primaryColor.g}, ${primaryColor.b})`,
          hex: hexColor,
          hsl: `hsl(${hslColor.h}, ${hslColor.s}%, ${hslColor.l}%)`
        }
      })
    };
  } catch (error) {
    console.error('Error processing image:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Error processing image' })
    };
  }
};

// Function to find the primary color from image data
function findPrimaryColor(imageData) {
  // Create a color map to count occurrences of each color
  const colorMap = {};
  
  // Sample pixels (for efficiency, we'll sample every 5th pixel)
  const sampleRate = 5;
  
  for (let i = 0; i < imageData.length; i += 4 * sampleRate) {
    // Get RGB values
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    const a = imageData[i + 3];
    
    // Skip transparent pixels
    if (a < 128) continue;
    
    // Quantize colors slightly to group similar colors
    const quantizedR = Math.round(r / 10) * 10;
    const quantizedG = Math.round(g / 10) * 10;
    const quantizedB = Math.round(b / 10) * 10;
    
    const colorKey = `${quantizedR},${quantizedG},${quantizedB}`;
    
    // Count this color
    if (colorMap[colorKey]) {
      colorMap[colorKey].count++;
      // Store sum for later averaging
      colorMap[colorKey].sumR += r;
      colorMap[colorKey].sumG += g;
      colorMap[colorKey].sumB += b;
    } else {
      colorMap[colorKey] = { 
        count: 1,
        sumR: r,
        sumG: g,
        sumB: b
      };
    }
  }
  
  // Find the most common color
  let maxCount = 0;
  let primaryColor = { r: 0, g: 0, b: 0 };
  
  for (const key in colorMap) {
    if (colorMap[key].count > maxCount) {
      maxCount = colorMap[key].count;
      
      // Use the average color within this quantized bucket
      primaryColor = {
        r: Math.round(colorMap[key].sumR / colorMap[key].count),
        g: Math.round(colorMap[key].sumG / colorMap[key].count),
        b: Math.round(colorMap[key].sumB / colorMap[key].count)
      };
    }
  }
  
  return primaryColor;
}

// Function to convert RGB to HSL
function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  
  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    
    h /= 6;
  }
  
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

// Function to convert RGB to HEX
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}
