(() => {
  'use strict';

  // ——— Цвета
  const COLORS = { 
    white: '#e6e6e6', 
    gray: '#c1c1c1', 
    lime: '#bfecc0', 
    blue: '#c8dfff' 
  };
  let FG = COLORS.white;
  
  const setFG = name => {
    FG = COLORS[name] || COLORS.white;
    document.documentElement.style.setProperty('--fg', FG);
    document.querySelectorAll('button[data-col]').forEach(b => 
      b.classList.toggle('active', b.dataset.col === name)
    );
  };
  
  document.getElementById('sw').querySelectorAll('button[data-col]').forEach(b =>
    b.addEventListener('click', () => setFG(b.dataset.col))
  );
  setFG('white');

  // ——— Канвас
  const canvas = document.getElementById('cv');
  const ctx = canvas.getContext('2d', {alpha: false});

  // ——— Параметры
  const CFG = {
    segCount: 84,       
    segLen: 8,        
    moveSpeed: 0.04,    // ОЧЕНЬ МЕДЛЕННО
    
    spineW: 2,        
    ribW: 1.5,      
    boneW: 1.8,      
    
    headR: 10,       
    neckR: 8,
    shoulderR: 14,      
    chestR: 20,       
    bellyR: 18,
    hipR: 14,
    tailBaseR: 10,
    tailMidR: 6,
    tailEndR: 2,
    
    skullW: 18,       
    skullH: 14,       
    jawLen: 16,       
    
    ribStart: 12,       
    ribEnd: 55,       
    ribCurve: 0.7,      
    
    legs: [
      {idx: 16, type: 'front'},
      {idx: 28, type: 'mid1'},
      {idx: 40, type: 'mid2'},
      {idx: 52, type: 'back'},
    ],
    
    bone1: 20,       
    bone2: 16,         
    bone3: 10,       
    toes: 5,        
    
    walkSpeed: 0.03,    // МЕДЛЕННАЯ ХОДЬБА
    stepAmp: 0.5,
    breathe: 0.003,
  };

  // ——— Состояние
  let w = 0, h = 0, dpr = 1, running = false, time = 0, started = false;
  const head = {x: 0, y: 0};
  const target = {x: 0, y: 0};
  const points = [];
  let walkPhase = 0, breathePhase = 0;

  const isCoarse = () => window.matchMedia && matchMedia('(pointer: coarse)').matches;
  let active = !isCoarse();

  // ——— Кнопка старта
  const overlay = document.getElementById('overlay');
  overlay.addEventListener('click', () => {
    overlay.style.display = 'none';
    if (!started) {
      started = true;
      start();
    }
  });

  // ——— Размер окна
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssW = canvas.clientWidth || window.innerWidth;
    const cssH = canvas.clientHeight || window.innerHeight;
    w = cssW; 
    h = cssH;
    canvas.width = Math.max(1, Math.floor(cssW * dpr));
    canvas.height = Math.max(1, Math.floor(cssH * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    center();
  }

  function center() {
    head.x = target.x = w * 0.5;
    head.y = target.y = h * 0.5;
    
    points.length = 0;
    for (let i = 0; i < CFG.segCount; i++) {
      points.push({
        x: head.x - (i + 1) * CFG.segLen,
        y: head.y + Math.sin(i * 0.1) * 15,
        r: radiusAt(i + 1, CFG.segCount + 1)
      });
    }
  }

  // ——— Управление
  canvas.addEventListener('pointerdown', e => {
    active = true;
    setTarget(e.clientX, e.clientY);
    canvas.setPointerCapture?.(e.pointerId);
    if (e.pointerType !== 'mouse') e.preventDefault();
  }, {passive: false});
  
  canvas.addEventListener('pointermove', e => {
    if (e.pointerType === 'mouse' || active) setTarget(e.clientX, e.clientY);
    if (e.pointerType !== 'mouse') e.preventDefault();
  }, {passive: false});
  
  function stopFollow() { 
    active = !isCoarse(); 
  }
  canvas.addEventListener('pointerup', stopFollow);
  canvas.addEventListener('pointercancel', stopFollow);
  
  function setTarget(x, y) { 
    target.x = x; 
    target.y = y; 
  }

  // ——— Математика
  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);

  function radiusAt(i, N) {
    const t = i / N;
    if (t < 0.08) return CFG.headR;
    if (t < 0.15) return lerp(CFG.headR, CFG.neckR, smooth((t - 0.08) / 0.07));
    if (t < 0.2) return lerp(CFG.neckR, CFG.shoulderR, smooth((t - 0.15) / 0.05));
    if (t < 0.35) return lerp(CFG.shoulderR, CFG.chestR, smooth((t - 0.2) / 0.15));
    if (t < 0.5) return CFG.chestR;
    if (t < 0.6) return lerp(CFG.chestR, CFG.bellyR, smooth((t - 0.5) / 0.1));
    if (t < 0.7) return lerp(CFG.bellyR, CFG.hipR, smooth((t - 0.6) / 0.1));
    if (t < 0.75) return lerp(CFG.hipR, CFG.tailBaseR, smooth((t - 0.7) / 0.05));
    if (t < 0.85) return lerp(CFG.tailBaseR, CFG.tailMidR, smooth((t - 0.75) / 0.1));
    return lerp(CFG.tailMidR, CFG.tailEndR, smooth((t - 0.85) / 0.15));
  }

  // ——— Обновление
  function update() {
    time++;
    breathePhase += CFG.breathe;
    
    // ПРОСТОЕ движение головы
    head.x += (target.x - head.x) * CFG.moveSpeed;
    head.y += (target.y - head.y) * CFG.moveSpeed;
    
    // Обновление точек - ПРОСТАЯ цепочка
    if (points.length > 0) {
      for (let i = 0; i < points.length; i++) {
        const followX = (i === 0) ? head.x : points[i - 1].x;
        const followY = (i === 0) ? head.y : points[i - 1].y;
        
        const dx = followX - points[i].x;
        const dy = followY - points[i].y;
        const dist = Math.hypot(dx, dy);
        
        if (dist > CFG.segLen) {
          const angle = Math.atan2(dy, dx);
          points[i].x = followX - Math.cos(angle) * CFG.segLen;
          points[i].y = followY - Math.sin(angle) * CFG.segLen;
        }
      }
    }
    
    // Анимация ходьбы
    const movement = Math.abs(target.x - head.x) + Math.abs(target.y - head.y);
    if (movement > 1) {
      walkPhase += CFG.walkSpeed;
    }
  }

  // ——— Рисование
  function draw() {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    if (points.length === 0) return;

    ctx.strokeStyle = FG;
    ctx.fillStyle = FG;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // ПОЗВОНОЧНИК
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = CFG.spineW;
    ctx.beginPath();
    ctx.moveTo(head.x, head.y);
    for (let i = 0; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    // РЁБРА
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = CFG.ribW;
    
    const breathe = Math.sin(breathePhase * TAU) * 0.05 + 1;
    
    for (let i = CFG.ribStart - 1; i < Math.min(CFG.ribEnd - 1, points.length); i += 2) {
      const p = points[i];
      const r = p.r * breathe;
      if (r < 8) continue;
      
      const prev = (i > 0) ? points[i - 1] : {x: head.x, y: head.y};
      const next = (i < points.length - 1) ? points[i + 1] : p;
      const angle = Math.atan2(next.y - prev.y, next.x - prev.x);
      
      const progress = (i - (CFG.ribStart - 1)) / (CFG.ribEnd - CFG.ribStart);
      const curve = CFG.ribCurve * (1 - progress * 0.3);
      
      // Правое ребро
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      const r1x = p.x + Math.cos(angle - Math.PI / 2) * r;
      const r1y = p.y + Math.sin(angle - Math.PI / 2) * r;
      const r2x = p.x + Math.cos(angle - Math.PI / 2 + curve) * r * 1.1 + Math.cos(angle) * r * 0.3;
      const r2y = p.y + Math.sin(angle - Math.PI / 2 + curve) * r * 1.1 + Math.sin(angle) * r * 0.3;
      ctx.quadraticCurveTo(r1x, r1y, r2x, r2y);
      ctx.stroke();
      
      // Левое ребро
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      const l1x = p.x + Math.cos(angle + Math.PI / 2) * r;
      const l1y = p.y + Math.sin(angle + Math.PI / 2) * r;
      const l2x = p.x + Math.cos(angle + Math.PI / 2 - curve) * r * 1.1 + Math.cos(angle) * r * 0.3;
      const l2y = p.y + Math.sin(angle + Math.PI / 2 - curve) * r * 1.1 + Math.sin(angle) * r * 0.3;
      ctx.quadraticCurveTo(l1x, l1y, l2x, l2y);
      ctx.stroke();
      
      ctx.beginPath();
      ctx.arc(r2x, r2y, 1.5, 0, TAU);
      ctx.arc(l2x, l2y, 1.5, 0, TAU);
      ctx.fill();
    }

    // ЛАПЫ
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = CFG.boneW;
    
    for (const leg of CFG.legs) {
      if (leg.idx - 1 >= points.length) continue;
      const spine = points[leg.idx - 1];
      
      drawLeg(spine, leg.idx - 1, 1, leg.type);
      drawLeg(spine, leg.idx - 1, -1, leg.type);
    }

    // ШИРОКИЙ ХВОСТ
    ctx.globalAlpha = 0.85;
    
    for (let i = 59; i < points.length - 1; i++) {
      if (i < 0) continue;
      const t = (i - 59) / (points.length - 59);
      const width = (1 - t) * 8 + 1;
      
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(points[i].x, points[i].y);
      ctx.lineTo(points[i + 1].x, points[i + 1].y);
      ctx.stroke();
    }

    // ПОЗВОНКИ
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = FG;
    
    for (let i = 2; i < points.length; i += 3) {
      ctx.beginPath();
      ctx.arc(points[i].x, points[i].y, 2.5, 0, TAU);
      ctx.fill();
    }

    // ГОЛОВА
    ctx.globalAlpha = 0.95;
    ctx.save();
    ctx.translate(head.x, head.y);
    
    // Угол головы = направление к первому сегменту
    let headAngle = 0;
    if (points.length > 0) {
      headAngle = Math.atan2(points[0].y - head.y, points[0].x - head.x) + Math.PI;
    }
    ctx.rotate(headAngle);
    
    // Череп
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = FG;
    ctx.beginPath();
    ctx.ellipse(0, 0, CFG.skullW, CFG.skullH, 0, 0, TAU);
    ctx.stroke();
    
    // Глазницы
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(-6, -5, 4, 5, -0.2, 0, TAU);
    ctx.ellipse(-6, 5, 4, 5, 0.2, 0, TAU);
    ctx.fill();
    
    ctx.strokeStyle = FG;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(-6, -5, 4, 5, -0.2, 0, TAU);
    ctx.ellipse(-6, 5, 4, 5, 0.2, 0, TAU);
    ctx.stroke();
    
    // Носовое отверстие
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(CFG.skullW - 2, 0, 2, 3, 0, 0, TAU);
    ctx.fill();
    
    // Челюсть
    ctx.strokeStyle = FG;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(CFG.skullW * 0.8, -3);
    ctx.lineTo(CFG.jawLen, -1);
    ctx.moveTo(CFG.skullW * 0.8, 3);
    ctx.lineTo(CFG.jawLen, 1);
    ctx.stroke();
    
    // Зубы
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const x = CFG.skullW * 0.7 + i * 2.5;
      ctx.beginPath();
      ctx.moveTo(x, -3);
      ctx.lineTo(x, -1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, 3);
      ctx.lineTo(x, 1);
      ctx.stroke();
    }
    
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawLeg(spine, idx, side, type) {
    const phase = walkPhase + (side > 0 ? 0 : Math.PI) + idx * 0.15;
    const swing = Math.sin(phase) * CFG.stepAmp;
    
    const prev = (idx > 0) ? points[idx - 1] : {x: head.x, y: head.y};
    const next = (idx < points.length - 1) ? points[idx + 1] : spine;
    const spineAngle = Math.atan2(next.y - prev.y, next.x - prev.x);
    
    const n = {x: -Math.sin(spineAngle), y: Math.cos(spineAngle)};
    const t = {x: Math.cos(spineAngle), y: Math.sin(spineAngle)};
    
    const base = {
      x: spine.x + n.x * side * spine.r,
      y: spine.y + n.y * side * spine.r
    };
    
    const joint1 = {
      x: base.x + n.x * side * CFG.bone1 * 0.8 + t.x * swing * 8,
      y: base.y + n.y * side * CFG.bone1 * 0.8 + t.y * swing * 8 + 5
    };
    
    const joint2 = {
      x: joint1.x + n.x * side * CFG.bone2 * 0.6 + t.x * swing * 5,
      y: joint1.y + n.y * side * CFG.bone2 * 0.6 + t.y * swing * 5 + CFG.bone2 * 0.5
    };
    
    const foot = {
      x: joint2.x + n.x * side * CFG.bone3 * 0.4,
      y: joint2.y + n.y * side * CFG.bone3 * 0.4 + CFG.bone3 * 0.6
    };

    ctx.beginPath();
    ctx.moveTo(spine.x, spine.y);
    ctx.lineTo(base.x, base.y);
    ctx.lineTo(joint1.x, joint1.y);
    ctx.lineTo(joint2.x, joint2.y);
    ctx.lineTo(foot.x, foot.y);
    ctx.stroke();

    for (const joint of [base, joint1, joint2]) {
      ctx.beginPath();
      ctx.arc(joint.x, joint.y, 2.5, 0, TAU);
      ctx.fill();
    }

    ctx.lineWidth = 1;
    const footAng = Math.atan2(foot.y - joint2.y, foot.x - joint2.x);
    
    ctx.beginPath();
    ctx.moveTo(foot.x, foot.y);
    ctx.lineTo(foot.x + Math.cos(footAng) * CFG.toes, foot.y + Math.sin(footAng) * CFG.toes);
    ctx.stroke();
    
    for (const offset of [-0.15, 0.15]) {
      const a = footAng + offset;
      ctx.beginPath();
      ctx.moveTo(foot.x, foot.y);
      ctx.lineTo(foot.x + Math.cos(a) * CFG.toes * 0.9, foot.y + Math.sin(a) * CFG.toes * 0.9);
      ctx.stroke();
    }
    
    ctx.beginPath();
    ctx.arc(foot.x, foot.y, 2, 0, TAU);
    ctx.fill();
  }

  // ——— Цикл
  function loop() {
    if (!running) return;
    update();
    draw();
    requestAnimationFrame(loop);
  }

  // ——— Запуск
  function start() {
    if (running) return;
    running = true;
    resize();
    requestAnimationFrame(loop);
  }
  
  window.addEventListener('resize', resize, {passive: true});
})();