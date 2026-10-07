// ============================================================
//  CAPA DE DATOS
//  - DemoStore: datos del Excel + cambios guardados en este dispositivo
//  - SheetsStore: hoja de Google del almacén (servidor Apps Script), usuarios de Partes LAV
//  Las dos ofrecen la misma interfaz para que la app no note la diferencia.
// ============================================================
(function () {
  const norm = (s) => String(s ?? "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

  const hoy = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };

  function ordenarMovs(a, b) {
    return (b.fecha || "").localeCompare(a.fecha || "") || (b.id || 0) - (a.id || 0);
  }

  function construirSugerencias(movs, mats) {
    const contar = (campo) => {
      const c = new Map();
      for (const m of movs) { const v = (m[campo] || "").trim(); if (v) c.set(v, (c.get(v) || 0) + 1); }
      return [...c.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]).slice(0, 200);
    };
    const unicos = (campo) => [...new Set(mats.map((m) => m[campo]).filter(Boolean))].sort();
    return {
      lineas: contar("linea"), vias: contar("via"), dependencias: contar("dependencia"),
      ubicaciones: unicos("ubicacion"), estantes: unicos("estante"),
      categorias: unicos("categoria"), unidades: unicos("unidad"), estados: unicos("estado"),
    };
  }

  // Herramientas instaladas en vía: salidas marcadas "instalada" menos lo ya devuelto
  function calcularInstaladas(movs) {
    const devuelto = new Map();
    for (const m of movs) if (m.origen_id) devuelto.set(m.origen_id, (devuelto.get(m.origen_id) || 0) + Number(m.cantidad));
    return movs.filter((m) => m.instalada)
      .map((m) => ({ ...m, pendiente: -Number(m.cantidad) - (devuelto.get(m.id) || 0) }))
      .filter((m) => m.pendiente > 0);
  }
  function asignarInstaladas(mats, lista) {
    const porCodigo = new Map();
    for (const l of lista) { if (!porCodigo.has(l.codigo)) porCodigo.set(l.codigo, []); porCodigo.get(l.codigo).push(l); }
    for (const m of mats) {
      const ls = (porCodigo.get(m.codigo) || []).sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
      m.lineas_instaladas = ls;
      m.instaladas = ls.reduce((a, l) => a + Number(l.pendiente), 0);
    }
  }

  function siguienteAlbaran(movs) {
    let max = 0;
    for (const m of movs) { const n = parseInt(m.albaran, 10); if (String(n) === String(m.albaran).trim() && n > max) max = n; }
    return String(max + 1);
  }

  function siguienteCodigo(mats, tipo) {
    const pre = tipo === "herramienta" ? "HER" : "MAT";
    let max = 0;
    for (const m of mats) if (m.codigo.startsWith(pre)) max = Math.max(max, parseInt(m.codigo.slice(4), 10) || 0);
    return `${pre}-${String(max + 1).padStart(4, "0")}`;
  }

  // ---------------------------------------------------------- BASE
  // Toda la lógica de stock se calcula en el móvil a partir de materiales + movimientos.
  class BaseStore {
    _cargar(materiales, movimientos) {
      this.mats = materiales.map((m) => ({ ...m }));
      this.movs = movimientos.map((m) => ({ ...m }));
      this._recalcular();
    }
    _recalcular() {
      const stock = new Map(), ultimo = new Map();
      for (const m of this.movs) {
        stock.set(m.codigo, (stock.get(m.codigo) || 0) + Number(m.cantidad));
        if (!ultimo.has(m.codigo) || (m.fecha || "") > ultimo.get(m.codigo)) ultimo.set(m.codigo, m.fecha);
      }
      for (const m of this.mats) {
        m.stock = Math.round((stock.get(m.codigo) || 0) * 1000) / 1000;
        m.ultimo_mov = ultimo.get(m.codigo) || null;
        m._q = norm([m.codigo, m.detalle, m.descripcion, m.ubicacion, m.estante, m.categoria].join(" "));
      }
      asignarInstaladas(this.mats, calcularInstaladas(this.movs));
      this.porCodigo = new Map(this.mats.map((m) => [m.codigo, m]));
      this._sug = construirSugerencias(this.movs, this.mats);
    }
    materiales() { return this.mats || []; }
    material(c) { return this.porCodigo?.get(c); }
    sugerencias() { return this._sug; }
    async siguienteAlbaran() { return siguienteAlbaran(this.movs || []); }
    async movimientos({ codigo, desde, hasta, tipo, limit = 200 } = {}) {
      return (this.movs || []).filter((m) =>
        (!codigo || m.codigo === codigo) && (!tipo || m.tipo === tipo) &&
        (!desde || (m.fecha || "") >= desde) && (!hasta || (m.fecha || "") <= hasta)
      ).sort(ordenarMovs).slice(0, limit);
    }
    cambiosLocales() { return 0; }
  }

  // ---------------------------------------------------------- DEMO
  class DemoStore extends BaseStore {
    constructor() { super(); this.modo = "demo"; this.KEY = "almacen-ute-demo-v1"; }

    async init() {
      const seed = window.SEED_DATA || await fetch("data/seed.json").then((r) => r.json());
      let local = { movs: [], mats: [], cambios: {} };
      try { local = JSON.parse(localStorage.getItem(this.KEY)) || local; } catch (e) { /* sin almacenamiento */ }
      this.local = local;
      let id = 1;
      this._cargar(
        seed.materiales.map((m) => ({ ...m, ...(local.cambios[m.codigo] || {}) })).concat(local.mats),
        seed.movimientos.map((m) => ({ ...m, id: m.id || id++ })).concat(local.movs));
    }
    _guardar() {
      try { localStorage.setItem(this.KEY, JSON.stringify(this.local)); return true; } catch (e) { return false; }
    }
    needsLogin() { return false; }
    usuario() { return "Demo (este dispositivo)"; }
    async registrar(lineas) {
      let id = this.movs.length ? Math.max(...this.movs.map((m) => m.id)) + 1 : 1;
      const nuevas = lineas.map((l) => ({ ...l, id: id++, usuario: this.usuario(), creado: new Date().toISOString() }));
      this.local.movs.push(...nuevas); this.movs.push(...nuevas);
      const ok = this._guardar(); this._recalcular();
      return { ok, persistente: ok };
    }
    async altaMaterial(m) {
      const nuevo = { ...m, codigo: siguienteCodigo(this.mats, m.tipo), revisar: false };
      this.local.mats.push(nuevo); this.mats.push(nuevo);
      this._guardar(); this._recalcular();
      return nuevo.codigo;
    }
    async actualizarMaterial(codigo, cambios) {
      const enLocal = this.local.mats.find((m) => m.codigo === codigo);
      if (enLocal) Object.assign(enLocal, cambios);
      else this.local.cambios[codigo] = { ...(this.local.cambios[codigo] || {}), ...cambios };
      Object.assign(this.porCodigo.get(codigo), cambios);
      this._guardar(); this._recalcular();
    }
    async refrescar() {}
    async borrarDatosLocales() { try { localStorage.removeItem(this.KEY); } catch (e) {} await this.init(); }
    cambiosLocales() { return this.local.movs.length + this.local.mats.length + Object.keys(this.local.cambios).length; }
  }

  // ------------------------------------------------- GOOGLE SHEETS
  // Datos en la hoja de Google del almacén (servidor Apps Script propio).
  // Usuarios: los de la app de Partes LAV (mismo correo y PIN).
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const leerLS = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const escribirLS = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } };

  /** POST «simple» (text/plain) a un Apps Script; si Google pierde la respuesta se repite con el mismo identificador. */
  async function llamarScript(url, accion, datos = {}, intentos = 4) {
    const cuerpo = JSON.stringify({ accion, peticion: uuid(), ...datos });
    let error;
    for (let i = 0; i < intentos; i++) {
      if (i) await espera(Math.min(1500 * i, 5000));
      let r, j;
      try { r = await fetch(url, { method: "POST", body: cuerpo, redirect: "follow" }); }
      catch (e) { error = new Error(navigator.onLine ? "Sin conexión con el servidor." : "Sin conexión. Revisa la cobertura."); error.red = true; if (!navigator.onLine) break; continue; }
      try { j = await r.json(); } catch (e) { error = new Error("El servidor no ha respondido bien. Inténtalo de nuevo."); error.red = true; continue; }
      if (j.reintentar) { error = new Error(j.error || "Servidor ocupado."); continue; }
      if (!j.ok) { const e = new Error(j.error || "Error del servidor"); e.sesion = /sesi[oó]n no v[aá]lida/i.test(j.error || ""); throw e; }
      return j;
    }
    throw error;
  }

  class SheetsStore extends BaseStore {
    constructor(cfg) {
      super();
      this.modo = "nube"; this.cfg = cfg;
      this.sesion = leerLS("almacen-sesion");       // {token, nombre, email}
    }
    async init() {
      const cache = leerLS("almacen-datos");          // última copia: la app abre al instante y sin cobertura
      if (this.sesion && cache) this._cargar(cache.materiales, cache.movimientos);
      else this._cargar([], []);
      if (this.sesion) {
        try { await this.refrescar(); }
        catch (e) { if (e.sesion) this._cerrar(); else if (!cache) throw e; else this.sinConexion = true; }
      }
    }
    needsLogin() { return !this.sesion; }
    usuario() { return this.sesion ? this.sesion.nombre || this.sesion.email : ""; }
    async login(email, pin) {
      const r = await llamarScript(this.cfg.PARTES_URL, "login", { email: String(email).trim().toLowerCase(), pin: String(pin).trim() });
      if (r.estado === "pendiente") throw new Error("Tu registro aún no está aprobado por la oficina.");
      if (r.estado && r.estado !== "activo") throw new Error("Tu cuenta no está activa. Habla con la oficina.");
      this.sesion = { token: r.token, nombre: r.nombre || "", email: String(email).trim().toLowerCase() };
      escribirLS("almacen-sesion", this.sesion);
      await this.refrescar();
    }
    _cerrar() { this.sesion = null; escribirLS("almacen-sesion", null); escribirLS("almacen-datos", null); this._cargar([], []); }
    async logout() { this._cerrar(); }
    async _api(accion, datos = {}) {
      try { return await llamarScript(this.cfg.SERVIDOR_URL, accion, { token: this.sesion && this.sesion.token, ...datos }); }
      catch (e) {
        if (e.sesion) { this._cerrar(); setTimeout(() => (location.hash = "#/login"), 0); }
        throw e;
      }
    }
    _guardarCopia() { escribirLS("almacen-datos", { materiales: this.mats, movimientos: this.movs, fecha: new Date().toISOString() }); }
    async refrescar() {
      const r = await this._api("datos");
      this._cargar(r.materiales, r.movimientos);
      this.sinConexion = false;
      this._guardarCopia();
    }
    async registrar(lineas) {
      const r = await this._api("registrar", { lineas });
      this.movs.push(...r.movimientos);
      this._recalcular(); this._guardarCopia();
      return { ok: true, persistente: true };
    }
    async altaMaterial(m) {
      const r = await this._api("alta", { material: m });
      this.mats.push(r.material);
      this._recalcular(); this._guardarCopia();
      return r.codigo;
    }
    async actualizarMaterial(codigo, cambios) {
      const r = await this._api("editar", { codigo, cambios });
      Object.assign(this.porCodigo.get(codigo), r.material);
      this._recalcular(); this._guardarCopia();
    }
  }

  const cfg = window.APP_CONFIG || {};
  window.Store = cfg.SERVIDOR_URL ? new SheetsStore(cfg) : new DemoStore();
  window.Util = { norm, hoy };
})();
