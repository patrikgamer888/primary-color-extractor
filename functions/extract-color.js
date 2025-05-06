// Netlify serverless function for color extraction
const fetch = require('node-fetch');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

exports.handler = async function (event, context) {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // Handle pre‑flight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // GET → query string | POST → JSON body
  let imageUrl;
  if (event.httpMethod === 'GET') {
    imageUrl = event.queryStringParameters?.imageUrl;
  } else if (event.httpMethod === 'POST') {
    try {
      imageUrl = JSON.parse(event.body).imageUrl;
    } catch {
      return { statusCode: 400, headers, body: 'Invalid JSON' };
    }
  }

  if (!imageUrl) {
    return { statusCode: 400, headers, body: 'imageUrl is required' };
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error(`Fetch failed: ${response.statusText}`);
    const imageBuffer = await response.buffer();

    // Decode and draw the image
    const img = await loadImage(imageBuffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);

    // Get pixel data
    const { data } = ctx.getImageData(0, 0, img.width, img.height);

    // Build a colour map
    const colorMap = {};
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      // Ignore fully transparent pixels
      if (a === 0) continue;

      const key = `${r},${g},${b}`;
      if (!colorMap[key]) {
        colorMap[key] = { count: 0, sumR: 0, sumG: 0, sumB: 0 };
      }
      colorMap[key].count++;
      colorMap[key].sumR += r;
      colorMap[key].sumG += g;
      colorMap[key].sumB += b;
    }

    // Pick the most frequent colour
    let primaryColor = { r: 0, g: 0, b: 0, count: 0 };
    for (const key in colorMap) {
      if (colorMap[key].count > primaryColor.count) {
        primaryColor = {
          count: colorMap[key].count,
          r: Math.round(colorMap[key].sumR / colorMap[key].count),
          g: Math.round(colorMap[key].sumG / colorMap[key].count),
          b: Math.round(colorMap[key].sumB / colorMap[key].count),
        };
      }
    }

    const { h, s, l } = rgbToHsl(
      primaryColor.r,
      primaryColor.g,
      primaryColor.b
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        rgb: primaryColor,
        hex: rgbToHex(primaryColor.r, primaryColor.g, primaryColor.b),
        hsl: { h, s, l },
      }),
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ message: err.message }),
    };
  }
};

// ---------- helpers ----------

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h, s, l;
  l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function rgbToHex(r, g, b) {
  return (
    '#' +
    [r, g, b]
      .map((x) => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      })
      .join('')
  );
}
