process.env.TZ = 'Europe/Vienna'; // the puzzle number is a local-date function; pin the zone for the DST cases
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/e2e/', '/tests/', '/web-build/', '/dist/'],
  moduleNameMapper: {
    '^@react-native-async-storage/async-storage$': '@react-native-async-storage/async-storage/jest/async-storage-mock',
  },
};
