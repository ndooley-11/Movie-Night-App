import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

// Opened from the iPhone home screen: see "Home-screen fit" in styles.css.
if (window.navigator.standalone === true || window.matchMedia?.("(display-mode: standalone)").matches) {
  document.documentElement.classList.add("standalone");
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
