class MandelbulbRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!this.gl) throw new Error('WebGL2 no disponible');

    // Cámara (coordenadas esféricas)
    this.rotationX  = 0.2;
    this.rotationY  = 0;
    this.zoom       = 3.5;
    this.targetZoom = 3.5;
    this.target     = [0, 0, 0];
    this.targetTarget = [0, 0, 0];
    this.cameraPos  = [0, 0, 3.5];
    this.up         = [0, 1, 0];

    // Parámetros del fractal
    this.power      = 8.0;
    this.iterations = 12;
    this.colorMode  = 0;

    // Calidad
    this.quality   = 'high';
    this.maxSteps  = 150;
    this.epsFactor = 0.001;

    this.autoRotate = false;
    this.startTime  = performance.now();

    // FPS
    this.frameCount    = 0;
    this.lastFpsUpdate = performance.now();
    this.currentFps    = 60;

    this._initGL();
    this._setupGeometry();
    this._bindAttribs();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  _initGL() {
    const vs = `#version 300 es
      precision highp float;
      in vec2 aPos;
      out vec3 vPosition;
      uniform mat4 uInvProjView;
      void main(){
        vec4 clip  = vec4(aPos, 0.0, 1.0);
        vec4 world = uInvProjView * clip;
        world /= world.w;
        vPosition   = world.xyz;
        gl_Position = vec4(aPos, 0.0, 1.0);
      }
    `;

    const fs = `#version 300 es
      precision highp float;
      in vec3 vPosition;
      out vec4 fragColor;

      uniform vec3  uCameraPos;
      uniform float uPower;
      uniform int   uIterations;
      uniform int   uColorMode;
      uniform float uTime;
      uniform float uZoom;
      uniform int   uMaxSteps;
      uniform float uEps;

      const float PI = 3.141592653589793;

      // ── Distance Estimator del Mandelbulb ──────────────────────────────
      float mandelbulbDE(vec3 pos) {
        vec3  z  = pos;
        float dr = 1.0;

        for (int i = 0; i < 1000; i++) {
          if (i >= uIterations) break;
          float r = length(z);
          if (r > 2.0 || r < 1e-7) break;

          float theta = acos(clamp(z.z / r, -1.0, 1.0));
          float phi   = atan(z.y, z.x);
          dr = pow(r, uPower - 1.0) * uPower * dr + 1.0;

          float zr = pow(r, uPower);
          theta   *= uPower;
          phi     *= uPower;
          z = zr * vec3(sin(theta)*cos(phi), sin(theta)*sin(phi), cos(theta)) + pos;
        }

        float r = length(z);
        return 0.5 * log(max(r, 1e-7)) * r / dr;
      }

      // ── Normal por diferencias centrales ──────────────────────────────
      vec3 calcNormal(vec3 p) {
        float h = uEps * 0.5;
        vec2 e  = vec2(1.0, -1.0);
        return normalize(
          e.xyy * mandelbulbDE(p + e.xyy*h) +
          e.yyx * mandelbulbDE(p + e.yyx*h) +
          e.yxy * mandelbulbDE(p + e.yxy*h) +
          e.xxx * mandelbulbDE(p + e.xxx*h)
        );
      }

      // ── Sombra suave ──────────────────────────────────────────────────
      float softShadow(vec3 ro, vec3 rd) {
        float res = 1.0;
        float t   = 0.05;
        for (int i = 0; i < 32; i++) {
          float h = mandelbulbDE(ro + rd * t);
          if (h < 0.001) return 0.0;
          res  = min(res, 6.0 * h / t);
          t   += clamp(h, 0.02, 0.15);
          if (t > 20.0) break;
        }
        return clamp(res, 0.0, 1.0);
      }

      // ── Paletas de color ──────────────────────────────────────────────
      vec3 palCosmico(float t, vec3 p) {
        return vec3(
          0.35 + 0.5  * sin(t*4.0 + p.x*2.0 + uTime*0.0005),
          0.25 + 0.5  * cos(t*3.0 + p.y*2.0),
          0.65 + 0.35 * sin(t*5.0 + uTime*0.0007)
        );
      }

      vec3 palLava(float t, vec3 p) {
        return vec3(0.75 + 0.25*sin(t*6.0), 0.15 + 0.35*t*t, 0.02*t);
      }

      vec3 palEsmeralda(float t, vec3 p) {
        return vec3(
          0.08 + 0.15*sin(t*5.0),
          0.45 + 0.45*cos(t*3.0 + p.y*2.0),
          0.15 + 0.25*sin(t*4.0)
        );
      }

      vec3 palAlien(float t, vec3 p) {
        return vec3(
          0.05 + 0.25*sin(t*7.0 + p.z*3.0),
          0.55 + 0.4 *cos(t*5.0 + uTime*0.0004),
          0.45 + 0.45*sin(t*4.0 + p.x*2.0)
        );
      }

      vec3 palRainbow(float t, vec3 p) {
        float tm = uTime * 0.0003;
        return vec3(
          0.5 + 0.5*sin(t*8.0  + p.x*4.0 + tm*3.0),
          0.5 + 0.5*sin(t*11.0 + p.y*5.0 + tm*5.0 + 2.094),
          0.5 + 0.5*sin(t*13.0 + p.z*6.0 + tm*7.0 + 4.189)
        );
      }

      vec3 palEspectral(float t, vec3 p) {
        float w = sin(p.x*3.0 + uTime*0.002) * cos(p.z*3.0 + uTime*0.003);
        return vec3(
          0.7 + 0.3*sin(t*15.0 + w*10.0),
          0.8 + 0.2*cos(t*12.0 + w* 8.0),
          0.9 + 0.1*sin(t*10.0 + w* 6.0)
        ) * (0.3 + 0.7*t);
      }

      // ── Main ──────────────────────────────────────────────────────────
      void main() {
        vec3  rayDir   = normalize(vPosition - uCameraPos);
        vec3  rayPos   = uCameraPos;
        float totalDist = 0.0;
        bool  hit      = false;
        float dist     = 0.0;
        float eps      = max(5e-5, uEps * uZoom);
        int   steps    = 0;
        float maxDist  = 30.0;

        for (steps = 0; steps < uMaxSteps; steps++) {
          dist = mandelbulbDE(rayPos);
          totalDist += dist;
          if (dist < eps) { hit = true; break; }
          rayPos += rayDir * dist * 0.9;
          if (totalDist > maxDist) break;
        }

        vec3 color = vec3(0.0);

        if (hit) {
          vec3 N = calcNormal(rayPos);
          vec3 L = normalize(vec3(sin(uTime*0.0006), 0.75, cos(uTime*0.0008)));
          vec3 V = normalize(uCameraPos - rayPos);

          float diff = max(0.25, dot(N, L));
          float sh   = softShadow(rayPos + N*eps*2.0, L);

          vec3  L2        = normalize(vec3(-sin(uTime*0.0004), -0.4, -cos(uTime*0.0005)));
          float fillLight = max(0.0, dot(N, L2)) * 0.3;

          float ambient     = 0.3 + sin(uTime*0.0003)*0.08;
          vec3  ambientColor = vec3(0.4, 0.5, 0.85);

          vec3  H    = normalize(L + V);
          float spec = pow(max(dot(N, H), 0.0), 50.0) * 0.7;

          float iterFactor = float(steps) / float(max(1, uMaxSteps));

          if      (uColorMode == 0) color = palCosmico  (iterFactor, rayPos);
          else if (uColorMode == 1) color = palLava      (iterFactor, rayPos);
          else if (uColorMode == 2) color = palEsmeralda (iterFactor, rayPos);
          else if (uColorMode == 3) color = palAlien     (iterFactor, rayPos);
          else if (uColorMode == 4) color = palRainbow   (iterFactor, rayPos);
          else                      color = palEspectral (iterFactor, rayPos);

          float ao = clamp(1.0 - dist*4.0, 0.35, 1.0);

          vec3 lighting = color * (ambient*ambientColor + diff*0.65 + fillLight);
          lighting *= (0.65 + sh*0.35);
          lighting *= ao;
          lighting += vec3(spec);

          float edge = 1.0 - smoothstep(0.0, eps*4.0, dist);
          color = mix(lighting, lighting*2.0, edge*0.45);

          float fog = smoothstep(20.0, maxDist, totalDist);
          color = mix(color, vec3(0.01, 0.01, 0.03), fog*0.5);

          color = pow(clamp(color, 0.0, 3.0), vec3(0.85));
          color *= 1.25;

          fragColor = vec4(color, 1.0);
        } else {
          float t  = 0.5 + 0.5*rayDir.y;
          vec3  bg = mix(vec3(0.01,0.01,0.04), vec3(0.03,0.04,0.09), t);
          fragColor = vec4(bg, 1.0);
        }
      }
    `;

    const gl   = this.gl;
    const vert = this._compile(gl.VERTEX_SHADER,   vs);
    const frag = this._compile(gl.FRAGMENT_SHADER, fs);
    this.program = this._link(vert, frag);

    this.aPosLoc      = gl.getAttribLocation (this.program, 'aPos');
    this.uCameraPos   = gl.getUniformLocation(this.program, 'uCameraPos');
    this.uPower       = gl.getUniformLocation(this.program, 'uPower');
    this.uIterations  = gl.getUniformLocation(this.program, 'uIterations');
    this.uColorMode   = gl.getUniformLocation(this.program, 'uColorMode');
    this.uTime        = gl.getUniformLocation(this.program, 'uTime');
    this.uZoom        = gl.getUniformLocation(this.program, 'uZoom');
    this.uMaxSteps    = gl.getUniformLocation(this.program, 'uMaxSteps');
    this.uEps         = gl.getUniformLocation(this.program, 'uEps');
    this.uInvProjView = gl.getUniformLocation(this.program, 'uInvProjView');
  }

  _compile(type, src) {
    const gl = this.gl;
    const s  = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      throw new Error('Shader compile error');
    }
    return s;
  }

  _link(vs, fs) {
    const gl = this.gl;
    const p  = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(p));
      throw new Error('Program link error');
    }
    return p;
  }

  _setupGeometry() {
    const gl   = this.gl;
    const verts = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
    const inds  = new Uint16Array([0,1,2,2,1,3]);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    this.ebo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, inds, gl.STATIC_DRAW);
  }

  _bindAttribs() {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(this.aPosLoc);
    gl.vertexAttribPointer(this.aPosLoc, 2, gl.FLOAT, false, 0, 0);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width  = Math.floor(window.innerWidth  * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.canvas.style.width  = window.innerWidth  + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  setQuality(q) {
    this.quality = q;
    if      (q === 'high')   { this.maxSteps = 150; this.epsFactor = 0.001; }
    else if (q === 'medium') { this.maxSteps = 100; this.epsFactor = 0.002; }
    else                     { this.maxSteps =  60; this.epsFactor = 0.004; }
  }

  setPreset(p) {
    const P = {
      clasico:  { zoom: 3.5, rotX:  0.20, rotY: 0.0,  power:  8, iter: 12, color: 0 },
      ecuador:  { zoom: 2.8, rotX:  0.05, rotY: 0.6,  power:  8, iter: 14, color: 3 },
      polo:     { zoom: 2.8, rotX:  1.35, rotY: 0.4,  power:  8, iter: 14, color: 2 },
      triada:   { zoom: 3.5, rotX:  0.35, rotY: 0.9,  power:  3, iter: 18, color: 1 },
      armadura: { zoom: 3.0, rotX:  0.45, rotY: 1.3,  power:  6, iter: 16, color: 4 },
      cristal:  { zoom: 3.5, rotX:  0.20, rotY: 0.7,  power: 10, iter: 14, color: 5 },
    };
    const cfg = P[p];
    if (!cfg) return;
    this.targetZoom = cfg.zoom;
    this.rotationX  = cfg.rotX;
    this.rotationY  = cfg.rotY;
    this.power      = cfg.power;
    this.iterations = cfg.iter;
    this.colorMode  = cfg.color;
  }

  render(now) {
    const gl = this.gl;
    if (this.autoRotate) this.rotationY += 0.004;

    // Interpolación suave de zoom y punto de mira
    this.zoom      += (this.targetZoom      - this.zoom)      * 0.1;
    this.target[0] += (this.targetTarget[0] - this.target[0]) * 0.1;
    this.target[1] += (this.targetTarget[1] - this.target[1]) * 0.1;
    this.target[2] += (this.targetTarget[2] - this.target[2]) * 0.1;

    // Posición de cámara desde coordenadas esféricas
    const r = this.zoom;
    this.cameraPos[0] = this.target[0] + r * Math.sin(this.rotationY) * Math.cos(this.rotationX);
    this.cameraPos[1] = this.target[1] + r * Math.sin(this.rotationX);
    this.cameraPos[2] = this.target[2] + r * Math.cos(this.rotationY) * Math.cos(this.rotationX);

    gl.useProgram(this.program);

    const proj  = this._perspective(60, this.canvas.width / this.canvas.height, 0.01, 200.0);
    const view  = this._lookAt(this.cameraPos, this.target, this.up);
    const pv    = this._mulMat4(proj, view);
    const invPV = this._invertMat4(pv);

    gl.uniformMatrix4fv(this.uInvProjView, false, invPV);
    gl.uniform3fv (this.uCameraPos,  this.cameraPos);
    gl.uniform1f  (this.uPower,      this.power);
    gl.uniform1i  (this.uIterations, this.iterations);
    gl.uniform1i  (this.uColorMode,  this.colorMode);
    gl.uniform1f  (this.uTime,       now - this.startTime);
    gl.uniform1f  (this.uZoom,       this.zoom);
    gl.uniform1i  (this.uMaxSteps,   this.maxSteps);
    gl.uniform1f  (this.uEps,        this.epsFactor);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    // FPS
    this.frameCount++;
    const elapsed = now - this.lastFpsUpdate;
    if (elapsed >= 1000) {
      this.currentFps    = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount    = 0;
      this.lastFpsUpdate = now;
    }
  }

  // ── Matemáticas de cámara ─────────────────────────────────────────────
  _lookAt(eye, target, up) {
    const z = this._normalize([eye[0]-target[0], eye[1]-target[1], eye[2]-target[2]]);
    const x = this._normalize(this._cross(up, z));
    const y = this._normalize(this._cross(z, x));
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -this._dot(x,eye), -this._dot(y,eye), -this._dot(z,eye), 1
    ]);
  }

  _perspective(fovy, aspect, near, far) {
    const f = 1.0 / Math.tan(fovy * Math.PI / 360.0);
    const d = near - far;
    return new Float32Array([
      f/aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far+near)/d, -1,
      0, 0, (2*far*near)/d, 0
    ]);
  }

  _mulMat4(a, b) {
    const o = new Float32Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k*4+j] * b[i*4+k];
      o[i*4+j] = s;
    }
    return o;
  }

  _invertMat4(m) {
    const mat = Array.from(m);
    const id  = new Float32Array(16);
    for (let i = 0; i < 16; i++) id[i] = (i%5===0) ? 1 : 0;
    for (let i = 0; i < 4; i++) {
      let pivot = i;
      for (let r = i; r < 4; r++) if (Math.abs(mat[r*4+i]) > Math.abs(mat[pivot*4+i])) pivot = r;
      if (pivot !== i) for (let c = 0; c < 4; c++) {
        let t = mat[i*4+c]; mat[i*4+c] = mat[pivot*4+c]; mat[pivot*4+c] = t;
        let u = id[i*4+c];  id[i*4+c]  = id[pivot*4+c];  id[pivot*4+c] = u;
      }
      const div = mat[i*4+i];
      if (Math.abs(div) < 1e-12) return id;
      for (let c = 0; c < 4; c++) { mat[i*4+c] /= div; id[i*4+c] /= div; }
      for (let r = 0; r < 4; r++) if (r !== i) {
        const mul = mat[r*4+i];
        for (let c = 0; c < 4; c++) { mat[r*4+c] -= mul*mat[i*4+c]; id[r*4+c] -= mul*id[i*4+c]; }
      }
    }
    return id;
  }

  _dot(a, b)      { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
  _cross(a, b)    { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
  _normalize(v)   { const l = Math.hypot(v[0],v[1],v[2]) || 1; return [v[0]/l,v[1]/l,v[2]/l]; }
}

/* ===================== APP WIRING ===================== */
(function () {
  const canvas = document.getElementById('canvas');
  let renderer;

  try {
    renderer = new MandelbulbRenderer(canvas);
  } catch (err) {
    document.getElementById('status').textContent = err.message;
    return;
  }

  // Referencias UI
  const powerEl   = document.getElementById('power');
  const iterEl    = document.getElementById('iterations');
  const colorEl   = document.getElementById('colorMode');
  const qualityEl = document.getElementById('quality');
  const autoBtn   = document.getElementById('autoRotate');
  const statusEl  = document.getElementById('status');

  // Sincronización inicial
  powerEl.value = renderer.power;
  document.getElementById('powerLabel').textContent = parseFloat(renderer.power).toFixed(1);
  iterEl.value  = renderer.iterations;
  document.getElementById('iterLabel').textContent  = renderer.iterations;
  qualityEl.value = 'high';
  renderer.setQuality('high');
  document.getElementById('qualityLabel').textContent = 'Alta';

  // Controles de parámetros
  powerEl.addEventListener('input', () => {
    renderer.power = parseFloat(powerEl.value);
    document.getElementById('powerLabel').textContent = parseFloat(powerEl.value).toFixed(1);
  });

  iterEl.addEventListener('input', () => {
    renderer.iterations = parseInt(iterEl.value);
    document.getElementById('iterLabel').textContent = iterEl.value;
  });

  colorEl.addEventListener('change', () => {
    renderer.colorMode = parseInt(colorEl.value);
  });

  qualityEl.addEventListener('change', () => {
    renderer.setQuality(qualityEl.value);
    document.getElementById('qualityLabel').textContent =
      { high: 'Alta', medium: 'Media', low: 'Baja' }[qualityEl.value];
  });

  document.getElementById('reset').addEventListener('click', () => {
    renderer.rotationX    = 0.2;
    renderer.rotationY    = 0;
    renderer.zoom         = 3.5;
    renderer.targetZoom   = 3.5;
    renderer.target       = [0,0,0];
    renderer.targetTarget = [0,0,0];
  });

  autoBtn.addEventListener('click', () => {
    renderer.autoRotate = !renderer.autoRotate;
    autoBtn.textContent = renderer.autoRotate ? 'Detener' : '▶ Rotar';
    autoBtn.classList.toggle('active', renderer.autoRotate);
  });

  // Presets
  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      renderer.setPreset(btn.dataset.preset);
      colorEl.value = renderer.colorMode;
      powerEl.value = renderer.power;
      document.getElementById('powerLabel').textContent = parseFloat(renderer.power).toFixed(1);
      iterEl.value  = renderer.iterations;
      document.getElementById('iterLabel').textContent  = renderer.iterations;
      document.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Controles de ratón
  let isDown = false, isPan = false, lastX = 0, lastY = 0;

  canvas.addEventListener('mousedown', (e) => {
    isDown = true;
    isPan  = e.shiftKey;
    lastX  = e.clientX;
    lastY  = e.clientY;
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('mouseup', () => {
    isDown = false;
    isPan  = false;
    canvas.style.cursor = 'auto';
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    if (isPan) {
      const panSpeed = 0.004 * renderer.zoom;
      const fwd   = [renderer.target[0]-renderer.cameraPos[0],
                     renderer.target[1]-renderer.cameraPos[1],
                     renderer.target[2]-renderer.cameraPos[2]];
      const right = renderer._normalize(renderer._cross(fwd, renderer.up));
      renderer.target[0] -= (right[0]*dx - renderer.up[0]*dy) * panSpeed;
      renderer.target[1] -= (right[1]*dx - renderer.up[1]*dy) * panSpeed;
      renderer.target[2] -= (right[2]*dx - renderer.up[2]*dy) * panSpeed;
      renderer.targetTarget = [...renderer.target];
    } else {
      renderer.rotationY += dx * 0.005;
      renderer.rotationX  = Math.max(-Math.PI/2,
        Math.min(Math.PI/2, renderer.rotationX + dy * 0.005));
    }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    renderer.zoom      *= e.deltaY > 0 ? 1.05 : 0.95;
    renderer.zoom       = Math.max(0.5, Math.min(30.0, renderer.zoom));
    renderer.targetZoom = renderer.zoom;
  }, { passive: false });

  canvas.addEventListener('dblclick', () => {
    renderer.target       = [0,0,0];
    renderer.targetTarget = [0,0,0];
  });

  // Touch (móvil)
  let lastTouchDist = 0;
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) { lastX = e.touches[0].clientX; lastY = e.touches[0].clientY; }
    else if (e.touches.length === 2) {
      lastTouchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const dx = e.touches[0].clientX - lastX;
      const dy = e.touches[0].clientY - lastY;
      lastX = e.touches[0].clientX;
      lastY = e.touches[0].clientY;
      renderer.rotationY += dx * 0.005;
      renderer.rotationX  = Math.max(-Math.PI/2, Math.min(Math.PI/2, renderer.rotationX + dy * 0.005));
    } else if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      renderer.zoom *= d > lastTouchDist ? 0.98 : 1.02;
      renderer.zoom  = Math.max(0.5, Math.min(30.0, renderer.zoom));
      renderer.targetZoom = renderer.zoom;
      lastTouchDist = d;
    }
  }, { passive: false });

  // Overlay de ayuda
  document.getElementById('helpClose').addEventListener('click', () => {
    document.getElementById('helpOverlay').classList.remove('visible');
  });
  document.getElementById('helpOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('visible');
  });

  // Menú toggle
  document.getElementById('menuToggle').addEventListener('click', () => {
    const ui = document.getElementById('ui');
    ui.style.display = ui.style.display === 'none' ? 'block' : 'none';
  });

  // Atajos de teclado
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'u') {
      ['ui', 'footer', 'menuToggle', 'status'].forEach(id => {
        const el = document.getElementById(id);
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
      });
    }
    if (e.key.toLowerCase() === 'c') {
      const sel = document.getElementById('colorMode');
      sel.value = (parseInt(sel.value) + 1) % sel.options.length;
      sel.dispatchEvent(new Event('change'));
    }
    if (e.key === '+' || e.key === '=') {
      iterEl.value = Math.min(parseInt(iterEl.value) + 1, iterEl.max);
      iterEl.dispatchEvent(new Event('input'));
    }
    if (e.key === '-' || e.key === '_') {
      iterEl.value = Math.max(parseInt(iterEl.value) - 1, iterEl.min);
      iterEl.dispatchEvent(new Event('input'));
    }
    if (e.key.toLowerCase() === 'q') {
      qualityEl.selectedIndex = (qualityEl.selectedIndex + 1) % qualityEl.options.length;
      qualityEl.dispatchEvent(new Event('change'));
    }
    if (e.key.toLowerCase() === 'p') {
      const step = 0.5;
      powerEl.value = e.shiftKey
        ? Math.max(parseFloat(powerEl.min), parseFloat(powerEl.value) - step).toFixed(1)
        : Math.min(parseFloat(powerEl.max), parseFloat(powerEl.value) + step).toFixed(1);
      powerEl.dispatchEvent(new Event('input'));
    }
    if (e.key.toLowerCase() === 'r') autoBtn.click();
    if (e.key.toLowerCase() === 'h') {
      document.getElementById('helpOverlay').classList.toggle('visible');
    }
  });

  // Loop de animación
  function loop(now) {
    renderer.render(now);
    statusEl.innerHTML = `<span class="fps">${renderer.currentFps} FPS</span> • ` +
      `Zoom: ${renderer.zoom.toFixed(2)} • Iter: ${renderer.iterations} • Pot: ${renderer.power.toFixed(1)}`;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Preset inicial
  setTimeout(() => {
    renderer.setPreset('clasico');
    colorEl.value = renderer.colorMode;
  }, 150);
})();
