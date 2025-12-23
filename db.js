/* BTX Docs Saúde — IndexedDB (memória forte) */
(() => {
  const DB_NAME = "btx_docs_saude_db";
  const DB_VERSION = 1;

  function openDB(){
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = () => {
        const db = req.result;

        // settings (profissional + prefs)
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings", { keyPath: "key" });
        }

        // patients
        if (!db.objectStoreNames.contains("patients")) {
          const st = db.createObjectStore("patients", { keyPath: "id" });
          st.createIndex("by_name", "name", { unique:false });
          st.createIndex("by_phone", "phone", { unique:false });
        }

        // appointments
        if (!db.objectStoreNames.contains("appointments")) {
          const st = db.createObjectStore("appointments", { keyPath: "id" });
          st.createIndex("by_date", "date", { unique:false });
          st.createIndex("by_patientId", "patientId", { unique:false });
        }

        // encounters (prontuário)
        if (!db.objectStoreNames.contains("encounters")) {
          const st = db.createObjectStore("encounters", { keyPath: "id" });
          st.createIndex("by_patientId", "patientId", { unique:false });
          st.createIndex("by_date", "date", { unique:false });
        }

        // drafts (autosave por tela)
        if (!db.objectStoreNames.contains("drafts")) {
          db.createObjectStore("drafts", { keyPath: "key" });
        }
      };

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function tx(storeName, mode="readonly"){
    const db = await openDB();
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  async function put(storeName, value){
    const store = await tx(storeName, "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.put(value);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function get(storeName, key){
    const store = await tx(storeName, "readonly");
    return new Promise((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function del(storeName, key){
    const store = await tx(storeName, "readwrite");
    return new Promise((resolve, reject) => {
      const req = store.delete(key);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAll(storeName){
    const store = await tx(storeName, "readonly");
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAllByIndex(storeName, indexName, key){
    const store = await tx(storeName, "readonly");
    return new Promise((resolve, reject) => {
      const idx = store.index(indexName);
      const req = idx.getAll(key);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // Export / Import (backup)
  async function exportAll(){
    const settings = await getAll("settings");
    const patients = await getAll("patients");
    const appointments = await getAll("appointments");
    const encounters = await getAll("encounters");
    const drafts = await getAll("drafts");

    return {
      meta: {
        app: "BTX Docs Saúde",
        exportedAt: new Date().toISOString(),
        version: DB_VERSION
      },
      settings, patients, appointments, encounters, drafts
    };
  }

  async function importAll(payload){
    if (!payload || typeof payload !== "object") throw new Error("Backup inválido.");

    const { settings=[], patients=[], appointments=[], encounters=[], drafts=[] } = payload;

    for (const s of settings) await put("settings", s);
    for (const p of patients) await put("patients", p);
    for (const a of appointments) await put("appointments", a);
    for (const e of encounters) await put("encounters", e);
    for (const d of drafts) await put("drafts", d);

    return true;
  }

  async function wipeAll(){
    // apaga tudo (stores)
    const db = await openDB();
    const stores = ["settings","patients","appointments","encounters","drafts"];
    await Promise.all(stores.map(storeName => new Promise((resolve, reject) => {
      const t = db.transaction(storeName, "readwrite");
      const req = t.objectStore(storeName).clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    })));
    return true;
  }

  window.BTXDB = { openDB, put, get, del, getAll, getAllByIndex, exportAll, importAll, wipeAll };
})();
