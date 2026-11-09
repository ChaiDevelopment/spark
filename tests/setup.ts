import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// `server-only` throws outside the React Server Components runtime; server
// modules are unit-tested directly here.
vi.mock("server-only", () => ({}));
