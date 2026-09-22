export default {
  testEnvironment: 'node',
  transform: {},
  moduleNameMapper: {
    '^#common/(.*)$': '<rootDir>/src/common/$1',
    '^#configs/(.*)$': '<rootDir>/src/common/$1',
    '^#constants/(.*)$': '<rootDir>/src/common/constants/$1',
    '^#controllers/(.*)$': '<rootDir>/src/controllers/$1',
    '^#models/(.*)$': '<rootDir>/src/models/$1',
    '^#repositories/(.*)$': '<rootDir>/src/repositories/$1',
    '^#routers/(.*)$': '<rootDir>/src/routers/$1',
    '^#schemas/(.*)$': '<rootDir>/src/schemas/$1',
    '^#service/(.*)$': '<rootDir>/src/services/$1',
  },
  testMatch: ['**/test/**/*.test.js'],
};
