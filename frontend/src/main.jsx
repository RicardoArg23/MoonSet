import React from "react";
import ReactDOM from "react-dom/client";
import App from "./v2/App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// PWA: el service worker solo se registra en el build publicado (en desarrollo molestaría con la recarga en caliente).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error) => console.warn("No se pudo registrar el service worker:", error));
  });
}
