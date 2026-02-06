/**
 * Vitest Test Setup
 *
 * This file configures the testing environment for Vitest and React Testing Library.
 * It includes global mocks, custom matchers, and test utilities.
 */

import { vi } from 'vitest';
import '@testing-library/jest-dom/vitest';

// SECTION: Global Test Configuration

// Set default timeout for all tests
vi.setConfig({
  testTimeout: 10000,
});

// SECTION: Mock Global APIs

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock window.ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
});

// SECTION: Mock Scroll Elements

// Mock scrollTo function
Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: vi.fn(),
});

// SECTION: Mock LocalStorage and SessionStorage

const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  clear: vi.fn(),
  removeItem: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  writable: true,
  value: localStorageMock,
});

const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  clear: vi.fn(),
  removeItem: vi.fn(),
};

Object.defineProperty(window, 'sessionStorage', {
  writable: true,
  value: sessionStorageMock,
});

// SECTION: Mock IntersectionObserver

class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
});

// SECTION: Cleanup After Each Test

vi.afterEach(() => {
  // Clear all mocks after each test
  vi.clearAllMocks();
  
  // Reset any mocked implementations
  vi.resetAllMocks();
});

// SECTION: Custom Test Utilities

/**
 * Creates a mock function that can be used in tests
 */
export const createMockFn = () => vi.fn();

/**
 * Mock implementation for async operations
 */
export const mockAsyncOperation = <T>(data: T, delay: number = 100): Promise<T> => {
  return new Promise((resolve) => {
    setTimeout(() => resolve(data), delay);
  });
};

/**
 * Wait for a specified amount of time
 */
export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Generate a unique ID for test isolation
 */
export const generateTestId = (prefix: string = 'test'): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};
