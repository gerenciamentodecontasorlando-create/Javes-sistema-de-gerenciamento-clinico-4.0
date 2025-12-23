/* BTX Docs Saúde — App (Agenda + Pacientes + Prontuário) */
(() => {
  const $ = (id) => document.getElementById(id);

  // UI helpers
  function toast(msg){
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(()=>t.classList.remove("show"), 2600);
  }

  function esc(str){
    return String(str ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#39;");
  }

  function uid(){
    return (crypto.randomUUID ? crypto.randomUUID() : (Date.now()+"-"+Math.random().toString(16).slice(2)));
  }

  function todayISO(){
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth()+1).padStart(2,"0");
    const dd = String(d.getDate()).padStart(2,"0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function fmtDateBR(iso){
    if(!iso) return "";
    const [y,m,d] = iso.split("-");
    if(!y||!m||!d) return iso;
    return `${d}/${m}/${y}`;
  }

  function line(label, value){
    if (!value) return "";
    return `<p class="doc-line"><strong>${esc(label)}:</strong> ${esc(value)}</p>`;
  }

  function block(title, value){
    if (!value) return "";
    return `<div><div class="doc-title">${esc(title)}</div><div class="doc-block">${esc(value)}</div></div>`;
  }

  function mondayOf(dateISO){
    const d = dateISO ? new Date(dateISO+"T12:00:00") : new Date();
    const day = d.getDay(); // 0=dom
    const diff = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate()+diff);
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const da = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${da}`;
  }

  function addDays(iso, n){
    const d = new Date(iso+"T12:00:00");
    d.setDate(d.getDate()+n);
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,"0");
    const da = String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${da}`;
  }

  async function getSetting(key, fallback=null){
    const row = await BTXDB.get("settings", key);
    return row ? row.value : fallback;
  }

  async function setSetting(key, value){
    await BTXDB.put("settings", { key, value, updatedAt: Date.now() });
  }

  async function saveDraft(key, data){
    await BTXDB.put("drafts", { key, data, updatedAt: Date.now() });
  }

  async function loadDraft(key){
    const row = await BTXDB.get("drafts", key);
    return row ? row.data : null;
  }

  // PROFISSIONAL
  const PROF_KEY = "profissional_v1";

  function readProfFromUI(){
    return {
      nome: $("profNome").value.trim(),
      esp: $("profEsp").value.trim(),
      conselho: $("profConselho").value.trim(),
      reg: $("profReg").value.trim(),
      end: $("profEnd").value.trim(),
      tel: $("profTel").value.trim(),
      email: $("profEmail").value.trim(),
    };
  }

  function setProfToUI(p){
    $("profNome").value = p?.nome || "";
    $("profEsp").value = p?.esp || "";
    $("profConselho").value = p?.conselho || "";
    $("profReg").value = p?.reg || "";
    $("profEnd").value = p?.end || "";
    $("profTel").value = p?.tel || "";
    $("profEmail").value = p?.email || "";
  }

  function profLines(p){
    const cr = (p?.conselho || p?.reg) ? `${p.conselho || ""} ${p.reg || ""}`.trim() : "";
    return [p?.nome, p?.esp, cr, p?.end, p?.tel, p?.email].filter(Boolean);
  }

  // DATA LAYER
  async function upsertPatient(p){
    const id = p.id || uid();
    const row = {
      id,
      name: (p.name || "").trim(),
      phone: (p.phone || "").trim(),
      birth: (p.birth || "").trim(),
      notes: (p.notes || "").trim(),
      updatedAt: Date.now(),
      createdAt: p.createdAt || Date.now()
    };
    await BTXDB.put("patients", row);
    return row;
  }

  async function upsertAppointment(a){
    const id = a.id || uid();
    const row = {
      id,
      date: a.date || todayISO(),
      time: (a.time || "").trim(),
      patientId: a.patientId || "",
      patientName: (a.patientName || "").trim(), // fallback
      type: (a.type || "consulta").trim(),
      status: (a.status || "aguardando").trim(),
      obs: (a.obs || "").trim(),
      updatedAt: Date.now(),
      createdAt: a.createdAt || Date.now()
    };
    await BTXDB.put("appointments", row);
    return row;
  }

  async function createEncounterFromAppointment(appt, extra={}){
    const id = uid();
    const row = {
      id,
      patientId: appt.patientId || "",
      patientName: appt.patientName || "",
      appointmentId: appt.id,
      date: appt.date,
      time: appt.time || "",
      procedure: (extra.procedure || "").trim(),
      evolution: (extra.evolution || "").trim(),
      conduct: (extra.conduct || "").trim(),
      attachmentsNote: (extra.attachmentsNote || "").trim(),
      updatedAt: Date.now(),
      createdAt: Date.now()
    };
    await BTXDB.put("encounters", row);
    return row;
  }

  async function listAppointmentsByDate(dateISO){
    const items = await BTXDB.getAllByIndex("appointments", "by_date", dateISO);
    items.sort((a,b)=> (a.time||"").localeCompare(b.time||""));
    return items;
  }

  async function listEncountersByPatient(patientId){
    const items = await BTXDB.getAllByIndex("encounters", "by_patientId", patientId);
    items.sort((a,b)=> (b.date||"").localeCompare(a.date||"") || (b.time||"").localeCompare(a.time||""));
    return items;
  }

  async function findPatients(query){
    const q = (query||"").trim().toLowerCase();
    const all = await BTXDB.getAll("patients");
    if(!q) return all.sort((a,b)=> (a.name||"").localeCompare(b.name||""));
    return all
      .filter(p =>
        (p.name||"").toLowerCase().includes(q) ||
        (p.phone||"").toLowerCase().includes(q)
      )
      .sort((a,b)=> (a.name||"").localeCompare(b.name||""));
  }

  // UI STATE
  let currentTab = "agenda";
  let currentProf = null;

  // TABS
  const TABS = {
    agenda: {
      title: "Agenda",
      sub: "Dia e Semana, offline, com memória forte.",
      renderForm: async () => {
        const draft = await loadDraft("agenda_form") || {};
        const date = draft.date || todayISO();
        const weekStart = mondayOf(date);

        return `
          <div class="doc-title">Novo agendamento</div>

          <label>Data</label>
          <input id="ag_date" type="date" value="${esc(date)}" />

          <div class="row">
            <div>
              <label>Hora</label>
              <input id="ag_time" type="time" value="${esc(draft.time||"")}" />
            </div>
            <div>
              <label>Paciente (busca rápida)</label>
              <input id="ag_patientSearch" placeholder="Digite nome ou telefone..." value="${esc(draft.patientSearch||"")}" />
            </div>
          </div>

          <label>Selecionar paciente (opcional)</label>
          <select id="ag_patientId">
            <option value="">— digite acima ou cadastre —</option>
          </select>

          <div class="row">
            <div>
              <label>Tipo</label>
              <select id="ag_type">
                ${["consulta","retorno","procedimento","avaliacao"].map(v => `<option value="${v}" ${draft.type===v?"selected":""}>${v}</option>`).join("")}
              </select>
            </div>
            <div>
              <label>Status</label>
              <select id="ag_status">
                ${["aguardando","confirmado","remarcado","faltou","concluido"].map(v => `<option value="${v}" ${draft.status===v?"selected":""}>${v}</option>`).join("")}
              </select>
            </div>
          </div>

          <label>Observações</label>
          <input id="ag_obs" placeholder="Ex: retorno pós-op, dor, etc." value="${esc(draft.obs||"")}" />

          <div class="actions" style="justify-content:flex-start; margin-top:10px;">
            <button class="btn btn-primary" type="button" id="btnAgSalvar">Salvar</button>
            <button class="btn btn-ghost" type="button" id="btnAgHoje">Hoje</button>
            <button class="btn btn-ghost" type="button" id="btnAgSemana">Semana</button>
          </div>

          <div class="doc-title">Visão rápida</div>
          <div class="row">
            <div>
              <label>Semana (início)</label>
              <input id="ag_weekStart" type="date" value="${esc(weekStart)}" />
            </div>
            <div style="display:flex; align-items:flex-end;">
              <button class="btn btn-ghost" type="button" id="btnAgRefresh">Atualizar listas</button>
            </div>
          </div>

          <div class="doc-title">Agendamentos do dia</div>
          <div id="ag_list_day" class="list"></div>

          <div class="doc-title">Agendamentos da semana</div>
          <div id="ag_list_week" class="list"></div>

          <p class="small" style="margin-top:10px;">
            Dica: Clique em <b>Atender</b> para abrir o registro do prontuário do dia. Tudo offline.
          </p>
        `;
      },
      afterRender: async () => {
        const dateEl = $("ag_date");
        const searchEl = $("ag_patientSearch");
        const patientSel = $("ag_patientId");

        async function fillPatientsSelect(q=""){
          const list = await findPatients(q);
          const cur = patientSel.value || "";
          patientSel.innerHTML = `<option value="">— digite acima ou cadastre —</option>` +
            list.slice(0,100).map(p => `<option value="${esc(p.id)}">${esc(p.name)}${p.phone?(" • "+esc(p.phone)):""}</option>`).join("");
          if(cur) patientSel.value = cur;
        }

        async function autosave(){
          await saveDraft("agenda_form", {
            date: dateEl.value || todayISO(),
            time: $("ag_time").value || "",
            patientSearch: searchEl.value || "",
            patientId: patientSel.value || "",
            type: $("ag_type").value || "consulta",
            status: $("ag_status").value || "aguardando",
            obs: $("ag_obs").value || ""
          });
        }

        ["ag_date","ag_time","ag_patientSearch","ag_patientId","ag_type","ag_status","ag_obs","ag_weekStart"]
          .forEach(id => {
            const el = $(id);
            if(!el) return;
            el.addEventListener("input", autosave);
            el.addEventListener("change", autosave);
          });

        // search patients
        let __searchTimer = null;
        searchEl.addEventListener("input", () => {
          clearTimeout(__searchTimer);
          __searchTimer = setTimeout(async () => {
            await fillPatientsSelect(searchEl.value || "");
          }, 180);
        });

        await fillPatientsSelect(searchEl.value || "");

        $("btnAgHoje").addEventListener("click", async () => {
          dateEl.value = todayISO();
          $("ag_weekStart").value = mondayOf(todayISO());
          await autosave();
          await renderAgendaLists();
          buildPreview();
        });

        $("btnAgSemana").addEventListener("click", async () => {
          $("ag_weekStart").value = mondayOf(dateEl.value || todayISO());
          await autosave();
          await renderAgendaLists();
          buildPreview();
        });

        $("btnAgRefresh").addEventListener("click", async () => {
          await renderAgendaLists();
          buildPreview();
        });

        $("btnAgSalvar").addEventListener("click", async () => {
          const date = dateEl.value || todayISO();
          const patientId = patientSel.value || "";
          const patients = patientId ? await BTXDB.get("patients", patientId) : null;

          const patientName = patients?.name || (searchEl.value || "").trim();
          if(!patientName){
            alert("Digite o nome do paciente (ou selecione).");
            return;
          }

          await upsertAppointment({
            date,
            time: $("ag_time").value || "",
            patientId,
            patientName,
            type: $("ag_type").value || "consulta",
            status: $("ag_status").value || "aguardando",
            obs: $("ag_obs").value || ""
          });

          $("ag_time").value = "";
          $("ag_obs").value = "";
          searchEl.value = patientName; // mantém como referência
          await autosave();
          toast("Agendamento salvo ✅");
          await renderAgendaLists();
          buildPreview();
        });

        async function renderAgendaLists(){
          const dayISO = $("ag_date").value || todayISO();
          const weekStart = $("ag_weekStart").value || mondayOf(dayISO);

          // Day list
          const dayItems = await listAppointmentsByDate(dayISO);
          $("ag_list_day").innerHTML = dayItems.length ? dayItems.map(apptItemHTML).join("") :
            `<div class="small">Nenhum agendamento para ${esc(fmtDateBR(dayISO))}.</div>`;

          // Week list
          const weekDays = Array.from({length:7}, (_,i)=> addDays(weekStart,i));
          const weekAll = [];
          for(const d of weekDays){
            const items = await listAppointmentsByDate(d);
            weekAll.push({ date:d, items });
          }
          $("ag_list_week").innerHTML = weekAll.map(group => {
            const header = `<div class="small" style="margin:6px 0 8px;">📅 <b>${esc(fmtDateBR(group.date))}</b> — ${group.items.length} item(ns)</div>`;
            if(!group.items.length) return `<div class="item"><div class="rowline">${header}</div><div class="muted">Sem agendamentos.</div></div>`;
            return `<div class="item"><div class="rowline">${header}</div>${group.items.map(apptItemHTML).join("")}</div>`;
          }).join("");

          // bind buttons
          bindAgendaActions();
        }

        function apptItemHTML(a){
          const name = a.patientName || "—";
          const time = a.time || "";
          const meta = `${a.type || ""} • ${a.status || ""}`.trim();
          const obs = a.obs || "";
          return `
            <div class="item" data-appt="${esc(a.id)}">
              <div class="rowline">
                <div><b>${esc(time)}</b> — ${esc(name)}</div>
                <div class="muted">${esc(meta)}</div>
              </div>
              ${obs ? `<div class="muted">Obs: ${esc(obs)}</div>` : ""}
              <div class="btnrow">
                <button class="btn btn-ghost" type="button" data-act="edit" data-id="${esc(a.id)}">Editar</button>
                <button class="btn btn-primary" type="button" data-act="attend" data-id="${esc(a.id)}">Atender</button>
                <button class="btn btn-danger" type="button" data-act="del" data-id="${esc(a.id)}">Excluir</button>
              </div>
            </div>
          `;
        }

        function bindAgendaActions(){
          document.querySelectorAll("[data-act='del']").forEach(btn => {
            btn.onclick = async () => {
              const id = btn.dataset.id;
              if(!confirm("Excluir agendamento?")) return;
              await BTXDB.del("appointments", id);
              toast("Agendamento excluído ✅");
              await renderAgendaLists();
              buildPreview();
            };
          });

          document.querySelectorAll("[data-act='edit']").forEach(btn => {
            btn.onclick = async () => {
              const id = btn.dataset.id;
              const a = await BTXDB.get("appointments", id);
              if(!a) return;

              $("ag_date").value = a.date || todayISO();
              $("ag_time").value = a.time || "";
              $("ag_type").value = a.type || "consulta";
              $("ag_status").value = a.status || "aguardando";
              $("ag_obs").value = a.obs || "";
              $("ag_patientSearch").value = a.patientName || "";
              $("ag_weekStart").value = mondayOf(a.date || todayISO());

              // ao salvar novamente, vira novo registro (simples e robusto)
              toast("Editando: ajuste e clique Salvar ✅");
              await saveDraft("agenda_form", {
                date: $("ag_date").value,
                time: $("ag_time").value,
                patientSearch: $("ag_patientSearch").value,
                patientId: a.patientId || "",
                type: $("ag_type").value,
                status: $("ag_status").value,
                obs: $("ag_obs").value
              });

              buildPreview();
            };
          });

          document.querySelectorAll("[data-act='attend']").forEach(btn => {
            btn.onclick = async () => {
              const id = btn.dataset.id;
              const a = await BTXDB.get("appointments", id);
              if(!a) return;
              // abre prontuário com draft do atendimento
              await setSetting("prontuario_focus_patientId", a.patientId || "");
              await saveDraft("encounter_form", {
                appointmentId: a.id,
                date: a.date,
                time: a.time,
                patientId: a.patientId || "",
                patientName: a.patientName || "",
                procedure: "",
                evolution: "",
                conduct: "",
                attachmentsNote: ""
              });
              renderTab("prontuario");
              toast("Abrindo atendimento (prontuário) ✅");
            };
          });
        }

        await renderAgendaLists();
      },
      buildPreviewBody: async () => {
        const d = (await loadDraft("agenda_form")) || {};
        const dayISO = d.date || todayISO();
        const weekStart = d.weekStart || mondayOf(dayISO);

        const dayItems = await listAppointmentsByDate(dayISO);

        const rows = dayItems.map(it => `
          <tr>
            <td>${esc(it.time||"")}</td>
            <td>${esc(it.patientName||"")}</td>
            <td>${esc(it.type||"")}</td>
            <td>${esc(it.status||"")}</td>
            <td>${esc(it.obs||"")}</td>
          </tr>
        `).join("");

        const dayTable = rows ? `
          <div class="doc-title">Agenda do dia — ${esc(fmtDateBR(dayISO))}</div>
          <table>
            <thead><tr><th>Hora</th><th>Paciente</th><th>Tipo</th><th>Status</th><th>Obs</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        ` : `<div class="doc-title">Agenda do dia — ${esc(fmtDateBR(dayISO))}</div><p class="doc-line">Nenhum agendamento.</p>`;

        return [
          `<p class="doc-line"><strong>Semana (início):</strong> ${esc(fmtDateBR(weekStart))}</p>`,
          dayTable,
          `<p class="doc-line" style="margin-top:12px;color:#334155;"><em>Dica:</em> para registrar procedimento, use o botão “Atender” na lista.</p>`
        ].join("");
      }
    },

    pacientes: {
      title: "Pacientes",
      sub: "Cadastro e busca rápida.",
      renderForm: async () => {
        const draft = await loadDraft("patient_form") || {};
        return `
          <div class="doc-title">Cadastrar / Atualizar paciente</div>

          <label>Nome</label>
          <input id="p_name" placeholder="Nome completo" value="${esc(draft.name||"")}" />

          <div class="row">
            <div>
              <label>Telefone</label>
              <input id="p_phone" placeholder="(00) 00000-0000" value="${esc(draft.phone||"")}" />
            </div>
            <div>
              <label>Nascimento</label>
              <input id="p_birth" type="date" value="${esc(draft.birth||"")}" />
            </div>
          </div>

          <label>Observações gerais</label>
          <textarea id="p_notes" placeholder="Alergias, alertas, histórico..." >${esc(draft.notes||"")}</textarea>

          <div class="actions" style="justify-content:flex-start; margin-top:10px;">
            <button class="btn btn-primary" type="button" id="btnP_Save">Salvar paciente</button>
            <button class="btn btn-ghost" type="button" id="btnP_Clear">Limpar</button>
          </div>

          <div class="doc-title">Buscar</div>
          <input id="p_search" placeholder="Buscar por nome ou telefone..." />

          <div class="doc-title">Lista</div>
          <div id="p_list" class="list"></div>
        `;
      },
      afterRender: async () => {
        async function autosave(){
          await saveDraft("patient_form", {
            name: $("p_name").value || "",
            phone: $("p_phone").value || "",
            birth: $("p_birth").value || "",
            notes: $("p_notes").value || ""
          });
        }
        ["p_name","p_phone","p_birth","p_notes"].forEach(id=>{
          const el = $(id);
          el.addEventListener("input", autosave);
          el.addEventListener("change", autosave);
        });

        $("btnP_Clear").onclick = async () => {
          $("p_name").value = "";
          $("p_phone").value = "";
          $("p_birth").value = "";
          $("p_notes").value = "";
          await autosave();
          toast("Form limpo ✅");
          await renderPatientList();
          buildPreview();
        };

        $("btnP_Save").onclick = async () => {
          const name = ($("p_name").value || "").trim();
          if(!name){ alert("Digite o nome do paciente."); return; }
          const saved = await upsertPatient({
            name,
            phone: $("p_phone").value || "",
            birth: $("p_birth").value || "",
            notes: $("p_notes").value || ""
          });
          toast("Paciente salvo ✅");
          // foca prontuário nesse paciente (pra agilizar)
          await setSetting("prontuario_focus_patientId", saved.id);
          await renderPatientList();
          buildPreview();
        };

        let __t = null;
        $("p_search").addEventListener("input", () => {
          clearTimeout(__t);
          __t = setTimeout(renderPatientList, 160);
        });

        async function renderPatientList(){
          const q = $("p_search").value || "";
          const list = await findPatients(q);
          $("p_list").innerHTML = list.length ? list.slice(0,150).map(p => `
            <div class="item">
              <div class="rowline">
                <div><b>${esc(p.name)}</b></div>
                <div class="muted">${esc(p.phone||"")}</div>
              </div>
              ${p.birth ? `<div class="muted">Nascimento: ${esc(fmtDateBR(p.birth))}</div>` : ""}
              ${p.notes ? `<div class="muted">Obs: ${esc(p.notes)}</div>` : ""}
              <div class="btnrow">
                <button class="btn btn-primary" type="button" data-act="openPront" data-id="${esc(p.id)}">Abrir prontuário</button>
                <button class="btn btn-ghost" type="button" data-act="copyToAgenda" data-id="${esc(p.id)}">Usar na agenda</button>
                <button class="btn btn-danger" type="button" data-act="delPat" data-id="${esc(p.id)}">Excluir</button>
              </div>
            </div>
          `).join("") : `<div class="small">Nenhum paciente.</div>`;

          document.querySelectorAll("[data-act='openPront']").forEach(btn=>{
            btn.onclick = async () => {
              await setSetting("prontuario_focus_patientId", btn.dataset.id);
              renderTab("prontuario");
            };
          });

          document.querySelectorAll("[data-act='copyToAgenda']").forEach(btn=>{
            btn.onclick = async () => {
              const p = await BTXDB.get("patients", btn.dataset.id);
              if(!p) return;
              await saveDraft("agenda_form", {
                date: todayISO(),
                time: "",
                patientSearch: p.name || "",
                patientId: p.id,
                type: "consulta",
                status: "aguardando",
                obs: ""
              });
              renderTab("agenda");
              toast("Paciente enviado para a agenda ✅");
            };
          });

          document.querySelectorAll("[data-act='delPat']").forEach(btn=>{
            btn.onclick = async () => {
              if(!confirm("Excluir paciente? (não apaga agenda automaticamente)")) return;
              await BTXDB.del("patients", btn.dataset.id);
              toast("Paciente excluído ✅");
              await renderPatientList();
              buildPreview();
            };
          });
        }

        await renderPatientList();
      },
      buildPreviewBody: async () => {
        const q = (document.getElementById("p_search")?.value || "");
        const list = await findPatients(q);
        return [
          `<div class="doc-title">Pacientes (${list.length})</div>`,
          list.length ? `<div class="doc-block">${esc(list.slice(0,50).map(p=> `${p.name}${p.phone?(" • "+p.phone):""}`).join("\n"))}${list.length>50 ? "\n… (lista parcial)" : ""}</div>` : `<p class="doc-line">Nenhum paciente cadastrado.</p>`
        ].join("");
      }
    },

    prontuario: {
      title: "Prontuário",
      sub: "Registro do que foi feito no paciente (procedimento, evolução, conduta).",
      renderForm: async () => {
        const focusPatientId = await getSetting("prontuario_focus_patientId", "");
        const focusPatient = focusPatientId ? await BTXDB.get("patients", focusPatientId) : null;

        const draft = await loadDraft("encounter_form") || {};
        const date = draft.date || todayISO();

        return `
          <div class="doc-title">Selecionar paciente</div>
          <input id="pr_search" placeholder="Buscar paciente..." />
          <select id="pr_patientId">
            <option value="">— selecione —</option>
          </select>

          <div class="doc-title">Registro do atendimento</div>

          <div class="row">
            <div>
              <label>Data</label>
              <input id="pr_date" type="date" value="${esc(date)}" />
            </div>
            <div>
              <label>Hora</label>
              <input id="pr_time" type="time" value="${esc(draft.time||"")}" />
            </div>
          </div>

          <label>Procedimentos realizados</label>
          <textarea id="pr_procedure" placeholder="Ex.: exodontia, restauração, consulta, curativo..." >${esc(draft.procedure||"")}</textarea>

          <label>Evolução / Observações clínicas</label>
          <textarea id="pr_evolution" placeholder="Ex.: paciente sem dor, edema leve, orientações..." >${esc(draft.evolution||"")}</textarea>

          <label>Conduta / Plano</label>
          <textarea id="pr_conduct" placeholder="Ex.: retorno em 7 dias, prescrição, encaminhamento..." >${esc(draft.conduct||"")}</textarea>

          <label>Anexos (nota)</label>
          <input id="pr_attachNote" placeholder="Ex.: foto enviada no WhatsApp / RX anexado..." value="${esc(draft.attachmentsNote||"")}" />

          <div class="actions" style="justify-content:flex-start; margin-top:10px;">
            <button class="btn btn-primary" type="button" id="btnPr_Save">Salvar atendimento</button>
            <button class="btn btn-ghost" type="button" id="btnPr_Clear">Limpar</button>
          </div>

          <div class="doc-title">Histórico do paciente</div>
          <div id="pr_history" class="list"></div>

          <p class="small" style="margin-top:10px;">
            <b>Memória forte:</b> tudo é salvo no IndexedDB. Mesmo offline, mesmo fechando o app.
          </p>
        `;
      },
      afterRender: async () => {
        const sel = $("pr_patientId");
        const search = $("pr_search");

        async function fillPatients(q=""){
          const list = await findPatients(q);
          const focusPatientId = await getSetting("prontuario_focus_patientId", "");
          sel.innerHTML = `<option value="">— selecione —</option>` + list.slice(0,120).map(p =>
            `<option value="${esc(p.id)}">${esc(p.name)}${p.phone?(" • "+esc(p.phone)):""}</option>`
          ).join("");
          if(focusPatientId) sel.value = focusPatientId;
        }

        async function autosave(){
          await saveDraft("encounter_form", {
            appointmentId: (await loadDraft("encounter_form"))?.appointmentId || "",
            date: $("pr_date").value || todayISO(),
            time: $("pr_time").value || "",
            patientId: sel.value || "",
            patientName: "",
            procedure: $("pr_procedure").value || "",
            evolution: $("pr_evolution").value || "",
            conduct: $("pr_conduct").value || "",
            attachmentsNote: $("pr_attachNote").value || ""
          });
        }

        ["pr_date","pr_time","pr_procedure","pr_evolution","pr_conduct","pr_attachNote","pr_patientId"]
          .forEach(id => {
            const el = $(id);
            el.addEventListener("input", autosave);
            el.addEventListener("change", autosave);
          });

        let __t = null;
        search.addEventListener("input", () => {
          clearTimeout(__t);
          __t = setTimeout(async () => {
            await fillPatients(search.value || "");
          }, 160);
        });

        sel.addEventListener("change", async () => {
          await setSetting("prontuario_focus_patientId", sel.value || "");
          await renderHistory();
          buildPreview();
        });

        $("btnPr_Clear").onclick = async () => {
          $("pr_date").value = todayISO();
          $("pr_time").value = "";
          $("pr_procedure").value = "";
          $("pr_evolution").value = "";
          $("pr_conduct").value = "";
          $("pr_attachNote").value = "";
          await autosave();
          toast("Form limpo ✅");
          buildPreview();
        };

        $("btnPr_Save").onclick = async () => {
          const pid = sel.value || "";
          if(!pid){
            alert("Selecione um paciente.");
            return;
          }
          const p = await BTXDB.get("patients", pid);
          if(!p){
            alert("Paciente inválido. Cadastre primeiro.");
            return;
          }

          const draft = await loadDraft("encounter_form") || {};
          const apptId = draft.appointmentId || "";

          const encounter = {
            patientId: pid,
            patientName: p.name || "",
            appointmentId: apptId || "",
            date: $("pr_date").value || todayISO(),
            time: $("pr_time").value || "",
            procedure: $("pr_procedure").value || "",
            evolution: $("pr_evolution").value || "",
            conduct: $("pr_conduct").value || "",
            attachmentsNote: $("pr_attachNote").value || ""
          };

          await BTXDB.put("encounters", { id: uid(), ...encounter, createdAt: Date.now(), updatedAt: Date.now() });

          toast("Atendimento salvo no prontuário ✅");

          // se veio de agendamento, pode marcar como concluído automaticamente (opcional)
          if(apptId){
            const appt = await BTXDB.get("appointments", apptId);
            if(appt){
              appt.status = "concluido";
              appt.updatedAt = Date.now();
              await BTXDB.put("appointments", appt);
            }
          }

          // limpa o draft do appointmentId (pra não ficar “preso”)
          await saveDraft("encounter_form", { date: todayISO(), time:"", patientId: pid, procedure:"", evolution:"", conduct:"", attachmentsNote:"" });

          await renderHistory();
          buildPreview();
        };

        async function renderHistory(){
          const pid = sel.value || "";
          if(!pid){
            $("pr_history").innerHTML = `<div class="small">Selecione um paciente para ver histórico.</div>`;
            return;
          }
          const p = await BTXDB.get("patients", pid);
          const list = await listEncountersByPatient(pid);

          $("pr_history").innerHTML = `
            <div class="item">
              <div class="rowline"><div><b>${esc(p?.name || "Paciente")}</b></div><div class="muted">${esc(p?.phone || "")}</div></div>
              ${p?.notes ? `<div class="muted">Obs: ${esc(p.notes)}</div>` : ""}
            </div>
          ` + (list.length ? list.map(e => `
            <div class="item">
              <div class="rowline">
                <div><b>${esc(fmtDateBR(e.date||""))}</b> ${esc(e.time||"")}</div>
                <div class="muted">${esc(e.appointmentId ? "via agenda" : "manual")}</div>
              </div>
              ${e.procedure ? `<div class="muted"><b>Proced:</b> ${esc(e.procedure)}</div>` : ""}
              ${e.evolution ? `<div class="muted"><b>Evol:</b> ${esc(e.evolution)}</div>` : ""}
              ${e.conduct ? `<div class="muted"><b>Conduta:</b> ${esc(e.conduct)}</div>` : ""}
              ${e.attachmentsNote ? `<div class="muted"><b>Anexos:</b> ${esc(e.attachmentsNote)}</div>` : ""}
              <div class="btnrow">
                <button class="btn btn-danger" type="button" data-act="delEnc" data-id="${esc(e.id)}">Excluir</button>
              </div>
            </div>
          `).join("") : `<div class="small">Nenhum atendimento registrado ainda.</div>`);

          document.querySelectorAll("[data-act='delEnc']").forEach(btn=>{
            btn.onclick = async () => {
              if(!confirm("Excluir registro do prontuário?")) return;
              await BTXDB.del("encounters", btn.dataset.id);
              toast("Registro excluído ✅");
              await renderHistory();
              buildPreview();
            };
          });
        }

        await fillPatients("");
        // tenta restaurar focus
        const focus = await getSetting("prontuario_focus_patientId", "");
        if(focus) sel.value = focus;

        await renderHistory();
      },
      buildPreviewBody: async () => {
        const focus = await getSetting("prontuario_focus_patientId", "");
        if(!focus){
          return `<p class="doc-line">Selecione um paciente na aba Prontuário.</p>`;
        }
        const p = await BTXDB.get("patients", focus);
        const list = await listEncountersByPatient(focus);

        const body = [
          `<div class="doc-title">Prontuário — ${esc(p?.name || "")}</div>`,
          line("Telefone", p?.phone || ""),
          line("Nascimento", p?.birth ? fmtDateBR(p.birth) : ""),
          p?.notes ? block("Observações gerais", p.notes) : "",
          `<div class="doc-title">Histórico (${list.length})</div>`,
          list.length ? list.slice(0,40).map(e => {
            return `
              <div class="doc-block">
                <b>${esc(fmtDateBR(e.date||""))} ${esc(e.time||"")}</b>
                ${e.procedure ? `\n\nProcedimentos:\n${e.procedure}` : ""}
                ${e.evolution ? `\n\nEvolução:\n${e.evolution}` : ""}
                ${e.conduct ? `\n\nConduta:\n${e.conduct}` : ""}
                ${e.attachmentsNote ? `\n\nAnexos:\n${e.attachmentsNote}` : ""}
              </div>
            `;
          }).join("") : `<p class="doc-line">Sem atendimentos.</p>`
        ].filter(Boolean).join("");

        return body;
      }
    },

    backup: {
      title: "Backup",
      sub: "Exportar/Importar para nunca perder nada.",
      renderForm: async () => {
        return `
          <div class="doc-title">Exportar (JSON)</div>
          <p class="small">Gera um arquivo com pacientes, agenda e prontuário. Guarde no Drive/WhatsApp.</p>
          <div class="actions" style="justify-content:flex-start;">
            <button class="btn btn-primary" type="button" id="btnBkExport">Exportar backup</button>
          </div>

          <div class="doc-title">Importar (JSON)</div>
          <p class="small">Cole o JSON abaixo e importe (sobrescreve/adiciona registros).</p>
          <textarea id="bkInput" placeholder="{ ... }"></textarea>
          <div class="actions" style="justify-content:flex-start;">
            <button class="btn btn-ghost" type="button" id="btnBkImport">Importar backup</button>
            <button class="btn btn-ghost" type="button" id="btnBkClear">Limpar caixa</button>
          </div>

          <div class="doc-title">Diagnóstico</div>
          <div id="bkStats" class="doc-block">Carregando…</div>
        `;
      },
      afterRender: async () => {
        async function refreshStats(){
          const patients = await BTXDB.getAll("patients");
          const appts = await BTXDB.getAll("appointments");
          const encs = await BTXDB.getAll("encounters");
          $("bkStats").textContent =
            `Pacientes: ${patients.length}\nAgenda: ${appts.length}\nProntuário: ${encs.length}\nAtualizado: ${new Date().toLocaleString("pt-BR")}`;
        }

        $("btnBkExport").onclick = async () => {
          const payload = await BTXDB.exportAll();
          const txt = JSON.stringify(payload, null, 2);

          // baixa arquivo
          const blob = new Blob([txt], { type:"application/json" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = `BTX-Backup-${new Date().toISOString().slice(0,10)}.json`;
          a.click();
          setTimeout(()=>URL.revokeObjectURL(a.href), 800);

          toast("Backup exportado ✅");
          await refreshStats();
          buildPreview();
        };

        $("btnBkImport").onclick = async () => {
          const raw = ($("bkInput").value || "").trim();
          if(!raw){ alert("Cole o JSON do backup."); return; }
          try{
            const obj = JSON.parse(raw);
            await BTXDB.importAll(obj);
            toast("Backup importado ✅");
            await refreshStats();
            buildPreview();
          }catch(e){
            alert("JSON inválido.");
          }
        };

        $("btnBkClear").onclick = () => {
          $("bkInput").value = "";
          toast("Caixa limpa ✅");
        };

        await refreshStats();
      },
      buildPreviewBody: async () => {
        const patients = await BTXDB.getAll("patients");
        const appts = await BTXDB.getAll("appointments");
        const encs = await BTXDB.getAll("encounters");
        return [
          `<div class="doc-title">Resumo do sistema</div>`,
          `<div class="doc-block">Pacientes: ${patients.length}\nAgenda: ${appts.length}\nProntuário: ${encs.length}</div>`,
          `<p class="doc-line">Use a aba Backup para exportar/guardar seus dados.</p>`
        ].join("");
      }
    }
  };

  async function renderTab(tab){
    currentTab = tab;

    document.querySelectorAll(".tabbtn").forEach(b=>{
      b.classList.toggle("active", b.dataset.tab === tab);
    });

    $("docTitle").textContent = TABS[tab].title;
    $("docSub").textContent = TABS[tab].sub;

    $("formPanel").innerHTML = `<div class="small">Carregando…</div>`;
    $("formPanel").innerHTML = await TABS[tab].renderForm();

    if (typeof TABS[tab].afterRender === "function") {
      await TABS[tab].afterRender();
    }

    await buildPreview();
  }

  async function buildPreview(){
    const now = new Date();
    $("pvMeta").textContent = `${now.toLocaleDateString("pt-BR")} • ${now.toLocaleTimeString("pt-BR").slice(0,5)}`;
    $("pvTitle").textContent = TABS[currentTab].title;
    $("pvSub").textContent = TABS[currentTab].sub;

    const lines = profLines(currentProf);
    $("profResumo").textContent = (lines.length ? `${lines[0]}${lines[1] ? " — " + lines[1] : ""}` : "—");
    $("topInfo").textContent = lines.length ? `Profissional salvo: ${lines[0]}` : "Preencha os dados do profissional (salva offline).";

    $("pvBody").innerHTML = await TABS[currentTab].buildPreviewBody();

    if (lines.length){
      const conselhoReg = lines[2] || "";
      $("pvSign").innerHTML = `
        <div class="sigrow">
          <div class="sig">
            <div class="line"></div>
            <div><b>${esc(lines[0] || "")}</b></div>
            <div style="font-size:12px;color:#334155;">${esc(conselhoReg)}</div>
          </div>
          <div class="sig">
            <div class="line"></div>
            <div><b>Assinatura do(a) paciente / responsável</b></div>
            <div style="font-size:12px;color:#334155;">(quando aplicável)</div>
          </div>
        </div>
      `;
    } else {
      $("pvSign").innerHTML = `<div class="small" style="color:#374151;">(Preencha os dados do profissional para aparecer assinatura.)</div>`;
    }
  }

  // BUTTONS
  async function init(){
    // Tabs
    document.querySelectorAll(".tabbtn").forEach(btn=>{
      btn.addEventListener("click", ()=>renderTab(btn.dataset.tab));
    });

    // Prof load
    currentProf = await getSetting(PROF_KEY, null);
    setProfToUI(currentProf);

    $("btnSalvarProf").addEventListener("click", async ()=>{
      const p = readProfFromUI();
      if (!p.nome){
        alert("Digite pelo menos o nome do profissional para salvar.");
        return;
      }
      await setSetting(PROF_KEY, p);
      currentProf = p;
      toast("Profissional salvo ✅");
      await buildPreview();
    });

    $("btnLimparProf").addEventListener("click", async ()=>{
      await setSetting(PROF_KEY, null);
      currentProf = null;
      setProfToUI(null);
      toast("Profissional limpo ✅");
      await buildPreview();
    });

    $("btnLimparForm").addEventListener("click", async ()=>{
      // limpa drafts do tab atual (só o que faz sentido)
      if(currentTab === "agenda") await saveDraft("agenda_form", { date: todayISO() });
      if(currentTab === "pacientes") await saveDraft("patient_form", {});
      if(currentTab === "prontuario") await saveDraft("encounter_form", { date: todayISO() });
      toast("Formulário limpo ✅");
      await renderTab(currentTab);
    });

    $("btnPrint").addEventListener("click", async ()=>{
      await buildPreview();
      window.print();
    });

    $("btnResetAll").addEventListener("click", async ()=>{
      if(!confirm("Tem certeza? Isso apaga TUDO (pacientes, agenda, prontuário e profissional) do aparelho.")) return;
      await BTXDB.wipeAll();
      currentProf = null;
      setProfToUI(null);
      toast("Tudo zerado ✅");
      await renderTab("agenda");
    });

    // init first tab
    await renderTab("agenda");
  }

  init().catch(err => {
    console.error(err);
    alert("Erro ao iniciar o app. Veja o console.");
  });
})();
