/* ============================================================
   SIMA · apresentação interativa. Tudo é calculado no navegador
   a partir de dados.js (agregados do modelo Power BI). Nenhum
   número de dado está escrito neste arquivo.
   ============================================================ */
(function () {
  'use strict';
  const D = window.DADOS;
  const REG = D.regionais, ESC = D.escritorios, MUN = D.municipios;
  const REGNAME = { 'Paraiso': 'Paraíso', 'Porto': 'Porto Nacional', 'Taguatinga do TO': 'Taguatinga' };
  const rn = i => (i < 0 ? 'Todo o estado' : (REGNAME[REG[i]] || REG[i]));
  const YEARS = []; for (let y = D.meta.anoIni; y <= D.meta.anoFim; y++) YEARS.push(y);
  const ultima = D.meta.ultimaData.split('-').reverse().join('/');   // 28/09/2026
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  const $ = s => document.querySelector(s);
  const nf = n => Math.round(n).toLocaleString('pt-BR');
  const nf1 = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const nf2 = n => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pc = x => (x * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const median = a => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const kpi = (v, l, d, cls) => `<div class="kpi ${cls || ''}"><div class="v">${v}</div><div class="l">${l}</div><div class="d">${d || ''}</div></div>`;

  $('#ftDate').textContent = ultima;

  /* ---------- tooltip global ---------- */
  const tip = $('#tip');
  function placeTip(e) {
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + 14, y = e.clientY + 16;
    if (x + w > innerWidth - 8) x = e.clientX - w - 14;
    if (y + h > innerHeight - 8) y = e.clientY - h - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  document.addEventListener('mouseover', e => { const t = e.target.closest && e.target.closest('[data-tip]'); if (t) { tip.innerHTML = t.getAttribute('data-tip'); tip.style.opacity = 1; placeTip(e); } });
  document.addEventListener('mousemove', e => { if (tip.style.opacity === '1') placeTip(e); });
  document.addEventListener('mouseout', e => { if (e.target.closest && e.target.closest('[data-tip]')) tip.style.opacity = 0; });

  /* ---------- componentes de gráfico ---------- */
  // maior valor do eixo: 4 intervalos de tamanho "redondo" (1, 2, 3, 4, 5, 6, 8 x 10^k), sempre com números inteiros nos rótulos
  function niceMax(v) {
    const raw = v / 4; if (raw <= 1) return 4;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = [1, 2, 3, 4, 5, 6, 8, 10].find(x => x * p >= raw - 1e-9);
    return f * p * 4;
  }
  function barPath(x, y, w, base, r) {
    const h = base - y;
    if (h <= 0) return '';
    r = Math.min(r, h, w / 2);
    return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
  }
  // barras verticais em SVG. items: {label, v, tip, peak, showLabel}
  function vbars(items, { unit = '', yTicks = 4, minLabelEvery = 1 } = {}) {
    const W = 640, H = 230, pl = 46, pr = 8, pt = 16, pb = 28, base = H - pb;
    const vmax = niceMax(Math.max(1, ...items.map(i => i.v)));
    const y = v => pt + (base - pt) * (1 - v / vmax);
    const cw = (W - pl - pr) / items.length, bw = Math.max(2, Math.min(cw * 0.62, 46));
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">`;
    for (let k = 0; k <= yTicks; k++) {
      const v = vmax * k / yTicks, yy = y(v);
      s += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}"/><text x="${pl - 8}" y="${yy + 4}" text-anchor="end">${nf(v)}</text>`;
    }
    const maxV = Math.max(...items.map(i => i.v));
    items.forEach((it, i) => {
      const cx = pl + cw * i + cw / 2, x = cx - bw / 2;
      const isPeak = it.peak !== undefined ? it.peak : (it.v === maxV && maxV > 0 && items.length <= 12);
      s += `<path class="bar${isPeak ? ' peak' : ''}" d="${barPath(x, y(it.v), bw, base, 4)}"/>`;
      if (it.showLabel !== false && i % minLabelEvery === 0) s += `<text x="${cx}" y="${H - 8}" text-anchor="middle">${esc(it.label)}</text>`;
      if (isPeak && it.v > 0) s += `<text x="${cx}" y="${y(it.v) - 5}" text-anchor="middle" style="fill:var(--ink);font-weight:600">${nf(it.v)}</text>`;
      s += `<rect class="hit" x="${cx - cw / 2}" y="${pt}" width="${cw}" height="${base - pt}" data-tip="${esc(it.tip)}"/>`;
    });
    s += `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${base}" y2="${base}" style="stroke:var(--slate300)"/></svg>`;
    return s;
  }
  // barras horizontais em HTML
  function hbars(target, items, maxv) {
    maxv = maxv || Math.max(1, ...items.map(i => i.v));
    target.innerHTML = items.map((it, i) =>
      `<div class="hbar${it.top ? ' top' : ''}" data-tip="${esc(it.tip || '')}"><span class="name">${esc(it.name)}</span><span class="bar"><i style="width:${(it.v / maxv * 100).toFixed(2)}%"></i></span><span class="val">${it.label}</span></div>`).join('');
  }
  function table(head, rows) {
    return `<table class="tbl"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  const tblData = {};
  document.addEventListener('click', e => {
    const b = e.target.closest('.tbl-btn'); if (!b || !b.dataset.tbl) return;
    const id = b.dataset.tbl, tb = $('#tb' + id), ch = $('#c' + id), show = tb.hidden;
    if (show && tblData[id]) tb.innerHTML = table(tblData[id].head, tblData[id].rows);
    tb.hidden = !show; ch.hidden = show; b.textContent = show ? 'ver como gráfico' : 'ver como tabela';
  });

  /* ============================================================
     01 · ABERTURA
     ============================================================ */
  const CP = D.cadastro.props, CF = D.cadastro.fam, CA = D.cadastro.ativ;
  function cad(reg) {
    const r = { props: 0, ativas: 0, comCAR: 0, fam: 0, mun: 0 };
    for (let i = 0; i < MUN.length; i++) {
      if (reg >= 0 && MUN[i][1] !== reg) continue;
      r.props += CP[i][0]; r.ativas += CP[i][1]; r.comCAR += CP[i][4]; r.fam += CF[i][0]; r.mun++;
    }
    return r;
  }
  (function abertura() {
    const t = cad(-1);
    $('#k1').innerHTML =
      kpi(nf(MUN.length), 'municípios com cadastro', 'todo o Tocantins', 'hi') +
      kpi(nf(REG.length), 'regionais') +
      kpi(nf(ESC.length), 'escritórios locais') +
      kpi(nf(t.props), 'propriedades cadastradas', nf(t.ativas) + ' ativas') +
      kpi(nf(t.fam), 'famílias cadastradas', 'com município identificado');

    // mapa de pontos
    const pts = MUN.map((m, i) => ({ i, n: m[0], lat: m[4], lon: m[5] })).filter(p => p.lat != null && p.lon != null);
    const CT = D.contorno || [];
    const lats = pts.map(p => p.lat).concat(CT.map(c => c[1])), lons = pts.map(p => p.lon).concat(CT.map(c => c[0]));
    const minLa = Math.min(...lats), maxLa = Math.max(...lats), minLo = Math.min(...lons), maxLo = Math.max(...lons);
    const W = 420, H = 560, pad = 22;
    const sc = Math.min((W - 2 * pad) / (maxLo - minLo), (H - 2 * pad) / (maxLa - minLa));
    const ox = (W - sc * (maxLo - minLo)) / 2, oy = (H - sc * (maxLa - minLa)) / 2;
    const maxP = Math.max(...pts.map(p => CP[p.i][0]));
    const k = 13 / Math.sqrt(maxP);
    pts.sort((a, b) => CP[b.i][0] - CP[a.i][0]);
    const px = c => (ox + (c[0] - minLo) * sc).toFixed(1) + ',' + (oy + (maxLa - c[1]) * sc).toFixed(1);
    const outline = CT.length ? `<path class="map-state" d="M${CT.map(px).join('L')}Z"/>` : '';
    $('#map').innerHTML = outline + pts.map(p => {
      const r = 2.2 + Math.sqrt(CP[p.i][0]) * k;
      const x = ox + (p.lon - minLo) * sc, y = oy + (maxLa - p.lat) * sc;
      return `<circle class="map-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" data-tip="<b>${esc(p.n)}</b><br>${nf(CP[p.i][0])} propriedades · ${nf(CF[p.i][0])} famílias<br>Regional ${esc(rn(MUN[p.i][1]))}"/>`;
    }).join('');

    // RURATER x SIGCAR
    const S = D.sigcar;
    $('#cmp').innerHTML =
      `<div class="compare-row"><span class="lb">SIGCAR</span><div class="track"><div class="fill" style="width:100%">${nf(S.imoveis)}</div></div></div>` +
      `<div class="compare-row"><span class="lb">RURATER</span><div class="track"><div class="fill amber" style="width:${(t.props / S.imoveis * 100).toFixed(1)}%">${nf(t.props)}</div></div></div>`;
    $('#cmpNote').innerHTML = `Em número de registros, o RURATER equivale a <strong>${pc(t.props / S.imoveis)}</strong> do SIGCAR (posição de ${S.data.split('-').reverse().join('/')}). É uma comparação de tamanho, não de sobreposição: só ${nf(t.comCAR)} propriedades do RURATER têm o número do CAR preenchido, o que hoje impede o cruzamento imóvel a imóvel.`;
  })();

  /* ============================================================
     02 · RURATER: atividades predominantes
     ============================================================ */
  let reg2 = -1;
  function chips2() {
    const opts = [-1, ...REG.map((_, i) => i)];
    $('#chips2').innerHTML = opts.map(i => `<button class="chip" type="button" data-r="${i}" aria-pressed="${i === reg2}">${esc(i < 0 ? 'Todo o estado' : rn(i))}</button>`).join('');
  }
  function render2() {
    chips2();
    const t = cad(reg2);
    const agg = new Map(); const seen = new Set();
    for (const row of CA) {
      if (reg2 >= 0 && MUN[row[0]][1] !== reg2) continue;
      agg.set(row[1], (agg.get(row[1]) || 0) + row[2]); seen.add(row[1]);
    }
    const list = [...agg.entries()].sort((a, b) => b[1] - a[1]);
    $('#k2').innerHTML =
      kpi(nf(t.ativas), 'propriedades ativas', reg2 < 0 ? 'todo o estado' : 'Regional ' + esc(rn(reg2)), 'hi') +
      kpi(nf(t.fam), 'famílias cadastradas') +
      kpi(nf(t.mun), 'municípios') +
      kpi(nf(seen.size), 'atividades diferentes registradas');
    $('#t2').textContent = 'Atividades predominantes · ' + rn(reg2);
    const top = list.slice(0, 10), max = top.length ? top[0][1] : 1;
    hbars($('#hb2'), top.map((r, i) => ({
      name: D.atividades[r[0]], v: r[1], label: nf(r[1]), top: i === 0,
      tip: `<b>${esc(D.atividades[r[0]])}</b><br>${nf(r[1])} propriedades (${pc(r[1] / t.ativas)} das ativas)`
    })), max);
    $('#carNote').innerHTML = `Só <b class="num">${nf(t.comCAR)}</b> das ${nf(t.props)} propriedades (${pc(t.comCAR / t.props)}) ${reg2 < 0 ? '' : 'da regional '}têm o número do CAR registrado no RURATER. Preencher esse campo é o caminho para cruzar o RURATER com o SIGCAR.`;
  }
  document.addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; reg2 = +c.dataset.r; render2(); });
  render2();

  /* ============================================================
     04 · GESTÃO REGIONAL (filtros reais)
     ============================================================ */
  const A = D.atend, N = A.a.length;
  const aA = Int8Array.from(A.a), aM = Int16Array.from(A.m), aE = Int16Array.from(A.e), aX = Int16Array.from(A.x), aB = Int32Array.from(A.b), aO = Int16Array.from(A.o), aD = Int32Array.from(A.d);
  const escReg = ESC.map(e => e[1]);
  const G = D.grupal;
  const st = { ano: YEARS.indexOf(2025), reg: -1, esc: -1, mun: -1 };
  let ordVol = false;
  let maxBen = 0; for (let i = 0; i < N; i++) if (aB[i] > maxBen) maxBen = aB[i];

  function rows(S) {
    const out = [];
    for (let i = 0; i < N; i++) {
      if (S.ano >= 0 && aA[i] !== S.ano) continue;
      if (S.mun >= 0 && aM[i] !== S.mun) continue;
      const e = aE[i];
      if (S.esc >= 0 && e !== S.esc) continue;
      if (S.reg >= 0 && (e < 0 || escReg[e] !== S.reg)) continue;
      out.push(i);
    }
    return out;
  }
  function basics(out) {
    const seen = new Uint8Array(maxBen + 1), es = new Set(), ms = new Set(); let prod = 0, or = 0;
    for (const i of out) {
      const b = aB[i]; if (b >= 0 && !seen[b]) { seen[b] = 1; prod++; }
      or += aO[i]; if (aE[i] >= 0) es.add(aE[i]); if (aM[i] >= 0) ms.add(aM[i]);
    }
    return { n: out.length, prod, or, esc: es.size, mun: ms.size };
  }
  function eventos(S) {
    let n = 0, part = 0, comPart = 0, semPart = 0;
    for (let j = 0; j < G.a.length; j++) {
      if (S.ano >= 0 && G.a[j] !== S.ano) continue;
      if (S.mun >= 0 && G.m[j] !== S.mun) continue;
      if (S.esc >= 0 && G.e[j] !== S.esc) continue;
      if (S.reg >= 0) { const r = G.m[j] >= 0 ? MUN[G.m[j]][1] : (G.e[j] >= 0 ? escReg[G.e[j]] : -1); if (r !== S.reg) continue; }
      n++; if (G.p[j] >= 0) { part += G.p[j]; comPart++; } else semPart++;
    }
    return { n, part, comPart, semPart };
  }

  /* ----- seletores em cascata ----- */
  const selAno = $('#fAno'), selReg = $('#fReg'), selEsc = $('#fEsc'), selMun = $('#fMun');
  const opt = (v, t, sel) => `<option value="${v}"${sel ? ' selected' : ''}>${esc(t)}</option>`;
  function fillSelectors() {
    selAno.innerHTML = opt(-1, `${YEARS[0]}–${YEARS[YEARS.length - 1]} (acumulado)`, st.ano === -1) +
      YEARS.map((y, i) => opt(i, y === D.meta.anoFim ? `${y} (até ${ultima.slice(0, 5)})` : y, st.ano === i)).join('');
    selReg.innerHTML = opt(-1, 'Todas as regionais', st.reg === -1) + REG.map((_, i) => opt(i, rn(i), st.reg === i)).join('');
    const escs = ESC.map((e, i) => [i, e[0], e[1]]).filter(e => st.reg < 0 || e[2] === st.reg).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
    if (st.esc >= 0 && !escs.some(e => e[0] === st.esc)) st.esc = -1;
    selEsc.innerHTML = opt(-1, 'Todos os escritórios', st.esc === -1) + escs.map(e => opt(e[0], e[1], st.esc === e[0])).join('');
    const muns = MUN.map((m, i) => [i, m[0], m[1], m[2]]).filter(m => st.esc >= 0 ? m[3] === st.esc : (st.reg < 0 || m[2] === st.reg)).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
    if (st.mun >= 0 && !muns.some(m => m[0] === st.mun)) st.mun = -1;
    selMun.innerHTML = opt(-1, 'Todos os municípios', st.mun === -1) + muns.map(m => opt(m[0], m[1], st.mun === m[0])).join('');
  }
  selAno.onchange = () => { st.ano = +selAno.value; render4(); };
  selReg.onchange = () => { st.reg = +selReg.value; st.esc = -1; st.mun = -1; fillSelectors(); render4(); };
  selEsc.onchange = () => { st.esc = +selEsc.value; st.mun = -1; fillSelectors(); render4(); };
  selMun.onchange = () => { st.mun = +selMun.value; render4(); };
  $('#fClear').onclick = () => { st.reg = st.esc = st.mun = -1; fillSelectors(); render4(); };
  $('#ord4c').onclick = () => { ordVol = !ordVol; $('#ord4c').textContent = ordVol ? 'ordem alfabética' : 'ordenar por volume'; render4c(); };

  function scopeText() {
    const y = st.ano < 0 ? `${YEARS[0]}–${YEARS[YEARS.length - 1]}` : YEARS[st.ano];
    let g = 'Todo o estado';
    if (st.mun >= 0) g = 'Município de ' + MUN[st.mun][0];
    else if (st.esc >= 0) g = 'Escritório de ' + ESC[st.esc][0];
    else if (st.reg >= 0) g = 'Regional ' + rn(st.reg);
    return `<b>${esc(y)}</b> · ${esc(g)}`;
  }

  function render4() {
    const out = rows(st), b = basics(out);
    $('#scope').innerHTML = scopeText();

    // variação sobre o ano anterior (mesmo recorte geográfico), só quando ambos os anos são completos
    let delta = '';
    if (st.ano < 0) delta = 'cinco anos somados';
    else if (st.ano === YEARS.length - 1) delta = 'ano parcial, até ' + ultima;
    else if (st.ano >= 1) {
      const p = basics(rows({ ...st, ano: st.ano - 1 }));
      if (p.n > 0) { const d = b.n / p.n - 1; delta = `${d >= 0 ? '+' : '−'}${pc(Math.abs(d))} sobre ${YEARS[st.ano - 1]}`; }
    }

    $('#k4').innerHTML =
      kpi(nf(b.n), 'atendimentos', delta, 'hi') +
      kpi(nf(b.prod), 'produtores atendidos', 'beneficiários distintos') +
      kpi(b.prod ? nf2(b.n / b.prod) : '—', 'atendimentos por produtor', 'recorrência do atendimento') +
      kpi(b.n ? nf2(b.or / b.n) : '—', 'orientações por atendimento', 'profundidade do atendimento') +
      kpi(nf(b.esc), 'escritórios com atendimento', 'no recorte escolhido') +
      kpi(nf(b.mun), 'municípios atendidos', 'onde moram os produtores atendidos');

    /* --- 4a: evolução --- */
    let items;
    if (st.ano >= 0) {
      const m = new Array(12).fill(0);
      for (const i of out) m[Math.floor(aD[i] / 100) % 100 - 1]++;
      const last = YEARS[st.ano] === D.meta.anoFim ? +D.meta.ultimaData.slice(5, 7) : 12;
      items = m.map((v, i) => ({ label: MESES[i], v, tip: i + 1 > last ? `<b>${MESES[i]}</b><br>fora do período de dados` : `<b>${MESES[i]}/${YEARS[st.ano]}</b><br>${nf(v)} atendimentos${i + 1 === last && last < 12 ? '<br>(parcial, até ' + ultima + ')' : ''}` }));
      $('#t4a').textContent = 'Atendimentos por mês';
      $('#s4a').textContent = `Ritmo do ano ${YEARS[st.ano]} no recorte escolhido.`;
      tblData['4a'] = { head: ['Mês', 'Atendimentos'], rows: m.map((v, i) => [MESES[i], nf(v)]) };
    } else {
      const y = new Array(YEARS.length).fill(0); for (const i of out) y[aA[i]]++;
      items = y.map((v, i) => ({ label: String(YEARS[i]), v, tip: `<b>${YEARS[i]}</b><br>${nf(v)} atendimentos${YEARS[i] === D.meta.anoFim ? '<br>(parcial, até ' + ultima + ')' : ''}` }));
      $('#t4a').textContent = 'Atendimentos por ano';
      $('#s4a').textContent = `Série ${YEARS[0]}–${YEARS[YEARS.length - 1]} no recorte escolhido (${YEARS[YEARS.length - 1]} parcial).`;
      tblData['4a'] = { head: ['Ano', 'Atendimentos'], rows: y.map((v, i) => [YEARS[i], nf(v)]) };
    }
    $('#c4a').innerHTML = vbars(items);

    /* --- 4b: método --- */
    const mc = new Array(D.metodos.length).fill(0); for (const i of out) if (aX[i] >= 0) mc[aX[i]]++;
    const tot = mc.reduce((a, c) => a + c, 0) || 1;
    hbars($('#c4b'), mc.map((v, i) => ({ name: D.metodos[i], v, label: pc(v / tot), tip: `<b>${esc(D.metodos[i])}</b><br>${nf(v)} atendimentos (${pc(v / tot)})` })).sort((a, b) => b.v - a.v).map((x, i) => ({ ...x, top: i === 0 })), tot);

    /* --- 4c: comparação entre escritórios --- */
    render4c();

    /* --- 4d: eventos --- */
    const ev = eventos(st);
    $('#s4d').textContent = 'Contam todos os eventos registrados, inclusive os cancelados.';
    $('#c4d').innerHTML =
      `<div><b>${nf(ev.n)}</b>eventos</div><div><b>${nf(ev.part)}</b>participantes</div>` +
      `<div><b>${ev.comPart ? nf1(ev.part / ev.comPart) : '—'}</b>participantes por evento</div>` +
      (ev.semPart ? `<div style="flex-basis:100%;color:var(--muted);font-size:.75rem">${nf(ev.semPart)} eventos sem número de participantes informado ficam fora da média.</div>` : '');

    $('#method4').innerHTML = `<b>Como os números são calculados.</b> Atendimento = registro individual no RURATER. Produtor atendido = beneficiário distinto. Na comparação entre escritórios, cada escritório soma todos os atendimentos que registrou no período escolhido, e os filtros de regional e ano definem o grupo comparado. Escritórios têm territórios e equipes de tamanhos diferentes: a comparação aponta onde olhar, não conclui nada sozinha. Eventos usam a data de início. ${YEARS[YEARS.length - 1]} vai até ${ultima}. Atendimentos sem escritório ou município identificado entram apenas quando não há filtro geográfico.`;
  }

  // Compara os escritórios do mesmo grupo (mesma regional). Sem filtro geográfico, compara as regionais.
  function render4c() {
    const level = (st.reg < 0 && st.esc < 0 && st.mun < 0) ? 'state' : 'esc';
    const peerReg = level === 'state' ? -1 : (st.reg >= 0 ? st.reg : (st.esc >= 0 ? ESC[st.esc][1] : MUN[st.mun][1]));
    const focus = st.esc >= 0 ? st.esc : (st.mun >= 0 ? MUN[st.mun][2] : -1);
    const groups = level === 'state' ? REG.length : ESC.length;
    const n = new Array(groups).fill(0), or = new Array(groups).fill(0), seen = Array.from({ length: groups }, () => new Set());
    for (let i = 0; i < N; i++) {
      if (st.ano >= 0 && aA[i] !== st.ano) continue;
      const e = aE[i]; if (e < 0) continue;
      if (level === 'esc' && escReg[e] !== peerReg) continue;
      const g = level === 'state' ? escReg[e] : e;
      n[g]++; or[g] += aO[i]; if (aB[i] >= 0) seen[g].add(aB[i]);
    }
    let list = [];
    for (let g = 0; g < groups; g++) {
      if (level === 'esc' && escReg[g] !== peerReg) continue;
      list.push({ g, name: level === 'state' ? rn(g) : ESC[g][0], v: n[g], prod: seen[g].size, or: or[g] });
    }
    const total = list.reduce((a, r) => a + r.v, 0) || 1;
    const vals = list.map(r => r.v), mn = Math.min(...vals), mx = Math.max(...vals), md = median(vals), zero = vals.filter(v => v === 0).length;
    list.sort((a, b) => ordVol ? (b.v - a.v || a.name.localeCompare(b.name, 'pt-BR')) : a.name.localeCompare(b.name, 'pt-BR'));

    const unit = level === 'state' ? 'regionais' : 'escritórios';
    $('#t4c').textContent = level === 'state' ? 'Comparação entre regionais' : 'Comparação entre escritórios · Regional ' + rn(peerReg);
    $('#s4c').textContent = level === 'state'
      ? 'Todos os atendimentos registrados por cada regional no período. Escolha uma regional para comparar os escritórios dela.'
      : 'Todos os atendimentos registrados por cada escritório da regional no período' + (focus >= 0 ? '. O escritório escolhido aparece em âmbar.' : '.');
    hbars($('#c4c'), list.map(r => ({
      name: r.name, v: r.v, label: nf(r.v), top: r.g === focus,
      tip: `<b>${esc(r.name)}</b><br>${nf(r.v)} atendimentos (${pc(r.v / total)} do grupo)<br>${nf(r.prod)} produtores atendidos${r.v ? '<br>' + nf2(r.or / r.v) + ' orientações por atendimento' : ''}`
    })), mx || 1);
    $('#c4c').innerHTML += `<div class="stats"><div><b>${nf(list.length)}</b>${unit}</div><div><b>${nf(mn)}</b>menor volume</div><div><b>${nf(md)}</b>mediana</div><div><b>${nf(mx)}</b>maior volume</div><div><b>${nf(total)}</b>atendimentos no grupo</div>${zero ? `<div><b>${nf(zero)}</b>sem atendimento registrado</div>` : ''}</div>`;
    tblData['4c'] = { head: [level === 'state' ? 'Regional' : 'Escritório', 'Atendimentos', 'Produtores atendidos', '% do grupo'], rows: list.map(r => [r.name, nf(r.v), nf(r.prod), pc(r.v / total)]) };

    const hint = 'Antes de qualquer conclusão, pergunte: há veículo disponível? O deslocamento é longo? Todos estão registrando no RURATER?';
    const nxt = level === 'state' ? ' Escolha uma regional para comparar os escritórios dela.' : (focus < 0 ? ' Escolha um escritório para destacá-lo entre os da regional.' : '');
    $('#msg4').innerHTML = `Entre ${level === 'state' ? 'as' : 'os'} <strong>${nf(list.length)}</strong> ${unit}${level === 'state' ? '' : ' da regional ' + esc(rn(peerReg))}, o volume de atendimentos vai de <strong>${nf(mn)}</strong> a <strong>${nf(mx)}</strong>, com mediana de <strong>${nf(md)}</strong>. ${hint}${nxt}`;
  }

  fillSelectors(); render4();

  /* ============================================================
     05 · CONCLUSÃO
     ============================================================ */
  (function fim() {
    const seen = new Uint8Array(maxBen + 1); let prod = 0;
    for (let i = 0; i < N; i++) { const b = aB[i]; if (b >= 0 && !seen[b]) { seen[b] = 1; prod++; } }
    $('#closing').innerHTML = `Entre ${YEARS[0]} e ${YEARS[YEARS.length - 1]}, o Ruraltins registrou <em>${nf(N)} atendimentos</em> a <em>${nf(prod)} produtores</em>. Por trás de cada linha, uma família tocantinense.`;
  })();

  /* ============================================================
     navegação: destaque da seção ativa e setas ← → para apresentar
     ============================================================ */
  const secs = [...document.querySelectorAll('main > section')];
  const links = [...document.querySelectorAll('#nav a')];
  const io = new IntersectionObserver(es => {
    es.forEach(en => { if (en.isIntersecting) links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + en.target.id)); });
  }, { rootMargin: '-45% 0px -50% 0px' });
  secs.forEach(s => io.observe(s));
  document.addEventListener('keydown', e => {
    if (/^(SELECT|INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const y = scrollY + innerHeight * 0.3;
    let cur = 0; secs.forEach((s, i) => { if (s.offsetTop <= y) cur = i; });
    const nx = Math.max(0, Math.min(secs.length - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)));
    secs[nx].scrollIntoView({ behavior: 'smooth', block: 'start' });
    e.preventDefault();
  });
})();
