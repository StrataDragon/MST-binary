import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { initLiveTransactionFeed } from "./lib/events";
import { MachinaPayPrivyProvider } from "./PrivyProvider";

// Initialize live SSE/WebSocket transaction stream
initLiveTransactionFeed();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MachinaPayPrivyProvider>
      <App />
    </MachinaPayPrivyProvider>
  </React.StrictMode>
);