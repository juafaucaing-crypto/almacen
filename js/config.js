// ============================================================
//  CONFIGURACIÓN DE LA APP
// ============================================================
// Mientras SERVIDOR_URL esté vacío, la app funciona en MODO DEMO:
// carga los datos importados del Excel (data/seed.json) y guarda los
// cambios solo en este dispositivo.
//
// Para usarla de verdad (datos compartidos en la hoja de Google del almacén),
// pega aquí la dirección de la aplicación web del servidor del almacén
// (servidor/Code.gs, ver README.md → «Poner en marcha»).
window.APP_CONFIG = {
  SERVIDOR_URL: "https://script.google.com/macros/s/AKfycbxIvd0RV-zrFOyPYXQ7SssvhEi9xEYvxTL-ng0LSH8D0l1ZCcBQIQVlDjXkPB3y3_-6/exec",

  // Servidor de usuarios de la app de Partes LAV: se entra con el mismo correo y PIN.
  PARTES_URL: "https://script.google.com/macros/s/AKfycby7EzTsuZ0q8pitvVX2zFh8SpK-s2WR1qSn2XktoH7-M5vKoi2-5u-SthXn2F-Es2yu/exec",
  // App de partes, para registrarse o recuperar el PIN.
  PARTES_APP: "https://mant-ute-lav-este.github.io/partes-lav/",

  // Dirección pública donde publiques la app (p. ej. https://mant-ute-lav-este.github.io/almacen/).
  // Si se rellena, los QR llevan un enlace directo: al escanearlos con la cámara
  // normal del móvil se abre la ficha del material. Si se deja vacío, el QR solo
  // contiene el código (MAT-0001) y se lee desde el escáner de la app.
  APP_URL: "",

  NOMBRE_ALMACEN: "Almacén UTE",
};
