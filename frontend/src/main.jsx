import React from "react";
import ReactDOM from "react-dom/client";

// La interfaz nueva (src/v2) es la principal. La anterior sigue disponible en ?clasico.
const clasico = new URLSearchParams(window.location.search).has("clasico");

const cargar = clasico
  ? Promise.all([import("./App.jsx"), import("./estilos.css")]).then(([m]) => m.default)
  : import("./v2/App.jsx").then((m) => m.default);

cargar.then((App) => {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
