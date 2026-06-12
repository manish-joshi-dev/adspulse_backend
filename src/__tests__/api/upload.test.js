const request = require('supertest');
const app = require('../../../app').default; // Adjust path as needed
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../../models/User.model');
const { config } = require('../../config/env');
const path = require('path');
const fs = require('fs');

describe('Upload API', () => {
  let token; // For authenticated requests
  let userId; // For authenticated requests

  beforeEach(async () => {
    // Create a user and get a token for authenticated tests
    const user = await User.create({ email: 'test@example.com', password: 'password123', name: 'Test User' });
    userId = user._id;
    token = jwt.sign({ userId: user._id }, config.jwtSecret, { expiresIn: '1h' });

    // Ensure uploads directory exists
    const uploadsDir = path.resolve(__dirname, '../../../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir);
    }
  });

  test('POST /api/upload without auth should return 401', async () => {
    await request(app)
      .post('/api/upload')
      .expect(401);
  });

  test('POST /api/upload without file should return 400', async () => {
    await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  test('POST /api/upload with non-CSV file should return 400', async () => {
    const filePath = path.join(__dirname, '../test_files/test.txt');
    fs.writeFileSync(filePath, 'not a csv');

    await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', filePath)
      .expect(400)
      .then(() => fs.unlinkSync(filePath)); // Clean up
  });

  test('POST /api/upload with valid CSV file and auth should return 200 with jobId', async () => {
    const filePath = path.join(__dirname, '../test_files/valid.csv');
    fs.writeFileSync(filePath, 'Day,Campaign,Clicks\n2024-01-01,Test Campaign,10');

    await request(app)
      .post('/api/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', filePath)
      .expect(200)
      .then(response => {
        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('jobId');
        fs.unlinkSync(filePath); // Clean up
      });
  });
});
