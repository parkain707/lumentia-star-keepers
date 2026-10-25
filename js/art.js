'use strict';

/* =========================================================
   ART — procedural constellation art (no external assets)
   ========================================================= */
const ART = (function () {
  const TAU = Math.PI * 2;

  function rgba(hex, a) {
    if (!hex) return 'rgba(255,255,255,' + a + ')';
    let h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function makeBackdrop() {
    const stars = [];
    for (let i = 0; i < 110; i++) {
      stars.push({
        x: Math.random() * 800,
        y: 30 + Math.random() * 620,
        r: 0.5 + Math.random() * 1.5,
        phase: Math.random() * TAU,
        speed: 0.4 + Math.random() * 1.2,
        tint: Math.random() > 0.82 ? '#9fd8ff' : '#ffffff'
      });
    }
    const pts = [
      { x: 70, y: 150 }, { x: 140, y: 105 }, { x: 215, y: 190 },
      { x: 300, y: 120 }, { x: 375, y: 205 }, { x: 455, y: 140 },
      { x: 530, y: 220 }, { x: 615, y: 155 }, { x: 700, y: 210 },
      { x: 745, y: 110 }
    ];
    const links = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [2, 5], [4, 8]];
    return { stars: stars, pts: pts, links: links };
  }

  function drawBackground(ctx, W, H, t, backdrop, boss) {
    const groundY = H * 0.86;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a1024');
    g.addColorStop(0.52, '#0b0f24');
    g.addColorStop(1, '#050710');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // nebula blooms
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const blooms = [
      { x: W * 0.28 + Math.sin(t * 0.06) * 20, y: H * 0.2, r: W * 0.4, c: '90,130,255', a: 0.09 },
      { x: W * 0.82 + Math.cos(t * 0.05) * 24, y: H * 0.34, r: W * 0.38, c: '170,110,255', a: 0.07 },
      { x: W * 0.55, y: groundY + Math.sin(t * 0.08) * 10, r: W * 0.46, c: '70,200,255', a: 0.05 }
    ];
    blooms.forEach(function (b) {
      const rg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      rg.addColorStop(0, 'rgba(' + b.c + ',' + b.a + ')');
      rg.addColorStop(1, 'rgba(' + b.c + ',0)');
      ctx.fillStyle = rg;
      ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
    });
    ctx.restore();

    // constellation map
    ctx.save();
    ctx.strokeStyle = 'rgba(140, 195, 255, .075)';
    ctx.lineWidth = 1;
    backdrop.links.forEach(function (l) {
      const a = backdrop.pts[l[0]];
      const b = backdrop.pts[l[1]];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    });
    backdrop.pts.forEach(function (p, i) {
      const tw = 0.35 + 0.35 * Math.sin(t * 0.7 + i);
      ctx.fillStyle = 'rgba(180, 220, 255,' + tw.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.7, 0, TAU);
      ctx.fill();
    });
    ctx.restore();

    // stars (with slow parallax drift)
    backdrop.stars.forEach(function (s) {
      const tw = 0.22 + 0.5 * Math.abs(Math.sin(t * s.speed + s.phase));
      const dx = Math.sin(t * 0.12 + s.phase) * (1.4 + s.r);
      const dy = Math.cos(t * 0.08 + s.phase) * (0.8 + s.r * 0.6);
      ctx.fillStyle = rgba(s.tint, tw);
      ctx.beginPath();
      ctx.arc(s.x + dx, s.y + dy, s.r, 0, TAU);
      ctx.fill();
    });

    drawAurora(ctx, W, H, t, boss);
    drawShooting(ctx, W, H, t);

    // distant horizon
    const hz = ctx.createRadialGradient(W * 0.5, groundY - 20, 10, W * 0.5, groundY - 20, 430);
    hz.addColorStop(0, 'rgba(95, 150, 255, .16)');
    hz.addColorStop(0.5, 'rgba(60, 90, 210, .05)');
    hz.addColorStop(1, 'rgba(10, 15, 35, 0)');
    ctx.fillStyle = hz;
    ctx.fillRect(0, groundY - 480, W, H - (groundY - 480));

    // drifting ground mist
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 2; i++) {
      const mx = W * 0.5 + Math.sin(t * 0.1 + i * 2.3) * W * 0.28;
      const my = groundY - 8 + Math.cos(t * 0.13 + i) * 12;
      ctx.save();
      ctx.translate(mx, my);
      ctx.scale(1, 0.18);
      const mg = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.42);
      mg.addColorStop(0, 'rgba(120, 170, 255, .085)');
      mg.addColorStop(1, 'rgba(120, 170, 255, 0)');
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(0, 0, W * 0.42, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();

    // ground platform
    ctx.save();
    ctx.translate(W * 0.5, groundY);
    ctx.scale(1, 0.16);
    const gy = ctx.createRadialGradient(0, 0, 10, 0, 0, 380);
    gy.addColorStop(0, 'rgba(110, 170, 255, .20)');
    gy.addColorStop(0.55, 'rgba(70, 110, 220, .07)');
    gy.addColorStop(1, 'rgba(10, 20, 50, 0)');
    ctx.fillStyle = gy;
    ctx.beginPath();
    ctx.arc(0, 0, 380, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(140, 190, 255, .10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(50, groundY);
    ctx.bezierCurveTo(W * 0.33, groundY - 12, W * 0.66, groundY - 12, W - 50, groundY);
    ctx.stroke();

    if (boss) {
      const bt = ctx.createRadialGradient(W * 0.74, H * 0.7, 20, W * 0.74, H * 0.7, 380);
      bt.addColorStop(0, 'rgba(255, 214, 150, .08)');
      bt.addColorStop(1, 'rgba(255, 214, 150, 0)');
      ctx.fillStyle = bt;
      ctx.fillRect(W * 0.3, 0, W, H);
    }

    // vignette
    const vg = ctx.createRadialGradient(W * 0.5, H * 0.52, H * 0.25, W * 0.5, H * 0.55, H * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.5)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  function drawAurora(ctx, W, H, t, boss) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const bands = [
      { y: H * 0.19, amp: 40, c: '120,190,255', a: 0.085, sp: 0.055, off: 0 },
      { y: H * 0.32, amp: 54, c: '168,132,255', a: 0.062, sp: 0.043, off: 2.4 },
      { y: H * 0.47, amp: 30, c: '110,244,214', a: 0.04, sp: 0.068, off: 4.6 }
    ];
    bands.forEach(function (b, bi) {
      const ph = t * b.sp + b.off;
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, 'rgba(' + b.c + ',0)');
      grad.addColorStop(0.34, 'rgba(' + b.c + ',' + (b.a * 0.7).toFixed(3) + ')');
      grad.addColorStop(0.64, 'rgba(' + b.c + ',' + b.a.toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(' + b.c + ',0)');
      ctx.strokeStyle = grad;
      [72, 26, 7].forEach(function (wd, wi) {
        ctx.globalAlpha = 0.5 + wi * 0.22;
        ctx.lineWidth = wd;
        ctx.beginPath();
        ctx.moveTo(-140, b.y + Math.sin(ph) * b.amp * 0.3);
        ctx.bezierCurveTo(
          W * 0.24, b.y - b.amp * Math.sin(ph + 0.6),
          W * 0.58, b.y + b.amp * Math.cos(ph * 1.15),
          W + 140, b.y + Math.sin(ph * 0.85 + bi) * b.amp * 0.5
        );
        ctx.stroke();
      });
    });
    if (boss) {
      const warm = ctx.createLinearGradient(0, 0, W, 0);
      warm.addColorStop(0, 'rgba(255, 214, 150, 0)');
      warm.addColorStop(0.55, 'rgba(255, 214, 150, .045)');
      warm.addColorStop(1, 'rgba(255, 214, 150, 0)');
      ctx.globalAlpha = 1;
      ctx.strokeStyle = warm;
      ctx.lineWidth = 46;
      ctx.beginPath();
      ctx.moveTo(-140, H * 0.26 + Math.sin(t * 0.04) * 14);
      ctx.bezierCurveTo(W * 0.3, H * 0.22, W * 0.7, H * 0.34, W + 140, H * 0.27);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawShooting(ctx, W, H, t) {
    const p = (t % 13) / 1.35;
    if (p >= 1) return;
    const e = 1 - Math.pow(1 - p, 2.2);
    const x = W * 0.9 - e * W * 0.46;
    const y = H * 0.08 + e * H * 0.2;
    const alpha = Math.sin(p * Math.PI);
    const tx = x + 96;
    const ty = y - 62;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lg = ctx.createLinearGradient(x, y, tx, ty);
    lg.addColorStop(0, 'rgba(255,255,255,' + (0.85 * alpha).toFixed(3) + ')');
    lg.addColorStop(0.25, 'rgba(180,220,255,' + (0.4 * alpha).toFixed(3) + ')');
    lg.addColorStop(1, 'rgba(150,200,255,0)');
    ctx.strokeStyle = lg;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,' + (0.9 * alpha).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(x, y, 1.9, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function hero(ctx, heroData, x, y, scale, t, opts) {
    opts = opts || {};
    const pal = heroData.palette;
    const seed = heroData.seed || 0;
    const alpha = opts.alpha == null ? 1 : opts.alpha;
    const bob = Math.sin(t * 2.0 + seed) * 5;
    const lunge = opts.lunge || 0;
    const flash = opts.flash || 0;
    const cls = heroData.cls;

    // ground shadow
    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    ctx.translate(x, y + 96 * scale);
    ctx.scale(1, 0.24);
    const sh = ctx.createRadialGradient(0, 0, 4, 0, 0, 62 * scale);
    sh.addColorStop(0, 'rgba(90, 130, 255, .3)');
    sh.addColorStop(0.6, 'rgba(50, 70, 140, .12)');
    sh.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(0, 0, 62 * scale, 0, TAU);
    ctx.fill();
    ctx.restore();

    // aura
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'lighter';
    const aura = ctx.createRadialGradient(x, y - 20 + bob, 4, x, y - 20 + bob, 118 * scale);
    aura.addColorStop(0, rgba(pal.ring, 0.2));
    aura.addColorStop(0.45, rgba(pal.ring, 0.055));
    aura.addColorStop(1, rgba(pal.ring, 0));
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(x, y - 20 + bob, 118 * scale, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x + lunge * 16, y + bob);
    ctx.scale(scale, scale);

    // back halo ring
    ctx.save();
    ctx.strokeStyle = rgba(pal.ring, 0.3);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(0, -80, 38, 12, -0.18, 0, TAU);
    ctx.stroke();
    ctx.restore();

    // flowing ribbons
    const sway = Math.sin(t * 1.6 + seed) * 6;
    ctx.save();
    ctx.strokeStyle = rgba(pal.a, 0.34);
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-28, 46);
    ctx.bezierCurveTo(-46, 62, -50 + sway, 84, -36 + sway, 100);
    ctx.stroke();
    ctx.strokeStyle = rgba(pal.a, 0.22);
    ctx.beginPath();
    ctx.moveTo(28, 48);
    ctx.bezierCurveTo(46, 66, 52 - sway, 88, 40 - sway, 104);
    ctx.stroke();
    ctx.restore();

    // body
    ctx.beginPath();
    ctx.moveTo(0, -58);
    ctx.bezierCurveTo(22, -60, 30, -24, 34, 4);
    ctx.bezierCurveTo(38, 34, 52, 58, 45, 82);
    ctx.bezierCurveTo(26, 92, 10, 96, 0, 96);
    ctx.bezierCurveTo(-10, 96, -26, 92, -45, 82);
    ctx.bezierCurveTo(-52, 58, -38, 34, -34, 4);
    ctx.bezierCurveTo(-30, -24, -22, -60, 0, -58);
    ctx.closePath();
    const bg = ctx.createLinearGradient(0, -70, 0, 98);
    bg.addColorStop(0, rgba(pal.a, 0.9));
    bg.addColorStop(0.45, rgba(pal.a, 0.48));
    bg.addColorStop(0.82, rgba(pal.b, 0.32));
    bg.addColorStop(1, rgba(pal.b, 0.04));
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = rgba(pal.a, 0.42);
    ctx.lineWidth = 1.3;
    ctx.stroke();

    // chest glow
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const chest = ctx.createRadialGradient(0, 12, 1, 0, 12, 42);
    chest.addColorStop(0, rgba(pal.core, 0.75));
    chest.addColorStop(0.35, rgba(pal.ring, 0.22));
    chest.addColorStop(1, rgba(pal.ring, 0));
    ctx.fillStyle = chest;
    ctx.beginPath();
    ctx.arc(0, 12, 42, 0, TAU);
    ctx.fill();
    ctx.restore();

    // hood + mask
    ctx.beginPath();
    ctx.ellipse(0, -78, 24, 27, 0, 0, TAU);
    const hood = ctx.createLinearGradient(0, -104, 0, -54);
    hood.addColorStop(0, rgba(pal.a, 0.95));
    hood.addColorStop(1, rgba(pal.b, 0.9));
    ctx.fillStyle = hood;
    ctx.fill();
    ctx.strokeStyle = rgba(pal.core, 0.28);
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(0, -74, 14, 15, 0, 0, TAU);
    ctx.fillStyle = 'rgba(6, 9, 20, .82)';
    ctx.fill();

    // eyes
    ctx.save();
    ctx.shadowColor = pal.core;
    ctx.shadowBlur = 10;
    ctx.fillStyle = pal.core;
    ctx.beginPath();
    ctx.ellipse(-6, -75, 3.4, 1.5, 0.12, 0, TAU);
    ctx.ellipse(6, -75, 3.4, 1.5, -0.12, 0, TAU);
    ctx.fill();
    ctx.restore();

    // class motifs - Epic High-Res Armaments & Effects
    if (cls === 'guide') {
      ctx.save();
      // Grand Cosmic Blade (Large Glowing Broadsword)
      ctx.shadowColor = pal.core;
      ctx.shadowBlur = 18;
      ctx.strokeStyle = rgba(pal.core, 0.95);
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(28, 80);
      ctx.lineTo(54, -75);
      ctx.stroke();

      // Blade energy edge
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(30, 70);
      ctx.lineTo(54, -75);
      ctx.stroke();

      // Blade hilt & guard
      ctx.strokeStyle = pal.ring;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(18, 52);
      ctx.lineTo(44, 42);
      ctx.stroke();

      // Sweeping Star Arc
      ctx.strokeStyle = rgba(pal.ring, 0.45);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 4, 75, -2.6 + Math.sin(t * 0.4) * 0.15, 0.6 + Math.sin(t * 0.4) * 0.15);
      ctx.stroke();

      for (let i = 0; i < 4; i++) {
        const ang = t * 0.7 + seed + (i / 4) * TAU;
        const bx = Math.cos(ang) * 72;
        const by = Math.sin(ang) * 32 + 4;
        softStar(ctx, bx, by, 10 + Math.sin(t * 2 + i) * 1.5, ang * 0.6, rgba(pal.core, 0.95), 0.85);
      }
      ctx.restore();
    } else if (cls === 'guard') {
      ctx.save();
      // Massive Hexagonal Energy Aegis (Frontal Shield)
      ctx.shadowColor = pal.ring;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.moveTo(-38, 10);
      ctx.lineTo(0, -10);
      ctx.lineTo(38, 10);
      ctx.lineTo(32, 68);
      ctx.lineTo(0, 92);
      ctx.lineTo(-32, 68);
      ctx.closePath();
      ctx.fillStyle = rgba(pal.a, 0.28);
      ctx.fill();
      ctx.strokeStyle = rgba(pal.core, 0.85);
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Inner Aegis Core
      ctx.beginPath();
      ctx.arc(0, 36, 16, 0, TAU);
      ctx.fillStyle = rgba(pal.core, 0.4);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Orbiting Defense Hex-Rays
      for (let i = 0; i < 6; i++) {
        const ang = t * 0.45 + seed + (i / 6) * TAU;
        const px = Math.cos(ang) * 68;
        const py = Math.sin(ang) * 36 + 14;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang);
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU;
          const r = 9;
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = rgba(pal.core, 0.45);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    } else if (cls === 'mage') {
      ctx.save();
      // Giant Constellation Runic Spell Circle (Backdrop Ring)
      ctx.strokeStyle = rgba(pal.core, 0.4);
      ctx.lineWidth = 1.8;
      ctx.shadowColor = pal.core;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(0, -10, 68, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([8, 10]);
      ctx.beginPath();
      ctx.arc(0, -10, 58, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);

      // Tall Astral Staff
      ctx.strokeStyle = rgba(pal.a, 0.85);
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(38, 90);
      ctx.lineTo(38, -50);
      ctx.stroke();

      // Supernova Orb at Staff Tip
      ctx.fillStyle = rgba(pal.core, 0.95);
      ctx.beginPath();
      ctx.arc(38, -62, 11 + Math.sin(t * 2.5 + seed) * 2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Floating Astral Diamonds
      for (let i = 0; i < 5; i++) {
        const ang = t * 0.6 + seed + (i / 5) * TAU;
        const px = Math.cos(ang) * 64;
        const py = Math.sin(ang) * 32 + 2;
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang * 1.8);
        ctx.fillStyle = rgba(pal.core, 0.8);
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(6, 0);
        ctx.lineTo(0, 8);
        ctx.lineTo(-6, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    } else if (cls === 'song') {
      ctx.save();
      // Grand 6-Fold Luminous Angelic Wings
      ctx.shadowColor = pal.ring;
      ctx.shadowBlur = 16;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      for (let s = -1; s <= 1; s += 2) {
        for (let i = 0; i < 3; i++) {
          const flap = Math.sin(t * 2 + i * 0.5) * 6;
          ctx.strokeStyle = rgba(pal.core, 0.85 - i * 0.15);
          ctx.fillStyle = rgba(pal.a, 0.16);
          ctx.beginPath();
          ctx.moveTo(s * 16, -26 + i * 10);
          ctx.bezierCurveTo(
            s * (46 + i * 10), -68 + i * 16 + flap,
            s * (78 + i * 12), -52 + i * 20 + flap,
            s * (86 + i * 14), -12 + i * 24 + flap
          );
          ctx.lineTo(s * 20, 20 + i * 8);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
      // Dual Holy Halo
      ctx.strokeStyle = rgba(pal.core, 0.9);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, -112 + Math.sin(t * 1.5 + seed) * 3, 34, 9, 0, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = rgba(pal.ring, 0.5);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, -118 + Math.sin(t * 1.5 + seed) * 3, 24, 6, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // orbiting motes
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const ang = t * (0.35 + i * 0.07) + seed + (i / 5) * TAU;
      const px = Math.cos(ang) * (58 + i * 5);
      const py = Math.sin(ang * 1.3) * 34 - 6 + i * 6;
      const pulse = 2 + Math.sin(t * 2 + i) * 0.8;
      const mg = ctx.createRadialGradient(px, py, 0, px, py, pulse * 3);
      mg.addColorStop(0, rgba(pal.core, 0.9));
      mg.addColorStop(1, rgba(pal.ring, 0));
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(px, py, pulse * 3, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    if (flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const fg = ctx.createRadialGradient(0, -10, 2, 0, -10, 80);
      fg.addColorStop(0, 'rgba(255,255,255,' + (flash * 0.75) + ')');
      fg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(0, -10, 80, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  const SHAPES = {
    wisp: { r: 35, bob: 8 },
    moth: { r: 33, bob: 7 },
    moon: { r: 36, bob: 9 },
    lantern: { r: 33, bob: 6 },
    boss: { r: 62, bob: 10 }
  };

  function softStar(ctx, x, y, r, rot, color, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot || 0);
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(r * 0.2, -r * 0.2, r, 0);
    ctx.quadraticCurveTo(r * 0.2, r * 0.2, 0, r);
    ctx.quadraticCurveTo(-r * 0.2, r * 0.2, -r, 0);
    ctx.quadraticCurveTo(-r * 0.2, -r * 0.2, 0, -r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function constellationLattice(ctx, r, t, seed) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + t * 0.05 + seed * 0.5;
      const rad = r * (0.44 + 0.15 * Math.sin(i * 1.9 + seed));
      pts.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad * 0.82 });
    }
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 244, 214, .22)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    pts.forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    ctx.closePath();
    ctx.stroke();
    pts.forEach(function (p, i) {
      softStar(ctx, p.x, p.y, r * 0.055, t * 0.2 + i, 'rgba(255, 246, 222, .85)', 0.45 + 0.35 * Math.sin(t * 1.2 + i));
    });
    ctx.restore();
  }

  function spiritCore(ctx, cx, cy, radius, color, t, seed, boss) {
    const pulse = 0.88 + 0.12 * Math.sin(t * 1.5 + seed);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalCompositeOperation = 'lighter';

    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    g.addColorStop(0, 'rgba(255, 255, 255, ' + (0.88 * pulse).toFixed(3) + ')');
    g.addColorStop(0.3, rgba(color, 0.58 * pulse));
    g.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, TAU);
    ctx.fill();

    if (boss) constellationLattice(ctx, radius, t, seed);

    ctx.save();
    ctx.rotate(-0.34 + Math.sin(t * 0.35 + seed) * 0.07);
    ctx.strokeStyle = rgba(color, 0.36);
    ctx.lineWidth = Math.max(0.8, radius * 0.035);
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 1.02, radius * 0.34, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();

    softStar(ctx, 0, 0, radius * (boss ? 0.46 : 0.44), t * 0.3 + seed, 'rgba(255, 252, 240, .92)', 0.85);
    ctx.restore();
  }

  function enemy(ctx, info, x, y, scale, t, opts) {
    opts = opts || {};
    const shape = info.shape || 'wisp';
    const cfg = SHAPES[shape] || SHAPES.wisp;
    const r = cfg.r;
    const color = info.color || '#b9a7ff';
    const alpha = opts.alpha == null ? 1 : opts.alpha;
    const flash = opts.flash || 0;
    const seed = info.seed || 0;
    const bob = Math.sin(t * 1.7 + seed) * cfg.bob;
    const dead = opts.deadT || 0;
    const shrink = dead > 0 ? Math.max(0, 1 - dead * 1.6) : 1;

    // soft shadow
    ctx.save();
    ctx.globalAlpha = alpha * 0.7;
    ctx.translate(x, y + r * scale * 0.95);
    ctx.scale(1, 0.22);
    const sh = ctx.createRadialGradient(0, 0, 4, 0, 0, r * 1.7 * scale);
    sh.addColorStop(0, rgba(color, 0.22));
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.7 * scale, 0, TAU);
    ctx.fill();
    ctx.restore();

    // gentle aura
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'lighter';
    const ag = ctx.createRadialGradient(x, y + bob, 2, x, y + bob, r * 2.7 * scale);
    ag.addColorStop(0, rgba(color, 0.18));
    ag.addColorStop(0.55, rgba(color, 0.05));
    ag.addColorStop(1, rgba(color, 0));
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(x, y + bob, r * 2.7 * scale, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y + bob + Math.sin(t * 2.2 + seed) * 2);
    ctx.scale(scale * shrink, scale * shrink);
    const spin = t * 0.18 + seed;

    const bodyFill = function (cx, cy, radius, strength) {
      const bg = ctx.createRadialGradient(cx, cy - radius * 0.25, radius * 0.08, cx, cy, radius);
      bg.addColorStop(0, 'rgba(255, 255, 255, ' + (0.72 * strength) + ')');
      bg.addColorStop(0.5, rgba(color, 0.5 * strength));
      bg.addColorStop(1, rgba(color, 0.06 * strength));
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, TAU);
      ctx.fill();
    };

    if (shape === 'moth') {
      ctx.save();
      ctx.rotate(Math.sin(t * 1.2 + seed) * 0.12);
      [-1, 1].forEach(function (side) {
        ctx.save();
        ctx.translate(side * r * 0.72, -r * 0.05);
        ctx.rotate(side * -0.35);
        const wg = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 0.85);
        wg.addColorStop(0, rgba(color, 0.55));
        wg.addColorStop(0.7, rgba(color, 0.2));
        wg.addColorStop(1, rgba(color, 0));
        ctx.fillStyle = wg;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.82, r * 0.55, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      });
      bodyFill(0, r * 0.1, r * 0.45, 1);
      ctx.strokeStyle = rgba(color, 0.5);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.12, -r * 0.25);
      ctx.quadraticCurveTo(-r * 0.42, -r * 0.82, -r * 0.62, -r * 0.66);
      ctx.moveTo(r * 0.12, -r * 0.25);
      ctx.quadraticCurveTo(r * 0.42, -r * 0.82, r * 0.62, -r * 0.66);
      ctx.stroke();
      softStar(ctx, -r * 0.62, -r * 0.66, r * 0.09, 0.2, rgba(color, 0.9), 1);
      softStar(ctx, r * 0.62, -r * 0.66, r * 0.09, -0.2, rgba(color, 0.9), 1);
      spiritCore(ctx, 0, r * 0.1, r * 0.44, color, t, seed, false);
    } else if (shape === 'moon') {
      bodyFill(0, 0, r, 1);
      ctx.strokeStyle = rgba(color, 0.4);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.12, -0.6 + spin * 0.2, 2.2 + spin * 0.2);
      ctx.stroke();
      softStar(ctx, -r * 0.95, -r * 0.7, r * 0.12, 0.3 + spin, 'rgba(255,255,255,.85)', 0.85);
      softStar(ctx, r * 0.95, r * 0.35, r * 0.09, -0.4, rgba(color, 0.9), 0.7);
      spiritCore(ctx, 0, 0, r * 0.76, color, t, seed, false);
    } else if (shape === 'lantern') {
      const lg = ctx.createLinearGradient(0, -r, 0, r);
      lg.addColorStop(0, rgba(color, 0.4));
      lg.addColorStop(0.5, 'rgba(255, 255, 255, .55)');
      lg.addColorStop(1, rgba(color, 0.32));
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.bezierCurveTo(r * 0.92, -r * 0.72, r * 0.92, r * 0.7, 0, r);
      ctx.bezierCurveTo(-r * 0.92, r * 0.7, -r * 0.92, -r * 0.72, 0, -r);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = rgba(color, 0.45);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.strokeStyle = rgba(color, 0.55);
      ctx.beginPath();
      ctx.arc(0, -r * 1.02, r * 0.22, Math.PI, TAU);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 214, 121, .45)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(-r * 0.16, r * 0.92);
      ctx.quadraticCurveTo(-r * 0.05, r * 1.22, -r * 0.28, r * 1.34);
      ctx.moveTo(r * 0.16, r * 0.92);
      ctx.quadraticCurveTo(r * 0.05, r * 1.22, r * 0.28, r * 1.34);
      ctx.stroke();
      spiritCore(ctx, 0, r * 0.03, r * 0.46, color, t, seed, false);
    } else {
      // wisp / boss — a sleepy puff of starlight
      bodyFill(-r * 0.42, r * 0.18, r * 0.72, 0.75);
      bodyFill(r * 0.42, r * 0.2, r * 0.68, 0.75);
      bodyFill(0, -r * 0.12, r * 0.95, 1);
      if (shape === 'boss') {
        ctx.save();
        ctx.rotate(spin * 0.5);
        ctx.strokeStyle = rgba(color, 0.32);
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 12]);
        ctx.beginPath();
        ctx.arc(0, 0, r * 1.28, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU + spin;
          softStar(ctx, Math.cos(a) * r * 1.28, Math.sin(a) * r * 1.28, r * 0.1, a, 'rgba(255, 240, 190, .85)', 0.6 + 0.4 * Math.sin(t * 2 + i));
        }
        ctx.restore();
      } else {
        for (let i = 0; i < 2; i++) {
          const a = spin + i * Math.PI + seed;
          softStar(ctx, Math.cos(a) * r * 1.12, Math.sin(a) * r * 0.62 - r * 0.3, r * 0.09, a, 'rgba(255, 255, 255, .8)', 0.55 + 0.35 * Math.sin(t * 2.4 + i));
        }
      }
      spiritCore(ctx, 0, 0, shape === 'boss' ? r * 0.94 : r * 0.68, color, t, seed, shape === 'boss');
    }

    if (flash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const fg = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 1.3);
      fg.addColorStop(0, 'rgba(255,255,255,' + (flash * 0.9) + ')');
      fg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.3, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  function portrait(canvas, heroData, opts) {
    opts = opts || {};
    // Ultra-Crisp Sharpness: Force at least 2.0x DPR buffer (Super-sampling)
    const dpr = Math.max(2, Math.min(3, window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(48, Math.round((rect.width || canvas.clientWidth || 120) * dpr));
    const h = Math.max(48, Math.round((rect.height || canvas.clientHeight || 120) * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, w, h);
    const size = Math.min(w, h);
    const cx = w / 2;
    const cy = h / 2;
    const pal = heroData.palette;

    // Rich cosmic card backdrop
    ctx.save();
    const bg = ctx.createRadialGradient(cx, cy * 0.75, size * 0.1, cx, cy, size * 0.75);
    bg.addColorStop(0, rgba(pal.core, 0.42));
    bg.addColorStop(0.35, rgba(pal.ring, 0.22));
    bg.addColorStop(0.7, rgba(pal.a, 0.1));
    bg.addColorStop(1, 'rgba(6, 10, 22, 0)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Decorative Constellation Halo Circle
    ctx.strokeStyle = rgba(pal.ring, 0.55);
    ctx.lineWidth = Math.max(2, size * 0.018);
    ctx.beginPath();
    ctx.arc(cx, cy * 0.8, size * 0.46, 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = rgba(pal.core, 0.35);
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 6]);
    ctx.beginPath();
    ctx.arc(cx, cy * 0.8, size * 0.40, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Bold, Commanding Hero Avatar Rendering (Scaled up to fill frame!)
    ctx.save();
    ctx.beginPath();
    const r = 14 * dpr;
    ctx.moveTo(r, 0);
    ctx.lineTo(w - r, 0);
    ctx.arcTo(w, 0, w, r, r);
    ctx.lineTo(w, h - r);
    ctx.arcTo(w, h, w - r, h, r);
    ctx.lineTo(r, h);
    ctx.arcTo(0, h, 0, h - r, r);
    ctx.lineTo(0, r);
    ctx.arcTo(0, 0, r, 0, r);
    ctx.closePath();
    ctx.clip();

    // Massive Scale (size / 112) for razor-sharp, screen-filling hero presence!
    const scale = size / 112;
    hero(ctx, heroData, cx, cy + size * 0.16, scale, opts.time || 0.8, { alpha: 1 });
    ctx.restore();
  }

  return {
    rgba: rgba,
    makeBackdrop: makeBackdrop,
    background: drawBackground,
    hero: hero,
    enemy: enemy,
    portrait: portrait
  };
})();
