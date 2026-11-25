// jest.setup.js — shared jest setup for the Guardian Angel app.
// The factory only requires a module (jest forbids out-of-scope variables,
// and nativewind's babel plugin rewrites react-native imports).
jest.mock('react-native-safe-area-context', () => require('./jest-safe-area-mock'));
