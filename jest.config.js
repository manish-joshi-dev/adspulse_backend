module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.js'] // Changed from setupFilesAfterFramework
};
