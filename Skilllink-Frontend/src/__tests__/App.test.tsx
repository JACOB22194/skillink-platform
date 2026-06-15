import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import App from "../App";

// App already contains BrowserRouter internally — no wrapper needed.
describe("App", () => {
  it("renders without crashing", () => {
    const { container } = render(<App />);
    expect(container).toBeTruthy();
  });
});
