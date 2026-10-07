// ============================================================
//  APP ALMACÉN UTE — interfaz
// ============================================================
(function () {
  const S = window.Store, CFG = window.APP_CONFIG || {}, { norm, hoy } = window.Util;
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const view = $("#view");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmt = (n) => Number(n || 0).toLocaleString("es-ES", { maximumFractionDigits: 2 });
  const fFecha = (iso) => iso ? iso.split("-").reverse().join("/") : "—";
  const ubic = (m) => [m.ubicacion, m.estante].filter(Boolean).map(limpiaPref).join(" · ") || "Sin ubicación";
  function limpiaPref(s) { return String(s).replace(/^\d+_/, ""); }

  function toast(msg, tipo = "") {
    const t = $("#toast");
    t.textContent = msg; t.className = "toast show " + tipo;
    clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = "toast"), 2800);
  }

  // confirmación dentro de la página (no depende de window.confirm)
  function confirmar(msg, si = "Aceptar") {
    return new Promise((res) => {
      $("#modal-msg").textContent = msg; $("#modal-si").textContent = si; $("#modal").hidden = false;
      const fin = (v) => { $("#modal").hidden = true; res(v); };
      $("#modal-si").onclick = () => fin(true); $("#modal-no").onclick = () => fin(false);
      $("#modal-si").focus();
    });
  }

  function nivelStock(m) {
    if (m.stock < 0) return "neg";
    if (m.stock === 0) return "cero";
    if (m.stock_minimo != null && m.stock_minimo !== "" && m.stock <= Number(m.stock_minimo)) return "bajo";
    return "ok";
  }
  const stockPill = (m) => `<span class="stock ${nivelStock(m)}"><b>${fmt(m.stock)}</b> ${esc(m.unidad || "")}</span>`;

  function qrTexto(codigo) {
    return CFG.APP_URL ? `${CFG.APP_URL.replace(/#.*$/, "")}#/m/${codigo}` : codigo;
  }
  function qrSvg(codigo, celda = 4) {
    if (!window.qrcode) return `<div class="qr-fallback">${esc(codigo)}</div>`;
    const q = window.qrcode(0, "M");
    q.addData(qrTexto(codigo)); q.make();
    return q.createSvgTag({ cellSize: celda, margin: 2, scalable: true });
  }

  // ---------------------------------------------------------- RUTAS
  const rutas = {
    "": vInicio, buscar: vBuscar, escanear: vEscanear, m: vFicha, movimiento: vMovimiento,
    movimientos: vHistorial, etiquetas: vEtiquetas, nuevo: vNuevo, editar: vEditar,
    alertas: vAlertas, mas: vMas, login: vLogin, instaladas: vInstaladas,
  };

  function parseHash() {
    const h = location.hash.replace(/^#\/?/, "");
    const [ruta, qs] = h.split("?");
    const partes = ruta.split("/").map(decodeURIComponent);
    return { nombre: partes[0] || "", arg: partes[1], q: new URLSearchParams(qs || "") };
  }

  async function render() {
    const r = parseHash();
    if (S.needsLogin() && r.nombre !== "login") { location.replace("#/login"); return; }
    const fn = rutas[r.nombre] || vInicio;
    $("#btn-back").hidden = ["", "buscar", "escanear", "movimiento", "mas", "login"].includes(r.nombre);
    $$("#tabbar a").forEach((a) => a.classList.toggle("on", a.dataset.tab === (r.nombre || "home")));
    $("#tabbar").hidden = r.nombre === "login";
    window.scrollTo(0, 0);
    try { await fn(r); } catch (e) { console.error(e); view.innerHTML = `<div class="card error">Error: ${esc(e.message || e)}</div>`; }
  }
  const titulo = (t) => { $("#title").textContent = t; document.title = t + " · " + (CFG.NOMBRE_ALMACEN || "Almacén"); };

  // ---------------------------------------------------------- INICIO
  async function vInicio() {
    titulo(CFG.NOMBRE_ALMACEN || "Almacén UTE");
    const mats = S.materiales();
    const conStock = mats.filter((m) => m.stock > 0).length;
    const alertas = mats.filter((m) => ["bajo", "neg"].includes(nivelStock(m))).length;
    const ult = await S.movimientos({ limit: 6 });
    view.innerHTML = `
      <section class="hero">
        <button class="hero-scan" id="go-scan">
          <svg viewBox="0 0 24 24"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/></svg>
          <span><b>Escanear QR</b><small>Identifica el material de la etiqueta</small></span>
        </button>
        <form class="search-big" id="f-buscar" role="search">
          <input type="search" name="q" placeholder="Buscar material, código, estante…" autocomplete="off" enterkeyhint="search">
        </form>
        <div class="quick">
          <a class="btn in" href="#/movimiento?tipo=Entrada">+ Entrada</a>
          <a class="btn out" href="#/movimiento?tipo=Salida">− Salida</a>
        </div>
      </section>
      <section class="stats">
        <a href="#/buscar"><b>${mats.length}</b><span>referencias</span></a>
        <a href="#/buscar?f=stock"><b>${conStock}</b><span>con stock</span></a>
        <a href="#/alertas" class="${alertas ? "warn" : ""}"><b>${alertas}</b><span>alertas</span></a>
      </section>
      <h2 class="sec">Últimos movimientos <a href="#/movimientos">Ver todos</a></h2>
      <div class="list">${ult.map((v) => filaMov(v)).join("") || '<p class="empty">Sin movimientos</p>'}</div>`;
    $("#go-scan").onclick = escanearYAbrir;
    $("#f-buscar").onsubmit = (e) => { e.preventDefault(); location.hash = "#/buscar?q=" + encodeURIComponent(e.target.q.value); };
  }

  function destinoTxt(v) {
    return [v.linea && "L" + v.linea, v.via, v.pk_ini && "PK " + v.pk_ini + (v.pk_fin ? "–" + v.pk_fin : ""), v.dependencia].filter(Boolean).join(" · ");
  }

  function filaMov(v, conMaterial = true) {
    const m = S.material(v.codigo) || { detalle: v.codigo, unidad: "" };
    const destino = [v.linea && "L" + v.linea, v.via, v.pk_ini && "PK " + v.pk_ini + (v.pk_fin ? "–" + v.pk_fin : ""), v.dependencia].filter(Boolean).join(" · ");
    return `<a class="mov ${v.cantidad > 0 ? "in" : "out"}" href="#/m/${encodeURIComponent(v.codigo)}">
      <span class="qty">${v.cantidad > 0 ? "+" : ""}${fmt(v.cantidad)}</span>
      <span class="txt">${conMaterial ? `<b>${esc(m.detalle)}</b>` : ""}
        <small>${fFecha(v.fecha)}${v.albaran ? " · Alb. " + esc(v.albaran) : ""}${destino ? " · " + esc(destino) : ""}</small>
        ${v.observaciones ? `<small class="obs">${esc(v.observaciones)}</small>` : ""}
      </span></a>`;
  }

  // ---------------------------------------------------------- BUSCAR
  function buscar(q, { filtro = "", ubicacion = "" } = {}) {
    const toks = norm(q).split(" ").filter(Boolean);
    let res = S.materiales().filter((m) => toks.every((t) => m._q.includes(t)));
    if (filtro === "stock") res = res.filter((m) => m.stock > 0);
    if (filtro === "herr") res = res.filter((m) => m.tipo === "herramienta");
    if (ubicacion) res = res.filter((m) => m.ubicacion === ubicacion);
    const nq = norm(q);
    return res.sort((a, b) =>
      (b.codigo.toLowerCase() === nq) - (a.codigo.toLowerCase() === nq) ||
      (norm(b.detalle).startsWith(nq)) - (norm(a.detalle).startsWith(nq)) ||
      (b.stock > 0) - (a.stock > 0) ||
      a.detalle.localeCompare(b.detalle, "es"));
  }

  function tarjetaMat(m) {
    return `<a class="mat" href="#/m/${encodeURIComponent(m.codigo)}">
      <span class="txt"><b>${esc(m.detalle)}</b>
      <small><span class="loc">${esc(ubic(m))}</span> · ${esc(m.codigo)}${m.tipo === "herramienta" ? " · Herramienta" : ""}</small></span>
      ${stockPill(m)}</a>`;
  }

  async function vBuscar(r) {
    titulo("Buscar material");
    const s = S.sugerencias();
    const est = { q: r.q.get("q") || "", filtro: r.q.get("f") || "", ubicacion: "", n: 60 };
    view.innerHTML = `
      <div class="sticky-search">
        <input type="search" id="q" value="${esc(est.q)}" placeholder="Ej.: placa getzner, brida, ED7B, MAT-0123" autocomplete="off" enterkeyhint="search">
        <div class="chips" id="chips">
          <button data-f="">Todos</button><button data-f="stock">Con stock</button><button data-f="herr">Herramientas</button>
          <select id="ubi"><option value="">Todas las ubicaciones</option>${s.ubicaciones.map((u) => `<option value="${esc(u)}">${esc(limpiaPref(u))}</option>`).join("")}</select>
        </div>
      </div>
      <p class="count" id="count"></p>
      <div class="list" id="res"></div>`;
    const pintar = () => {
      const res = buscar(est.q, est);
      $("#count").textContent = `${res.length} resultado${res.length === 1 ? "" : "s"}`;
      $("#res").innerHTML = res.slice(0, est.n).map(tarjetaMat).join("") +
        (res.length > est.n ? `<button class="btn ghost wide" id="mas">Mostrar más (${res.length - est.n})</button>` : "") +
        (!res.length ? `<p class="empty">No hay coincidencias.<br><a href="#/nuevo?detalle=${encodeURIComponent(est.q)}">Dar de alta «${esc(est.q)}»</a></p>` : "");
      const b = $("#mas"); if (b) b.onclick = () => { est.n += 100; pintar(); };
      $$("#chips button").forEach((b) => b.classList.toggle("on", b.dataset.f === est.filtro));
    };
    $("#q").oninput = (e) => { est.q = e.target.value; est.n = 60; pintar(); history.replaceState(null, "", "#/buscar?q=" + encodeURIComponent(est.q) + (est.filtro ? "&f=" + est.filtro : "")); };
    $$("#chips button").forEach((b) => (b.onclick = () => { est.filtro = b.dataset.f; pintar(); }));
    $("#ubi").onchange = (e) => { est.ubicacion = e.target.value; pintar(); };
    pintar();
    if (!est.q) $("#q").focus();
  }

  // ---------------------------------------------------------- ESCANEAR
  async function escanearYAbrir() {
    const codigo = await window.Scanner.abrir();
    if (!codigo) { if (parseHash().nombre === "escanear") history.back(); return; }
    if (!S.material(codigo)) { toast(`El código ${codigo} no existe en el almacén`, "err"); return; }
    location.hash = "#/m/" + codigo;
  }
  async function vEscanear() {
    titulo("Escanear");
    view.innerHTML = `<div class="card center"><p>Abriendo la cámara…</p><button class="btn" id="re">Volver a escanear</button></div>`;
    $("#re").onclick = escanearYAbrir;
    escanearYAbrir();
  }

  // ---------------------------------------------------------- FICHA
  async function vFicha(r) {
    const m = S.material(r.arg);
    if (!m) { titulo("No encontrado"); view.innerHTML = `<div class="card">No existe ningún material con código <b>${esc(r.arg)}</b>.</div>`; return; }
    titulo(m.codigo);
    const movs = await S.movimientos({ codigo: m.codigo, limit: 300 });
    const entradas = movs.filter((v) => v.cantidad > 0).reduce((a, v) => a + Number(v.cantidad), 0);
    const salidas = movs.filter((v) => v.cantidad < 0).reduce((a, v) => a + Number(v.cantidad), 0);
    view.innerHTML = `
      <article class="ficha">
        <p class="cod">${esc(m.codigo)} ${m.tipo === "herramienta" ? '<span class="tag">Herramienta</span>' : ""} ${m.revisar ? '<span class="tag warn">Revisar ficha</span>' : ""}</p>
        <h2>${esc(m.detalle)}</h2>
        ${m.descripcion && m.descripcion !== m.detalle ? `<p class="desc">${esc(m.descripcion)}</p>` : ""}
        <div class="big2">
          <div class="where"><small>Ubicación</small><b>${esc(limpiaPref(m.ubicacion || "—"))}</b><span>${esc(m.estante ? "Estante " + limpiaPref(m.estante) : "Sin estante")}</span></div>
          <div class="howmuch ${nivelStock(m)}"><small>Stock actual</small><b>${fmt(m.stock)}</b><span>${esc(m.unidad || "")}${m.stock_minimo ? " · mín. " + fmt(m.stock_minimo) : ""}</span></div>
        </div>
        ${m.tipo === "herramienta" && m.stock_inicial ? `<p class="note">Dotación total: ${fmt(m.stock_inicial)} · en almacén: ${fmt(m.stock)} · instaladas en vía: ${fmt(m.instaladas)}</p>` : ""}
        <dl class="meta">
          <div><dt>Categoría</dt><dd>${esc(m.categoria || "—")}</dd></div>
          <div><dt>Estado</dt><dd>${esc(m.estado || "—")}</dd></div>
          <div><dt>Entradas</dt><dd>+${fmt(entradas)}</dd></div>
          <div><dt>Salidas</dt><dd>${fmt(salidas)}</dd></div>
        </dl>
        <div class="actions">
          <a class="btn in" href="#/movimiento?tipo=Entrada&c=${encodeURIComponent(m.codigo)}">+ Entrada</a>
          <a class="btn out" href="#/movimiento?tipo=Salida&c=${encodeURIComponent(m.codigo)}">− Salida</a>
        </div>
        <div class="actions sec2">
          <a class="btn ghost" href="#/editar/${encodeURIComponent(m.codigo)}">Editar ficha</a>
          <button class="btn ghost" id="ver-qr">Etiqueta QR</button>
        </div>
        <div class="qrbox" id="qrbox" hidden>
          ${qrSvg(m.codigo)}
          <p>${esc(m.codigo)}</p>
          <a class="btn ghost" href="#/etiquetas?c=${encodeURIComponent(m.codigo)}">Imprimir etiqueta</a>
        </div>
      </article>
      ${m.tipo === "herramienta" ? `
      <h2 class="sec">Instaladas en vía (${fmt(m.instaladas)})</h2>
      <div class="list">${m.lineas_instaladas.map(filaInstalada).join("") || '<p class="empty">Ninguna: todas en el almacén</p>'}</div>
      ${m.instaladas ? `<a class="btn in wide" href="#/movimiento?tipo=Entrada&c=${encodeURIComponent(m.codigo)}">Registrar devolución</a>` : ""}` : ""}
      <h2 class="sec">Movimientos (${movs.length})</h2>
      <div class="list">${movs.map((v) => filaMov(v, false)).join("") || '<p class="empty">Sin movimientos</p>'}</div>`;
    $("#ver-qr").onclick = () => ($("#qrbox").hidden = !$("#qrbox").hidden);
  }

  function filaInstalada(l, conMaterial) {
    const m = S.material(l.codigo);
    return `<a class="mov out" href="#/movimiento?tipo=Entrada&c=${encodeURIComponent(l.codigo)}">
      <span class="qty">${fmt(l.pendiente)}</span>
      <span class="txt">${conMaterial === true ? `<b>${esc(m.detalle)}</b>` : ""}<b class="${conMaterial === true ? "sub" : ""}">${esc(destinoTxt(l) || "Sin ubicación en vía")}</b>
        <small>Desde ${fFecha(l.fecha)}${l.albaran ? " · Alb. " + esc(l.albaran) : ""}${l.observaciones ? " · " + esc(l.observaciones) : ""}</small></span></a>`;
  }

  // ---------------------------------------------------------- HERRAMIENTAS INSTALADAS
  async function vInstaladas() {
    titulo("Herramientas en vía");
    const hs = S.materiales().filter((m) => m.tipo === "herramienta" && m.instaladas > 0)
      .sort((a, b) => a.detalle.localeCompare(b.detalle, "es"));
    const total = hs.reduce((a, m) => a + m.instaladas, 0);
    view.innerHTML = `<p class="count">${fmt(total)} unidades instaladas de ${hs.length} herramientas. Toca una línea para registrar su devolución.</p>` +
      hs.map((m) => `<h2 class="sec"><span>${esc(m.detalle)}</span><a href="#/m/${encodeURIComponent(m.codigo)}">Ficha</a></h2>
        <div class="list">${m.lineas_instaladas.map((l) => filaInstalada(l)).join("")}</div>`).join("") +
      (hs.length ? "" : '<p class="empty">No hay herramientas instaladas en vía.</p>');
  }

  // ---------------------------------------------------------- SELECTOR DE MATERIAL
  // opciones.filtro(m): qué materiales se pueden elegir; opciones.extra(): botón/lista adicional
  function selectorMaterial(contenedor, alElegir, opciones = {}) {
    contenedor.innerHTML = `
      <div class="picker">
        <div class="picker-row">
          <input type="search" placeholder="Buscar material…" autocomplete="off" class="pk-in">
          <button type="button" class="btn icon pk-scan" aria-label="Escanear QR">
            <svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
        <div class="pk-extra"></div>
        <div class="pk-list"></div>
      </div>`;
    const inp = $(".pk-in", contenedor), lista = $(".pk-list", contenedor), extra = $(".pk-extra", contenedor);
    const fila = (m) => `<button type="button" data-c="${esc(m.codigo)}"><span><b>${esc(m.detalle)}</b><small>${esc(ubic(m))} · ${esc(m.codigo)}${m.instaladas ? ` · <span class="inst">${fmt(m.instaladas)} instalada${m.instaladas === 1 ? "" : "s"}</span>` : ""}</small></span>${stockPill(m)}</button>`;
    const pintarExtra = () => {
      const ex = opciones.extra ? opciones.extra() : null;
      extra.innerHTML = ex ? `<button type="button" class="btn ghost wide pk-ex">${esc(ex.texto)}</button>` : "";
      if (ex) $(".pk-ex", extra).onclick = () => { inp.value = ""; lista.innerHTML = ex.lista.map(fila).join("") || '<p class="empty">Ninguna</p>'; };
    };
    const pintar = () => {
      const q = inp.value.trim();
      pintarExtra();
      if (!q) { lista.innerHTML = ""; return; }
      const filtro = opciones.filtro || (() => true);
      const todos = buscar(q), validos = todos.filter(filtro);
      const ocultos = todos.length - validos.length;
      lista.innerHTML = validos.slice(0, 8).map(fila).join("") +
        (ocultos && opciones.motivoOculto ? `<p class="note">${ocultos} ${opciones.motivoOculto}</p>` : "") +
        (validos.length ? "" : `<p class="empty">Sin resultados${todos.length ? "" : ` · <a href="#/nuevo?detalle=${encodeURIComponent(q)}">dar de alta</a>`}</p>`);
    };
    inp.oninput = pintar;
    lista.onclick = (e) => { const b = e.target.closest("button[data-c]"); if (b) { inp.value = ""; lista.innerHTML = ""; alElegir(b.dataset.c); } };
    $(".pk-scan", contenedor).onclick = async () => {
      const c = await window.Scanner.abrir();
      if (!c) return;
      if (!S.material(c)) { toast(`El código ${c} no existe`, "err"); return; }
      alElegir(c);
    };
    pintarExtra();
    return { foco: () => inp.focus(), refrescar: () => { lista.innerHTML = ""; inp.value = ""; pintarExtra(); } };
  }

  // ---------------------------------------------------------- MOVIMIENTO (ALBARÁN)
  async function vMovimiento(r) {
    let tipo = r.q.get("tipo") === "Entrada" ? "Entrada" : "Salida";
    titulo("Entrada / Salida");
    const s = S.sugerencias();
    const lineas = [];
    const dl = (id, arr) => `<datalist id="${id}">${arr.map((v) => `<option value="${esc(v)}">`).join("")}</datalist>`;
    view.innerHTML = `
      <form id="fm" class="form" autocomplete="off">
        <div class="seg" id="seg">
          <button type="button" data-t="Entrada" class="in">+ Entrada</button>
          <button type="button" data-t="Salida" class="out">− Salida</button>
        </div>

        <fieldset>
          <legend>Material</legend>
          <div id="lineas" class="lineas"></div>
          <div id="actual" class="actual" hidden></div>
          <div id="picker"></div>
        </fieldset>

        <fieldset>
          <legend>Albarán</legend>
          <div class="grid2">
            <label>Nº albarán<input name="albaran" inputmode="numeric" value="${esc(await S.siguienteAlbaran())}"></label>
            <label>Fecha<input name="fecha" type="date" value="${hoy()}" required></label>
          </div>
        </fieldset>

        <fieldset>
          <legend id="lg-dest">Destino en vía</legend>
          <div class="grid2">
            <label>Línea<input name="linea" list="dl-linea" inputmode="numeric" placeholder="040"></label>
            <label>Vía<input name="via" list="dl-via" placeholder="V1"></label>
            <label>PK inicio<input name="pk_ini" inputmode="numeric" placeholder="308368"></label>
            <label>PK fin<input name="pk_fin" inputmode="numeric"></label>
          </div>
          <label>Dependencia<input name="dependencia" list="dl-dep" placeholder="BM RQU, S2 ALG2…"></label>
          <label>SIOS<input name="sios" inputmode="numeric"></label>
          <label>Observaciones<textarea name="observaciones" rows="2"></textarea></label>
        </fieldset>
        ${dl("dl-linea", s.lineas)}${dl("dl-via", s.vias)}${dl("dl-dep", s.dependencias)}

        <div class="savebar">
          <button type="submit" class="btn wide" id="guardar">Guardar</button>
        </div>
      </form>`;

    let actual = null; // material elegido pendiente de añadir
    let entradaNueva = false; // herramienta: entrada nueva (compra) en vez de devolución
    const esDevolucion = () => tipo === "Entrada" && actual && S.material(actual).tipo === "herramienta" && !entradaNueva;
    const pintarTipo = () => {
      $$("#seg button").forEach((b) => b.classList.toggle("on", b.dataset.t === tipo));
      $("#fm").dataset.tipo = tipo;
      $("#lg-dest").textContent = tipo === "Salida" ? "Destino en vía" : "Procedencia (opcional)";
      if (tipo === "Salida") {
        const n = lineas.length;
        for (let i = lineas.length - 1; i >= 0; i--) if (lineas[i].origen) lineas.splice(i, 1);
        if (n !== lineas.length) toast("Se han quitado las devoluciones de herramientas", "");
      }
      if (typeof picker !== "undefined") picker.refrescar();
      pintarLineas(); pintarActual();
    };
    const yaEnAlbaran = (id) => lineas.some((l) => l.origen && l.origen.id === id);
    const pintarDevolucion = (m) => {
      const box = $("#actual");
      const ls = m.lineas_instaladas.filter((l) => !yaEnAlbaran(l.id));
      box.innerHTML = `
        <div class="sel"><b>${esc(m.detalle)}</b><small>${esc(m.codigo)} · en almacén ${fmt(m.stock)} · instaladas ${fmt(m.instaladas)} ${esc(m.unidad || "")}</small>
          <button type="button" class="x" id="quitar" aria-label="Quitar">×</button></div>
        ${ls.length ? `<p class="hint">Marca las que vuelven al almacén:</p>
        <div class="inst-list">${ls.map((l) => `
          <label class="inst-row">
            <input type="checkbox" data-id="${l.id}" ${ls.length === 1 ? "checked" : ""}>
            <span class="txt"><b>${esc(destinoTxt(l) || "Sin ubicación en vía")}</b>
              <small>Salida ${fFecha(l.fecha)}${l.albaran ? " · Alb. " + esc(l.albaran) : ""}${l.observaciones ? " · " + esc(l.observaciones) : ""}</small></span>
            <span class="inst-q"><input type="number" inputmode="numeric" min="1" max="${l.pendiente}" step="1" value="${l.pendiente}" data-q="${l.id}" aria-label="Unidades que vuelven"><small>de ${fmt(l.pendiente)}</small></span>
          </label>`).join("")}</div>
        <button type="button" class="btn ghost wide" id="add">Añadir devolución al albarán</button>`
        : `<p class="hint">${m.instaladas ? "Ya has añadido todas sus líneas instaladas a este albarán." : "Esta herramienta no tiene unidades instaladas en vía."}</p>`}
        <button type="button" class="linkbtn" id="nueva">Es una entrada nueva (compra o alta), no una devolución</button>`;
      $("#quitar").onclick = () => { actual = null; pintarActual(); };
      $("#nueva").onclick = () => { entradaNueva = true; pintarActual(); };
      const add = $("#add"); if (add) add.onclick = () => { if (anadirActual()) picker.foco(); };
    };
    const pintarActual = () => {
      const box = $("#actual");
      if (!actual) { box.hidden = true; return; }
      const m = S.material(actual);
      box.hidden = false;
      if (esDevolucion()) { pintarDevolucion(m); return; }
      box.innerHTML = `
        <div class="sel"><b>${esc(m.detalle)}</b><small>${esc(ubic(m))} · ${esc(m.codigo)} · stock ${fmt(m.stock)} ${esc(m.unidad || "")}</small>
          <button type="button" class="x" id="quitar" aria-label="Quitar">×</button></div>
        <div class="qty-row">
          <button type="button" class="btn ghost" data-d="-1">−</button>
          <input id="cant" type="number" inputmode="decimal" min="0" step="any" placeholder="Cantidad" aria-label="Cantidad">
          <button type="button" class="btn ghost" data-d="1">+</button>
          <span class="u">${esc(m.unidad || "")}</span>
        </div>
        <button type="button" class="btn ghost wide" id="add">Añadir otra línea a este albarán</button>
        ${tipo === "Entrada" && m.tipo === "herramienta" ? '<button type="button" class="linkbtn" id="devol">Es una devolución de herramienta instalada</button>' : ""}
        ${tipo === "Salida" && m.tipo === "herramienta" ? '<p class="hint">Quedará registrada como instalada en vía hasta que se devuelva.</p>' : ""}`;
      $("#quitar").onclick = () => { actual = null; pintarActual(); };
      if ($("#devol")) $("#devol").onclick = () => { entradaNueva = false; pintarActual(); };
      $$(".qty-row [data-d]").forEach((b) => (b.onclick = () => { const i = $("#cant"); i.value = Math.max(0, (Number(i.value) || 0) + Number(b.dataset.d)); }));
      $("#add").onclick = () => { if (anadirActual()) { picker.foco(); } };
      $("#cant").focus();
    };
    const pintarLineas = () => {
      $("#lineas").innerHTML = lineas.map((l, i) => {
        const m = S.material(l.codigo);
        return `<div class="linea"><span class="qty ${tipo === "Entrada" ? "in" : "out"}">${tipo === "Entrada" ? "+" : "−"}${fmt(l.cantidad)}</span>
          <span class="txt"><b>${esc(m.detalle)}</b><small>${l.origen ? "Devolución desde " + esc(destinoTxt(l.origen) || "vía") : esc(m.codigo) + " · " + esc(ubic(m))}</small></span>
          <button type="button" class="x" data-i="${i}" aria-label="Quitar línea">×</button></div>`;
      }).join("");
      $$("#lineas .x").forEach((b) => (b.onclick = () => { lineas.splice(Number(b.dataset.i), 1); pintarLineas(); }));
      $("#guardar").textContent = `Guardar ${tipo.toLowerCase()}`;
    };
    const anadirActual = () => {
      if (!actual) return true;
      if (esDevolucion()) {
        const m = S.material(actual);
        const marcadas = $$("#actual .inst-row input[type=checkbox]:checked");
        if (!m.lineas_instaladas.length || !$("#add")) { actual = null; entradaNueva = false; pintarActual(); return true; }
        if (!marcadas.length) { toast("Marca las líneas que vuelven al almacén", "err"); return false; }
        for (const cb of marcadas) {
          const l = m.lineas_instaladas.find((x) => String(x.id) === cb.dataset.id);
          const q = Number($(`#actual [data-q="${cb.dataset.id}"]`).value);
          if (!(q > 0) || q > l.pendiente || !Number.isInteger(q)) { toast(`Cantidad no válida: máximo ${fmt(l.pendiente)}`, "err"); return false; }
          lineas.push({ codigo: actual, cantidad: q, origen: l });
        }
        actual = null; entradaNueva = false; pintarActual(); pintarLineas();
        return true;
      }
      const c = Number($("#cant").value);
      if (!(c > 0)) { toast("Indica la cantidad", "err"); $("#cant").focus(); return false; }
      lineas.push({ codigo: actual, cantidad: c });
      actual = null; entradaNueva = false; pintarActual(); pintarLineas();
      return true;
    };
    const herrInstaladas = () => S.materiales().filter((m) => m.tipo === "herramienta" && m.instaladas > 0);
    const picker = selectorMaterial($("#picker"), (c) => { if (actual && !anadirActual()) return; actual = c; entradaNueva = false; pintarActual(); }, {
      // en una entrada, de las herramientas solo salen las que están instaladas en vía
      filtro: (m) => tipo !== "Entrada" || m.tipo !== "herramienta" || m.instaladas > 0,
      motivoOculto: "herramienta(s) ocultas porque no tienen unidades instaladas",
      extra: () => tipo === "Entrada" ? { texto: `Devolver herramienta instalada (${herrInstaladas().length})`, lista: herrInstaladas() } : null,
    });

    $$("#seg button").forEach((b) => (b.onclick = () => { tipo = b.dataset.t; pintarTipo(); }));
    if (r.q.get("c") && S.material(r.q.get("c"))) actual = r.q.get("c");
    pintarTipo();

    $("#fm").onsubmit = async (e) => {
      e.preventDefault();
      if (!anadirActual()) return;
      if (!lineas.length) { toast("Añade al menos un material", "err"); picker.foco(); return; }
      const f = Object.fromEntries(new FormData(e.target).entries());
      if (tipo === "Salida") {
        const faltan = lineas.filter((l) => l.cantidad > S.material(l.codigo).stock);
        if (faltan.length && !await confirmar(`Hay ${faltan.length} línea(s) con más cantidad que el stock registrado:\n\n` +
          faltan.map((l) => `• ${S.material(l.codigo).detalle}: stock ${fmt(S.material(l.codigo).stock)}, salida ${fmt(l.cantidad)}`).join("\n") +
          "\n\n¿Guardar igualmente?", "Guardar igualmente")) return;
      }
      const filas = lineas.map((l) => {
        const o = l.origen; // devolución: se copia de dónde estaba instalada, como hacía el Excel
        return {
          albaran: f.albaran.trim(), fecha: f.fecha, codigo: l.codigo,
          cantidad: tipo === "Entrada" ? l.cantidad : -l.cantidad, tipo,
          estado: S.material(l.codigo).estado || "",
          linea: o ? o.linea || "" : f.linea.trim(), via: o ? o.via || "" : f.via.trim(),
          pk_ini: o ? o.pk_ini || "" : f.pk_ini.trim(), pk_fin: o ? o.pk_fin || "" : f.pk_fin.trim(),
          dependencia: o ? o.dependencia || "" : f.dependencia.trim(), sios: o ? o.sios || "" : f.sios.trim(),
          observaciones: f.observaciones.trim() || (o ? "Devolución de herramienta instalada" : ""),
          instalada: tipo === "Salida" && S.material(l.codigo).tipo === "herramienta",
          origen_id: o ? o.id : null,
        };
      });
      $("#guardar").disabled = true;
      try {
        const res = await S.registrar(filas);
        toast(`${tipo} guardada: ${filas.length} línea${filas.length > 1 ? "s" : ""}` + (res.persistente ? "" : " (sin guardar en el dispositivo)"), "ok");
        location.hash = filas.length === 1 ? "#/m/" + filas[0].codigo : "#/movimientos";
      } catch (err) {
        toast("No se ha podido guardar: " + err.message, "err");
        $("#guardar").disabled = false;
      }
    };
  }

  // ---------------------------------------------------------- HISTORIAL
  async function vHistorial(r) {
    titulo("Movimientos");
    const est = { desde: r.q.get("desde") || "", hasta: r.q.get("hasta") || "", tipo: "" };
    view.innerHTML = `
      <div class="filters">
        <label>Desde<input type="date" id="desde" value="${est.desde}"></label>
        <label>Hasta<input type="date" id="hasta" value="${est.hasta}"></label>
        <select id="tipo"><option value="">Entradas y salidas</option><option>Entrada</option><option>Salida</option></select>
        ${CFG.EMBED ? "" : '<button class="btn ghost" id="csv">Exportar a Excel (CSV)</button>'}
      </div>
      <p class="count" id="count"></p>
      <div class="list" id="lst"></div>`;
    let datos = [];
    const cargar = async () => {
      datos = await S.movimientos({ ...est, limit: 5000 });
      $("#count").textContent = `${datos.length} movimiento${datos.length === 1 ? "" : "s"}` + (datos.length > 300 ? " (se muestran los 300 más recientes)" : "");
      $("#lst").innerHTML = datos.slice(0, 300).map((v) => filaMov(v)).join("") || '<p class="empty">Sin movimientos en ese periodo</p>';
    };
    $("#desde").onchange = (e) => { est.desde = e.target.value; cargar(); };
    $("#hasta").onchange = (e) => { est.hasta = e.target.value; cargar(); };
    $("#tipo").onchange = (e) => { est.tipo = e.target.value; cargar(); };
    if ($("#csv")) $("#csv").onclick = () => exportarCSV(datos);
    await cargar();
  }

  function exportarCSV(movs) {
    const cols = ["Nº ALBARÁN", "Fecha", "Código", "Detalle del Material", "Ubicación", "Estante", "Unidad", "Balance Stock Real", "Tipo", "LÍNEA", "VIA", "PK_INI", "PK_FIN", "DEPENDENCIA", "SIOS", "Observaciones", "Usuario"];
    const q = (v) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const filas = movs.map((v) => { const m = S.material(v.codigo) || {};
      return [v.albaran, fFecha(v.fecha), v.codigo, m.detalle, m.ubicacion, m.estante, m.unidad, String(v.cantidad).replace(".", ","), v.tipo, v.linea, v.via, v.pk_ini, v.pk_fin, v.dependencia, v.sios, v.observaciones, v.usuario].map(q).join(";"); });
    const blob = new Blob(["﻿" + [cols.join(";"), ...filas].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `movimientos_${hoy()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  // ---------------------------------------------------------- ALERTAS
  async function vAlertas() {
    titulo("Alertas de stock");
    const mats = S.materiales();
    const neg = mats.filter((m) => nivelStock(m) === "neg");
    const bajo = mats.filter((m) => nivelStock(m) === "bajo");
    const sinMin = mats.filter((m) => m.tipo === "material" && (m.stock_minimo == null || m.stock_minimo === "")).length;
    view.innerHTML = `
      <h2 class="sec">Por debajo del stock mínimo (${bajo.length})</h2>
      <div class="list">${bajo.map(tarjetaMat).join("") || '<p class="empty">Ninguno</p>'}</div>
      <h2 class="sec">Stock negativo — revisar registros (${neg.length})</h2>
      <div class="list">${neg.map(tarjetaMat).join("") || '<p class="empty">Ninguno</p>'}</div>
      <p class="note">${sinMin} materiales no tienen stock mínimo definido. Puedes ponerlo desde «Editar ficha».</p>`;
  }

  // ---------------------------------------------------------- ALTA / EDICIÓN DE MATERIAL
  function formMaterial(m, s) {
    const dl = (id, arr) => `<datalist id="${id}">${arr.map((v) => `<option value="${esc(v)}">`).join("")}</datalist>`;
    return `
      <label>Detalle del material *<input name="detalle" required value="${esc(m.detalle || "")}"></label>
      <label>Descripción<input name="descripcion" value="${esc(m.descripcion || "")}"></label>
      <div class="grid2">
        <label>Ubicación<input name="ubicacion" list="dl-ubi" value="${esc(m.ubicacion || "")}"></label>
        <label>Estante<input name="estante" list="dl-est" value="${esc(m.estante || "")}"></label>
        <label>Categoría<input name="categoria" list="dl-cat" value="${esc(m.categoria || "")}"></label>
        <label>Unidad<input name="unidad" list="dl-uni" value="${esc(m.unidad || "Ud")}"></label>
        <label>Estado<input name="estado" list="dl-esta" value="${esc(m.estado || "N - Nuevo")}"></label>
        <label>Stock mínimo<input name="stock_minimo" type="number" step="any" min="0" value="${m.stock_minimo ?? ""}"></label>
      </div>
      ${dl("dl-ubi", s.ubicaciones)}${dl("dl-est", s.estantes)}${dl("dl-cat", s.categorias)}${dl("dl-uni", s.unidades)}${dl("dl-esta", s.estados)}`;
  }
  const datosForm = (form) => {
    const f = Object.fromEntries(new FormData(form).entries());
    for (const k in f) f[k] = typeof f[k] === "string" ? f[k].trim() : f[k];
    f.stock_minimo = f.stock_minimo === "" ? null : Number(f.stock_minimo);
    return f;
  };

  async function vNuevo(r) {
    titulo("Alta de material");
    view.innerHTML = `<form class="form" id="fn">
      <div class="seg" id="seg"><button type="button" data-t="material" class="on">Material</button><button type="button" data-t="herramienta">Herramienta</button></div>
      <fieldset>${formMaterial({ detalle: r.q.get("detalle") || "" }, S.sugerencias())}</fieldset>
      <div class="savebar"><button class="btn wide">Dar de alta</button></div></form>`;
    let tipo = "material";
    $$("#seg button").forEach((b) => (b.onclick = () => { tipo = b.dataset.t; $$("#seg button").forEach((x) => x.classList.toggle("on", x === b)); }));
    $("#fn").onsubmit = async (e) => {
      e.preventDefault();
      const f = datosForm(e.target);
      if (S.materiales().some((m) => norm(m.detalle) === norm(f.detalle))) { toast("Ya existe un material con ese detalle", "err"); return; }
      try {
        const codigo = await S.altaMaterial({ ...f, tipo, descripcion: f.descripcion || f.detalle });
        toast(`Alta hecha: ${codigo}`, "ok");
        location.hash = "#/m/" + codigo;
      } catch (err) { toast("Error: " + err.message, "err"); }
    };
  }

  async function vEditar(r) {
    const m = S.material(r.arg);
    if (!m) { location.hash = "#/buscar"; return; }
    titulo("Editar " + m.codigo);
    view.innerHTML = `<form class="form" id="fe"><fieldset>${formMaterial(m, S.sugerencias())}</fieldset>
      <p class="note">El código ${esc(m.codigo)} no cambia, así que la etiqueta QR sigue siendo válida.</p>
      <div class="savebar"><button class="btn wide">Guardar cambios</button></div></form>`;
    $("#fe").onsubmit = async (e) => {
      e.preventDefault();
      try { await S.actualizarMaterial(m.codigo, { ...datosForm(e.target), revisar: false }); toast("Ficha actualizada", "ok"); location.hash = "#/m/" + m.codigo; }
      catch (err) { toast("Error: " + err.message, "err"); }
    };
  }

  // ---------------------------------------------------------- ETIQUETAS QR
  async function vEtiquetas(r) {
    titulo("Etiquetas QR");
    const s = S.sugerencias();
    const sel = new Set(r.q.get("c") ? [r.q.get("c")] : []);
    const est = { q: "", ubicacion: "", estante: "" };
    view.innerHTML = `
      <p class="note">Elige los materiales y pulsa «Imprimir». Hoja A4 de 3×8 etiquetas (70×37 mm, tipo Apli 1274 / Avery L7160).</p>
      <div class="filters">
        <input type="search" id="eq" placeholder="Filtrar…">
        <select id="eu"><option value="">Todas las ubicaciones</option>${s.ubicaciones.map((u) => `<option value="${esc(u)}">${esc(limpiaPref(u))}</option>`).join("")}</select>
        <select id="ee"><option value="">Todos los estantes</option>${s.estantes.map((u) => `<option value="${esc(u)}">${esc(limpiaPref(u))}</option>`).join("")}</select>
      </div>
      <div class="row-btns"><button class="btn ghost" id="todos">Marcar los filtrados</button><button class="btn ghost" id="ninguno">Desmarcar todo</button></div>
      <div class="list checks" id="el"></div>
      ${CFG.EMBED ? '<p class="note">En esta vista previa no se puede imprimir. En la app instalada este botón imprime la hoja de etiquetas.</p>' : ""}
      <div class="savebar"><button class="btn wide" id="imp" ${CFG.EMBED ? "disabled" : ""}>Imprimir</button></div>
      <div id="print-area"></div>`;
    const filtrados = () => buscar(est.q).filter((m) => (!est.ubicacion || m.ubicacion === est.ubicacion) && (!est.estante || m.estante === est.estante))
      .sort((a, b) => (a.ubicacion + a.estante + a.detalle).localeCompare(b.ubicacion + b.estante + b.detalle, "es"));
    const pintar = () => {
      const l = filtrados();
      $("#el").innerHTML = l.slice(0, 400).map((m) => `<label class="chk"><input type="checkbox" value="${esc(m.codigo)}" ${sel.has(m.codigo) ? "checked" : ""}>
        <span><b>${esc(m.detalle)}</b><small>${esc(m.codigo)} · ${esc(ubic(m))}</small></span></label>`).join("");
      $("#imp").textContent = `Imprimir ${sel.size} etiqueta${sel.size === 1 ? "" : "s"}`;
    };
    $("#el").onchange = (e) => { if (e.target.checked) sel.add(e.target.value); else sel.delete(e.target.value); $("#imp").textContent = `Imprimir ${sel.size} etiqueta${sel.size === 1 ? "" : "s"}`; };
    $("#eq").oninput = (e) => { est.q = e.target.value; pintar(); };
    $("#eu").onchange = (e) => { est.ubicacion = e.target.value; pintar(); };
    $("#ee").onchange = (e) => { est.estante = e.target.value; pintar(); };
    $("#todos").onclick = () => { filtrados().forEach((m) => sel.add(m.codigo)); pintar(); };
    $("#ninguno").onclick = () => { sel.clear(); pintar(); };
    $("#imp").onclick = () => {
      if (!sel.size) { toast("Marca al menos un material", "err"); return; }
      const mats = [...sel].map((c) => S.material(c)).filter(Boolean);
      $("#print-area").innerHTML = `<div class="sheet">${mats.map((m) => `
        <div class="label">${qrSvg(m.codigo, 3)}
          <div><b>${esc(m.codigo)}</b><p>${esc(m.detalle)}</p><small>${esc(ubic(m))}</small></div></div>`).join("")}</div>`;
      document.body.classList.add("printing");
      setTimeout(() => { window.print(); document.body.classList.remove("printing"); }, 150);
    };
    pintar();
  }

  // ---------------------------------------------------------- MÁS
  async function vMas() {
    titulo("Más opciones");
    const local = S.cambiosLocales();
    view.innerHTML = `
      <div class="menu">
        <a href="#/movimientos">Historial de movimientos<small>Filtrar por fechas y exportar a Excel</small></a>
        <a href="#/instaladas">Herramientas instaladas en vía<small>Dónde está cada una y registrar su devolución</small></a>
        <a href="#/alertas">Alertas de stock<small>Bajo mínimo y stock negativo</small></a>
        <a href="#/etiquetas">Imprimir etiquetas QR<small>Por ubicación, estante o material</small></a>
        <a href="#/nuevo">Alta de material o herramienta<small>Se le asigna un código QR nuevo</small></a>
      </div>
      <div class="card">
        <p><b>Modo:</b> ${S.modo === "demo" ? "Demo — datos del Excel, cambios guardados solo en este dispositivo" : "Hoja de Google del almacén — datos compartidos"}</p>
        <p><b>Usuario:</b> ${esc(S.usuario())}</p>
        ${S.modo === "demo" ? `<p>${local} cambio(s) hechos en este dispositivo.</p><button class="btn ghost" id="reset">Borrar cambios de prueba</button>` : `<div class="row-btns"><button class="btn ghost" id="actualizar">Actualizar datos</button><button class="btn ghost" id="salir">Cerrar sesión</button></div>`}
      </div>`;
    const reset = $("#reset");
    if (reset) reset.onclick = async () => { if (await confirmar("¿Borrar los movimientos y altas de prueba de este dispositivo?", "Borrar")) { await S.borrarDatosLocales(); toast("Datos de prueba borrados", "ok"); vMas(); } };
    const salir = $("#salir");
    if (salir) salir.onclick = async () => { await S.logout(); location.hash = "#/login"; };
    const act = $("#actualizar");
    if (act) act.onclick = async () => { act.disabled = true; try { await S.refrescar(); toast("Datos actualizados", "ok"); } catch (e) { toast(e.message, "err"); } act.disabled = false; };
  }

  // ---------------------------------------------------------- LOGIN
  async function vLogin() {
    titulo(CFG.NOMBRE_ALMACEN || "Almacén UTE");
    let email = "";
    try { email = localStorage.getItem("almacen-ultimo-email") || ""; } catch (e) { /* sin almacenamiento */ }
    view.innerHTML = `<form class="form login" id="fl" autocomplete="on">
      <h2>Entrar</h2>
      <p class="note">Con el mismo correo y PIN que usas en la app de <b>Partes LAV</b>.</p>
      <label>Correo<input id="login-email" name="email" type="email" autocomplete="username" required value="${esc(email)}"></label>
      <label>PIN<input id="login-pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4,6}" maxlength="6" autocomplete="current-password" required></label>
      <button class="btn wide" id="entrar">Entrar</button>
      <p class="note">¿No tienes cuenta o has olvidado el PIN? Hazlo en la app de partes:<br>
        <a href="${esc(CFG.PARTES_APP || "#")}" target="_blank" rel="noopener">${esc((CFG.PARTES_APP || "").replace(/^https?:\/\//, ""))}</a></p>
    </form>`;
    $(email ? "#login-pin" : "#login-email").focus();
    $("#fl").onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target).entries());
      if (!/^\d{4,6}$/.test(f.pin)) { toast("El PIN tiene de 4 a 6 cifras", "err"); return; }
      const b = $("#entrar"); b.disabled = true; b.textContent = "Comprobando…";
      try {
        await S.login(f.email, f.pin);
        try { localStorage.setItem("almacen-ultimo-email", f.email.trim().toLowerCase()); } catch (x) { /* nada */ }
        toast(`Hola, ${S.usuario()}`, "ok");
        location.hash = "#/";
      } catch (err) {
        toast(err.message, "err");
        b.disabled = false; b.textContent = "Entrar";
      }
    };
  }

  // ---------------------------------------------------------- ARRANQUE
  $("#btn-back").onclick = () => (history.length > 1 ? history.back() : (location.hash = "#/"));
  $("#mode-badge").textContent = S.modo === "demo" ? "DEMO" : "";
  window.addEventListener("hashchange", render);
  // En modo nube, al volver a la app se recargan los datos (otros compañeros pueden haber registrado movimientos)
  let ultimaCarga = Date.now();
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden || S.modo === "demo" || S.needsLogin() || Date.now() - ultimaCarga < 60000) return;
    ultimaCarga = Date.now();
    const r = parseHash().nombre;
    try { await S.refrescar(); if (["", "buscar", "m", "alertas", "instaladas", "movimientos"].includes(r)) render(); }
    catch (e) { /* sin cobertura: se sigue con la última copia */ }
  });
  view.innerHTML = '<p class="empty">Cargando datos del almacén…</p>';
  S.init().then(() => { if (S.sinConexion) toast("Sin conexión: se muestran los últimos datos descargados", "err"); render(); }).catch((e) => { view.innerHTML = `<div class="card error">No se han podido cargar los datos: ${esc(e.message)}</div>`; });
})();
