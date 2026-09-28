import React from "react";
import { render } from "@testing-library/react";
import { describe, it } from "vitest";
import { MachinaPayPrivyProvider } from "./PrivyProvider";
import App from "./App";

describe("PrivyProvider rendering", () => {
  it("renders without crashing", () => {
    render(
      <MachinaPayPrivyProvider>
        <div>Hello Privy</div>
      </MachinaPayPrivyProvider>
    );
  });

  it("renders App without crashing", () => {
    render(
      <MachinaPayPrivyProvider>
        <App />
      </MachinaPayPrivyProvider>
    );
  });
});
