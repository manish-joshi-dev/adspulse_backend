import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { BullMQ } from 'bullmq';
import { GoogleGenerativeAI } from '@google/generative-ai';

let mongoServer;

// Mock BullMQ
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
  })),
  Worker: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    close: jest.fn(),
  })),
}));

// Mock Gemini API
jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: { text: () => JSON.stringify([{
          priority: 'medium',
          category: 'bidding',
          title: 'Sample Rec',
          description: 'Sample description',
          expectedImpact: 'Sample impact',
          actionSteps: ['Step 1'],
          relatedFlags: []
        }]) }
      }),
    }),
  })),
}));

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  process.env.MONGODB_URI = mongoUri; // Set for mongoose connection
  await mongoose.connect(mongoUri);
});

beforeEach(async () => {
  // Clean all collections before each test
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
  jest.clearAllMocks();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});
