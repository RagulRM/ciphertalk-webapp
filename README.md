# CipherTalk

A secure encrypted chat platform with steganography features.

## Features

- 🔐 End-to-end encryption with RSA + AES
- 🖼️ Steganography - hide messages in images
- 👥 User registration and authentication
- 💬 Real-time messaging
- 📱 Responsive design

## Quick Deploy

### Railway (Recommended)
1. Fork this repository
2. Connect to [Railway](https://railway.app)
3. Add environment variable: `MONGODB_URI=your_mongodb_connection_string`
4. Deploy automatically!

### Vercel
1. Fork this repository
2. Connect to [Vercel](https://vercel.com)
3. Add environment variable: `MONGODB_URI=your_mongodb_connection_string`
4. Deploy!

## Environment Variables

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/dbname
```

## Local Development

```bash
npm install
npm start
```

Visit `http://localhost:3000`

## Tech Stack

- Node.js + Express
- MongoDB + Mongoose
- Vanilla JavaScript
- HTML5 + CSS3
- RSA + AES encryption
- Steganography with Canvas API
