// MLB Pinpoint Challenge \u2014 shared engine (list math, renderer, transport)
// Used by index.html (control) and display.html (OBS).
window.PP = (() => {
  const HUB_DEFAULT = 'https://jomboy-relay.jomboymedia.workers.dev';
  const W = 1920, H = 1080;

  // ── Stats (same definitions + list math as jomboytrivia.com MLB Pinpoint) ───────
  // PPDS batting row: [pidx, tidx, year, PA, H, HR, RBI, R, SB, AVG×1000, OBP×1000, SLG×1000, OPS×1000, TB]
  // PPDS pitching row: [pidx, tidx, year, OUTS, W, K, BB, ER, H, G, GS, SV]
  const B = { PID:0, TID:1, YEAR:2, PA:3, H:4, HR:5, RBI:6, R:7, SB:8, AVG:9, OBP:10, SLG:11, OPS:12, TB:13 };
  const P = { PID:0, TID:1, YEAR:2, OUTS:3, W:4, K:5, BB:6, ER:7, H:8, G:9, GS:10, SV:11 };
  const STATS = {
    hr:   { label:'Home Runs',        short:'HR',  card:'Home Runs' },
    hits: { label:'Hits',             short:'H',   card:'Hits' },
    rbi:  { label:'RBI',              short:'RBI', card:'RBI' },
    runs: { label:'Runs',             short:'R',   card:'Runs' },
    sb:   { label:'Stolen Bases',     short:'SB',  card:'Stolen Bases' },
    tb:   { label:'Total Bases',      short:'TB',  card:'Total Bases' },
    avg:  { label:'Batting Average',  short:'AVG', card:'Batting Avg', rate:1 },
    obp:  { label:'On-Base %',        short:'OBP', card:'On-Base Pct', rate:1 },
    slg:  { label:'Slugging %',       short:'SLG', card:'Slugging Pct', rate:1 },
    ops:  { label:'OPS',              short:'OPS', card:'OPS', rate:1 },
    wins: { label:'Wins',             short:'W',   card:'Wins', pit:1 },
    k:    { label:'Strikeouts',       short:'K',   card:'Strikeouts', pit:1 },
    ip:   { label:'Innings Pitched',  short:'IP',  card:'Innings Pitched', pit:1 },
    sv:   { label:'Saves',            short:'SV',  card:'Saves', pit:1 },
    g:    { label:'Games Pitched',    short:'G',   card:'Games Pitched', pit:1 },
    era:  { label:'ERA',              short:'ERA', card:'ERA', pit:1, rate:1, low:1 },
    whip: { label:'WHIP',             short:'WHIP',card:'WHIP', pit:1, rate:1, low:1 },
    war:  { label:'WAR (all players)',short:'WAR', card:'WAR', war:1 },
    warh: { label:'WAR (position players)', short:'WAR', card:'WAR', war:1 },
    warp: { label:'WAR (pitchers)',   short:'WAR', card:'WAR', war:1 },
  };
  const STAT_GROUPS = [
    ['Hitting', ['hr','hits','rbi','runs','sb','tb','avg','obp','slg','ops']],
    ['Pitching', ['wins','k','ip','sv','g','era','whip']],
    ['WAR', ['war','warh','warp']],
  ];
  const RATE_SCALE = 1000;
  const SHORT_SEASONS = { 2020:60, 1995:144, 1994:115, 1981:107, 1972:156, 1919:140, 1918:124, 1917:126 };
  const seasonGames = y => SHORT_SEASONS[y] || 162;
  // rate-stat qualifiers, exactly as the site computes them
  function qualifiers(yearMin, yearMax) {
    const n = Math.max(1, yearMax - yearMin + 1);
    if (n >= 7) return { minPA: 3000, minOuts: 3000 };
    if (n === 1) { const g = seasonGames(yearMin); return { minPA: g < 162 ? Math.round(3.1 * g) : 502, minOuts: g < 162 ? g * 3 : 486 }; }
    let minPA = 0, minOuts = 0;
    for (let y = yearMin; y <= yearMax; y++) { const g = seasonGames(y); minPA += g < 162 ? Math.round(3.1 * g) : 450; minOuts += g < 162 ? g * 3 : 450; }
    return { minPA, minOuts };
  }
  function qualLabel(stat, yearMin, yearMax) {
    const st = STATS[stat]; if (!st || !st.rate) return '';
    const q = qualifiers(yearMin, yearMax);
    return st.pit ? Math.round(q.minOuts / 3).toLocaleString('en-US') + ' IP minimum' : q.minPA.toLocaleString('en-US') + ' PA minimum';
  }
  // Display value: rate stats are stored ×1000, IP as outs
  function fmtStat(stat, v) {
    if (v == null || v === '') return '';
    const st = STATS[stat] || {};
    if (st.war) return Number(v).toFixed(1);
    if (stat === 'ip') { const o = Math.max(0, Math.round(+v)); return Math.floor(o / 3).toLocaleString('en-US') + '.' + (o % 3); }
    if (!st.rate) return Math.round(+v).toLocaleString('en-US');
    const x = +v / RATE_SCALE;
    if (stat === 'era' || stat === 'whip') return x.toFixed(2);
    if (stat === 'ops' && x >= 1) return x.toFixed(3);
    const s = x.toFixed(3); return s.startsWith('0.') ? s.slice(1) : s;
  }
  const NEGRO = new Set(['NNL','NAL','NN2','WES','EAS','EWL','ECL','NSL','ANL','NAC']);
  function leagueFor(DS, tidx, year) {
    const t = DS.teams[DS.teamIndex[tidx]]; if (!t) return '';
    const ab = (t.abbr || '').toUpperCase();
    if (ab === 'MIL' && year < 1998) return 'AL';
    if (ab === 'HOU' && year < 2013) return 'NL';
    return t.lg || '';
  }
  // Display-name fixes + split-ID merges the site applies
  const PID_CANON = { greenri03: 'greenri02', acunajo01: 'acunalu01', callal02: 'callal01', rodrijo10: 'rodrijo08' };
  const DISPLAY_NAMES = { griffke01:'Ken Griffey Sr.', griffke02:'Ken Griffey Jr.', wittbo01:'Bobby Witt Sr.', wittbo02:'Bobby Witt Jr.', ripkeca01:'Cal Ripken Jr.',
    guerrvl01:'Vladimir Guerrero', guerrvl02:'Vladimir Guerrero Jr.', speaktr01:'Tris Speaker', tatisfe01:'Fernando Tatis Sr.', tatisfe02:'Fernando Tatis Jr.' };
  const ALIASES = { 'dee gordon':'dee strangegordon', 'clint frazier':'jackson frazier', 'melvin upton':'bj upton', 'melvin upton jr':'bj upton', 'joey belle':'albert belle',
    'felipe rivero':'felipe vazquez', 'zach britton':'zack britton', 'mike stanton':'giancarlo stanton', 'trenton clark':'trent grisham', 'trenton grisham':'trent grisham',
    'fausto carmona':'roberto hernandez', 'leo nunez':'juan carlos oviedo', 'kendry morales':'kendrys morales', 'michael king':'mike king', 'michael inoa':'michael ynoa',
    'john ryan murphy':'jr murphy', 'javy baez':'javier baez', 'ryan gennett':'scooter gennett', 'gerald posey':'buster posey', 'larry jones':'chipper jones',
    'albertin chapman':'aroldis chapman', 'covelli crisp':'coco crisp', 'john bonser':'boof bonser', 'grover alexander':'pete alexander',
    'grover cleveland alexander':'pete alexander', 'chief bender':'charles bender', 'ken griffey':'ken griffey jr', 'j richard':'jr richard',
    'bobby witt':'bobby witt jr', 'cal ripken':'cal ripken jr', 'matthew boyd':'matt boyd', 'louis varland':'louie varland' };
  const nameOf = (DS, id) => DISPLAY_NAMES[id] || ((DS.players[id] || {}).n) || id;

  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
  const normHy = s => norm((s || '').replace(/-/g, ' '));
  const lastName = s => { const p = norm(s).split(' ').filter(x => !/^(jr|sr|ii|iii|iv|v)$/.test(x)); return p[p.length - 1] || ''; };

  function rankRows(rows, low) {
    let i = 0;
    while (i < rows.length) {
      let j = i; while (j < rows.length && rows[j].val === rows[i].val) j++;
      for (let k = i; k < j; k++) { rows[k].rank = i + 1; rows[k].dr = (j - i > 1 ? 'T' : '') + (i + 1); }
      i = j;
    }
    return rows;
  }

  // WAR rows: [bbrefId, year, bbrefTeam, war]; classified hitter/pitcher by where the season was played
  function warList(DS, spec, kind) {
    const { yearMin, yearMax } = spec;
    const isPitSeason = DS._pitSeason || (DS._pitSeason = (() => { const s = new Set(); for (const r of DS.pitching) if (r[P.OUTS] >= 30) s.add(DS.playerIndex[r[0]] + '|' + r[2]); return s; })());
    const isBatSeason = DS._batSeason || (DS._batSeason = (() => { const s = new Set(); for (const r of DS.batting) if (r[B.PA] >= 50) s.add(DS.playerIndex[r[0]] + '|' + r[2]); return s; })());
    const agg = new Map();
    for (const [wid, y, , w] of DS.war) {
      if (y < yearMin || y > yearMax) continue;
      const id = DS.warId[wid] || wid;
      if (kind === 'p' && !isPitSeason.has(id + '|' + y)) continue;
      if (kind === 'h' && (isPitSeason.has(id + '|' + y) && !isBatSeason.has(id + '|' + y))) continue;
      agg.set(id, (agg.get(id) || 0) + w);
    }
    const out = [];
    agg.forEach((v, id) => { v = Math.round(v * 10) / 10; if (v > 0) out.push({ id, val: v, name: nameOf(DS, id) }); });
    out.sort((a, b) => b.val - a.val);
    return out;
  }

  // computePinpointList port. spec = { stat, yearMin, yearMax, poolTab:'all'|'league'|'team', leagues:[], teams:[tidx...], listSize }
  function computeList(DS, spec) {
    const { stat, yearMin, yearMax, poolTab = 'all', leagues = [], teams = [], listSize = 100 } = spec;
    const st = STATS[stat];
    let full, unq = new Set();
    if (st.war) full = warList(DS, spec, stat === 'warh' ? 'h' : stat === 'warp' ? 'p' : 'a');
    else {
      const isPit = !!st.pit, src = isPit ? DS.pitching : DS.batting;
      const lgSet = poolTab === 'league' && leagues.length ? leagues : null;
      const tmSet = poolTab === 'team' && teams.length ? new Set(teams) : null;
      const agg = new Map();
      for (const r of src) {
        const y = r[2]; if (y < yearMin || y > yearMax) continue;
        if (lgSet) { const lg = leagueFor(DS, r[1], y); if (!lgSet.some(q => q === 'NEGRO' ? NEGRO.has(lg) : lg === q)) continue; }
        if (tmSet && !tmSet.has(r[1])) continue;
        let id = DS.playerIndex[r[0]]; id = PID_CANON[id] || id;
        let a = agg.get(id);
        if (!a) agg.set(id, a = isPit ? { outs:0, er:0, bb:0, h:0, w:0, k:0, sv:0, g:0 } : { pa:0, hits:0, hr:0, rbi:0, runs:0, sb:0, tb:0, avg:0, obp:0, slg:0, ops:0 });
        if (isPit) { a.outs += r[P.OUTS] || 0; a.er += r[P.ER] || 0; a.bb += r[P.BB] || 0; a.h += r[P.H] || 0; a.w += r[P.W] || 0; a.k += r[P.K] || 0; a.sv += r[P.SV] || 0; a.g += r[P.G] || 0; }
        else { const pa = r[B.PA] || 0; a.pa += pa; a.hits += r[B.H] || 0; a.hr += r[B.HR] || 0; a.rbi += r[B.RBI] || 0; a.runs += r[B.R] || 0; a.sb += r[B.SB] || 0; a.tb += r[B.TB] || 0;
          a.avg += pa * (r[B.AVG] || 0); a.obp += pa * (r[B.OBP] || 0); a.slg += pa * (r[B.SLG] || 0); a.ops += pa * (r[B.OPS] || 0); }
      }
      const { minPA, minOuts } = qualifiers(yearMin, yearMax);
      full = [];
      agg.forEach((a, id) => {
        let v = 0;
        if (isPit) v = stat === 'wins' ? a.w : stat === 'k' ? a.k : stat === 'ip' ? a.outs : stat === 'sv' ? a.sv : stat === 'g' ? a.g
          : stat === 'era' ? (a.outs > 0 ? Math.round(a.er * 27 * RATE_SCALE / a.outs) : 0) : (a.outs > 0 ? Math.round((a.bb + a.h) * 3 * RATE_SCALE / a.outs) : 0);
        else v = stat === 'avg' || stat === 'obp' || stat === 'slg' || stat === 'ops' ? (a.pa > 0 ? Math.round(a[stat] / a.pa) : 0) : a[stat];
        if (v <= 0) return;
        if (st.rate && (isPit ? a.outs < minOuts : a.pa < minPA)) { unq.add(id); return; }   // didn't qualify
        full.push({ id, val: v, name: nameOf(DS, id) });
      });
      full.sort((a, b) => st.low ? a.val - b.val : b.val - a.val);
    }
    full.forEach((r, i) => { r.rank = i + 1; r.dr = String(i + 1); });   // the site ranks straight 1..N (no ties)
    return { top: full.slice(0, listSize), full, unq };
  }

  function subtitleFor(yMin, yMax, first, last) {
    if (yMin <= first + 30 && yMax >= last) return 'All-Time';
    if (yMin === yMax) return String(yMin);
    if (yMax >= last) return 'Since ' + yMin;
    if (yMin % 10 === 0 && yMax === yMin + 9) return 'The ' + yMin + 's';
    return yMin + '–' + yMax;
  }

  const fmtVal = v => {
    if (v == null || v === '') return '';
    if (typeof v === 'string') return v;
    return Number.isInteger(v) ? v.toLocaleString('en-US') : v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  };
  // (see headshotUrl below for MLB photo codes)
  // photo codes: m<mlbam> = MLB cutout ("silo"), h<mlbam> = MLB headshot on a grey backdrop; or a full URL / data URL
  const headshotUrl = hs => !hs ? '' : /^https?:|^data:/.test(hs) ? hs
    : hs[0] === 'm' ? `https://img.mlbstatic.com/mlb-photos/image/upload/w_800,q_auto:best/v1/people/${hs.slice(1)}/headshot/silo/current`
    : hs[0] === 'h' ? `https://img.mlbstatic.com/mlb-photos/image/upload/w_640,q_auto:best/v1/people/${hs.slice(1)}/headshot/67/current`
    : '';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const CARD_THEMES = [
    { panel:'#12c2f4', ban:'#f45fb5' }, // cyan / pink (the episode look)
    { panel:'#f6d02a', ban:'#1fae5b' }, // yellow / green
    { panel:'#ff7a3d', ban:'#2e6fe3' }, // orange / blue
    { panel:'#8fdf4f', ban:'#ec3d55' }, // lime / red
    { panel:'#b784ef', ban:'#f6a12e' }, // purple / orange
    { panel:'#ff5a7a', ban:'#1fb8b0' }, // coral / teal
  ];
  const PLAYER_COLORS = ['#f7a35c', '#f45fb5', '#f6e04a', '#5cc8ff', '#7be07b'];

  // card x/y/size \u00b7 scoreboard x/y/size \u00b7 strike boxes centre-x/y/size \u00b7 board size
  const LAY_DEFAULT = { cx: 30, cy: 20, cs: 126, sx: 805, sy: 615, ss: 100, kx: 1350, ky: 819, ks: 100, bs: 100, bx: 0, by: 0, sn: 100, snm: 100 };

  // \u2500\u2500 Fonts: every on-screen text element has its own font, chosen on the control page \u2500\u2500
  // PRIMETIME + Designer load from fonts installed on the machine (not shipped); the rest are Google / Adobe (kit lxl2pkq).
  const FONTS = {
    "anton": ["Anton", "'Anton',sans-serif", 400, 'normal', "Block & condensed", "Anton"],
    "bebas": ["Bebas Neue", "'Bebas Neue',sans-serif", 400, 'normal', "Block & condensed", "Bebas+Neue"],
    "g-oswald-700": ["Oswald Bold", "'Oswald',sans-serif", 700, 'normal', "Block & condensed", "Oswald:wght@700"],
    "g-league-gothic-400": ["League Gothic", "'League Gothic',sans-serif", 400, 'normal', "Block & condensed", "League+Gothic"],
    "g-fjalla-one-400": ["Fjalla One", "'Fjalla One',sans-serif", 400, 'normal', "Block & condensed", "Fjalla+One"],
    "g-staatliches-400": ["Staatliches", "'Staatliches',sans-serif", 400, 'normal', "Block & condensed", "Staatliches"],
    "g-teko-600": ["Teko SemiBold", "'Teko',sans-serif", 600, 'normal', "Block & condensed", "Teko:wght@600"],
    "g-big-shoulders-display-900": ["Big Shoulders Display Black", "'Big Shoulders Display',sans-serif", 900, 'normal', "Block & condensed", "Big+Shoulders+Display:wght@900"],
    "g-barlow-condensed-800": ["Barlow Condensed ExtraBold", "'Barlow Condensed',sans-serif", 800, 'normal', "Block & condensed", "Barlow+Condensed:wght@800"],
    "g-barlow-condensed-800-i": ["Barlow Condensed ExtraBold Italic", "'Barlow Condensed',sans-serif", 800, 'italic', "Block & condensed", "Barlow+Condensed:ital,wght@1,800"],
    "g-saira-condensed-800": ["Saira Condensed ExtraBold", "'Saira Condensed',sans-serif", 800, 'normal', "Block & condensed", "Saira+Condensed:wght@800"],
    "g-roboto-condensed-800": ["Roboto Condensed ExtraBold", "'Roboto Condensed',sans-serif", 800, 'normal', "Block & condensed", "Roboto+Condensed:wght@800"],
    "archivo": ["Archivo Narrow Bold", "'Archivo Narrow',sans-serif", 700, 'normal', "Block & condensed", "Archivo+Narrow:wght@700"],
    "g-squada-one-400": ["Squada One", "'Squada One',sans-serif", 400, 'normal', "Block & condensed", "Squada+One"],
    "g-six-caps-400": ["Six Caps", "'Six Caps',sans-serif", 400, 'normal', "Block & condensed", "Six+Caps"],
    "g-antonio-700": ["Antonio Bold", "'Antonio',sans-serif", 700, 'normal', "Block & condensed", "Antonio:wght@700"],
    "g-koulen-400": ["Koulen", "'Koulen',sans-serif", 400, 'normal', "Block & condensed", "Koulen"],
    "g-archivo-black-400": ["Archivo Black", "'Archivo Black',sans-serif", 400, 'normal', "Heavy & impact", "Archivo+Black"],
    "g-bowlby-one-400": ["Bowlby One", "'Bowlby One',sans-serif", 400, 'normal', "Heavy & impact", "Bowlby+One"],
    "g-rubik-mono-one-400": ["Rubik Mono One", "'Rubik Mono One',sans-serif", 400, 'normal', "Heavy & impact", "Rubik+Mono+One"],
    "g-russo-one-400": ["Russo One", "'Russo One',sans-serif", 400, 'normal', "Heavy & impact", "Russo+One"],
    "g-black-han-sans-400": ["Black Han Sans", "'Black Han Sans',sans-serif", 400, 'normal', "Heavy & impact", "Black+Han+Sans"],
    "g-dela-gothic-one-400": ["Dela Gothic One", "'Dela Gothic One',sans-serif", 400, 'normal', "Heavy & impact", "Dela+Gothic+One"],
    "g-titan-one-400": ["Titan One", "'Titan One',sans-serif", 400, 'normal', "Heavy & impact", "Titan+One"],
    "g-ultra-400": ["Ultra", "'Ultra',sans-serif", 400, 'normal', "Heavy & impact", "Ultra"],
    "g-chango-400": ["Chango", "'Chango',sans-serif", 400, 'normal', "Heavy & impact", "Chango"],
    "g-passion-one-900": ["Passion One Black", "'Passion One',sans-serif", 900, 'normal', "Heavy & impact", "Passion+One:wght@900"],
    "g-montserrat-900": ["Montserrat Black", "'Montserrat',sans-serif", 900, 'normal', "Heavy & impact", "Montserrat:wght@900"],
    "g-montserrat-900-i": ["Montserrat Black Italic", "'Montserrat',sans-serif", 900, 'italic', "Heavy & impact", "Montserrat:ital,wght@1,900"],
    "g-poppins-900": ["Poppins Black", "'Poppins',sans-serif", 900, 'normal', "Heavy & impact", "Poppins:wght@900"],
    "g-inter-900": ["Inter Black", "'Inter',sans-serif", 900, 'normal', "Heavy & impact", "Inter:wght@900"],
    "g-archivo-900": ["Archivo Black", "'Archivo',sans-serif", 900, 'normal', "Heavy & impact", "Archivo:wght@900"],
    "g-rubik-900": ["Rubik Black", "'Rubik',sans-serif", 900, 'normal', "Heavy & impact", "Rubik:wght@900"],
    "g-kanit-800": ["Kanit ExtraBold", "'Kanit',sans-serif", 800, 'normal', "Heavy & impact", "Kanit:wght@800"],
    "g-kanit-800-i": ["Kanit ExtraBold Italic", "'Kanit',sans-serif", 800, 'italic', "Heavy & impact", "Kanit:ital,wght@1,800"],
    "g-unbounded-900": ["Unbounded Black", "'Unbounded',sans-serif", 900, 'normal', "Heavy & impact", "Unbounded:wght@900"],
    "g-krona-one-400": ["Krona One", "'Krona One',sans-serif", 400, 'normal', "Heavy & impact", "Krona+One"],
    "g-graduate-400": ["Graduate", "'Graduate',sans-serif", 400, 'normal', "Sporty & varsity", "Graduate"],
    "g-holtwood-one-sc-400": ["Holtwood One SC", "'Holtwood One SC',sans-serif", 400, 'normal', "Sporty & varsity", "Holtwood+One+SC"],
    "g-bungee-400": ["Bungee", "'Bungee',sans-serif", 400, 'normal', "Sporty & varsity", "Bungee"],
    "g-bungee-inline-400": ["Bungee Inline", "'Bungee Inline',sans-serif", 400, 'normal', "Sporty & varsity", "Bungee+Inline"],
    "g-bungee-shade-400": ["Bungee Shade", "'Bungee Shade',sans-serif", 400, 'normal', "Sporty & varsity", "Bungee+Shade"],
    "g-racing-sans-one-400": ["Racing Sans One", "'Racing Sans One',sans-serif", 400, 'normal', "Sporty & varsity", "Racing+Sans+One"],
    "g-faster-one-400": ["Faster One", "'Faster One',sans-serif", 400, 'normal', "Sporty & varsity", "Faster+One"],
    "g-seymour-one-400": ["Seymour One", "'Seymour One',sans-serif", 400, 'normal', "Sporty & varsity", "Seymour+One"],
    "g-contrail-one-400": ["Contrail One", "'Contrail One',sans-serif", 400, 'normal', "Sporty & varsity", "Contrail+One"],
    "g-changa-one-400": ["Changa One", "'Changa One',sans-serif", 400, 'normal', "Sporty & varsity", "Changa+One"],
    "g-changa-one-400-i": ["Changa One Italic", "'Changa One',sans-serif", 400, 'italic', "Sporty & varsity", "Changa+One:ital,wght@1,400"],
    "g-days-one-400": ["Days One", "'Days One',sans-serif", 400, 'normal', "Sporty & varsity", "Days+One"],
    "g-black-ops-one-400": ["Black Ops One", "'Black Ops One',sans-serif", 400, 'normal', "Sporty & varsity", "Black+Ops+One"],
    "g-saira-stencil-one-400": ["Saira Stencil One", "'Saira Stencil One',sans-serif", 400, 'normal', "Sporty & varsity", "Saira+Stencil+One"],
    "g-allerta-stencil-400": ["Allerta Stencil", "'Allerta Stencil',sans-serif", 400, 'normal', "Sporty & varsity", "Allerta+Stencil"],
    "g-jockey-one-400": ["Jockey One", "'Jockey One',sans-serif", 400, 'normal', "Sporty & varsity", "Jockey+One"],
    "g-teko-700": ["Teko Bold", "'Teko',sans-serif", 700, 'normal', "Sporty & varsity", "Teko:wght@700"],
    "g-bangers-400": ["Bangers", "'Bangers',sans-serif", 400, 'normal', "Fun & comic", "Bangers"],
    "g-luckiest-guy-400": ["Luckiest Guy", "'Luckiest Guy',sans-serif", 400, 'normal', "Fun & comic", "Luckiest+Guy"],
    "g-lilita-one-400": ["Lilita One", "'Lilita One',sans-serif", 400, 'normal', "Fun & comic", "Lilita+One"],
    "g-sigmar-one-400": ["Sigmar One", "'Sigmar One',sans-serif", 400, 'normal', "Fun & comic", "Sigmar+One"],
    "g-rammetto-one-400": ["Rammetto One", "'Rammetto One',sans-serif", 400, 'normal', "Fun & comic", "Rammetto+One"],
    "g-chewy-400": ["Chewy", "'Chewy',sans-serif", 400, 'normal', "Fun & comic", "Chewy"],
    "g-fredoka-700": ["Fredoka Bold", "'Fredoka',sans-serif", 700, 'normal', "Fun & comic", "Fredoka:wght@700"],
    "g-baloo-2-800": ["Baloo 2 ExtraBold", "'Baloo 2',sans-serif", 800, 'normal', "Fun & comic", "Baloo+2:wght@800"],
    "g-londrina-solid-900": ["Londrina Solid Black", "'Londrina Solid',sans-serif", 900, 'normal', "Fun & comic", "Londrina+Solid:wght@900"],
    "g-boogaloo-400": ["Boogaloo", "'Boogaloo',sans-serif", 400, 'normal', "Fun & comic", "Boogaloo"],
    "g-bubblegum-sans-400": ["Bubblegum Sans", "'Bubblegum Sans',sans-serif", 400, 'normal', "Fun & comic", "Bubblegum+Sans"],
    "g-knewave-400": ["Knewave", "'Knewave',sans-serif", 400, 'normal', "Fun & comic", "Knewave"],
    "g-shrikhand-400": ["Shrikhand", "'Shrikhand',sans-serif", 400, 'normal', "Fun & comic", "Shrikhand"],
    "g-righteous-400": ["Righteous", "'Righteous',sans-serif", 400, 'normal', "Fun & comic", "Righteous"],
    "g-modak-400": ["Modak", "'Modak',sans-serif", 400, 'normal', "Fun & comic", "Modak"],
    "g-gluten-800": ["Gluten ExtraBold", "'Gluten',sans-serif", 800, 'normal', "Fun & comic", "Gluten:wght@800"],
    "g-rubik-bubbles-400": ["Rubik Bubbles", "'Rubik Bubbles',sans-serif", 400, 'normal', "Fun & comic", "Rubik+Bubbles"],
    "g-coiny-400": ["Coiny", "'Coiny',sans-serif", 400, 'normal', "Fun & comic", "Coiny"],
    "g-alfa-slab-one-400": ["Alfa Slab One", "'Alfa Slab One',sans-serif", 400, 'normal', "Slab & western", "Alfa+Slab+One"],
    "g-rye-400": ["Rye", "'Rye',sans-serif", 400, 'normal', "Slab & western", "Rye"],
    "g-sancreek-400": ["Sancreek", "'Sancreek',sans-serif", 400, 'normal', "Slab & western", "Sancreek"],
    "g-bevan-400": ["Bevan", "'Bevan',sans-serif", 400, 'normal', "Slab & western", "Bevan"],
    "g-arvo-700": ["Arvo Bold", "'Arvo',sans-serif", 700, 'normal', "Slab & western", "Arvo:wght@700"],
    "g-zilla-slab-700": ["Zilla Slab Bold", "'Zilla Slab',sans-serif", 700, 'normal', "Slab & western", "Zilla+Slab:wght@700"],
    "g-abril-fatface-400": ["Abril Fatface", "'Abril Fatface',sans-serif", 400, 'normal', "Slab & western", "Abril+Fatface"],
    "g-playfair-display-900": ["Playfair Display Black", "'Playfair Display',sans-serif", 900, 'normal', "Slab & western", "Playfair+Display:wght@900"],
    "g-playfair-display-900-i": ["Playfair Display Black Italic", "'Playfair Display',sans-serif", 900, 'italic', "Slab & western", "Playfair+Display:ital,wght@1,900"],
    "g-chonburi-400": ["Chonburi", "'Chonburi',sans-serif", 400, 'normal', "Slab & western", "Chonburi"],
    "g-ewert-400": ["Ewert", "'Ewert',sans-serif", 400, 'normal', "Slab & western", "Ewert"],
    "g-smokum-400": ["Smokum", "'Smokum',sans-serif", 400, 'normal', "Slab & western", "Smokum"],
    "g-orbitron-900": ["Orbitron Black", "'Orbitron',sans-serif", 900, 'normal', "Tech & retro", "Orbitron:wght@900"],
    "g-audiowide-400": ["Audiowide", "'Audiowide',sans-serif", 400, 'normal', "Tech & retro", "Audiowide"],
    "g-zen-dots-400": ["Zen Dots", "'Zen Dots',sans-serif", 400, 'normal', "Tech & retro", "Zen+Dots"],
    "g-michroma-400": ["Michroma", "'Michroma',sans-serif", 400, 'normal', "Tech & retro", "Michroma"],
    "g-monoton-400": ["Monoton", "'Monoton',sans-serif", 400, 'normal', "Tech & retro", "Monoton"],
    "g-press-start-2p-400": ["Press Start 2P", "'Press Start 2P',sans-serif", 400, 'normal', "Tech & retro", "Press+Start+2P"],
    "g-silkscreen-700": ["Silkscreen Bold", "'Silkscreen',sans-serif", 700, 'normal', "Tech & retro", "Silkscreen:wght@700"],
    "g-vt323-400": ["VT323", "'VT323',sans-serif", 400, 'normal', "Tech & retro", "VT323"],
    "g-goldman-700": ["Goldman Bold", "'Goldman',sans-serif", 700, 'normal', "Tech & retro", "Goldman:wght@700"],
    "g-chakra-petch-700": ["Chakra Petch Bold", "'Chakra Petch',sans-serif", 700, 'normal', "Tech & retro", "Chakra+Petch:wght@700"],
    "g-exo-2-900": ["Exo 2 Black", "'Exo 2',sans-serif", 900, 'normal', "Tech & retro", "Exo+2:wght@900"],
    "g-exo-2-900-i": ["Exo 2 Black Italic", "'Exo 2',sans-serif", 900, 'italic', "Tech & retro", "Exo+2:ital,wght@1,900"],
    "g-turret-road-800": ["Turret Road ExtraBold", "'Turret Road',sans-serif", 800, 'normal', "Tech & retro", "Turret+Road:wght@800"],
    "g-syncopate-700": ["Syncopate Bold", "'Syncopate',sans-serif", 700, 'normal', "Tech & retro", "Syncopate:wght@700"],
    "g-tilt-warp-400": ["Tilt Warp", "'Tilt Warp',sans-serif", 400, 'normal', "Tech & retro", "Tilt+Warp"],
    "g-tilt-prism-400": ["Tilt Prism", "'Tilt Prism',sans-serif", 400, 'normal', "Tech & retro", "Tilt+Prism"],
    "g-major-mono-display-400": ["Major Mono Display", "'Major Mono Display',sans-serif", 400, 'normal', "Tech & retro", "Major+Mono+Display"],
    "g-permanent-marker-400": ["Permanent Marker", "'Permanent Marker',sans-serif", 400, 'normal', "Script & marker", "Permanent+Marker"],
    "g-pacifico-400": ["Pacifico", "'Pacifico',sans-serif", 400, 'normal', "Script & marker", "Pacifico"],
    "g-lobster-400": ["Lobster", "'Lobster',sans-serif", 400, 'normal', "Script & marker", "Lobster"],
    "g-yellowtail-400": ["Yellowtail", "'Yellowtail',sans-serif", 400, 'normal', "Script & marker", "Yellowtail"],
    "g-kaushan-script-400": ["Kaushan Script", "'Kaushan Script',sans-serif", 400, 'normal', "Script & marker", "Kaushan+Script"],
    "g-damion-400": ["Damion", "'Damion',sans-serif", 400, 'normal', "Script & marker", "Damion"],
    "g-great-vibes-400": ["Great Vibes", "'Great Vibes',sans-serif", 400, 'normal', "Script & marker", "Great+Vibes"],
    "g-oleo-script-700": ["Oleo Script Bold", "'Oleo Script',sans-serif", 700, 'normal', "Script & marker", "Oleo+Script:wght@700"],
    "g-caveat-brush-400": ["Caveat Brush", "'Caveat Brush',sans-serif", 400, 'normal', "Script & marker", "Caveat+Brush"],
    "g-rock-salt-400": ["Rock Salt", "'Rock Salt',sans-serif", 400, 'normal', "Script & marker", "Rock+Salt"],
    "g-marck-script-400": ["Marck Script", "'Marck Script',sans-serif", 400, 'normal', "Script & marker", "Marck+Script"],
    "g-sedgwick-ave-display-400": ["Sedgwick Ave Display", "'Sedgwick Ave Display',sans-serif", 400, 'normal', "Script & marker", "Sedgwick+Ave+Display"],
    "g-covered-by-your-grace-400": ["Covered By Your Grace", "'Covered By Your Grace',sans-serif", 400, 'normal', "Script & marker", "Covered+By+Your+Grace"],
    "dmsans": ["DM Sans Bold", "'DM Sans',sans-serif", 700, 'normal', "Clean", "DM+Sans:wght@700"],
    "g-inter-700": ["Inter Bold", "'Inter',sans-serif", 700, 'normal', "Clean", "Inter:wght@700"],
    "g-space-grotesk-700": ["Space Grotesk Bold", "'Space Grotesk',sans-serif", 700, 'normal', "Clean", "Space+Grotesk:wght@700"],
    "g-manrope-800": ["Manrope ExtraBold", "'Manrope',sans-serif", 800, 'normal', "Clean", "Manrope:wght@800"],
    "g-outfit-800": ["Outfit ExtraBold", "'Outfit',sans-serif", 800, 'normal', "Clean", "Outfit:wght@800"],
    "g-lexend-800": ["Lexend ExtraBold", "'Lexend',sans-serif", 800, 'normal', "Clean", "Lexend:wght@800"],
    "g-work-sans-800": ["Work Sans ExtraBold", "'Work Sans',sans-serif", 800, 'normal', "Clean", "Work+Sans:wght@800"],
    "g-barlow-800": ["Barlow ExtraBold", "'Barlow',sans-serif", 800, 'normal', "Clean", "Barlow:wght@800"],
    "g-bricolage-grotesque-800": ["Bricolage Grotesque ExtraBold", "'Bricolage Grotesque',sans-serif", 800, 'normal', "Clean", "Bricolage+Grotesque:wght@800"],
    "g-syne-800": ["Syne ExtraBold", "'Syne',sans-serif", 800, 'normal', "Clean", "Syne:wght@800"],
    "g-archivo-700": ["Archivo Bold", "'Archivo',sans-serif", 700, 'normal', "Clean", "Archivo:wght@700"],
    primetime:   ['PRIMETIME + ten drop shadows (installed)', "'NPP Primetime','Archivo Black',sans-serif", 400, 'normal', 'Your fonts', 'Archivo+Black'],
    designer:    ['Designer (installed)', "'NPP Designer','Russo One',sans-serif", 400, 'normal', 'Your fonts', 'Russo+One'],
    gothic:      ['Gothic Open Shaded (Adobe)', "'gothic-open-shaded','Anton',sans-serif", 400, 'normal', 'Your fonts', null],
    roboto:      ['Roboto Bold (Adobe)', "'roboto',sans-serif", 700, 'normal', 'Your fonts', null],
    'roboto-r':  ['Roboto (Adobe)', "'roboto',sans-serif", 400, 'normal', 'Your fonts', null],
    'roboto-i':  ['Roboto Italic (Adobe)', "'roboto',sans-serif", 400, 'italic', 'Your fonts', null],
    'roboto-xl': ['Roboto ExtraLight (Adobe)', "'roboto-extralight',sans-serif", 200, 'normal', 'Your fonts', null],
    'roboto-xli':['Roboto ExtraLight Italic (Adobe)', "'roboto-extralight',sans-serif", 200, 'italic', 'Your fonts', null],
    'sys-impact':  ['Impact', "Impact,'Anton',sans-serif", 400, 'normal', 'On this computer', null],
    'sys-arialblack': ['Arial Black', "'Arial Black','Archivo Black',sans-serif", 900, 'normal', 'On this computer', null],
    'sys-futura':  ['Futura Bold', "Futura,'Montserrat',sans-serif", 700, 'normal', 'On this computer', null],
    'sys-avenircond': ['Avenir Next Condensed Heavy', "'Avenir Next Condensed','Barlow Condensed',sans-serif", 800, 'normal', 'On this computer', null],
    'sys-helvcond': ['Helvetica Neue Condensed Black', "'Helvetica Neue','Roboto Condensed',sans-serif", 900, 'normal', 'On this computer', null],
    'sys-copperplate': ['Copperplate', "Copperplate,'Cinzel',serif", 700, 'normal', 'On this computer', null],
    'sys-markerfelt': ['Marker Felt', "'Marker Felt','Permanent Marker',sans-serif", 700, 'normal', 'On this computer', null],
  };
  // [key, label, default, group]
  const FONT_SLOTS = [
    ['scoreName', 'Contestant names', 'primetime', 'Scoreboard'],
    ['score', 'Scores', 'designer', 'Scoreboard'],
    ['pop', '+points pop & OUT stamp', 'anton', 'Scoreboard'],
    ['title', 'List title bar', 'anton', 'Scoreboard'],
    ['cardName', 'Player name', 'primetime', 'Card'],
    ['cardVal', 'Stat number', 'designer', 'Card'],
    ['cardLbl', 'Stat label & star text', 'designer', 'Card'],
    ['rank', 'Rank number', 'designer', 'Card'],
    ['teams', 'Team & years tags', 'anton', 'Card'],
    ['who', 'Contestant tag & Rare find', 'anton', 'Card'],
    ['pin', 'PINPOINT banner', 'primetime', 'Card'],
    ['boardHead', 'Board title', 'anton', 'Full board'],
    ['board', 'Board names', 'archivo', 'Full board'],
  ];
  // pieces inside the card the producer can move / size: [key, label]
  const CARD_PIECES = [['name', 'Player name'], ['val', 'Stat number'], ['lbl', 'Stat label'], ['rank', 'Rank badge'], ['teams', 'Team & years tags'],
    ['who', 'Contestant tag'], ['rare', 'Rare find sticker'], ['pin', 'PINPOINT banner'], ['photo', 'Player photo']];
  const fontLinks = new Set();
  function ensureFont(key) {           // Google fonts load only when picked
    const d = FONTS[key]; if (!d || !d[5] || fontLinks.has(d[5])) return;
    fontLinks.add(d[5]);
    const l = document.createElement('link'); l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + d[5] + '&display=block';
    document.head.appendChild(l);
  }
  const fontDefaults = () => Object.fromEntries(FONT_SLOTS.map(f => [f[0], f[2]]));

  // \u2500\u2500 Teams: colours (by franchise) + the abbreviation the team used that year (Lahman) \u2500\u2500
  const TEAM_COLORS = {
    ARI:['#A71930','#E3D4AD'], ATL:['#13274F','#CE1141'], BAL:['#DF4601','#000000'], BOS:['#BD3039','#0C2340'], CHC:['#0E3386','#CC3433'],
    CHW:['#27251F','#C4CED4'], CIN:['#C6011F','#000000'], CLE:['#00385D','#E50022'], COL:['#33006F','#C4CED4'], DET:['#0C2340','#FA4616'],
    HOU:['#002D62','#EB6E1F'], KCR:['#004687','#BD9B60'], LAA:['#BA0021','#003263'], LAD:['#005A9C','#EF3E42'], MIA:['#00A3E0','#EF3340'],
    MIL:['#12284B','#FFC52F'], MIN:['#002B5C','#D31145'], NYM:['#002D72','#FF5910'], NYY:['#0C2340','#C4CED3'], ATH:['#003831','#EFB21E'],
    PHI:['#E81828','#002D72'], PIT:['#27251F','#FDB827'], SDP:['#2F241D','#FFC425'], SFG:['#FD5A1E','#27251F'], SEA:['#0C2C56','#005C5C'],
    STL:['#C41E3A','#0C2340'], TBR:['#092C5C','#8FBCE6'], TEX:['#003278','#C0111F'], TOR:['#134A8E','#1D2D5C'], WSN:['#AB0003','#14225A'],
  };
  // Lahman abbreviation -> franchise colour key
  const TEAM_ALIAS = { OAK:'ATH', KCA:'ATH', PHA:'ATH', CAL:'LAA', ANA:'LAA', FLA:'MIA', MLN:'ATL', BSN:'ATL', MON:'WSN', BRO:'LAD', NYG:'SFG', SEP:'MIL',
    WSH:'MIN', WSA:'TEX', SLB:'BAL', BLA:'NYY', NYH:'NYY', CHA:'CHW', CHN:'CHC', LAN:'LAD', SDN:'SDP', SFN:'SFG', SLN:'STL', TBA:'TBR', NYN:'NYM', NYA:'NYY', KCR:'KCR' };
  const teamColors = code => TEAM_COLORS[TEAM_ALIAS[code] || code] || ['#2b4a63', '#fbcc7a'];
  const teamLabel = code => code;
  const yrs = (a, b) => a === b ? String(a) : `${a}\u2013${String(b).slice(-2)}`;
  // [{t:'MON', y:'1977\u201390', c:[primary,secondary]}...] + colours of the team he played most for
  function teamStints(DS, id) {
    const pi = DS.pidx ? DS.pidx[id] : DS.playerIndex.indexOf(id); if (pi == null || pi < 0) return null;
    const seen = new Map();
    const add = (r, g) => { const k = r[2] + '|' + r[1]; const t = DS.teams[DS.teamIndex[r[1]]] || {}; const cur = seen.get(k) || { y: r[2], ab: t.abbr || DS.teamIndex[r[1]], g: 0 }; cur.g += g; seen.set(k, cur); };
    for (const r of (DS.batByP ? DS.batByP[pi] || [] : DS.batting.filter(x => x[0] === pi))) add(r, r[B.PA] || 0);
    for (const r of (DS.pitByP ? DS.pitByP[pi] || [] : DS.pitching.filter(x => x[0] === pi))) add(r, (r[P.OUTS] || 0) * 1.5);
    const seasons = [...seen.values()].filter(s => s.g > 0).sort((a, b) => a.y - b.y);
    if (!seasons.length) return null;
    const out = [], games = {};
    for (const s of seasons) {
      games[s.ab] = (games[s.ab] || 0) + s.g;
      const last = out[out.length - 1];
      if (last && last.t === s.ab && s.y <= last.y1 + 1) last.y1 = s.y; else out.push({ t: s.ab, y0: s.y, y1: s.y });
    }
    const main = Object.keys(games).sort((a, b) => games[b] - games[a])[0];
    return { stints: out.map(s => ({ t: s.t, y: yrs(s.y0, s.y1), c: teamColors(s.t) })), main: teamColors(main) };
  }

  // \u2500\u2500 Renderer \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
  // state = { seq, show:{card,score,strikes,board,title,turn}, card, players[], turn, maxStrikes, title, sub, size, board, layout, theme }
  function createStage(host, opts = {}) {
    host.innerHTML = `
      <div class="pp-stage">
        <div class="pp-cardwrap"><div class="pp-card"></div></div>
        <div class="pp-sbwrap">
          <div class="pp-title"></div>
          <div class="pp-score"></div>
        </div>
        <div class="pp-kwrap"><div class="pp-kin"><div class="pp-strikes"></div></div></div>
        <div class="pp-board"></div>
      </div>`;
    const $ = s => host.querySelector(s);
    const el = { stage: $('.pp-stage'), cardwrap: $('.pp-cardwrap'), card: $('.pp-card'), sbwrap: $('.pp-sbwrap'), kwrap: $('.pp-kwrap'),
      title: $('.pp-title'), score: $('.pp-score'), strikes: $('.pp-strikes'), board: $('.pp-board') };
    let lastCardKey = '', lastScores = {}, lastStrikes = {}, lastBoardKey = '';
    let latest = null, waitingKey = '', lastPre = '', rankState = 'shown';
    // Sounds play only on a stage created with {sound:true} (the OBS display), never for the state replayed on connect.
    // All 25 whooshes are fetched + decoded up front into Web Audio buffers, so a whoosh starts on the same frame as
    // its card (HTML <audio> has to fetch/decode on first play, which is what put them out of sync).
    const born = Date.now(); let sfxCfg = null; const audio = {}, buffers = {}; let actx = null;
    // where each whoosh hits its loudest point (s), measured from the files. A whoosh is started partway in so its
    // peak lands on the visual beat: the card settling (~0.22s after it shows) or the star opening (~0.3s).
    const SFX_PEAK = { 'whoosh-01': 0.63, 'whoosh-02': 0.66, 'whoosh-03': 0.49, 'whoosh-04': 0.69, 'whoosh-05': 0.6, 'whoosh-06': 1.34, 'whoosh-07': 0.35, 'whoosh-08': 0.23, 'whoosh-09': 0.26, 'whoosh-10': 0.27, 'whoosh-11': 0.2, 'whoosh-12': 0.26, 'whoosh-13': 0.14, 'whoosh-14': 0.17, 'whoosh-15': 0.21, 'whoosh-16': 0.16, 'whoosh-17': 0.14, 'whoosh-18': 0.09, 'whoosh-19': 0.11, 'whoosh-20': 0.49, 'whoosh-21': 0.55, 'whoosh-22': 0.29, 'whoosh-23': 0.23, 'whoosh-24': 0.51, 'whoosh-25': 0.44 };
    const SFX_BEAT = { card: 0.22, reveal: 0.30 };
    const SFX_NAMES = Array.from({ length: 25 }, (_, i) => 'whoosh-' + String(i + 1).padStart(2, '0'));
    if (opts.sound) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
      SFX_NAMES.forEach(n => {
        const el = new Audio('sfx/' + n + '.m4a'); el.preload = 'auto'; audio[n] = el;      // fallback path
        if (actx) fetch('sfx/' + n + '.m4a').then(r => r.arrayBuffer()).then(b => new Promise((ok, no) => actx.decodeAudioData(b, ok, no))).then(buf => { buffers[n] = buf; }).catch(() => {});
      });
      const wake = () => { if (actx && actx.state !== 'running') actx.resume().catch(() => {}); };
      wake(); ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, wake));
    }
    function sfx(kind) {
      const soundOn = typeof opts.sound === 'function' ? opts.sound() : opts.sound;
      if (!soundOn || !sfxCfg || (!sfxCfg.on && typeof opts.sound !== 'function') || Date.now() - born < 2500) return;
      const name = sfxCfg[kind]; if (!name) return;
      const vol = Math.max(0, Math.min(1, (sfxCfg.vol ?? 80) / 100));
      // skip the build-up so the peak hits on the beat; the producer's nudge (ms) moves it later (+) or earlier (-)
      const nudge = (+sfxCfg.sync || 0) / 1000;
      let skip = Math.max(0, (SFX_PEAK[name] ?? 0.2) - (SFX_BEAT[kind] ?? 0.25) - nudge);
      const wait = Math.max(0, nudge - Math.max(0, (SFX_PEAK[name] ?? 0.2) - (SFX_BEAT[kind] ?? 0.25)));
      const go = () => { try {
        if (actx && actx.state === 'running' && buffers[name]) {
          const src = actx.createBufferSource(), g = actx.createGain();
          src.buffer = buffers[name]; g.gain.value = vol; src.connect(g).connect(actx.destination);
          skip = Math.min(skip, buffers[name].duration - 0.05);
          // tiny fade-in where we cut into the file, so the skip never clicks
          g.gain.setValueAtTime(0, actx.currentTime); g.gain.linearRampToValueAtTime(vol, actx.currentTime + 0.015);
          src.start(0, skip);
          return;
        }
        const a = audio[name] || (audio[name] = new Audio('sfx/' + name + '.m4a'));
        a.volume = vol; a.currentTime = skip; a.play().catch(() => {});
      } catch {} };
      if (wait > 0) setTimeout(go, wait * 1000); else go();
    }
    let soundedCard = null;
    const loaded = new Set();   // src+mode that finished loading (ok or not)
    const frames = new Map();   // src -> {x,y,w,h}: cutout placement measured from the image's own pixels
    const failed = new Set();   // photos that would not load: draw the silhouette, never a broken-image icon
    const pending = new Map();  // src+mode -> promise, so a preload and a card share one fetch
    const PH_W = 566, PH_H = 638; // photo window (the PSD's rounded panel)
    // Load a photo before the card is drawn, so card and photo always arrive together (no img.decode(): it can hang).
    function preload(src, cutout) {
      const k = src + (cutout ? '#c' : '');
      if (loaded.has(k)) return Promise.resolve(!failed.has(src));
      if (pending.has(k)) return pending.get(k);
      const p = new Promise(res => {
        const im = new Image(); let done = false;
        const fin = ok => { if (!done) { done = true; clearTimeout(t); pending.delete(k); loaded.add(k); if (!ok) failed.add(src); res(ok); } };
        const t = setTimeout(() => fin(false), 6000);
        if (cutout && !/^data:/.test(src)) im.crossOrigin = 'anonymous';
        im.onload = () => { if (cutout) { try { const f = frameCutout(im); if (f) frames.set(src, f); } catch {} } fin(true); };
        im.onerror = () => { if (im.crossOrigin) { im.onerror = () => fin(false); im.removeAttribute('crossorigin'); im.src = src; } else fin(false); };
        im.src = src;
      });
      pending.set(k, p);
      return p;
    }
    // Every cutout framed the same way: crown just under the top of the photo window, head centred.
    function frameCutout(im) {
      const W0 = 120, H0 = Math.max(1, Math.round(W0 * im.naturalHeight / im.naturalWidth));
      const cv = document.createElement('canvas'); cv.width = W0; cv.height = H0;
      const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0, W0, H0);
      const d = cx.getImageData(0, 0, W0, H0).data;
      const solid = (x, y) => d[(y * W0 + x) * 4 + 3] > 60;
      let top = -1;
      for (let y = 0; y < H0 && top < 0; y++) { let n = 0; for (let x = 0; x < W0; x++) if (solid(x, y)) n++; if (n >= 3) top = y; }
      if (top < 0) return null;
      // a rectangular photo inside a transparent canvas (MLB does this for old-timers): fill the panel from its top edge
      let rowN = 0; for (let x = 0; x < W0; x++) if (solid(x, top + 1 < H0 ? top + 1 : top)) rowN++;
      if (rowN > W0 * 0.6) {
        let bot = H0 - 1; for (; bot > top; bot--) { let n = 0; for (let x = 0; x < W0; x++) if (solid(x, bot)) n++; if (n > W0 * 0.6) break; }
        const fh = (bot - top + 1) / H0;                                   // fraction of the image that is picture
        let w = PH_W, h = w * im.naturalHeight / im.naturalWidth;
        if (h * fh < PH_H) { h = PH_H / fh; w = h * im.naturalWidth / im.naturalHeight; }
        return { x: Math.round((PH_W - w) / 2), y: Math.round(-top / H0 * h), w: Math.round(w), h: Math.round(h), rect: true };
      }
      let sx = 0, sn = 0;
      for (let y = top; y < Math.min(H0, top + Math.round(H0 * 0.18)); y++) for (let x = 0; x < W0; x++) if (solid(x, y)) { sx += x; sn++; }
      const headX = sn ? sx / sn / W0 : 0.5;
      const topF = top / H0;
      const HEAD_TOP = 70, BOTTOM = 690;
      const h = Math.min((BOTTOM - HEAD_TOP) / Math.max(0.35, 1 - topF), 1250);
      const w = h * im.naturalWidth / im.naturalHeight;
      return { x: Math.round(PH_W / 2 - headX * w), y: Math.round(HEAD_TOP - topF * h), w: Math.round(w), h: Math.round(h) };
    }
    // Shrink a line until it fits its box: text is never clipped.
    function fitText(root) {
      root.querySelectorAll('[data-fit]').forEach(n => {
        const max = +n.dataset.fit, min = +(n.dataset.min || 24), box = (n.parentElement.clientWidth || +n.dataset.w) - (+n.dataset.pad || 0);
        let s = max; n.style.fontSize = s + 'px';
        while (s > min && n.scrollWidth > box) { s -= 2; n.style.fontSize = s + 'px'; }
      });
    }
    const refit = () => { fitText(el.card); fitText(el.score); };
    if (document.fonts) { document.fonts.ready.then(refit); document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', refit); }

    function renderCard(S) {
      const c = S.card;
      const on = !!(S.show && S.show.card && c && !(S.show.board && S.board));
      if (!c) { el.cardwrap.classList.toggle('on', false); return; }
      const key = c.id + '|' + (c.img || '') + '|' + (c.photo ? 1 : 0) + '|' + (S.cardLabel || '') + '|' + (S.sub || '') + '|' + JSON.stringify(c.pf || 0) + '|' + (S.showTeams ? 1 : 0);
      const lk = c.img + (c.photo ? '' : '#c');
      if (key !== lastCardKey && c.img && !loaded.has(lk)) {
        el.cardwrap.classList.remove('on');           // hold the new card until its photo is ready
        if (waitingKey !== key) { waitingKey = key; preload(c.img, !c.photo).then(() => { if (waitingKey === key) { waitingKey = ''; if (latest) renderCard(latest); } }); }
        return;
      }
      el.cardwrap.classList.toggle('on', on);
      if (on && soundedCard !== c.id && key === lastCardKey) { soundedCard = c.id; sfx('card'); }
      if (key === lastCardKey) { syncRank(c); return; }
      const sameId = lastCardKey.split('|')[0] === String(c.id);
      lastCardKey = key;
      const miss = c.kind === 'miss';
      const src = c.img && !failed.has(c.img) ? c.img : '';
      const gray = miss ? 'filter="url(#jcGray)"' : '';
      const fid = 'jcSh' + String(c.id).replace(/\W/g, '');
      const shade = `filter="url(#${fid})"`;   // cutouts get a soft dark drop shadow
      // this player's own photo position / zoom (set by the producer, saved with the photo)
      const pf = c.pf || null;
      const pft = pf ? `transform="translate(${pf.x || 0} ${pf.y || 0}) translate(${PH_W / 2} ${PH_H / 2}) scale(${(pf.s || 100) / 100}) translate(${-PH_W / 2} ${-PH_H / 2})"` : '';
      let photo = '';
      if (src && c.photo) photo = `<image href="${esc(src)}" x="0" y="0" width="${PH_W}" height="${PH_H}" preserveAspectRatio="xMidYMin slice" ${pft} ${gray}/>`;
      else if (src) { const f = frames.get(src) || { x: -97, y: 20, w: 760, h: 760 };
        photo = `<image href="${esc(src)}" ${frames.has(src) && !/^data:/.test(src) ? 'crossorigin="anonymous"' : ''} x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" preserveAspectRatio="xMidYMin meet" ${pft} ${f.rect ? gray : shade}/>`; }
      else photo = `<g opacity=".18" fill="#0a0a0a"><circle cx="${PH_W / 2}" cy="250" r="110"/><path d="M80 650 Q90 420 ${PH_W / 2} 405 Q${PH_W - 90} 420 ${PH_W - 80} 650Z"/></g>`;
      const hasVal = c.val !== '' && c.val != null;
      const statBig = miss && !hasVal ? 'Not on list' : fmtVal(c.val);
      const statLbl = miss && !hasVal ? '' : (S.cardLabel || '');
      const rankBig = miss ? (c.rank ? '#' + c.rank : '✕') : '#' + (c.dr || c.rank);
      const rankSub = miss ? (c.rank ? 'Actual rank' : 'Not on the list') : (S.sub || '');
      const st = (c.teams || []);
      const shown = st.length > 9 ? st.slice(0, 8) : st;
      const tags = S.showTeams === false ? '' : shown.map((t, i) => `<span class="jt" style="--t1:${esc(t.c[0])};--t2:${esc(t.c[1])};--r:${i % 2 ? 2.5 : -2.5}deg"><b>${esc(t.t)}</b>${esc(t.y)}</span>`).join('')
        + (st.length > 9 ? `<span class="jt more" style="--r:2deg"><b>+${st.length - 8}</b>more</span>` : '');
      const rankHidden = !miss && c.rankShown === false;
      rankState = rankHidden ? 'hidden' : 'shown';
      el.card.className = 'pp-card jc mc' + (miss ? ' miss' : '') + (c.pinpoint ? ' pin' : '') + (rankHidden ? ' rank-hidden' : '');
      el.card.style.setProperty('--pc', c.whoColor || '#ffd84a');
      el.card.innerHTML = `
        <div class="jc-namebox"><div class="jc-name" data-fit="50" data-min="22">${esc(c.name)}</div></div>
        <div class="jc-photo">
          <svg class="jc-img" viewBox="0 0 ${PH_W} ${PH_H}" width="${PH_W}" height="${PH_H}">
            <defs>
              <filter id="jcGray"><feColorMatrix type="saturate" values="0"/></filter>
              <filter id="${fid}" x="-20%" y="-20%" width="140%" height="140%">
                <feColorMatrix in="SourceGraphic" type="saturate" values="${miss ? 0 : 1}" result="g"/>
                <feGaussianBlur in="SourceAlpha" stdDeviation="14" result="b1"/><feOffset in="b1" dx="8" dy="12" result="o1"/>
                <feFlood flood-color="#05080c" flood-opacity=".45"/><feComposite in2="o1" operator="in" result="soft"/>
                <feMerge><feMergeNode in="soft"/><feMergeNode in="g"/></feMerge>
              </filter>
            </defs>
            ${photo}
          </svg>
          ${tags ? `<div class="jc-teams${st.length > 6 ? ' many2' : st.length > 3 ? ' many' : ''}">${tags}</div>` : ''}
          ${miss ? `<svg class="jc-x" viewBox="0 0 100 100"><path d="M20 20 L80 80 M80 20 L20 80" stroke="#0a0a0a" stroke-width="20" stroke-linecap="round"/><path d="M20 20 L80 80 M80 20 L20 80" stroke="#e3262f" stroke-width="12" stroke-linecap="round"/></svg>` : ''}
          ${c.pinpoint ? `<div class="jc-pin rv"><span>Best possible answer</span>PINPOINT!</div>` : ''}
        </div>
        <div class="jc-statrow"><div class="jc-statbox"><b class="jc-val" data-fit="${miss && !hasVal ? 40 : 56}" data-min="24">${esc(statBig)}</b></div><div class="jc-lbl">${esc(statLbl)}</div></div>
        <div class="jc-rank"><img class="jc-star" src="img/star.png" alt="">
          <div class="jc-rtext"><b data-fit="50" data-min="24" data-w="112">${esc(rankBig)}</b><i>${esc(rankSub).split(/\s+/).join('<br>')}</i></div>
          ${rankHidden ? `<div class="jc-cover"><img src="img/star.png" alt=""></div>` : ''}</div>
        ${c.who ? `<div class="jc-who">${esc(c.who)}${miss ? ' <b>STRIKE</b>' : ` <b class="rv">+${esc(c.pts)}</b>`}</div>` : ''}
        ${c.rare && !c.pinpoint ? `<div class="jc-rare rv">Rare find!</div>` : ''}`;
      fitText(el.card);
      if (!sameId) { el.card.classList.remove('enter'); void el.card.offsetWidth; el.card.classList.add('enter'); }
      if (on && soundedCard !== c.id) { soundedCard = c.id; sfx('card'); }
    }
    // star-wipe the rank in when the producer reveals it (no full re-render, so the card doesn't re-animate)
    function syncRank(c) {
      if (!c || c.kind === 'miss') return;
      const want = c.rankShown === false ? 'hidden' : 'shown';
      if (want === rankState) return;
      rankState = want;
      const r = el.card.querySelector('.jc-rank'); if (!r) return;
      let cov = r.querySelector('.jc-cover');
      if (want === 'shown') {
        el.card.classList.remove('rank-hidden');
        if (cov) { cov.classList.remove('peel'); void cov.offsetWidth; cov.classList.add('peel'); }
        el.card.classList.add('revealed');
        sfx('reveal');
      } else {
        if (!cov) { r.insertAdjacentHTML('beforeend', '<div class="jc-cover"><img src="img/star.png" alt=""></div>'); }
        else cov.classList.remove('peel');
        el.card.classList.add('rank-hidden'); el.card.classList.remove('revealed');
      }
    }
    // warm a whole list of photos (display does this as soon as a list is chosen)
    async function preloadAll(items) {
      let i = 0; const run = async () => { while (i < items.length) { const it = items[i++]; await preload(it.img, !it.photo); } };
      await Promise.all(Array.from({ length: 4 }, run));
    }

    function renderScore(S) {
      const ps = S.players || [];
      el.sbwrap.style.setProperty('--n', ps.length || 1);
      el.sbwrap.classList.toggle('many', ps.length > 3);
      el.kwrap.classList.toggle('many', ps.length > 3); el.kwrap.style.setProperty('--n', ps.length || 1);
      el.score.classList.toggle('on', !!(S.show && S.show.score));
      el.strikes.classList.toggle('on', !!(S.show && S.show.strikes));
      el.title.classList.toggle('on', !!(S.show && S.show.title && S.title));
      el.title.innerHTML = `<b>${esc(S.title || '')}</b>${S.size ? `<i>Top ${esc(S.size)}</i>` : ''}`;
      const turnOn = S.show && S.show.turn;
      const LL = Object.assign({}, LAY_DEFAULT, S.layout || {}), scScale = (LL.sn || 100) / 100, nmScale = (LL.snm || 100) / 100;
      el.score.innerHTML = ps.map((p, i) => `
        <div class="pp-col${p.out ? ' out' : ''}${turnOn && S.turn === i && !p.out ? ' turn' : ''}" style="--pc:${esc(p.color)}">
          <div class="pp-pname" data-fit="${Math.round((ps.length > 3 ? 54 : 66) * nmScale)}" data-min="16">${esc(p.name)}</div>
          <div class="pp-pscore" data-fit="${Math.round((ps.length > 3 ? 92 : 108) * scScale)}" data-min="24">${p.score}</div>
          ${p.out ? '<div class="pp-out">OUT</div>' : ''}
          ${lastScores[i] != null && p.score > lastScores[i] ? `<div class="pp-plus">+${p.score - lastScores[i]}</div>` : ''}
        </div>`).join('');
      const max = S.maxStrikes || 0;
      el.strikes.innerHTML = ps.map((p, i) => {
        let boxes;
        if (max > 0 && max <= 5) boxes = Array.from({ length: max }, (_, k) => `<div class="pp-box${k < p.strikes ? ' x' : ''}${k === p.strikes - 1 && lastStrikes[i] != null && p.strikes > lastStrikes[i] ? ' new' : ''}">${k < p.strikes ? XSVG : ''}</div>`).join('');
        else boxes = `<div class="pp-box x">${XSVG}</div><div class="pp-xcount">\u00d7 ${p.strikes}</div>`;
        return `<div class="pp-scol${p.out ? ' out' : ''}">${boxes}</div>`;
      }).join('');
      ps.forEach((p, i) => { lastScores[i] = p.score; lastStrikes[i] = p.strikes; });
      fitText(el.score);
    }

    function renderBoard(S) {
      const on = !!(S.show && S.show.board && S.board);
      el.board.classList.toggle('on', on);
      if (!on) return;
      const key = JSON.stringify(S.board) + S.title;
      if (key === lastBoardKey) return;
      lastBoardKey = key;
      const rows = S.board;
      const n = rows.length;
      const cols = n <= 12 ? 1 : n <= 30 ? 2 : n <= 60 ? 3 : 4;
      const per = Math.ceil(n / cols);
      const rh = Math.min(64, Math.floor((830 - 5 * (per - 1)) / per));
      el.board.innerHTML = `
        <div class="pp-bhead"><b>${esc(S.title || '')}</b><span>${esc(S.sub || '')} \u00b7 Top ${esc(S.size || n)}</span></div>
        <div class="pp-bgrid" style="grid-template-rows:repeat(${per},${rh}px);grid-template-columns:repeat(${cols},1fr);font-size:${Math.round(rh * 0.56)}px">
          ${rows.map(r => `<div class="pp-slot${r.c ? ' got' : ''}${r.rv ? ' rv' : ''}" style="${r.c ? `--pc:${esc(r.c)}` : ''}">
            <span class="r">${esc(r.r)}</span><span class="n">${r.n ? esc(r.n) : '?????'}</span><span class="v">${r.n ? esc(fmtVal(r.v)) : ''}</span></div>`).join('')}
        </div>`;
    }

    let fontSig = '';
    function applyFonts(S) {
      const F = Object.assign(fontDefaults(), S.fonts || {});
      if (S.fonts && S.fonts.name && !S.fonts.scoreName) F.scoreName = S.fonts.name;   // older control pages
      const sig = JSON.stringify(F); if (sig === fontSig) return; fontSig = sig;
      const st = el.stage.style;
      FONT_SLOTS.forEach(([k]) => {
        const d = FONTS[F[k]] || FONTS.anton; ensureFont(F[k]);
        st.setProperty('--ff-' + k, d[1]); st.setProperty('--fw-' + k, d[2]); st.setProperty('--fs-' + k, d[3]);
        if (F[k] === 'primetime') el.stage.setAttribute('data-fx-' + k.toLowerCase(), ''); else el.stage.removeAttribute('data-fx-' + k.toLowerCase());
        if (document.fonts && document.fonts.load) document.fonts.load(`${d[3]} ${d[2]} 40px ${d[1].split(',')[0]}`).then(refit, () => {});
      });
      refit();
    }
    function applyLayout(S) {
      const L = Object.assign({}, LAY_DEFAULT, S.layout || {});
      el.cardwrap.style.transform = `translate(${L.cx}px,${L.cy}px) scale(${L.cs / 100})`;
      const ce = L.ce || {};
      CARD_PIECES.forEach(([k]) => { const v = ce[k] || {}; const cs = el.card.style;
        cs.setProperty(`--${k}-x`, (v.x || 0) + 'px'); cs.setProperty(`--${k}-y`, (v.y || 0) + 'px'); cs.setProperty(`--${k}-s`, (v.s || 100) / 100); });
      el.sbwrap.style.transform = `translate(${L.sx}px,${L.sy}px) scale(${L.ss / 100})`;
      el.kwrap.style.transform = `translate(${L.kx}px,${L.ky}px) scale(${L.ks / 100})`;
      el.board.style.transform = `translate(${L.bx || 0}px,${L.by || 0}px) scale(${L.bs / 100 * (el.board.classList.contains('on') ? 1 : 0.96)})`;
    }

    function render(S) {
      if (!S) return;
      latest = S; sfxCfg = S.sfx || null;
      applyFonts(S);
      if (opts.sound && sfxCfg) ['card', 'reveal'].forEach(k => { const n = sfxCfg[k]; if (n && !audio[n]) { const au = new Audio('sfx/' + n + '.m4a'); au.preload = 'auto'; audio[n] = au; } });
      if (S.pre && S.pre.length) { const k = S.pre.map(x => x.img).join('|'); if (k !== lastPre) { lastPre = k; preloadAll(S.pre); } }
      applyLayout(S);
      renderCard(S);
      renderScore(S);
      renderBoard(S);
      el.sbwrap.style.opacity = el.kwrap.style.opacity = S.show && S.show.board && S.board ? 0 : 1;
      applyLayout(S);
    }
    return { el, render, preloadAll, preload, frames };
  }
  const XSVG = `<svg viewBox="0 0 100 100"><path d="M18 18 L82 82 M82 18 L18 82" stroke="#0a0a0a" stroke-width="30" stroke-linecap="round"/><path d="M18 18 L82 82 M82 18 L18 82" stroke="#e3262f" stroke-width="18" stroke-linecap="round"/></svg>`;

  // fit a 1920x1080 stage into its parent
  function fitStage(stageHost) {
    const fit = () => {
      const p = stageHost.parentElement; if (!p) return;
      const s = Math.min(p.clientWidth / W, p.clientHeight / H) || 1;
      stageHost.style.transform = `scale(${s})`;
    };
    fit(); window.addEventListener('resize', fit);
    if (window.ResizeObserver) new ResizeObserver(fit).observe(stageHost.parentElement);
    return fit;
  }

  // \u2500\u2500 Transport: Jomboy relay (WebSocket + stored state) + BroadcastChannel \u2500\u2500\u2500\u2500
  const hubOf = params => (params.get('hub') || HUB_DEFAULT).replace(/\/$/, '');
  function publisher(hub, getRoom, onStatus) {
    let bc = null, bcRoom = null, inflight = 0;
    return async payload => {
      const room = getRoom();
      if (bcRoom !== room) { try { bc && bc.close(); bc = new BroadcastChannel('mpp-' + room); bcRoom = room; } catch { bc = null; } }
      try { bc && bc.postMessage(payload); } catch {}
      const my = ++inflight;
      onStatus('sending\u2026', '');
      try {
        const r = await fetch(`${hub}/r/${encodeURIComponent(room)}`, { method: 'POST', body: JSON.stringify(payload), signal: AbortSignal.timeout(6000) });
        const j = await r.json().catch(() => ({}));
        if (my !== inflight) return;
        if (!r.ok) throw new Error('HTTP ' + r.status);
        onStatus(`on air \u00b7 ${j.sent ?? 0} screen${j.sent === 1 ? '' : 's'} listening`, 'ok');
      } catch { if (my === inflight) onStatus('relay unreachable \u2014 OBS will not update', 'bad'); }
    };
  }
  async function fetchRoom(hub, room) {
    const r = await fetch(`${hub}/r/${encodeURIComponent(room)}?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
    const t = await r.text();
    return t && t !== 'null' ? JSON.parse(t) : null;
  }
  function subscribe(hub, room, apply) {
    try { new BroadcastChannel('mpp-' + room).onmessage = e => apply(e.data); } catch {}
    const url = `${hub}/r/${encodeURIComponent(room)}`;
    let backoff = 2000;
    const open = () => {
      try {
        const ws = new WebSocket(url.replace(/^http/, 'ws'));
        ws.onopen = () => { backoff = 2000; };
        ws.onmessage = ev => { try { apply(JSON.parse(ev.data)); } catch {} };
        ws.onclose = () => { setTimeout(open, backoff); backoff = Math.min(backoff * 2, 30000); };
      } catch { setTimeout(open, backoff); }
    };
    open();
    const poll = () => fetchRoom(hub, room).then(apply).catch(() => {});
    poll(); setInterval(poll, 30000);
  }

  return { W, H, STATS, STAT_GROUPS, fmtStat, qualLabel, qualifiers, computeList, subtitleFor, nameOf, ALIASES, norm, normHy, lastName, rankRows,
    fmtVal, headshotUrl, esc, PLAYER_COLORS, LAY_DEFAULT, createStage, fitStage, CARD_PIECES, FONTS, FONT_SLOTS, fontDefaults, ensureFont, TEAM_COLORS, teamColors, teamLabel, teamStints, hubOf, publisher, fetchRoom, subscribe };
})();
