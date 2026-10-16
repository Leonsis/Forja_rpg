const fichas = ['dd', 't20', 'oprpg'];

async function incHTML(elementId, path) {
    const element = document.getElementById(elementId);
    if (!element) throw new Error(`Elemento #${elementId} não encontrado.`);

    const response = await fetch(path);
    if (!response.ok) throw new Error(`Erro ao carregar ${path}: HTTP ${response.status}`);
    element.innerHTML = await response.text();
}

async function fichaHTML() {
    const container = document.getElementById('fichas');
    if (!container) throw new Error('Elemento #fichas não encontrado.');

    const contents = await Promise.all(fichas.map(async ficha => {
        const path = `./src/fichas/${ficha}.html`;
        const response = await fetch(path);
        if (!response.ok) throw new Error(`Erro ao carregar ${path}: HTTP ${response.status}`);
        return { ficha, html: await response.text() };
    }));

    contents.forEach(({ ficha, html }) => {
        const wrapper = document.createElement('div');
        wrapper.id = `ficha-${ficha}`;
        wrapper.innerHTML = html;
        container.appendChild(wrapper);
    });
}
/* ============================================================
       1. ESTADO GLOBAL
    ============================================================ */
    let currentSystem = 'dnd5e';
    let currentArea = 'herois';
    let autosaveTimer = null;
    let dirty = false;
    let lastSaved = null;

    const STORAGE_KEY = 'forja_rpg_sheets_v1';
    const STORAGE_SYSTEM = 'forja_rpg_system';
    const MONSTERS_STORAGE_KEY = 'forja_monstros_multi_v1';
    const MONSTER_AUTOSAVE_DELAY = 700;

    let monsters = [];
    const monsterAutosaveTimers = {};
    const diceHistory = [];
    let initList = [];
    let currentTurn = 0;

    /* ============================================================
       2. NAVEGAÇÃO ENTRE ÁREAS E SISTEMAS
    ============================================================ */
    function showArea(area) {
      currentArea = area;
      document.querySelectorAll('.area-panel').forEach(p => p.classList.remove('active'));
      const target = document.getElementById('area-' + area);
      if (target) target.classList.add('active');
      document.querySelectorAll('.navbar .nav-link[data-area]').forEach(l => {
        l.classList.toggle('active', l.dataset.area === area);
      });
      const nc = document.getElementById('navMenu');
      if (nc?.classList.contains('show')) new bootstrap.Collapse(nc).hide();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      try { localStorage.setItem('forja_area_ativa', area); } catch(e) {}
    }

    function showSystem(system) {
      currentSystem = system;
      document.querySelectorAll('.system-panel').forEach(p => p.classList.remove('active'));
      const panel = document.getElementById('system-' + system);
      if (panel) panel.classList.add('active');

      document.querySelectorAll('.system-options button').forEach(btn => {
        const a = btn.dataset.system === system;
        btn.classList.toggle('active', a);
        btn.setAttribute('aria-selected', a ? 'true' : 'false');
      });

      const t = document.getElementById('pageTitle');
      const s = document.getElementById('pageSubtitle');
      if (system === 't20') {
        t.textContent = 'Forje seu Herói — Tormenta 20';
        s.textContent = 'Ficha oficial de Tormenta 20 — preencha, salve e leve para Arton.';
      } else if (system === 'oprpg') {
        t.textContent = 'Forje seu Herói — Ordem Paranormal';
        s.textContent = 'Ficha de agente da Ordem — enfrente o Outro Lado com estilo.';
      } else {
        t.textContent = 'Forje seu Herói — D&D 5e';
        s.textContent = 'Ficha oficial de D&D 5e — preencha, salve e leve para a mesa.';
      }

      updateSystemLabel(system);
      closeSystemMenu();
      try { localStorage.setItem(STORAGE_SYSTEM, system); } catch(e) {}
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (system === 't20') updateT20Mods();
      if (system === 'oprpg') { recalcAllOPRPGSkills(); updateOPRPGDefense(); }
      updateSaveIndicator();
    }

    /* ============================================================
       3. MENU ACORDEÃO DO SELETOR
    ============================================================ */
    function toggleSystemMenu(event) {
      if (event) event.stopPropagation();
      const selector = document.getElementById('systemSelector');
      const toggle = selector.querySelector('.system-toggle');
      if (!selector) return;
      const isOpen = selector.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }

    function closeSystemMenu() {
      const selector = document.getElementById('systemSelector');
      const toggle = selector?.querySelector('.system-toggle');
      if (!selector) return;
      selector.classList.remove('open');
      toggle?.setAttribute('aria-expanded', 'false');
    }

    function updateSystemLabel(system) {
      const label = document.getElementById('currentSystemLabel');
      if (!label) return;
      const names = { 'dnd5e': 'D&D 5e', 't20': 'Tormenta 20', 'oprpg': 'Ordem Paranormal' };
      label.textContent = names[system] || 'Escolher Sistema';
    }

    /* ============================================================
       4. MODIFICADORES — D&D 5e
    ============================================================ */
    function calcModDnD(v) {
      const n = parseInt(v) || 10;
      const m = Math.floor((n - 10) / 2);
      return (m >= 0 ? '+' : '') + m;
    }
    const attrIds = ['forca', 'destreza', 'constituicao', 'inteligencia', 'sabedoria', 'carisma'];
    const attrMap = {
      'força': 'forca', 'destreza': 'destreza', 'constituição': 'constituicao',
      'inteligência': 'inteligencia', 'sabedoria': 'sabedoria', 'carisma': 'carisma'
    };

    function updateAllMods() {
      attrIds.forEach(id => {
        const i = document.getElementById(id);
        const m = document.getElementById(id + 'Mod');
        if (i && m) m.value = calcModDnD(i.value);
      });
      document.querySelectorAll('#system-dnd5e .check-item').forEach(item => {
        const n = item.querySelector('.name'); if (!n) return;
        const k = n.textContent.toLowerCase().trim();
        const a = attrMap[k];
        if (a) {
          const el = document.getElementById(a);
          if (el) item.querySelector('.mod').value = calcModDnD(el.value);
        }
      });
    }

    /* ============================================================
       5. MODIFICADORES — TORMENTA 20
    ============================================================ */
    const t20AttrIds = ['t20_for', 't20_des', 't20_con', 't20_int', 't20_sab', 't20_car'];

    function updateT20Mods() {
      t20AttrIds.forEach(id => {
        const i = document.getElementById(id);
        const m = document.getElementById(id + '_mod');
        if (!i || !m) return;
        const v = parseInt(i.value) || 0;
        const mod = Math.floor((v - 10) / 2);
        m.textContent = (mod >= 0 ? '+' : '') + mod;
      });
    }

    const t20Skills = [
      { key:'acrobacia', name:'Acrobacia*', attr:'des' }, { key:'adestramento', name:'Adestramento*', attr:'car' },
      { key:'atletismo', name:'Atletismo', attr:'for' }, { key:'atuacao', name:'Atuação', attr:'car' },
      { key:'cavalgar', name:'Cavalgar', attr:'des' }, { key:'conhecimento', name:'Conhecimento*', attr:'int' },
      { key:'cura', name:'Cura', attr:'sab' }, { key:'diplomacia', name:'Diplomacia', attr:'car' },
      { key:'enganacao', name:'Enganação', attr:'car' }, { key:'fortitude', name:'Fortitude', attr:'con' },
      { key:'furtividade', name:'Furtividade*', attr:'des' }, { key:'guerra', name:'Guerra*', attr:'int' },
      { key:'iniciativa', name:'Iniciativa', attr:'des' }, { key:'intimidacao', name:'Intimidação', attr:'car' },
      { key:'intuicao', name:'Intuição', attr:'sab' }, { key:'investigacao', name:'Investigação', attr:'int' },
      { key:'jogatina', name:'Jogatina*', attr:'car' }, { key:'ladinagem', name:'Ladinagem*', attr:'des' },
      { key:'luta', name:'Luta', attr:'for' }, { key:'misticismo', name:'Misticismo*', attr:'int' },
      { key:'nobreza', name:'Nobreza*', attr:'int' }, { key:'percepcao', name:'Percepção', attr:'sab' },
      { key:'pilotagem', name:'Pilotagem*', attr:'des' }, { key:'pontaria', name:'Pontaria', attr:'des' },
      { key:'reflexos', name:'Reflexos', attr:'des' }, { key:'religiao', name:'Religião*', attr:'sab' },
      { key:'sobrevivencia', name:'Sobrevivência', attr:'sab' }, { key:'vontade', name:'Vontade', attr:'sab' }
    ];

    function buildT20SkillsTable() {
      const tb = document.getElementById('t20-skills-body');
      if (!tb || tb.children.length > 0) return;
      tb.innerHTML = t20Skills.map(sk => `
        <tr>
          <td class="skill-name">${sk.name}</td>
          <td><input type="number" id="t20_sk_${sk.key}_total" data-skill="${sk.key}"></td>
          <td><input type="number" id="t20_sk_${sk.key}_niv" data-skill="${sk.key}"></td>
          <td><input type="number" id="t20_sk_${sk.key}_atr" data-skill="${sk.key}"></td>
          <td><input type="checkbox" id="t20_sk_${sk.key}_trn" data-skill="${sk.key}"></td>
          <td><input type="number" id="t20_sk_${sk.key}_out" data-skill="${sk.key}"></td>
        </tr>`).join('');
      tb.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('input', () => { recalcT20Skill(inp.dataset.skill); markDirty(); });
        inp.addEventListener('change', () => { recalcT20Skill(inp.dataset.skill); markDirty(); });
      });
    }

    function recalcT20Skill(k) {
      if (!k) return;
      const t = document.getElementById(`t20_sk_${k}_total`); if (!t) return;
      const n = parseInt(document.getElementById(`t20_sk_${k}_niv`)?.value) || 0;
      const a = parseInt(document.getElementById(`t20_sk_${k}_atr`)?.value) || 0;
      const tr = document.getElementById(`t20_sk_${k}_trn`)?.checked ? 5 : 0;
      const o = parseInt(document.getElementById(`t20_sk_${k}_out`)?.value) || 0;
      t.value = Math.floor(n / 2) + a + tr + o;
    }

    function buildT20EquipmentTable() {
      const tb = document.getElementById('t20-equip-body');
      if (!tb || tb.children.length > 0) return;
      let h = '';
      for (let i = 1; i <= 10; i++) h += `<tr><td><input id="t20_eq${i}_nome"></td><td><input id="t20_eq${i}_peso"></td></tr>`;
      tb.innerHTML = h;
    }

    /* ============================================================
       6. MODIFICADORES — ORDEM PARANORMAL
    ============================================================ */
    const oprpgSkills = [
      { key:'acrobacia', name:'Acrobacia', attr:'AGI', treino:false },
      { key:'adestramento', name:'Adestramento*', attr:'PRE', treino:true },
      { key:'artes', name:'Artes', attr:'PRE', treino:false },
      { key:'atletismo', name:'Atletismo', attr:'FOR', treino:false },
      { key:'atualidades', name:'Atualidades', attr:'INT', treino:false },
      { key:'ciencias', name:'Ciências*', attr:'INT', treino:true },
      { key:'crime', name:'Crime*', attr:'AGI', treino:true },
      { key:'diplomacia', name:'Diplomacia', attr:'PRE', treino:false },
      { key:'enganacao', name:'Enganação', attr:'PRE', treino:false },
      { key:'fortitude', name:'Fortitude', attr:'VIG', treino:false },
      { key:'furtividade', name:'Furtividade+', attr:'AGI', treino:true },
      { key:'iniciativa', name:'Iniciativa', attr:'AGI', treino:false },
      { key:'intimidacao', name:'Intimidação', attr:'PRE', treino:false },
      { key:'intuicao', name:'Intuição', attr:'PRE', treino:false },
      { key:'investigacao', name:'Investigação', attr:'INT', treino:false },
      { key:'luta', name:'Luta', attr:'FOR', treino:false },
      { key:'medicina', name:'Medicina', attr:'INT', treino:false },
      { key:'ocultismo', name:'Ocultismo*', attr:'INT', treino:true },
      { key:'percepcao', name:'Percepção', attr:'PRE', treino:false },
      { key:'pilotagem', name:'Pilotagem*', attr:'AGI', treino:true },
      { key:'pontaria', name:'Pontaria', attr:'AGI', treino:false },
      { key:'profissao', name:'Profissão*', attr:'INT', treino:true },
      { key:'reflexos', name:'Reflexos', attr:'AGI', treino:false },
      { key:'religiao', name:'Religião*', attr:'PRE', treino:true },
      { key:'sobrevivencia', name:'Sobrevivência', attr:'INT', treino:false },
      { key:'tatica', name:'Tática*', attr:'INT', treino:true },
      { key:'tecnologia', name:'Tecnologia*', attr:'INT', treino:true },
      { key:'vontade', name:'Vontade', attr:'PRE', treino:false }
    ];
    const oprpgAttrMap = { 'AGI': 'op_agi', 'FOR': 'op_for', 'INT': 'op_int', 'PRE': 'op_pre', 'VIG': 'op_vig' };

    function buildOPRPGSkillsTable() {
      const tb = document.getElementById('oprpg-skills-body');
      if (!tb || tb.children.length > 0) return;
      tb.innerHTML = oprpgSkills.map(sk => `
        <tr>
          <td class="skill-name">${sk.name}</td>
          <td class="skill-attr">${sk.attr}</td>
          <td><input type="number" id="op_sk_${sk.key}_bonus" data-skill="${sk.key}" value="0"></td>
          <td><input type="checkbox" id="op_sk_${sk.key}_treino" data-skill="${sk.key}"></td>
          <td><input type="number" id="op_sk_${sk.key}_outros" data-skill="${sk.key}" value="0"></td>
        </tr>`).join('');
      tb.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('input', () => { recalcOPRPGSkill(inp.dataset.skill); markDirty(); });
        inp.addEventListener('change', () => { recalcOPRPGSkill(inp.dataset.skill); markDirty(); });
      });
    }

    function recalcOPRPGSkill(key) {
      if (!key) return;
      const skill = oprpgSkills.find(s => s.key === key); if (!skill) return;
      const bonusEl = document.getElementById(`op_sk_${key}_bonus`);
      const treinoEl = document.getElementById(`op_sk_${key}_treino`);
      const outrosEl = document.getElementById(`op_sk_${key}_outros`);
      if (!bonusEl) return;
      const attrInput = document.getElementById(oprpgAttrMap[skill.attr]);
      const attrVal = parseInt(attrInput?.value) || 0;
      const treino = treinoEl?.checked ? 5 : 0;
      const outros = parseInt(outrosEl?.value) || 0;
      bonusEl.value = attrVal + treino + outros;
    }

    function recalcAllOPRPGSkills() {
      oprpgSkills.forEach(sk => recalcOPRPGSkill(sk.key));
    }

    function updateOPRPGDefense() {
      const agi = parseInt(document.getElementById('op_agi')?.value) || 0;
      const equip = parseInt(document.getElementById('op_def_equip')?.value) || 0;
      const outros = parseInt(document.getElementById('op_def_outros')?.value) || 0;
      const el = document.getElementById('op_defesa');
      if (el) el.value = 10 + agi + equip + outros;
    }

    function buildOPRPGInventory() {
      const tb = document.getElementById('oprpg-inv-body');
      if (!tb || tb.children.length > 0) return;
      let html = '';
      for (let i = 1; i <= 10; i++) {
        html += `<tr>
          <td><input id="op_inv${i}_item"></td>
          <td><input id="op_inv${i}_cat"></td>
          <td><input id="op_inv${i}_esp"></td>
          <td><input id="op_inv${i}_qtd"></td>
          <td><input id="op_inv${i}_peso"></td>
        </tr>`;
      }
      tb.innerHTML = html;
    }

    /* ============================================================
       7. CACHE / SALVAR / CARREGAR
    ============================================================ */
    function collectFormData() {
      const d = {};
      document.querySelectorAll('#area-herois input[id], #area-herois textarea[id]').forEach(el => {
        if (el.type === 'checkbox') d[el.id] = el.checked;
        else d[el.id] = el.value;
      });
      d.__meta = { savedAt: new Date().toISOString() };
      return d;
    }

    function applyFormData(d) {
      if (!d) return;
      Object.keys(d).forEach(k => {
        if (k === '__meta') return;
        const el = document.getElementById(k); if (!el) return;
        if (el.type === 'checkbox') el.checked = !!d[k];
        else el.value = d[k];
      });
    }

    function saveSheet(silent) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(collectFormData()));
        dirty = false;
        lastSaved = new Date();
        updateSaveIndicator();
        if (!silent) showToast('Ficha salva!', 'success');
      } catch(e) {
        if (!silent) showToast('Erro ao salvar.', 'error');
      }
    }

    function loadSheet() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return;
        const d = JSON.parse(raw);
        applyFormData(d);
        if (d.__meta?.savedAt) lastSaved = new Date(d.__meta.savedAt);
        updateAllMods();
        updateT20Mods();
        recalcAllOPRPGSkills();
        updateOPRPGDefense();
        updateSaveIndicator();
      } catch(e) {}
    }

    function clearSystemCache(sys) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return;
        const d = JSON.parse(raw), nd = {};
        Object.keys(d).forEach(k => {
          if (k === '__meta') return;
          const isT20 = k.startsWith('t20_');
          const isOP = k.startsWith('op_');
          if (sys === 't20') { if (!isT20) nd[k] = d[k]; }
          else if (sys === 'oprpg') { if (!isOP) nd[k] = d[k]; }
          else { if (isT20 || isOP) nd[k] = d[k]; }
        });
        nd.__meta = { savedAt: new Date().toISOString() };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nd));
      } catch(e) {}
    }

    function markDirty() {
      dirty = true;
      updateSaveIndicator();
      clearTimeout(autosaveTimer);
      autosaveTimer = setTimeout(() => saveSheet(true), 800);
    }

    function updateSaveIndicator() {
      const el = document.getElementById('saveIndicator'); if (!el) return;
      if (!lastSaved) {
        el.textContent = dirty ? 'Alterações não salvas' : 'Nenhum salvamento ainda';
        el.classList.toggle('dirty', dirty);
        return;
      }
      const w = lastSaved.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
      el.textContent = dirty ? 'Salvando...' : `Salvo às ${w}`;
      el.classList.toggle('dirty', dirty);
    }

    function showToast(msg, type) {
      const t = document.getElementById('toastSave'); if (!t) return;
      const c = {
        success: ['#8b1e1e', '#a83328'],
        info: ['#5c3a1e', '#3d2415'],
        error: ['#7a1010', '#a83328']
      };
      const [c1, c2] = c[type] || c.success;
      t.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
      const ic = { success:'fa-check-circle', info:'fa-circle-info', error:'fa-triangle-exclamation' }[type] || 'fa-check-circle';
      t.innerHTML = `<i class="fas ${ic} me-2"></i>${msg}`;
      t.classList.add('show');
      clearTimeout(t._hideTimer);
      t._hideTimer = setTimeout(() => t.classList.remove('show'), 2800);
    }

    /* ============================================================
       8. AÇÕES DE FICHA (salvar, limpar, importar, exportar)
    ============================================================ */
    function saveAll() { saveSheet(false); }

    function resetSystem(sys) {
      const n = sys === 't20' ? 'Tormenta 20' : sys === 'oprpg' ? 'Ordem Paranormal' : 'D&D 5e';
      if (!confirm(`Limpar a ficha de ${n}?`)) return;
      resetSystemFields(sys);
    }

    function resetSystemFields(sys) {
      const p = document.getElementById('system-' + sys); if (!p) return;
      p.querySelectorAll('input, textarea').forEach(el => {
        if (el.type === 'checkbox') el.checked = false;
        else if (el.type === 'number') {
          if (attrIds.includes(el.id) || t20AttrIds.includes(el.id)) el.value = 10;
          else if (['op_agi','op_for','op_int','op_pre','op_vig'].includes(el.id)) el.value = 1;
          else if (el.id === 'profBonus') el.value = 2;
          else if (el.id === 'ca' || el.id === 't20_defesa') el.value = 10;
          else if (el.id === 'op_defesa') el.value = 11;
          else if (el.id === 'deslocamento') el.value = 9;
          else if (['pvTotal','pvAtual','op_pv_max','op_pv_atual','op_san_max','op_san_atual'].includes(el.id)) el.value = 20;
          else if (el.id === 't20_pv_max' || el.id === 't20_pv_atual') el.value = 20;
          else if (el.id === 't20_pm_max' || el.id === 't20_pm_atual') el.value = 10;
          else el.value = 0;
        } else el.value = '';
      });
      if (sys === 't20') updateT20Mods();
      else if (sys === 'oprpg') { recalcAllOPRPGSkills(); updateOPRPGDefense(); }
      else updateAllMods();
      clearSystemCache(sys);
      saveSheet(true);
      const n = sys === 't20' ? 'Tormenta 20' : sys === 'oprpg' ? 'Ordem Paranormal' : 'D&D 5e';
      showToast(`Ficha de ${n} limpa.`, 'info');
    }

    function clearAllSystems() {
      if (!confirm('Apagar TODAS as fichas?')) return;
      document.querySelectorAll('#area-herois .system-panel input, #area-herois .system-panel textarea').forEach(el => {
        if (el.type === 'checkbox') el.checked = false;
        else if (el.type === 'number') el.value = 0;
        else el.value = '';
      });
      attrIds.forEach(id => { const e = document.getElementById(id); if (e) e.value = 10; });
      t20AttrIds.forEach(id => { const e = document.getElementById(id); if (e) e.value = 10; });
      ['op_agi','op_for','op_int','op_pre','op_vig'].forEach(id => { const e = document.getElementById(id); if (e) e.value = 1; });
      updateAllMods(); updateT20Mods(); recalcAllOPRPGSkills(); updateOPRPGDefense();
      localStorage.removeItem(STORAGE_KEY);
      lastSaved = null; dirty = false; updateSaveIndicator();
      showToast('Todas as fichas foram limpas.', 'info');
    }

    function exportSheet() {
      const blob = new Blob([JSON.stringify(collectFormData(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ficha_${Date.now()}.json`;
      a.click();
      showToast('Ficha exportada!', 'success');
    }

    function importSheet(inp) {
      const f = inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = e => {
        try {
          applyFormData(JSON.parse(e.target.result));
          updateAllMods(); updateT20Mods(); recalcAllOPRPGSkills(); updateOPRPGDefense(); markDirty();
          showToast('Ficha importada!', 'success');
        } catch(e) { showToast('Arquivo inválido.', 'error'); }
        inp.value = '';
      };
      r.readAsText(f);
    }

    /* ============================================================
       9. FORJA DO MESTRE — DADOS
    ============================================================ */
    function rollDice(s) {
      const q = parseInt(document.getElementById('diceQty')?.value) || 1;
      const m = parseInt(document.getElementById('diceMod')?.value) || 0;
      doRoll(q, s, m);
    }
    function rollCustom() {
      const q = parseInt(document.getElementById('diceQty')?.value) || 1;
      const s = parseInt(document.getElementById('diceSide')?.value) || 20;
      const m = parseInt(document.getElementById('diceMod')?.value) || 0;
      doRoll(q, s, m);
    }
    function doRoll(q, s, m) {
      q = Math.max(1, Math.min(20, q));
      s = Math.max(2, Math.min(100, s));
      const rolls = []; let total = 0;
      for (let i = 0; i < q; i++) {
        const r = Math.floor(Math.random() * s) + 1;
        rolls.push(r); total += r;
      }
      total += m;
      document.getElementById('diceResultValue').textContent = total;
      let lbl = `${q}d${s}`;
      if (m !== 0) lbl += (m > 0 ? ' + ' : ' - ') + Math.abs(m);
      lbl += ` [${rolls.join(', ')}]`;
      document.getElementById('diceResultLabel').textContent = lbl;
      diceHistory.unshift({ total, label: lbl });
      if (diceHistory.length > 20) diceHistory.pop();
      renderDiceHistory();
    }
    function renderDiceHistory() {
      const l = document.getElementById('diceHistory'); if (!l) return;
      if (diceHistory.length === 0) {
        l.innerHTML = '<li style="justify-content:center; opacity:0.6;"><em>Nenhuma rolagem ainda</em></li>';
        return;
      }
      l.innerHTML = diceHistory.map(h => `<li><span>${h.label}</span><strong>${h.total}</strong></li>`).join('');
    }
    function clearDiceHistory() {
      diceHistory.length = 0;
      renderDiceHistory();
      document.getElementById('diceResultValue').textContent = '—';
      document.getElementById('diceResultLabel').textContent = 'Aguardando rolagem';
    }

    /* ============================================================
       10. FORJA DO MESTRE — INICIATIVA
    ============================================================ */
    function addInitiative() {
      const n = document.getElementById('initName').value.trim();
      if (!n) { showToast('Digite um nome.', 'error'); return; }
      const v = parseInt(document.getElementById('initValue').value) || (Math.floor(Math.random() * 20) + 1);
      initList.push({ name: n, value: v, id: Date.now() + Math.random() });
      initList.sort((a, b) => b.value - a.value);
      document.getElementById('initName').value = '';
      document.getElementById('initValue').value = '';
      renderInitiative();
    }
    function rollInitiativeAll() {
      initList.forEach(i => i.value = Math.floor(Math.random() * 20) + 1);
      initList.sort((a, b) => b.value - a.value);
      renderInitiative();
      showToast('Iniciativa rolada!', 'success');
    }
    function renderInitiative() {
      const l = document.getElementById('initiativeList'); if (!l) return;
      if (initList.length === 0) {
        l.innerHTML = '<li style="text-align:center; padding:1rem; color:var(--texto-suave); font-style:italic;">Nenhum combatente ainda</li>';
        return;
      }
      l.innerHTML = initList.map((i, idx) => `
        <li class="init-item ${idx === currentTurn ? 'current' : ''}">
          <span class="init-pos">${idx + 1}º</span>
          <span class="init-name">${escapeHtml(i.name)}</span>
          <span class="init-value">${i.value}</span>
          <button class="init-remove" onclick="removeInitiative(${i.id})"><i class="fas fa-times"></i></button>
        </li>`).join('');
    }
    function removeInitiative(id) {
      initList = initList.filter(i => i.id !== id);
      if (currentTurn >= initList.length) currentTurn = 0;
      renderInitiative();
    }
    function nextTurn() {
      if (initList.length === 0) return;
      currentTurn = (currentTurn + 1) % initList.length;
      renderInitiative();
      showToast(`Turno de ${initList[currentTurn].name}`, 'info');
    }
    function clearInitiative() {
      if (!confirm('Limpar ordem?')) return;
      initList = []; currentTurn = 0;
      renderInitiative();
    }

    /* ============================================================
       11. FORJA DO MESTRE — NPC
    ============================================================ */
    const npcData = {
      nomes: ['Aldric','Mira','Thorn','Selene','Borin','Vera','Kael','Lyra','Dorin','Anya','Fenrir','Íris','Cassius','Naomi','Orin','Talia'],
      racas: ['Humano','Elfo','Anão','Halfling','Meio-Elfo','Meio-Orc','Tiefling','Draconato','Gnomo'],
      ocupacoes: ['Tavernheiro','Ferreiro','Mercador','Guarda','Nobre','Camponês','Sacerdote','Ladrão','Mago','Bardo'],
      tons: ['Amigável','Neutro','Desconfiado','Hostil','Excêntrico'],
      aparencias: ['Cabelos grisalhos e barba longa','Marcas de queimadura no rosto','Olhos de cores diferentes','Tatuagens rituais nos braços','Cicatriz sobre o olho esquerdo','Roupas surradas e gastas','Aparência elegante mas descuidada','Cheiro forte de ervas'],
      tracos: ['Fala muito rápido','Sempre sussurra','Ri em momentos errados','Cita provérbios antigos','Nunca olha nos olhos','Gesticula exageradamente','Tem um tique nervoso','Fala com sotaque carregado'],
      ganchos: ['Deve um favor a alguém perigoso','Procura por um parente desaparecido','Testemunhou algo que não devia','Tem um mapa para um tesouro','Está sendo chantageado','Carrega uma maldição antiga','Faz parte de uma sociedade secreta','Está apaixonado por alguém proibido']
    };
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    function generateNPC() {
      const rs = document.getElementById('npcRaca').value;
      const os = document.getElementById('npcOcupacao').value;
      const ts = document.getElementById('npcTom').value;
      const nome = pick(npcData.nomes);
      const raca = rs === 'Aleatório' ? pick(npcData.racas) : rs;
      const ocup = os === 'Aleatório' ? pick(npcData.ocupacoes) : os;
      const tom = ts === 'Aleatório' ? pick(npcData.tons) : ts;
      document.getElementById('npcNome').textContent = `${nome}, ${raca} ${ocup}`;
      document.getElementById('npcRacaResult').textContent = raca;
      document.getElementById('npcOcupacaoResult').textContent = ocup;
      document.getElementById('npcTomResult').textContent = tom;
      document.getElementById('npcAparencia').textContent = pick(npcData.aparencias);
      document.getElementById('npcTraco').textContent = pick(npcData.tracos);
      document.getElementById('npcGancho').textContent = pick(npcData.ganchos);
      document.getElementById('npcResult').style.display = 'block';
    }

    /* ============================================================
       12. FORJA DO MESTRE — TESOURO
    ============================================================ */
    function rollStr(q, s) { let t = 0; for (let i = 0; i < q; i++) t += Math.floor(Math.random() * s) + 1; return t; }
    function rollTreasure() {
      const d = Math.floor(Math.random() * 100) + 1;
      let r = '';
      if (d <= 15) r = 'Nada além de poeira';
      else if (d <= 30) r = `${rollStr(2,6)} moedas de cobre`;
      else if (d <= 45) r = `${rollStr(3,6)} moedas de prata`;
      else if (d <= 60) r = `${rollStr(2,10)} moedas de ouro`;
      else if (d <= 70) r = `${rollStr(1,4)} gemas de 10 PO`;
      else if (d <= 80) r = 'Poção de Cura';
      else if (d <= 88) r = 'Item mágico incomum';
      else if (d <= 95) r = 'Arma +1';
      else if (d <= 99) r = 'Item mágico raro';
      else r = 'Item lendário + 500 PO';
      document.getElementById('treasureText').textContent = r;
      document.getElementById('treasureResult').style.display = 'block';
    }

    /* ============================================================
       13. FORJA DOS MONSTROS
    ============================================================ */
    function createEmptyMonster() {
      return {
        monNome:'', monTipo:'Morto-Vivo', monTamanho:'Médio', monTendencia:'',
        monVD:'', monXP:'', monProf:'',
        monFor:10, monDes:10, monCon:10, monInt:10, monSab:10, monCar:10,
        monPV:'', monDefesa:'', monDesloc:'', monIniciativa:'',
        monPericias:'', monResistencias:'', monVulnerabilidades:'', monImunidades:'', monSentidos:'', monIdiomas:'',
        monAcao1_nome:'', monAcao1_bonus:'', monAcao1_dano:'', monAcao1_desc:'',
        monAcao2_nome:'', monAcao2_bonus:'', monAcao2_dano:'', monAcao2_desc:'',
        monAcao3_nome:'', monAcao3_bonus:'', monAcao3_dano:'', monAcao3_desc:'',
        monAcao4_nome:'', monAcao4_bonus:'', monAcao4_dano:'', monAcao4_desc:'',
        monAcao5_nome:'', monAcao5_bonus:'', monAcao5_dano:'', monAcao5_desc:'',
        monHabilidades:'', monAparencia:'', monComportamento:'', monHistoria:'', monTesouro:''
      };
    }

    function renderMonsterBody(m) {
      const d = m.data, id = m.id;
      const tipoOpts = ['Morto-Vivo','Aberração','Besta','Celestial','Construto','Corrupto','Dragão','Elemental','Fada','Fiend','Gigante','Humanoide','Limo','Monstruosidade','Planta','Paranormal']
        .map(o => `<option ${d.monTipo === o ? 'selected' : ''}>${o}</option>`).join('');
      const tamOpts = ['Minúsculo','Pequeno','Médio','Grande','Enorme','Colossal']
        .map(o => `<option ${d.monTamanho === o ? 'selected' : ''}>${o}</option>`).join('');

      return `
        <div class="monster-accordion-inner">
          <div class="monster-brand"><i class="fas fa-skull me-1"></i>Bestiário</div>

          <div class="monster-grid" style="margin-bottom:0.75rem;">
            <div class="monster-field"><label>Tipo</label><select data-mid="${id}" data-field="monTipo">${tipoOpts}</select></div>
            <div class="monster-field"><label>Tamanho</label><select data-mid="${id}" data-field="monTamanho">${tamOpts}</select></div>
            <div class="monster-field"><label>Tendência</label><input type="text" data-mid="${id}" data-field="monTendencia" value="${escapeAttr(d.monTendencia)}" placeholder="Ex.: Caótico e Mau"></div>
          </div>

          <div class="monster-grid" style="margin-bottom:0.75rem;">
            <div class="stat-box"><label>VD / ND</label><input type="text" data-mid="${id}" data-field="monVD" value="${escapeAttr(d.monVD)}" placeholder="Ex.: 5"></div>
            <div class="stat-box"><label>XP</label><input type="text" data-mid="${id}" data-field="monXP" value="${escapeAttr(d.monXP)}" placeholder="Ex.: 1800"></div>
            <div class="stat-box"><label>Bônus Prof.</label><input type="text" data-mid="${id}" data-field="monProf" value="${escapeAttr(d.monProf)}" placeholder="Ex.: +3"></div>
          </div>

          <div class="monster-block full">
            <div class="monster-block-title">Atributos</div>
            <div class="monster-attrs">
              <div class="monster-attr"><div class="monster-attr-name">FOR</div><input type="number" class="monster-attr-value" data-mid="${id}" data-field="monFor" value="${d.monFor}"></div>
              <div class="monster-attr"><div class="monster-attr-name">DES</div><input type="number" class="monster-attr-value" data-mid="${id}" data-field="monDes" value="${d.monDes}"></div>
              <div class="monster-attr"><div class="monster-attr-name">CON</div><input type="number" class="monster-attr-value" data-mid="${id}" data-field="monCon" value="${d.monCon}"></div>
              <div class="monster-attr"><div class="monster-attr-name">INT</div><input type="number" class="monster-attr-value" data-mid="${id}" data-field="monInt" value="${d.monInt}"></div>
              <div class="monster-attr"><div class="monster-attr-name">SAB</div><input type="number" class="monster-attr-value" data-mid="${id}" data-field="monSab" value="${d.monSab}"></div>
              <div class="monster-attr"><div class="monster-attr-name">CAR</div><input type="number" class="monster-attr-value" data-mid="${id}" data-field="monCar" value="${d.monCar}"></div>
            </div>
          </div>

          <div class="monster-grid" style="margin-bottom:0.75rem;">
            <div class="stat-box"><label>PV</label><input type="text" data-mid="${id}" data-field="monPV" value="${escapeAttr(d.monPV)}" placeholder="Ex.: 45 (6d8+18)"></div>
            <div class="stat-box"><label>Defesa / CA</label><input type="text" data-mid="${id}" data-field="monDefesa" value="${escapeAttr(d.monDefesa)}" placeholder="Ex.: 15"></div>
            <div class="stat-box"><label>Deslocamento</label><input type="text" data-mid="${id}" data-field="monDesloc" value="${escapeAttr(d.monDesloc)}" placeholder="Ex.: 9m"></div>
            <div class="stat-box"><label>Iniciativa</label><input type="text" data-mid="${id}" data-field="monIniciativa" value="${escapeAttr(d.monIniciativa)}" placeholder="Ex.: +2"></div>
          </div>

          <div class="monster-grid">
            <div class="monster-block"><div class="monster-block-title">Perícias</div><textarea class="monster-textarea" data-mid="${id}" data-field="monPericias" rows="4">${escapeHtml(d.monPericias)}</textarea></div>
            <div class="monster-block"><div class="monster-block-title">Resistências</div><textarea class="monster-textarea" data-mid="${id}" data-field="monResistencias" rows="4">${escapeHtml(d.monResistencias)}</textarea></div>
            <div class="monster-block"><div class="monster-block-title">Vulnerabilidades</div><textarea class="monster-textarea" data-mid="${id}" data-field="monVulnerabilidades" rows="4">${escapeHtml(d.monVulnerabilidades)}</textarea></div>
            <div class="monster-block"><div class="monster-block-title">Imunidades</div><textarea class="monster-textarea" data-mid="${id}" data-field="monImunidades" rows="4">${escapeHtml(d.monImunidades)}</textarea></div>
            <div class="monster-block"><div class="monster-block-title">Sentidos</div><textarea class="monster-textarea" data-mid="${id}" data-field="monSentidos" rows="4">${escapeHtml(d.monSentidos)}</textarea></div>
            <div class="monster-block"><div class="monster-block-title">Idiomas</div><textarea class="monster-textarea" data-mid="${id}" data-field="monIdiomas" rows="4">${escapeHtml(d.monIdiomas)}</textarea></div>
          </div>

          <div class="monster-block full" style="margin-top:0.6rem;">
            <div class="monster-block-title">Ações</div>
            <div class="table-scroll">
              <table class="monster-table">
                <thead><tr><th style="width:30%;">Nome</th><th style="width:15%;">Bônus/CD</th><th style="width:25%;">Dano/Efeito</th><th>Descrição</th></tr></thead>
                <tbody>
                  ${[1,2,3,4,5].map(i => `<tr>
                    <td><input type="text" data-mid="${id}" data-field="monAcao${i}_nome" value="${escapeAttr(d['monAcao'+i+'_nome'])}"></td>
                    <td><input type="text" data-mid="${id}" data-field="monAcao${i}_bonus" value="${escapeAttr(d['monAcao'+i+'_bonus'])}"></td>
                    <td><input type="text" data-mid="${id}" data-field="monAcao${i}_dano" value="${escapeAttr(d['monAcao'+i+'_dano'])}"></td>
                    <td><input type="text" data-mid="${id}" data-field="monAcao${i}_desc" value="${escapeAttr(d['monAcao'+i+'_desc'])}"></td>
                  </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>

          <div class="monster-block full" style="margin-top:0.6rem;">
            <div class="monster-block-title">Habilidades Especiais</div>
            <textarea class="monster-textarea" data-mid="${id}" data-field="monHabilidades" rows="6">${escapeHtml(d.monHabilidades)}</textarea>
          </div>

          <div class="monster-grid">
            <div class="monster-block"><div class="monster-block-title">Aparência</div><textarea class="monster-textarea" data-mid="${id}" data-field="monAparencia" rows="5">${escapeHtml(d.monAparencia)}</textarea></div>
            <div class="monster-block"><div class="monster-block-title">Comportamento</div><textarea class="monster-textarea" data-mid="${id}" data-field="monComportamento" rows="5">${escapeHtml(d.monComportamento)}</textarea></div>
            <div class="monster-block full"><div class="monster-block-title">Lore / História</div><textarea class="monster-textarea" data-mid="${id}" data-field="monHistoria" rows="5">${escapeHtml(d.monHistoria)}</textarea></div>
            <div class="monster-block full"><div class="monster-block-title">Tesouro / Recompensa</div><textarea class="monster-textarea" data-mid="${id}" data-field="monTesouro" rows="3">${escapeHtml(d.monTesouro)}</textarea></div>
          </div>
        </div>`;
    }

    function renderAllMonsters() {
      const c = document.getElementById('monstersContainer'); if (!c) return;
      if (monsters.length === 0) {
        c.innerHTML = `<div class="monsters-empty">
          <i class="fas fa-dragon"></i>
          <h4>Nenhum monstro criado ainda</h4>
          <p>Clique em <strong>"Novo Monstro"</strong> para começar a forjar suas criaturas.</p>
        </div>`;
        updateMonsterIndicator();
        return;
      }
      c.innerHTML = monsters.map(m => `
        <div class="monster-accordion ${m.expanded ? 'expanded' : ''}" data-mid="${m.id}">
          <div class="monster-accordion-header" onclick="toggleMonster('${m.id}', event)">
            <div class="monster-accordion-title">
              <i class="fas fa-dragon biome-icon"></i>
              <div style="min-width:0; flex:1;">
                <h3>${escapeHtml(m.data.monNome || 'Monstro sem nome')}</h3>
                <span class="monster-subtitle">
                  ${escapeHtml(m.data.monTipo || '')} · ${escapeHtml(m.data.monTamanho || '')}${m.data.monVD ? ' · VD ' + escapeHtml(m.data.monVD) : ''}
                </span>
              </div>
            </div>
            <div class="monster-accordion-actions" onclick="event.stopPropagation();">
              <button title="Duplicar" onclick="duplicateMonster('${m.id}')"><i class="fas fa-copy"></i></button>
              <button title="Exportar" onclick="exportOneMonster('${m.id}')"><i class="fas fa-file-export"></i></button>
              <button class="danger" title="Deletar" onclick="deleteMonster('${m.id}')"><i class="fas fa-trash"></i></button>
              <button class="chevron" title="Expandir/Minimizar" onclick="toggleMonster('${m.id}', event)"><i class="fas fa-chevron-down"></i></button>
            </div>
          </div>
          <div class="monster-accordion-body">${renderMonsterBody(m)}</div>
        </div>`).join('');

      c.querySelectorAll('[data-mid][data-field]').forEach(el => {
        el.addEventListener('input', handleMonsterFieldChange);
        el.addEventListener('change', handleMonsterFieldChange);
      });
      updateMonsterIndicator();
    }

    function handleMonsterFieldChange(e) {
      const el = e.target;
      const mid = el.dataset.mid;
      const f = el.dataset.field;
      if (!mid || !f) return;
      const m = monsters.find(x => x.id === mid); if (!m) return;
      m.data[f] = el.value;
      if (['monNome','monTipo','monTamanho','monVD'].includes(f)) {
        const acc = document.querySelector(`.monster-accordion[data-mid="${mid}"]`);
        if (acc) {
          const h3 = acc.querySelector('h3');
          const sub = acc.querySelector('.monster-subtitle');
          if (h3) h3.textContent = m.data.monNome || 'Monstro sem nome';
          if (sub) sub.textContent = `${m.data.monTipo || ''} · ${m.data.monTamanho || ''}${m.data.monVD ? ' · VD ' + m.data.monVD : ''}`;
        }
      }
      scheduleMonsterSave(mid);
    }

    function createMonster() {
      const id = 'mon_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      monsters.push({ id, expanded: true, data: createEmptyMonster() });
      monsters.forEach(m => { if (m.id !== id) m.expanded = false; });
      renderAllMonsters();
      saveMonsters();
      setTimeout(() => {
        const a = document.querySelector(`.monster-accordion[data-mid="${id}"]`);
        if (a) a.scrollIntoView({ behavior:'smooth', block:'start' });
      }, 100);
      showToast('Novo monstro criado!', 'success');
    }

    function toggleMonster(id, ev) {
      if (ev) ev.stopPropagation();
      const m = monsters.find(x => x.id === id); if (!m) return;
      m.expanded = !m.expanded;
      const a = document.querySelector(`.monster-accordion[data-mid="${id}"]`);
      if (a) a.classList.toggle('expanded', m.expanded);
      saveMonsters();
    }

    function expandAllMonsters() {
      monsters.forEach(m => m.expanded = true);
      document.querySelectorAll('.monster-accordion').forEach(a => a.classList.add('expanded'));
      saveMonsters();
    }

    function collapseAllMonsters() {
      monsters.forEach(m => m.expanded = false);
      document.querySelectorAll('.monster-accordion').forEach(a => a.classList.remove('expanded'));
      saveMonsters();
    }

    function duplicateMonster(id) {
      const o = monsters.find(x => x.id === id); if (!o) return;
      const nid = 'mon_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      const c = { id: nid, expanded: false, data: JSON.parse(JSON.stringify(o.data)) };
      c.data.monNome = (c.data.monNome || 'Monstro') + ' (cópia)';
      monsters.push(c);
      renderAllMonsters();
      saveMonsters();
      showToast('Monstro duplicado!', 'success');
    }

    function deleteMonster(id) {
      const m = monsters.find(x => x.id === id); if (!m) return;
      if (!confirm(`Deletar "${m.data.monNome || 'sem nome'}"?`)) return;
      monsters = monsters.filter(x => x.id !== id);
      renderAllMonsters();
      saveMonsters();
      showToast('Monstro deletado.', 'info');
    }

    function saveMonsters() {
      try { localStorage.setItem(MONSTERS_STORAGE_KEY, JSON.stringify(monsters)); }
      catch(e) { console.error(e); }
    }

    function loadMonsters() {
      try {
        const raw = localStorage.getItem(MONSTERS_STORAGE_KEY);
        if (raw) {
          const p = JSON.parse(raw);
          if (Array.isArray(p)) monsters = p;
        }
      } catch(e) {}
    }

    function scheduleMonsterSave(id) {
      clearTimeout(monsterAutosaveTimers[id]);
      monsterAutosaveTimers[id] = setTimeout(() => {
        saveMonsters();
        updateMonsterIndicator();
      }, MONSTER_AUTOSAVE_DELAY);
    }

    function updateMonsterIndicator() {
      const el = document.getElementById('monsterSaveIndicator'); if (!el) return;
      if (monsters.length === 0) { el.textContent = 'Nenhum monstro criado ainda'; return; }
      const d = new Date();
      el.textContent = `${monsters.length} ${monsters.length === 1 ? 'monstro salvo' : 'monstros salvos'} · ${d.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}`;
    }

    function exportOneMonster(id) {
      const m = monsters.find(x => x.id === id); if (!m) return;
      const b = new Blob([JSON.stringify(m.data, null, 2)], { type:'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      const n = (m.data.monNome || 'criatura').trim().replace(/\s+/g, '_').toLowerCase();
      a.download = `monstro_${n}.json`;
      a.click();
      showToast('Monstro exportado!', 'success');
    }

    function exportAllMonsters() {
      if (monsters.length === 0) { showToast('Nenhum monstro para exportar.', 'error'); return; }
      const b = new Blob([JSON.stringify(monsters, null, 2)], { type:'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `monstros_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      showToast(`${monsters.length} monstros exportados!`, 'success');
    }

    function importAllMonsters(inp) {
      const f = inp.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = e => {
        try {
          const p = JSON.parse(e.target.result);
          if (Array.isArray(p)) {
            p.forEach(item => {
              const id = item.id || ('mon_' + Date.now() + '_' + Math.floor(Math.random() * 1000));
              const d = item.data || item;
              monsters.push({ id, expanded: false, data: { ...createEmptyMonster(), ...d } });
            });
            showToast(`${p.length} monstros importados!`, 'success');
          } else {
            const id = 'mon_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
            monsters.push({ id, expanded: true, data: { ...createEmptyMonster(), ...p } });
            showToast('Monstro importado!', 'success');
          }
          renderAllMonsters();
          saveMonsters();
        } catch(e) { showToast('Arquivo inválido.', 'error'); }
        inp.value = '';
      };
      r.readAsText(f);
    }

    /* ============================================================
       14. UTILITÁRIOS
    ============================================================ */
    function escapeAttr(s) {
      if (s === undefined || s === null) return '';
      return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function escapeHtml(s) {
      const d = document.createElement('div');
      d.textContent = s == null ? '' : s;
      return d.innerHTML;
    }

async function initializeApp() {
    await incHTML('mainNav', './src/inc/nav.html');
    await fichaHTML();

    document.addEventListener('click', (e) => {
      const selector = document.getElementById('systemSelector');
      if (!selector) return;
      if (!selector.contains(e.target)) closeSystemMenu();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSystemMenu();
    });

    // Navbar com sombra ao rolar
    const nav = document.getElementById('mainNav');
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 30);
    }, { passive: true });

    // Botão voltar ao topo
    const btt = document.getElementById('backToTop');
    if (btt) {
      window.addEventListener('scroll', () => {
        btt.classList.toggle('visible', window.scrollY > 300);
      }, { passive: true });
      btt.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    }

    // Clique nos botões do seletor
    document.querySelectorAll('.system-options button').forEach(btn => {
      btn.addEventListener('click', () => showSystem(btn.dataset.system));
    });

    // Abas do Mestre
    document.querySelectorAll('.mestre-tabs button').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mestre-tabs button').forEach(b => b.classList.toggle('active', b === btn));
        document.querySelectorAll('.mestre-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === btn.dataset.tab));
      });
    });

    // Listeners de modificadores
    attrIds.forEach(id => {
      const e = document.getElementById(id);
      if (e) e.addEventListener('input', () => { updateAllMods(); markDirty(); });
    });
    t20AttrIds.forEach(id => {
      const e = document.getElementById(id);
      if (e) e.addEventListener('input', () => { updateT20Mods(); markDirty(); });
    });
    ['op_agi','op_for','op_int','op_pre','op_vig'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', () => { recalcAllOPRPGSkills(); updateOPRPGDefense(); markDirty(); });
    });

    // Constrói tabelas dinâmicas
    buildT20SkillsTable();
    buildT20EquipmentTable();
    buildOPRPGSkillsTable();
    buildOPRPGInventory();

    // Carrega dados salvos
    loadSheet();
    updateAllMods();
    updateT20Mods();
    recalcAllOPRPGSkills();
    updateOPRPGDefense();

    // Restaura sistema e área ativos
    let sys = 'dnd5e';
    try { sys = localStorage.getItem(STORAGE_SYSTEM) || 'dnd5e'; } catch(e) {}
    showSystem(sys);

    let area = 'herois';
    try { area = localStorage.getItem('forja_area_ativa') || 'herois'; } catch(e) {}
    showArea(area);

    // Carrega monstros
    loadMonsters();
    renderAllMonsters();

    // Listeners de auto-save da ficha de herói
    document.querySelectorAll('#area-herois input, #area-herois textarea').forEach(el => {
      el.addEventListener('input', markDirty);
      el.addEventListener('change', markDirty);
    });

    updateSaveIndicator();
}

document.addEventListener('DOMContentLoaded', () => {
    initializeApp().catch(error => console.error('Erro ao inicializar a aplicação:', error));
});
