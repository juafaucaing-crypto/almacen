// ============================================================
//  ESCÁNER QR
//  Usa la cámara trasera. Si el navegador no deja usar la cámara en
//  directo, se puede hacer una foto de la etiqueta y se lee de la foto.
// ============================================================
(function () {
  const $ = (id) => document.getElementById(id);
  let stream = null, rafId = 0, resolver = null, detector = null;

  const extraerCodigo = (texto) => {
    const m = String(texto || "").toUpperCase().match(/\b(MAT|HER)-\d{4,}\b/);
    return m ? m[0] : null;
  };

  async function decodificar(fuente, w, h) {
    if (detector) {
      try {
        const r = await detector.detect(fuente);
        if (r.length) return r[0].rawValue;
      } catch (e) { /* cae a jsQR */ }
    }
    if (!window.jsQR) return null;
    const c = decodificar.canvas || (decodificar.canvas = document.createElement("canvas"));
    const escala = Math.min(1, 900 / Math.max(w, h));
    c.width = Math.round(w * escala); c.height = Math.round(h * escala);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(fuente, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const r = window.jsQR(img.data, img.width, img.height, { inversionAttempts: "attemptBoth" });
    return r ? r.data : null;
  }

  function terminar(valor) {
    cancelAnimationFrame(rafId);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    $("scanner").hidden = true;
    const r = resolver; resolver = null;
    if (r) r(valor);
  }

  function aceptar(texto) {
    if (!texto) return false;
    const codigo = extraerCodigo(texto);
    if (!codigo) {
      $("scan-hint").textContent = "Este QR no es una etiqueta del almacén";
      return false;
    }
    if (navigator.vibrate) navigator.vibrate(60);
    terminar(codigo);
    return true;
  }

  async function bucle() {
    const v = $("scan-video");
    if (!stream) return;
    if (v.readyState >= 2 && v.videoWidth) {
      const texto = await decodificar(v, v.videoWidth, v.videoHeight);
      if (aceptar(texto)) return;
    }
    rafId = requestAnimationFrame(bucle);
  }

  async function abrir() {
    if (resolver) terminar(null);
    $("scan-hint").textContent = "Apunta al código QR de la etiqueta";
    $("scan-torch").hidden = true;
    $("scanner").hidden = false;
    if ("BarcodeDetector" in window && !detector) {
      try { detector = new window.BarcodeDetector({ formats: ["qr_code"] }); } catch (e) { detector = null; }
    }
    const p = new Promise((res) => (resolver = res));
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      const v = $("scan-video");
      v.srcObject = stream;
      await v.play();
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps.torch) {
        let on = false;
        $("scan-torch").hidden = false;
        $("scan-torch").onclick = () => { on = !on; track.applyConstraints({ advanced: [{ torch: on }] }); };
      }
      bucle();
    } catch (e) {
      $("scan-hint").textContent = "No se puede usar la cámara aquí. Pulsa «Hacer foto» y fotografía la etiqueta.";
    }
    return p;
  }

  $("scan-close").onclick = () => terminar(null);
  $("scan-photo").onchange = async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = "";
    if (!f) return;
    $("scan-hint").textContent = "Leyendo la foto…";
    try {
      const bmp = await createImageBitmap(f);
      const texto = await decodificar(bmp, bmp.width, bmp.height);
      if (!aceptar(texto) && !texto) $("scan-hint").textContent = "No se ha encontrado ningún QR en la foto. Prueba más cerca y con luz.";
    } catch (e) {
      $("scan-hint").textContent = "No se ha podido leer la foto.";
    }
  };

  window.Scanner = { abrir, extraerCodigo };
})();
