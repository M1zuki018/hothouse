/* HOTHOUSE 演出エンジン（HHStage）
   index.html の本体シェーダーの前後に、別のパスを足す。
     1. 背景パス：背景を手続きで描いて FBO に置く（画像の背景も、ゆっくり寄るカメラと瞬きを足してから渡す）
     2. 本体：index.html の FS がそのまま描く（背景は 1 の FBO を読む）。描き先だけ FBO に変える
     3. 仕上げ：ブルーム → ゆがみ・粒子・色調・特殊演出を掛けて画面へ
   シナリオからは GameCommand の「fx ...」で触る（@cmd fx snow 1 2 ／ 演出トラック stage-cues.js）
   背景か @phase が変わると、上書きした値はその背景の既定値に戻る */
(function(){
'use strict';
const SH = window.HHStageShaders;
const Stage = window.HHStage = { active:false, missing:[] };

/* ---------- 1. パラメータ ---------- */
// 仕上げシェーダーの uK[] と同じ並び
const POST_KEYS = ['exposure','contrast','sat','temp','bloom','grain','ca','vignette','haze','ripple','flashback','observe',
  'snow','embers','dust','motes','leaves','soft','unravel','unravelX','flower','flowerA','shatter','wake','wakeBlur','white',
  'pulse','jolt','touch','touchX','touchY','dim','cold','motion'];
// 既定値。場面の見た目（LOOKS）はここからの差分だけ書く
const BASE = { exposure:1, contrast:1, sat:1, temp:0, bloom:.6, bloomTh:.7, grain:.18, ca:0, vignette:.35, haze:0, ripple:0,
  flashback:0, observe:0, snow:0, embers:0, dust:0, motes:0, leaves:0, soft:0, unravel:0, unravelX:960, dim:0, cold:0, warm:0, desat:0,
  bgx:1, bgy:0, rimA:.55, lift:[0,0,0], gain:[1,1,1], rimC:[.86,.68,.33], amb:[1,1,1], rimD:[-.6,-.8] };
// 場面ごとの見た目。背景キーで引く
const LOOKS = {
  title:          { bloom:.9, motes:.45, grain:.16, lift:[.004,.004,.01] },
  lab:            { bloom:.8, motes:.28, lift:[.004,.004,.012], gain:[.98,.97,1.02], rimC:[.9,.72,.38], amb:[.86,.86,.95] },
  slope:          { bloom:.6, temp:-.35, grain:.22, rimC:[.6,.7,1], rimA:.4, amb:[.9,.92,1], bgx:0 },
  observatory:    { bloom:.85, temp:-.2, grain:.2, rimC:[.75,.8,1], rimA:.5, amb:[.92,.93,1], bgx:0 },
  church:         { bloom:.65, observe:1, sat:.72, temp:.25, dust:.7, gain:[1.02,.97,.96], rimC:[1,.75,.8], rimD:[0,-1], amb:[.95,.9,.92] },
  room:           { bloom:.7, temp:-.15, dust:.25, lift:[0,.004,.02], rimC:[1,.72,.4], rimD:[.9,-.4], rimA:.45, amb:[.68,.72,.9], bgx:0 },
  classroom:      { bloom:.55, sat:.7, temp:.15, dust:.8, contrast:.96, rimC:[1,.92,.78], rimD:[-1,-.3], rimA:.4, amb:[1,.98,.95] },
  base:           { bloom:.75, temp:.55, leaves:.55, dust:.35, contrast:1.04, rimC:[1,.65,.3], rimD:[.8,-.6], rimA:.7, amb:[.85,.78,.72], bgx:.25 },
  dream:          { bloom:.9, bloomTh:.62, motes:.7, ripple:.18, soft:.35, sat:.85, temp:.2, gain:[1.02,1,1.02], rimC:[1,.9,.95], rimA:.8, amb:[1.05,1.02,1.05] },
  corridor:       { bloom:.75, motes:.2, temp:-.2, lift:[0,.006,.008], rimC:[.85,.8,.6], rimD:[0,-1], amb:[.82,.86,.9], bgx:0 },
  corridor_night: { bloom:.6, grain:.38, ca:.2, temp:-.3, sat:.8, rimC:[.5,.6,.9], rimA:.35, amb:[.62,.66,.8], bgx:0 },
  fire_outside:   { bloom:1.1, bloomTh:.55, embers:1, haze:.55, ca:.22, temp:.4, contrast:1.08, rimC:[1,.5,.15], rimD:[0,-1], rimA:1, amb:[.8,.62,.55] },
  island:         { bloom:.55, snow:.9, temp:-.45, sat:.78, grain:.24, lift:[.01,.014,.02], rimC:[.8,.88,1], rimA:.4, amb:[.85,.9,.98] },
  island_night:   { bloom:.75, snow:.45, temp:-.4, sat:.8, grain:.26, lift:[.004,.008,.02], rimC:[1,.75,.45], rimD:[-.8,-.4], rimA:.45, amb:[.68,.72,.86] },
  black:          { bloom:0, grain:.08, vignette:0 },
  room_dusk:      { bloom:.75, temp:.5, dust:.45, rimC:[1,.55,.25], rimD:[.9,-.3], rimA:.75, amb:[.95,.82,.72], bgx:0, bgy:1 },
  kitchen:        { bloom:.55, temp:.25, dust:.55, rimC:[1,.95,.82], rimD:[-.8,-.5], rimA:.45, amb:[1,.97,.92] },
  home_night:     { bloom:.75, temp:.45, rimC:[1,.72,.42], rimD:[0,-1], rimA:.6, amb:[.95,.84,.74] },
  jonas_room:     { bloom:.5, motes:.12, lift:[.004,.004,.012], rimC:[.85,.72,.45], rimA:.3, amb:[.8,.82,.92], bgx:0 },
  counseling_room:{ bloom:.5, temp:.2, sat:.86, dust:.5, rimC:[1,.95,.85], rimD:[.9,-.4], rimA:.4, amb:[1,.98,.95] },
  corridor_school:{ bgx:0, bloom:.45, bloomTh:.75, temp:.08, sat:.82, dust:.6, rimC:[1,.97,.9], rimD:[-.9,-.3], rimA:.35, amb:[1,1,.98] },
  school_gate:    { bloom:.45, temp:-.05, sat:.86, rimC:[1,1,1], rimA:.3, amb:[.97,.98,1] },
  schoolyard:     { bloom:.45, temp:.1, sat:.88, dust:.2, rimC:[1,.97,.9], rimA:.3, amb:[1,1,.98] },
  park:           { bloom:.55, temp:.35, sat:.9, leaves:.25, rimC:[1,.8,.55], rimD:[.8,-.6], rimA:.55, amb:[1,.95,.88] },
  back_alley:     { bloom:.95, bloomTh:.55, grain:.36, ca:.22, temp:-.2, contrast:1.06, rimC:[1,.35,.7], rimD:[.9,-.2], rimA:.7, amb:[.66,.68,.82] },
  institute_night:{ bloom:.65, grain:.26, sat:.8, temp:-.1, rimC:[1,.72,.4], rimD:[-.9,-.3], rimA:.45, amb:[.78,.76,.8], bgx:.35 },
  observatory_dusk: { bloom:.8, temp:.7, sat:.95, contrast:1.03, rimC:[1,.7,.4], rimA:.6, amb:[1,.92,.85], bgx:0 },
  observatory_night:{ bloom:.9, temp:-.25, grain:.2, rimC:[.75,.8,1], rimA:.5, amb:[.9,.92,1], bgx:0 },
  slope_night:    { bloom:.7, temp:-.35, grain:.22, rimC:[.6,.7,1], rimA:.4, amb:[.9,.92,1], bgx:0 },
};
// fx の別名：小道具のパラメータは場面ごとに uP.x（bgx）へ
const BGX_ALIAS = new Set(['star','telescope','doodle','seadoor','glassbox']);
const SLOT_X = { Left:560, Center:960, Right:1360 };

const cur = {}, tw = {};
for (const k of Object.keys(BASE)) cur[k] = Array.isArray(BASE[k]) ? BASE[k].slice() : BASE[k];
const events = [];   // 時間で動く一回きりの演出
let api = null, lookKey = '', lastPhase = null, bgSince = 0, cgKey = '', cgSince = 0;
const now = () => performance.now() / 1000;
const skipK = () => (api && api.S.skip) ? .05 : 1;
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

function set(k, to, dur = 0){
  dur *= skipK();
  if (dur <= 0){ cur[k] = Array.isArray(to) ? to.slice() : to; delete tw[k]; return; }
  tw[k] = { from: Array.isArray(cur[k]) ? cur[k].slice() : cur[k], to, t0: now(), dur };
}
function stepTweens(){
  const t = now();
  for (const k in tw){
    const w = tw[k], e = Math.min(1, (t - w.t0) / w.dur), s = e*e*(3-2*e);
    cur[k] = Array.isArray(w.to) ? w.to.map((v,i)=>w.from[i] + (v - w.from[i]) * s) : w.from + (w.to - w.from) * s;
    if (e >= 1) delete tw[k];
  }
}
function applyLook(key, dur){
  lookKey = key;
  const L = LOOKS[key] || LOOKS.lab;
  for (const k of Object.keys(BASE)) set(k, k in L ? L[k] : BASE[k], dur);
  events.length = 0;
}
// 背景と @phase の変化を拾う。fx を実行する前にも呼ぶ（同じ群の @phase を先に反映させるため）
function sync(inGame = true){
  if (!api) return;
  const key = inGame ? (api.R.bg || 'lab') : 'title';
  const ph = inGame ? (api.S.phase || '') : '';
  if (key !== lookKey){ applyLook(key, lookKey ? .6 : 0); bgSince = now(); lastPhase = ph; return; }
  if (ph !== lastPhase){ lastPhase = ph; applyLook(key, .8); }
}

/* ---------- 2. 一回きりの演出 ---------- */
const bump = (x, c, w) => Math.exp(-(((x-c)/w)**2));
const EVENT = {
  // まぶたが開く（途中で一度まばたき）
  wake(k){ const open = k < .3 ? .55*(k/.3) : k < .42 ? .55*(1-(k-.3)/.12*.9) : .05 + .95*Math.min(1,(k-.42)/.45);
    return { wake: Math.min(1, open*1.02), wakeBlur: 1.6*(1-Math.min(1,k/.95)) }; },
  pulse(k, a){ return { pulse: (bump(k,.18,.08) + .65*bump(k,.48,.1)) * (a[0] ?? 1) }; },
  jolt(k, a){ return { jolt: Math.exp(-k*5) * (1-k) * (a[0] ?? 1) }; },
  touch(k, a){ return { touch: k, touchX: a[0], touchY: a[1] }; },
  white(k, a){ const pk = a[0] ?? 1; return { white: pk * (k < .35 ? k/.35 : 1 - (k-.35)/.65) }; },
  shatter(k){ return { shatter: k }; },
};
function addEvent(kind, dur, args = []){
  const i = events.findIndex(e=>e.kind===kind); if (i >= 0) events.splice(i,1);
  events.push({ kind, t0: now(), dur: Math.max(.05, dur * skipK()), args });
}
function eventValues(){
  const out = {}, t = now();
  for (let i = events.length-1; i >= 0; i--){
    const e = events[i], k = Math.min(1, (t - e.t0) / e.dur);
    Object.assign(out, EVENT[e.kind](k, e.args));
    if (k >= 1) events.splice(i, 1);
  }
  return out;
}

/* ---------- 3. fx コマンド ---------- */
const num = (v, d) => (v === undefined || v === '' || isNaN(Number(v))) ? d : Number(v);
const slotX = v => SLOT_X[v] ?? num(v, 960);
function runFx(line){
  sync(true);
  const [name, ...a] = line.trim().split(/\s+/);
  if (!name) return;
  if (name === 'reset'){ applyLook(lookKey, num(a[0], .8)); return; }
  if (BGX_ALIAS.has(name)){ set('bgx', num(a[0],1), num(a[1],1)); return; }
  if (name === 'daylight'){ set('bgy', num(a[0],2), num(a[1],1)); return; }   // ルネの部屋：0 夜／1 夕方／2 朝
  switch (name){
    case 'wake':    addEvent('wake', num(a[0], 3)); return;
    case 'pulse':   addEvent('pulse', .9, [num(a[0],1)]); return;
    case 'jolt':    addEvent('jolt', .7, [num(a[0],1)]); return;
    case 'touch':   addEvent('touch', num(a[2], 1.4), [slotX(a[0]), num(a[1], 560)]); return;
    case 'whiteout':addEvent('white', num(a[1], 2), [num(a[0], 1)]); return;
    case 'shatter': addEvent('shatter', num(a[0], 1.4)); set('flowerA', 0, .25); return;
    case 'firerush':
    case 'comet':   set('bgx', 0); set('bgx', 1, num(a[0], name==='comet' ? 7 : 1.8)); return;
    case 'flower': {  // 光の花。peak<1 は咲ききらずに消える（つぼみ）
      const pk = num(a[0], 1), d = num(a[1], 4);
      set('flower', 0); set('flowerA', 1, .4); set('flower', pk, d);
      if (pk < 1) setTimeout(()=>set('flowerA', 0, d*.6), d*1000*skipK());
      return; }
    case 'unravel': set('unravelX', slotX(a[0])); set('unravel', num(a[1], 1), num(a[2], 1.5)); return;
  }
  if (name in BASE && !Array.isArray(BASE[name])){ set(name, num(a[0], BASE[name]), num(a[1], 1)); return; }
  console.warn('[HHStage] 知らない fx', line);
}

/* ---------- 4. シナリオへの差し込み（演出トラック） ----------
   cue = [場面, 行の書き出し, 'fx 命令; fx 命令']
   ・場面は @phase の「大|小」。同じ場面が二度あるときは「大|小#2」
   ・行の書き出しが空なら、その場面の頭（@phase の直後に @bg があればそれと同時）
   ・見つからないものは Stage.missing に残す（デバッグの「演出」タブで見られる） */
Stage.cues = [];
Stage.applyCues = function(orders){
  const phases = [];
  orders.forEach((o,i)=>{ if (o.order_type==='GameCommand' && /^phase /.test(o.dialog_text)) phases.push({label:o.dialog_text.slice(6).trim(), i}); });
  const count = {}; for (const p of phases){ count[p.label] = (count[p.label]||0)+1; p.key = p.label + (count[p.label] > 1 ? '#'+count[p.label] : ''); }
  const inserts = [];   // {after:index, text}
  this.missing = [];
  let n = 0;
  for (const [scene, head, cmd] of this.cues){
    const k = phases.findIndex(p=>p.key===scene);
    if (k < 0){ this.missing.push(`場面なし：${scene}`); continue; }
    // 行は場面の頭から後ろへ探す（分岐の中に @phase があっても、そのあとの合流先まで届くように）
    const from = phases[k].i, to = head ? orders.length : (k+1 < phases.length ? phases[k+1].i : orders.length);
    let at = -1;
    if (!head){
      at = from;
      for (let i = from+1; i < to; i++){ const t = orders[i].order_type;
        if (t==='Talk' || t==='Descriptive' || t==='Choice') break;
        if (t==='ChangeBackground'){ at = i; while (orders[at+1] && orders[at+1].sequence==='Join') at++; break; } }
    } else if (head.startsWith('@bg ')){   // 場面の中の背景の切り替え（@bg キー）と同時に
      const key = head.slice(4).trim();
      for (let i = from+1; i < to; i++){ const o = orders[i];
        if (o.order_type==='ChangeBackground' && o.file_path===key){ at = i; while (orders[at+1] && orders[at+1].sequence==='Join') at++; break; } }
    } else {
      for (let i = from; i < to; i++){ const o = orders[i];
        if ((o.order_type==='Talk' || o.order_type==='Descriptive') && o.dialog_text.startsWith(head)){ at = i; break; } }
    }
    if (at < 0){ this.missing.push(`行なし：${scene}「${head}」`); continue; }
    const text = cmd.split(';').map(s=>s.trim()).filter(Boolean).map(s=>'fx '+s).join('; ');
    inserts.push({ after: at, text, n: n++ });
  }
  // 後ろから差し込むと前の位置がずれない。同じ行に複数あれば書いた順に並ぶ
  inserts.sort((x,y)=>y.after-x.after || y.n-x.n);
  for (const s of inserts){
    orders.splice(s.after+1, 0, { order_id:'cue'+s.n, order_type:'GameCommand', sequence:'Join', speaker_id:0, dialog_text:s.text,
      override_display_name:'', file_path:'', position:'Center', facial_expression:'Default', override_text_speed:0, duration:0 });
  }
  if (this.missing.length) console.warn('[HHStage] 置けなかった演出', this.missing);
  return inserts.length;
};

/* ---------- 5. ゲーム側とのつなぎ ---------- */
Stage.install = function(a){
  api = a;
  const sink = a.GameCommandSink, orig = sink.exec.bind(sink);
  sink.exec = cmd => {
    const rest = [];
    for (const line of String(cmd).split(';')){ const t = line.trim(); if (t.startsWith('fx ')) runFx(t.slice(3)); else if (t) rest.push(t); }
    const r = rest.length ? orig(rest.join('; ')) : undefined;
    // @phase を通ったら、同じ場面でも上書きを戻す（デバッグで同じ場面から再生し直したとき）
    if (rest.some(t=>/^phase\s/.test(t))){ lastPhase = null; sync(true); }
    return r;
  };
  Stage.fx = runFx;
  if (a.DebugService && a.DebugService.isAvailable) registerDebug(a.DebugService);
};

/* ---------- 6. WebGL ---------- */
let gl = null, mainProg = null, P = {}, FB = {}, quality = { bg: matchMedia('(pointer:coarse)').matches ? .6 : 1, post: true };
const dummy = {};
function compile(fs, names){
  const sh = (t,src)=>{ const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, SH.VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
  gl.bindAttribLocation(pr, 0, 'a'); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
  const u = {}; for (const n of names) u[n] = gl.getUniformLocation(pr, n);
  return { pr, u };
}
const BG_U = ['uRes','uPx','uTime','uP','uImg','uImgOn','uKen'];
function bgProg(key){
  if (P['bg:'+key]) return P['bg:'+key];
  const t0 = performance.now();
  const p = compile(SH.bgSource(key), BG_U);
  gl.useProgram(p.pr); gl.uniform1i(p.u.uImg, 0);
  console.info(`[HHStage] 背景シェーダー ${key}：${(performance.now()-t0).toFixed(0)}ms`);
  return P['bg:'+key] = p;
}
function makeFB(w, h){
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  for (const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
  const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindTexture(gl.TEXTURE_2D, null);   // どのユニットにも残さない（描き先と読み先が重なるのを防ぐ）
  if (!ok) throw new Error('FBO を作れません');
  return { t, f, w, h };
}
function ensureFB(name, w, h){
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  const o = FB[name]; if (o && o.w === w && o.h === h) return o;
  if (o){ gl.deleteTexture(o.t); gl.deleteFramebuffer(o.f); }
  return FB[name] = makeFB(w, h);
}
let texFn = null, bgImg = null, reportedFail = false;
Stage.attachGL = function(g, opts){
  try {
    gl = g; mainProg = gl.getParameter(gl.CURRENT_PROGRAM); texFn = opts.tex; bgImg = opts.BG_IMG;
    P.bright = compile(SH.BRIGHT, ['uSrc','uTexel','uTh']);
    P.blur = compile(SH.BLUR, ['uSrc','uTexel','uDir']);
    P.post = compile(SH.POST, ['uSrc','uBloomA','uBloomB','uRes','uView','uTime','uK','uLift','uGain']);
    gl.useProgram(P.post.pr); gl.uniform1i(P.post.u.uSrc,0); gl.uniform1i(P.post.u.uBloomA,1); gl.uniform1i(P.post.u.uBloomB,2);
    for (const k of ['bright','blur']){ gl.useProgram(P[k].pr); gl.uniform1i(P[k].u.uSrc, 0); }
    bgProg('title'); bgProg('lab');
    gl.useProgram(mainProg);
    // ほかの背景は手の空いたときに順に作っておく（場面が変わるときに引っかからないように）
    const rest = Object.keys(SH.SCENES).filter(k=>!P['bg:'+k]);
    const idle = f => setTimeout(()=>(window.requestIdleCallback || (g=>g()))(f, {timeout:500}), 120);
    const next = () => { const k = rest.shift(); if (!k) return; try { bgProg(k); gl.useProgram(mainProg); } catch(e){ console.warn('[HHStage]', k, e); } idle(next); };
    idle(next);
    this.active = true;
  } catch (e){
    console.warn('[HHStage] 演出エンジンを使わずに表示します', e);
    this.active = false; gl && mainProg && gl.useProgram(mainProg);
  }
  return this.active;
};
const fail = e => { if (!reportedFail){ console.warn('[HHStage] 描画で失敗。演出エンジンを止めます', e); reportedFail = true; } Stage.active = false;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.useProgram(mainProg); gl.viewport(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight); };

// 背景を描いて、本体シェーダーに渡すテクスチャと見た目を返す
Stage.prepare = function(tMs, inGame){
  if (!this.active) return null;
  try {
    sync(inGame); stepTweens();
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, px = W / 1920;
    const key = inGame ? (api.R.bg || 'lab') : 'title';
    const imgUrl = inGame && bgImg[key];
    const prog = imgUrl ? 'image' : (SH.SCENES[key] ? key : 'lab');
    const bp = bgProg(prog);
    const fb = ensureFB('bg', W*quality.bg, H*quality.bg);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb.f); gl.viewport(0,0,fb.w,fb.h);
    gl.useProgram(bp.pr);
    const time = (tMs/1000) % 3600, since = now() - bgSince;
    gl.uniform2f(bp.u.uRes, 1920, 1080); gl.uniform1f(bp.u.uPx, px*quality.bg); gl.uniform1f(bp.u.uTime, time);
    gl.uniform4f(bp.u.uP, cur.bgx, cur.bgy, 0, 0);
    // ゆっくり寄るカメラ（画像の背景）
    const ken = reduce.matches ? 1 : 1 + .045 * (1 - Math.exp(-since/18));
    gl.uniform3f(bp.u.uKen, ken, Math.sin(since*.03)*.004, -.006*(ken-1)/.045);
    let imgOn = 0;
    gl.activeTexture(gl.TEXTURE0);
    if (imgUrl){ const t = texFn(imgUrl); if (t && t.ready){ gl.bindTexture(gl.TEXTURE_2D, t.gl); imgOn = 1; } else gl.bindTexture(gl.TEXTURE_2D, null); }
    else gl.bindTexture(gl.TEXTURE_2D, null);
    gl.uniform1f(bp.u.uImgOn, imgOn);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0,0,W,H); gl.useProgram(mainProg);
    // スチルもゆっくり寄る
    if (api.R.cg !== cgKey){ cgKey = api.R.cg; cgSince = now(); }
    const cgZ = reduce.matches ? 1 : 1 + .035 * (1 - Math.exp(-(now()-cgSince)/14));
    // 炎の場面は縁の光もゆらぐ
    let rimA = cur.rimA; if (key === 'fire_outside') rimA *= .75 + .25*Math.sin(time*9)*Math.sin(time*5.3+1);
    const d = cur.rimD, dl = Math.hypot(d[0], d[1]) || 1;
    return { bg: fb.t, cgZoom: cgZ, rimC: cur.rimC, rimA, rimD: [d[0]/dl, d[1]/dl], amb: cur.amb };
  } catch (e){ fail(e); return null; }
};
// 本体の描き先を FBO に
Stage.beginMain = function(){
  if (!this.active || !quality.post) return false;
  try { const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight; const fb = ensureFB('main', W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb.f); gl.viewport(0,0,W,H); return true; } catch(e){ fail(e); return false; }
};
const K = new Float32Array(POST_KEYS.length);
function pass(prog, target, src, setU){
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.f : null);
  gl.viewport(0, 0, target ? target.w : gl.drawingBufferWidth, target ? target.h : gl.drawingBufferHeight);
  gl.useProgram(prog.pr);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.t);
  setU && setU(prog.u, target || {w:gl.drawingBufferWidth, h:gl.drawingBufferHeight});
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
Stage.endMain = function(tMs){
  try {
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight, main = FB.main;
    const a1 = ensureFB('a1', W/4, H/4), a2 = ensureFB('a2', W/4, H/4), b1 = ensureFB('b1', W/8, H/8), b2 = ensureFB('b2', W/8, H/8);
    const texel = (u, t) => gl.uniform2f(u.uTexel, 1/t.w, 1/t.h);
    pass(P.bright, a1, main, (u,t)=>{ texel(u,t); gl.uniform1f(u.uTh, cur.bloomTh); });
    pass(P.blur, a2, a1, (u,t)=>{ texel(u,t); gl.uniform2f(u.uDir, 1, 0); });
    pass(P.blur, a1, a2, (u,t)=>{ texel(u,t); gl.uniform2f(u.uDir, 0, 1); });
    pass(P.blur, b1, a1, (u,t)=>{ texel(u,t); gl.uniform2f(u.uDir, 1.5, 0); });
    pass(P.blur, b2, b1, (u,t)=>{ texel(u,t); gl.uniform2f(u.uDir, 0, 1.5); });
    // 仕上げ
    const ev = eventValues();
    const v = Object.assign({}, cur, { wake:1, wakeBlur:0, white:0, pulse:0, jolt:0, touch:0, touchX:960, touchY:540, shatter:0,
      flower: cur.flower ?? 0, flowerA: cur.flowerA ?? 0 }, ev);
    v.temp = cur.temp + cur.warm*.9;
    v.sat = cur.sat * (1 - cur.desat);
    v.motion = reduce.matches ? 0 : 1;
    if (reduce.matches){ v.pulse *= .3; v.jolt *= .3; }
    POST_KEYS.forEach((k,i)=>K[i] = v[k] ?? 0);
    pass(P.post, null, main, u=>{
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, a1.t);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, b2.t);
      gl.uniform2f(u.uRes, 1920, 1080); gl.uniform2f(u.uView, W, H); gl.uniform1f(u.uTime, (tMs/1000) % 3600);
      gl.uniform1fv(u.uK, K); gl.uniform3fv(u.uLift, cur.lift); gl.uniform3fv(u.uGain, cur.gain);
    });
    gl.useProgram(mainProg);
  } catch (e){ fail(e); }
};
// 光の花の値は BASE にないので、ここで持つ
cur.flower = 0; cur.flowerA = 0;
BASE.flower = 0; BASE.flowerA = 0;

/* ---------- 7. デバッグ（「演出」タブ） ---------- */
function registerDebug(D){
  const C = '演出';
  D.string(C, '今の見た目', ()=>lookKey || '—', null, {order:0});
  D.toggle(C, '仕上げ（ブルーム・色調・粒子）', ()=>quality.post, v=>{ quality.post = v; }, {order:1, note:'切ると本体シェーダーだけで描く'});
  D.int(C, '背景の解像度（%）', ()=>Math.round(quality.bg*100), v=>{ quality.bg = Math.max(.25, Math.min(1, v/100)); }, {min:25, max:100, order:2});
  D.inputAction(C, 'fx を実行', v=>v.split(';').forEach(s=>runFx(s.replace(/^\s*fx\s+/, ''))), {placeholder:'例：snow 1 2 ／ flower 1 4 ／ wake 3', order:3});
  D.group(C, 'ためし撃ち', {order:10});
  const tries = [['目覚め','wake 3'],['鼓動','pulse'],['干渉の波紋','touch 960 560'],['光の花','flower 1 4'],['つぼみ（咲かない）','flower .35 3'],
    ['割れる','shatter 1.4'],['白く飛ぶ','whiteout 1 2.4'],['ほどける（左）','unravel Left 1 1'],['回想','flashback 1 1'],['冷える','cold 1 .6'],
    ['雪','snow 1 1'],['火の粉','embers 1 1'],['彗星（展望台）','comet 7'],['火が走る（夜の廊下）','firerush 1.8'],['元に戻す','reset']];
  tries.forEach(([l, c], i)=>D.button(C, l, ()=>{ D.close(); runFx(c); }, {buttonText:'見る', order:11+i, note:'fx '+c}));
  D.view(C, '置けなかった演出', ()=>Stage.missing.length ? Stage.missing.join('\n') : 'なし（すべての演出が原稿の行に付いています）', {order:40});
}
})();
