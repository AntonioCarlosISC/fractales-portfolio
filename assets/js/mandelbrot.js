class MandelbrotRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', { precision: 'highp' });
    if (!this.gl) throw new Error('WebGL2 no está disponible en tu navegador.');

    // Parámetros de navegación
    this.zoomSpeed     = 1.005;
    this.pathX         = 0.00263;
    this.pathY         = -0.00305;
    this.colorMode     = 0;
    this.maxIterations = 500;

    // Estado de vista
    this.zoom         = 1.0;
    this.targetZoom   = 1.0;
    this.offset       = [0.0, 0.0];
    this.targetOffset = [0.0, 0.0];
    this.aspectRatio  = 1;
    this.zoomDepth    = 1;

    // Auto-zoom
    this.autoZoomEnabled    = false;
    this._autoZoomTimeoutId = null;

    this._rafCallback = () => {
      this.zoom      += (this.targetZoom      - this.zoom)      * 0.1;
      this.offset[0] += (this.targetOffset[0] - this.offset[0]) * 0.1;
      this.offset[1] += (this.targetOffset[1] - this.offset[1]) * 0.1;
      this.render();
      requestAnimationFrame(this._rafCallback);
    };

    this._initGL();
    this._setupGeometry();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  _initGL() {
    const gl = this.gl;

    const vertSrc = `#version 300 es
      in vec2 a_position;
      out vec2 v_uv;
      void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_uv = a_position * 0.5 + 0.5;
      }
    `;

    const fragSrc = `#version 300 es
      precision highp float;
      in vec2 v_uv;
      out vec4 outColor;

      uniform float u_zoom;
      uniform vec2  u_offset;
      uniform float u_aspect;
      uniform int   u_colorMode;
      uniform int   u_maxIter;

      const float PI = 3.141592653589793;

      vec3 palettePsycho(float t, float time) {
        float r = 0.5 + 0.5 * cos(6.0*PI*t + 0.1*time + 0.5) *
                  sin(3.0*PI*t + 0.2*time) * cos(9.0*PI*t + 0.3*time);
        float g = 0.5 + 0.5 * sin(4.0*PI*t + 0.4*time) *
                  cos(7.0*PI*t + 0.5*time) * sin(5.0*PI*t + 0.6*time);
        float b = 0.5 + 0.5 * cos(8.0*PI*t + 0.7*time) *
                  sin(6.0*PI*t + 0.8*time) * cos(4.0*PI*t + 0.9*time);
        return vec3(r*r, g*g, b*b);
      }

      vec3 paletteFire(float t) {
        return vec3(t * 0.7 + 0.2, t * t * 0.7, pow(t, 5.3) * 0.4);
      }

      vec3 paletteOcean(float t) {
        return vec3(
          0.2 + 0.5 * cos(2.0*PI*t + 1.5),
          0.3 + 0.5 * cos(2.0*PI*t + 2.0),
          0.7 + 0.3 * sin(2.0*PI*t + 3.0)
        );
      }

      vec3 paletteNeon(float t) {
        return vec3(
          0.7 + 0.5 * sin(2.0*PI*t * 5.0),
          0.5 + 0.5 * cos(2.0*PI*t * 3.0 + 1.0),
          0.3 + 0.7 * sin(2.0*PI*t * 7.0 + 2.0)
        );
      }

      vec3 paletteGreen(float t) {
        return vec3(
          0.15 + 0.03 * cos(2.0 * PI * t * t),
          0.35 + 0.45 * cos(2.0 * PI * t + 3.0),
          0.08 + 0.07 * sin(2.0 * PI * t + 1.0)
        );
      }

      void main() {
        vec2 c = (v_uv - 0.5) * vec2(4.0/u_zoom, (4.0/u_zoom)/u_aspect) - u_offset;
        vec2 z = vec2(0.0, 0.0);
        int iterations = 0;

        for (int i = 0; i < u_maxIter; i++) {
          if (z.x*z.x + z.y*z.y > 256.0) break;
          float xtemp = z.x*z.x - z.y*z.y + c.x;
          z.y = 2.0*z.x*z.y + c.y;
          z.x = xtemp;
          iterations++;
        }

        if (iterations == u_maxIter) {
          outColor = vec4(0.0, 0.0, 0.0, 1.0);
        } else {
          float smoothed = float(iterations) - log(log(length(z))) / log(2.0);
          float colorT = sqrt(smoothed / float(u_maxIter));

          vec3 color;
          if (u_colorMode == 0) {
            color = paletteOcean(colorT);
          } else if (u_colorMode == 1) {
            color = paletteFire(colorT) * 2.0;
          } else if (u_colorMode == 2) {
            float time = float(u_zoom) * 0.01;
            color = palettePsycho(colorT * 2.0, time) * (1.0 + 0.5 * sin(time));
          } else if (u_colorMode == 3) {
            color = paletteNeon(colorT) * 1.5;
          } else {
            color = paletteGreen(colorT) * 1.75;
          }

          vec3 saturated = mix(color, color * color * 3.0, 0.7);
          outColor = vec4(saturated, 1.0);
        }
      }
    `;

    this.program = this._createProgram(vertSrc, fragSrc);
    const p = this.program;
    this._loc = {
      position:  gl.getAttribLocation(p, 'a_position'),
      zoom:      gl.getUniformLocation(p, 'u_zoom'),
      offset:    gl.getUniformLocation(p, 'u_offset'),
      aspect:    gl.getUniformLocation(p, 'u_aspect'),
      colorMode: gl.getUniformLocation(p, 'u_colorMode'),
      maxIter:   gl.getUniformLocation(p, 'u_maxIter'),
    };
  }

  _createProgram(vertSrc, fragSrc) {
    const gl = this.gl;
    const vert = this._compileShader(gl.VERTEX_SHADER, vertSrc);
    const frag = this._compileShader(gl.FRAGMENT_SHADER, fragSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vert);
    gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error('Error al linkear el programa: ' + gl.getProgramInfoLog(prog));
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    return prog;
  }

  _compileShader(type, source) {
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
      throw new Error('Error al compilar shader: ' + gl.getShaderInfoLog(s));
    return s;
  }

  _setupGeometry() {
    const gl = this.gl;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, 1,1, -1,1]), gl.STATIC_DRAW);
    gl.vertexAttribPointer(this._loc.position, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(this._loc.position);
    gl.bindVertexArray(null);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.aspectRatio   = w / h;
    this.canvas.width  = w;
    this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
  }

  render() {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.uniform1f(this._loc.zoom,      this.zoom);
    gl.uniform2fv(this._loc.offset,   this.offset);
    gl.uniform1f(this._loc.aspect,    this.aspectRatio);
    gl.uniform1i(this._loc.colorMode, this.colorMode);
    gl.uniform1i(this._loc.maxIter,   this.maxIterations);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
    gl.bindVertexArray(null);
  }

  animate() {
    requestAnimationFrame(this._rafCallback);
  }

  startAutoZoom() {
    this.autoZoomEnabled = true;
    this._autoZoomStep();
  }

  stopAutoZoom() {
    this.autoZoomEnabled = false;
    clearTimeout(this._autoZoomTimeoutId);
    this._autoZoomTimeoutId = null;
  }

  _autoZoomStep() {
    if (!this.autoZoomEnabled) return;
    this.targetZoom      *= this.zoomSpeed;
    this.zoomDepth       *= this.zoomSpeed;
    this.targetOffset[0] += this.pathX / this.targetZoom;
    this.targetOffset[1] += this.pathY / this.targetZoom;
    this.maxIterations = Math.min(2000, 500 + Math.floor(Math.log(this.zoomDepth) * 50));
    this._autoZoomTimeoutId = setTimeout(() => this._autoZoomStep(), 20);
  }

  resetView() {
    this.stopAutoZoom();
    this.targetZoom   = 1.0;
    this.zoomDepth    = 1;
    this.targetOffset = [0.0, 0.0];
    this.maxIterations = 500;
  }
}

/* ===================== APP WIRING ===================== */
(function () {
  const canvas = document.getElementById('mandelbrotCanvas');
  let renderer;

  try {
    renderer = new MandelbrotRenderer(canvas);
  } catch (err) {
    document.getElementById('status').textContent = err.message;
    return;
  }

  document.getElementById('status').textContent = '';

  const zoomLevelEl   = document.getElementById('zoomLevel');
  const toggleZoomBtn = document.getElementById('toggleZoom');
  const colorModeEl   = document.getElementById('colorMode');

  // Menú móvil
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('controls').classList.toggle('open');
  });

  renderer.animate();

  document.getElementById('zoomSpeed').addEventListener('input', (e) => {
    renderer.zoomSpeed = 1.0 + parseInt(e.target.value) / 1000;
    document.getElementById('zoomSpeedValue').textContent = e.target.value;
  });

  document.getElementById('pathX').addEventListener('input', (e) => {
    renderer.pathX = parseInt(e.target.value) / 100000;
    document.getElementById('pathXValue').textContent = e.target.value;
  });

  document.getElementById('pathY').addEventListener('input', (e) => {
    renderer.pathY = parseInt(e.target.value) / 100000;
    document.getElementById('pathYValue').textContent = e.target.value;
  });

  colorModeEl.addEventListener('change', (e) => {
    renderer.colorMode = parseInt(e.target.value);
    if (e.target.value === '2') {
      alert('⚠️ Advertencia: El modo \'Psicodélico Extremo\' puede emitir destellos rápidos e intensos durante el zoom. Si tienés sensibilidad a estímulos visuales o epilepsia fotosensible, se recomienda evitar este modo. Usalo bajo tu responsabilidad.');
    }
  });

  toggleZoomBtn.addEventListener('click', () => {
    if (renderer.autoZoomEnabled) {
      renderer.stopAutoZoom();
      toggleZoomBtn.textContent = 'Reanudar Zoom';
    } else {
      renderer.startAutoZoom();
      toggleZoomBtn.textContent = 'Pausar Zoom';
    }
  });

  document.getElementById('resetView').addEventListener('click', () => {
    renderer.resetView();
    toggleZoomBtn.textContent = 'Reanudar Zoom';
  });

  // Controles de ratón
  let isDragging = false, lastX, lastY;

  canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    renderer.stopAutoZoom();
    toggleZoomBtn.textContent = 'Reanudar Zoom';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    renderer.targetOffset[0] += dx * 2.0 / (canvas.width  * renderer.zoom);
    renderer.targetOffset[1] += dy * 2.0 / (canvas.height * renderer.zoom);
  });

  window.addEventListener('mouseup', () => { isDragging = false; });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    renderer.stopAutoZoom();
    toggleZoomBtn.textContent = 'Reanudar Zoom';
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const mx = e.clientX / canvas.width  * 2.0 - 1.0;
    const my = 1.0 - e.clientY / canvas.height * 2.0;
    renderer.targetOffset[0] -= mx * (1.0 - factor) / renderer.zoom;
    renderer.targetOffset[1] -= my * (1.0 - factor) / renderer.zoom;
    renderer.targetZoom  *= factor;
    renderer.zoomDepth   *= factor;
    renderer.maxIterations = Math.min(2000, 500 + Math.floor(Math.log(renderer.zoomDepth) * 50));
  }, { passive: false });

  setInterval(() => {
    zoomLevelEl.textContent = `Zoom: ${renderer.zoomDepth.toExponential(2)}x`;
  }, 100);
})();
