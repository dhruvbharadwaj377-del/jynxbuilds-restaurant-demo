import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import MotionController from "./components/MotionController.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
    <MotionController />
  </StrictMode>
);
