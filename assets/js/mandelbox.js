/* ===================================================================
   Mandelbox 3D — Versión Psicodélica y Terror Fractal
   - 8 nuevas paletas visuales extremas
   - Efectos especiales por modo
   - Presets optimizados para cada estilo
   ===================================================================*/

class MandelboxRenderer {
  constructor(canvas){
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', {antialias:true, alpha:false});
    if(!this.gl) throw new Error('WebGL2 no disponible');

    // Estado de la cámara
    this.cameraPos = [0,0,5];
    this.target = [0,0,0];
    this.up = [0,1,0];
    this.rotationX = 0; 
    this.rotationY = 0;
    this.zoom = 5.0;

    // Interpolación suave
    this.targetCameraPos = [...this.cameraPos];
    this.targetTarget = [...this.target];
    this.targetZoom = this.zoom;

    // Parámetros fractal
    this.scale = 2.0; 
    this.iterations = 18; 
    this.colorMode = 0;

    // Performance/quality
    this.quality = 'high';
    this.maxSteps = 200;
    this.epsFactor = 0.0008;

    this.autoRotate = false;
    this.startTime = performance.now();
    
    // FPS tracking
    this.frameCount = 0;
    this.lastFpsUpdate = performance.now();
    this.currentFps = 60;

    this._initGL();
    this._setupGeometry();
    this._bindUniforms();
    this.resize();
    window.addEventListener('resize', ()=>this.resize());
  }

  _initGL(){
    // Vertex shader (fullscreen quad)
    const vs = `#version 300 es
      precision highp float;
      in vec2 aPos;
      out vec3 vPosition;
      uniform mat4 uInvProjView;
      void main(){
        vec4 clip = vec4(aPos, 0.0, 1.0);
        vec4 world = uInvProjView * clip;
        world /= world.w;
        vPosition = world.xyz;
        gl_Position = vec4(aPos, 0.0, 1.0);
      }
    `;

    // Fragment shader con NUEVAS PALETAS
    const fs = `#version 300 es
      precision highp float;
      in vec3 vPosition;
      out vec4 fragColor;

      uniform vec3 uCameraPos;
      uniform float uScale;
      uniform int uIterations;
      uniform int uColorMode;
      uniform float uTime;
      uniform float uZoom;
      uniform int uMaxSteps;
      uniform float uEps;

      const float PI = 3.141592653589793;

      // Distance Estimator del Mandelbox
      float mandelboxDE(vec3 z){
        float scale = uScale;
        float fixedRadius2 = 1.0;
        float minRadius2 = 0.25;
        float dr = 1.0;
        vec3 offset = z;

        for(int n=0;n<1000;n++){
          if(n>=uIterations) break;
          // box fold
          z = clamp(z, -1.0, 1.0) * 2.0 - z;
          // sphere fold
          float r2 = dot(z,z);
          if(r2 < minRadius2) z *= (fixedRadius2 / minRadius2);
          else if(r2 < fixedRadius2) z *= (fixedRadius2 / r2);
          z = z * scale + offset;
          dr = dr * abs(scale) + 1.0;
          if(dot(z,z) > 1e6) break;
        }
        return length(z)/abs(dr);
      }

      // Normal via central differences
      vec3 calcNormal(vec3 p){
        float h = uEps * 0.5;
        vec2 e = vec2(1.0,-1.0);
        return normalize(
          e.xyy*mandelboxDE(p + e.xyy*h) + 
          e.yyx*mandelboxDE(p + e.yyx*h) + 
          e.yxy*mandelboxDE(p + e.yxy*h) + 
          e.xxx*mandelboxDE(p + e.xxx*h)
        );
      }

      // Soft shadow
      float softShadow(vec3 ro, vec3 rd){
        float res = 1.0;
        float t = 0.02;
        for(int i=0;i<60;i++){
          float h = mandelboxDE(ro + rd * t);
          if(h < 0.001) return 0.0;
          res = min(res, 8.0 * h / t);
          t += clamp(h, 0.02, 0.2);
          if(t > 50.0) break;
        }
        return clamp(res, 0.0, 1.0);
      }

      // ========== PALETAS ORIGINALES ==========
      vec3 neonGalactic(float t, vec3 pos){ 
        return vec3(
          0.7+0.5*sin(t*3.0 + pos.x*2.0 + uTime*0.001), 
          0.5+0.5*cos(t*2.5+pos.y*3.0), 
          1.0-0.5*sin(t*4.0+pos.z*2.0)
        ); 
      }

      vec3 fireLava(float t){ 
        return vec3(1.0, 0.4 + t*0.6, 0.05*t); 
      }

      vec3 deepOcean(float t, vec3 pos){ 
        return vec3(
          0.2 + 0.5*cos(t*2.0 + pos.x*0.5), 
          0.3 + 0.5*sin(t*3.0 + pos.y*0.7), 
          0.7 + 0.3*sin(t*5.0 + pos.z)
        ); 
      }

      vec3 alien(float t, vec3 pos){ 
        return vec3(
          0.5 + 0.5*sin(t*7.0 + pos.z*2.0 + uTime*0.001), 
          0.5 + 0.5*cos(t*5.0 + pos.x*3.0), 
          0.5 + 0.5*sin(t*3.0 + pos.y*4.0)
        ); 
      }

      // ========== PALETAS PSICODÉLICAS ==========
      
      // Arcoíris Infinito - colores saturados que fluyen
      vec3 psychedelicRainbow(float t, vec3 pos){
        float time = uTime * 0.0003;
        float phase1 = t * 8.0 + pos.x * 4.0 + time * 3.0;
        float phase2 = t * 11.0 + pos.y * 5.0 + time * 5.0;
        float phase3 = t * 13.0 + pos.z * 6.0 + time * 7.0;
        
        return vec3(
          0.5 + 0.5 * sin(phase1),
          0.5 + 0.5 * sin(phase2 + 2.094), // +120°
          0.5 + 0.5 * sin(phase3 + 4.189)  // +240°
        );
      }

      // Vórtice Hipnótico - espiral que arrastra la mirada
      vec3 psychedelicVortex(float t, vec3 pos){
        float time = uTime * 0.0005;
        float angle = atan(pos.x, pos.z);
        float radius = length(pos.xz);
        float spiral = angle * 3.0 + radius * 2.0 + time * 10.0;
        
        return vec3(
          0.5 + 0.5 * cos(spiral + t * 15.0),
          0.5 + 0.5 * sin(spiral * 1.3 + t * 12.0 + 1.57),
          0.5 + 0.5 * cos(spiral * 0.7 + t * 18.0 + 3.14)
        );
      }

      // Plasma Cósmico - ondas de energía pura
      vec3 psychedelicPlasma(float t, vec3 pos){
        float time = uTime * 0.0004;
        float p1 = sin(pos.x * 3.0 + time * 2.0);
        float p2 = cos(pos.y * 4.0 + time * 3.0);
        float p3 = sin(pos.z * 2.5 + time * 4.0);
        float plasma = (p1 + p2 + p3) * 0.333 + t * 5.0;
        
        return vec3(
          0.5 + 0.5 * sin(plasma * 2.0),
          0.5 + 0.5 * sin(plasma * 3.0 + 2.0),
          0.5 + 0.5 * sin(plasma * 4.0 + 4.0)
        );
      }

      // Ácido Cuántico - caos colorido organizado
      vec3 psychedelicAcid(float t, vec3 pos){
        float time = uTime * 0.0006;
        float wave = sin(pos.x * 2.0 + time) * 
                     cos(pos.y * 2.0 + time * 1.5) * 
                     sin(pos.z * 2.0 + time * 2.0);
        
        return vec3(
          0.5 + 0.5 * sin(t * 20.0 + wave * 10.0 + time * 5.0),
          0.5 + 0.5 * cos(t * 25.0 + wave * 12.0 + time * 7.0),
          0.5 + 0.5 * sin(t * 30.0 + wave * 15.0 + time * 9.0)
        );
      }

      // ========== PALETAS DE TERROR ==========
      
      // Sangre Coagulada - rojo viscoso y palpitante
      vec3 horrorBlood(float t, vec3 pos){
        float pulse = sin(uTime * 0.002) * 0.5 + 0.5;
        float veins = sin(pos.x * 20.0) * sin(pos.y * 20.0) * sin(pos.z * 20.0);
        float darkening = 1.0 - t * 0.3;
        
        return vec3(
          (0.8 + 0.2 * sin(t * 10.0 + veins * 5.0)) * darkening,
          (0.05 + 0.05 * t * pulse) * darkening,
          0.02 * darkening
        );
      }

      // Vacío Abismal - oscuridad con destellos espectrales
      vec3 horrorVoid(float t, vec3 pos){
        float flicker = sin(uTime * 0.01 + t * 50.0) * 0.5 + 0.5;
        float depth = 1.0 - t * 0.8;
        float spectral = sin(pos.y * 10.0 + uTime * 0.003) * 0.5 + 0.5;
        
        return vec3(
          0.1 * depth * flicker,
          0.05 * depth * spectral,
          0.15 * depth * (1.0 - flicker * 0.5)
        );
      }

      // Descomposición - tonos verdes enfermizos
      vec3 horrorDecay(float t, vec3 pos){
        float rot = sin(pos.x * 5.0 + uTime * 0.001) * cos(pos.y * 5.0);
        float mold = sin(pos.z * 8.0 + uTime * 0.002) * 0.5 + 0.5;
        
        return vec3(
          0.3 + 0.2 * sin(t * 8.0 + rot * 3.0),
          0.4 + 0.3 * cos(t * 6.0 + rot * 2.0) * (0.7 + mold * 0.3),
          0.2 + 0.1 * sin(t * 4.0)
        ) * (0.6 + t * 0.4);
      }

      // Espectro Fantasmal - blanco etéreo y translúcido
      vec3 horrorGhost(float t, vec3 pos){
        float wisp = sin(pos.x * 3.0 + uTime * 0.002) * 
                     cos(pos.z * 3.0 + uTime * 0.003);
        float ethereal = 0.3 + 0.7 * t;
        
        return vec3(
          0.7 + 0.3 * sin(t * 15.0 + wisp * 10.0),
          0.8 + 0.2 * cos(t * 12.0 + wisp * 8.0),
          0.9 + 0.1 * sin(t * 10.0 + wisp * 6.0)
        ) * ethereal;
      }

      void main(){
        vec3 rayDir = normalize(vPosition - uCameraPos);
        vec3 rayPos = uCameraPos;
        float totalDist = 0.0;
        bool hit = false;
        float dist = 0.0;

        float eps = max(1e-4, uEps * uZoom);
        int steps = 0;
        float maxDist = 200.0;

        // Raymarch principal
        for(steps=0; steps < uMaxSteps; steps++){
          dist = mandelboxDE(rayPos);
          totalDist += dist;
          if(dist < eps){ 
            hit = true; 
            break; 
          }
          rayPos += rayDir * dist * (dist>1.0 ? 0.85 : 1.0);
          if(totalDist > maxDist) break;
        }

        vec3 color = vec3(0.0);
        
        if(hit){
          vec3 N = calcNormal(rayPos);
          
          // Luz principal animada más intensa
          vec3 L = normalize(vec3(sin(uTime*0.0007), 0.8, cos(uTime*0.0009)));
          vec3 V = normalize(uCameraPos - rayPos);

          // Iluminación difusa mejorada - más rango dinámico
          float diff = max(0.3, dot(N, L)); // Aumentado de 0.1 a 0.3
          float sh = softShadow(rayPos + N*eps*2.0, L);
          
          // Luz de relleno (fill light) para iluminar áreas oscuras
          vec3 L2 = normalize(vec3(-sin(uTime*0.0005), -0.5, -cos(uTime*0.0006)));
          float fillLight = max(0.0, dot(N, L2)) * 0.4;
          
          // Luz ambiental mejorada con variación de color
          float ambientBase = 0.35; // Aumentado de 0.1 para más luz base
          vec3 ambientColor = vec3(0.5, 0.6, 0.8); // Azul claro ambiental
          float ambient = ambientBase + sin(uTime * 0.0003) * 0.1;

          // Blinn-Phong specular más brillante
          vec3 H = normalize(L+V);
          float spec = pow(max(dot(N,H),0.0), 40.0) * 0.8; // Más ancho y brillante

          float iterFactor = float(steps)/float(max(1,uIterations));

          // ===== SELECTOR DE PALETAS =====
          if(uColorMode==0) color = neonGalactic(iterFactor, rayPos);
          else if(uColorMode==1) color = fireLava(iterFactor);
          else if(uColorMode==2) color = deepOcean(iterFactor, rayPos);
          else if(uColorMode==3) color = alien(iterFactor, rayPos);
          // Psicodélicos
          else if(uColorMode==4) color = psychedelicRainbow(iterFactor, rayPos);
          else if(uColorMode==5) color = psychedelicVortex(iterFactor, rayPos);
          else if(uColorMode==6) color = psychedelicPlasma(iterFactor, rayPos);
          else if(uColorMode==7) color = psychedelicAcid(iterFactor, rayPos);
          // Terror
          else if(uColorMode==8) color = horrorBlood(iterFactor, rayPos);
          else if(uColorMode==9) color = horrorVoid(iterFactor, rayPos);
          else if(uColorMode==10) color = horrorDecay(iterFactor, rayPos);
          else color = horrorGhost(iterFactor, rayPos);

          // AO mejorado - más suave
          float ao = clamp(1.0 - dist*2.0, 0.5, 1.0); // Más luminoso

          // ===== EFECTOS ESPECIALES POR MODO =====
          if(uColorMode >= 4 && uColorMode <= 7) {
            // MODO PSICODÉLICO: Súper brillante con múltiples luces
            vec3 lighting = color * (ambient * ambientColor + diff * 0.7 + fillLight * 0.5);
            lighting *= (0.8 + sh * 0.2); // Sombras muy suaves
            lighting *= ao;
            lighting += vec3(spec * 1.5); // Specular muy brillante
            
            // Edge glow psicodélico
            float edge = 1.0 - smoothstep(0.0, eps*5.0, dist);
            color = mix(lighting, lighting * 3.0, edge * 0.8);
            
          } else if(uColorMode >= 8 && uColorMode <= 11) {
            // MODO TERROR: Contrastes dramáticos
            vec3 lighting = color * (ambient * 0.3 + diff * 0.8 + fillLight * 0.2);
            lighting *= (0.5 + sh * 0.5); // Sombras moderadas
            lighting *= ao;
            lighting += vec3(spec * 0.5);
            
            // Edge con variación - a veces brilla, a veces oscurece
            float edge = 1.0 - smoothstep(0.0, eps*2.0, dist);
            float edgeFlicker = sin(uTime * 0.01 + rayPos.x * 10.0) * 0.5 + 0.5;
            color = mix(lighting, lighting * (0.5 + edgeFlicker), edge * 0.6);
            
          } else {
            // MODO NORMAL: Balance mejorado
            vec3 lighting = color * (ambient * ambientColor * 0.8 + diff * 0.6 + fillLight * 0.3);
            lighting *= (0.7 + sh * 0.3);
            lighting *= ao;
            lighting += vec3(spec * 0.8);
            
            float edge = 1.0 - smoothstep(0.0, eps*3.0, dist);
            color = mix(lighting, lighting * 2.0, edge * 0.5);
          }

          // ===== FOG SEGÚN MODO (más suave) =====
          float fog = smoothstep(50.0, maxDist, totalDist); // Comienza más lejos
          vec3 fogC = vec3(0.02, 0.02, 0.04);
          
          if(uColorMode >= 4 && uColorMode <= 7) {
            // Fog psicodélico - púrpura luminoso
            fogC = vec3(0.15, 0.08, 0.2);
          } else if(uColorMode >= 8 && uColorMode <= 11) {
            // Fog terror - gris muy oscuro en lugar de negro
            fogC = vec3(0.01, 0.01, 0.02);
          }
          
          color = mix(color, fogC, fog * 0.7); // Fog más suave

          // Gamma correction con más contraste
          color = pow(clamp(color, 0.0, 3.0), vec3(0.85)); // Más contraste (antes 0.9)
          
          // Boost de brillo general
          color *= 1.3;
          
          fragColor = vec4(color, 1.0);
          
        } else {
          // ===== BACKGROUND SEGÚN MODO =====
          vec3 bg = vec3(0.02,0.03,0.05); // Más claro
          
          if(uColorMode==1) bg = vec3(0.05,0.02,0.02);
          if(uColorMode >= 4 && uColorMode <= 7) bg = vec3(0.08, 0.04, 0.12); // Púrpura más visible
          if(uColorMode >= 8 && uColorMode <= 11) bg = vec3(0.01, 0.01, 0.02); // Gris muy oscuro
          
          fragColor = vec4(bg,1.0);
        }
      }
    `;

    const gl = this.gl;
    const vert = this._compile(gl.VERTEX_SHADER, vs);
    const frag = this._compile(gl.FRAGMENT_SHADER, fs);
    this.program = this._link(vert, frag);

    // Obtener locations
    this.aPosLoc = gl.getAttribLocation(this.program, 'aPos');
    this.uCameraPos = gl.getUniformLocation(this.program, 'uCameraPos');
    this.uScale = gl.getUniformLocation(this.program, 'uScale');
    this.uIterations = gl.getUniformLocation(this.program, 'uIterations');
    this.uColorMode = gl.getUniformLocation(this.program, 'uColorMode');
    this.uTime = gl.getUniformLocation(this.program, 'uTime');
    this.uZoom = gl.getUniformLocation(this.program, 'uZoom');
    this.uMaxSteps = gl.getUniformLocation(this.program, 'uMaxSteps');
    this.uEps = gl.getUniformLocation(this.program, 'uEps');
    this.uInvProjView = gl.getUniformLocation(this.program, 'uInvProjView');
  }

  _compile(type, source){
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)){
      console.error(gl.getShaderInfoLog(s));
      throw new Error('Shader compile error');
    }
    return s;
  }

  _link(vs, fs){
    const gl = this.gl;
    const p = gl.createProgram();
    gl.attachShader(p, vs); 
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if(!gl.getProgramParameter(p, gl.LINK_STATUS)){
      console.error(gl.getProgramInfoLog(p));
      throw new Error('Program link error');
    }
    return p;
  }

  _setupGeometry(){
    const gl = this.gl;
    const verts = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
    const inds = new Uint16Array([0,1,2,2,1,3]);

    this.vbo = gl.createBuffer(); 
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo); 
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
    
    this.ebo = gl.createBuffer(); 
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo); 
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, inds, gl.STATIC_DRAW);
  }

  _bindUniforms(){
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.enableVertexAttribArray(this.aPosLoc);
    gl.vertexAttribPointer(this.aPosLoc, 2, gl.FLOAT, false, 0, 0);
  }

  resize(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.gl.viewport(0,0,this.canvas.width,this.canvas.height);
  }

  setQuality(q){
    this.quality = q;
    if(q==='high'){ 
      this.maxSteps = 200; 
      this.epsFactor = 0.0008; 
    } else if(q==='medium'){ 
      this.maxSteps = 140; 
      this.epsFactor = 0.0016; 
    } else { 
      this.maxSteps = 90; 
      this.epsFactor = 0.003; 
    }
  }

  setPreset(p){
    // Presets originales
    if(p==='ciudadela') {
      this._setTarget([-1.39,-1.14,-0.21],[0,0,0],0.98,2.8,27,1);
    } else if(p==='biblioteca') {
      this._setTarget([1.22,1.30,-1.10],[0,0,0],2.64,2.7,27,0);
    } else if(p==='paisaje') {
      this._setTarget([-2.71,0.80,-0.03],[0,0,0],2.35,2.4,27,2);
    } else if(p==='trono') {
      this._setTarget([0.03,0.08,1.53],[0,0,0],1.54,3.0,27,2);
    }
    // Presets PSICODÉLICOS
    else if(p==='psychedelic1') {
      this._setTarget([0.5,0.5,3.0],[0,0,0],3.0,2.2,30,4);
    } else if(p==='psychedelic2') {
      this._setTarget([-1.0,1.5,-2.0],[0,0,0],2.5,2.6,35,6);
    } else if(p==='psychedelic3') {
      this._setTarget([1.8,-0.5,1.2],[0,0,0],2.2,2.4,28,5);
    } else if(p==='psychedelic4') {
      this._setTarget([-0.8,-1.2,2.8],[0,0,0],3.2,2.3,33,7);
    }
    // Presets TERROR
    else if(p==='horror1') {
      this._setTarget([0.2,-0.8,2.5],[0,0,0],2.5,2.9,25,8);
    } else if(p==='horror2') {
      this._setTarget([-1.5,0.3,1.8],[0,0,0],1.8,3.2,22,9);
    } else if(p==='horror3') {
      this._setTarget([0.9,-1.1,2.2],[0,0,0],2.3,3.0,24,10);
    } else if(p==='horror4') {
      this._setTarget([-0.6,0.9,-2.1],[0,0,0],2.1,2.8,26,11);
    }
  }

  _setTarget(camPos, target, zoom, scale, iterations, colorMode){
    this.targetCameraPos = camPos.slice();
    this.targetTarget = target.slice();
    this.targetZoom = zoom;
    this.setScaleIterations(scale, iterations);
    this.colorMode = colorMode;
    this._syncCameraRotation();
  }

  setScaleIterations(s, it){ 
    this.scale = s; 
    this.iterations = it; 
  }

  _syncCameraRotation(){
    const dx = this.cameraPos[0] - this.target[0];
    const dy = this.cameraPos[1] - this.target[1];
    const dz = this.cameraPos[2] - this.target[2];
    const z = Math.hypot(dx,dy,dz);
    this.zoom = z;
    this.rotationY = Math.atan2(dx, dz);
    this.rotationX = Math.asin(dy / Math.max(1e-6, z));
  }

  render(now){
    const gl = this.gl;
    if(this.autoRotate) this.rotationY += 0.002;

    // Smooth interpolation
    for(let i=0;i<3;i++){
      this.cameraPos[i] += (this.targetCameraPos[i] - this.cameraPos[i]) * 0.12;
      this.target[i] += (this.targetTarget[i] - this.target[i]) * 0.12;
    }
    this.zoom += (this.targetZoom - this.zoom) * 0.12;

    // Recompute camera position
    const radius = this.zoom;
    this.cameraPos[0] = this.target[0] + radius * Math.sin(this.rotationY) * Math.cos(this.rotationX);
    this.cameraPos[1] = this.target[1] + radius * Math.sin(this.rotationX);
    this.cameraPos[2] = this.target[2] + radius * Math.cos(this.rotationY) * Math.cos(this.rotationX);

    gl.useProgram(this.program);

    const proj = this._perspective(60, this.canvas.width/this.canvas.height, 0.1, 1000.0);
    const view = this._lookAt(this.cameraPos, this.target, this.up);
    const pv = this._mulMat4(proj, view);
    const invPV = this._invertMat4(pv);
    
    gl.uniformMatrix4fv(this.uInvProjView, false, invPV);
    gl.uniform3fv(this.uCameraPos, this.cameraPos);
    gl.uniform1f(this.uScale, this.scale);
    gl.uniform1i(this.uIterations, this.iterations);
    gl.uniform1i(this.uColorMode, this.colorMode);
    gl.uniform1f(this.uTime, now - this.startTime);
    gl.uniform1f(this.uZoom, this.zoom);
    gl.uniform1i(this.uMaxSteps, this.maxSteps);
    gl.uniform1f(this.uEps, this.epsFactor);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ebo);
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);

    // FPS calculation
    this.frameCount++;
    const elapsed = now - this.lastFpsUpdate;
    if(elapsed >= 1000){
      this.currentFps = Math.round((this.frameCount * 1000) / elapsed);
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }
  }

  // Math helpers
  _lookAt(eye, target, up){
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

  _perspective(fovy, aspect, near, far){
    const f = 1.0 / Math.tan(fovy * Math.PI / 360.0);
    const range = near - far;
    return new Float32Array([
      f/aspect,0,0,0,
      0,f,0,0,
      0,0,(far+near)/range,-1,
      0,0,(2*far*near)/range,0
    ]);
  }

  _mulMat4(a,b){
    const out = new Float32Array(16);
    for(let i=0;i<4;i++) for(let j=0;j<4;j++){
      let s=0; 
      for(let k=0;k<4;k++) s+= a[k*4 + j] * b[i*4 + k]; 
      out[i*4 + j] = s;
    }
    return out;
  }

  _invertMat4(m){
    const inv = new Float32Array(16);
    const mat = Array.from(m);
    const id = new Float32Array(16);
    for(let i=0;i<16;i++) id[i]= (i%5===0)?1:0;

    for(let i=0;i<4;i++){
      let pivot = i;
      for(let r=i;r<4;r++) 
        if(Math.abs(mat[r*4+i])>Math.abs(mat[pivot*4+i])) pivot=r;
      
      if(pivot!==i){ 
        for(let c=0;c<4;c++){ 
          const t = mat[i*4+c]; 
          mat[i*4+c]=mat[pivot*4+c]; 
          mat[pivot*4+c]=t; 
          const tt=id[i*4+c]; 
          id[i*4+c]=id[pivot*4+c]; 
          id[pivot*4+c]=tt; 
        }
      }
      
      const div = mat[i*4+i]; 
      if(Math.abs(div) < 1e-12) return id;
      
      for(let c=0;c<4;c++){ 
        mat[i*4+c] /= div; 
        id[i*4+c] /= div; 
      }
      
      for(let r=0;r<4;r++) {
        if(r!==i){ 
          const mul = mat[r*4+i]; 
          for(let c=0;c<4;c++){ 
            mat[r*4+c] -= mul*mat[i*4+c]; 
            id[r*4+c] -= mul*id[i*4+c]; 
          }
        }
      }
    }
    
    for(let i=0;i<16;i++) inv[i]=id[i];
    return inv;
  }

  _dot(a,b){
    return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  }

  _cross(a,b){
    return [
      a[1]*b[2]-a[2]*b[1], 
      a[2]*b[0]-a[0]*b[2], 
      a[0]*b[1]-a[1]*b[0]
    ];
  }

  _normalize(v){ 
    const l=Math.hypot(v[0],v[1],v[2])||1; 
    return [v[0]/l,v[1]/l,v[2]/l]; 
  }
}

/* ===================== APP WIRING ===================== */
(function(){
  const canvas = document.getElementById('canvas');
  let renderer;
  
  try{ 
    renderer = new MandelboxRenderer(canvas); 
  } catch(err){ 
    document.getElementById('status').textContent = err.message; 
    return; 
  }

  // UI refs
  const iter = document.getElementById('iterations');
  const scale = document.getElementById('scale');
  const colorMode = document.getElementById('colorMode');
  const status = document.getElementById('status');
  const autoBtn = document.getElementById('autoRotate');
  const quality = document.getElementById('quality');

  // Initial sync
  iter.value = renderer.iterations; 
  document.getElementById('iterLabel').textContent = iter.value;
  scale.value = renderer.scale; 
  document.getElementById('scaleLabel').textContent = parseFloat(scale.value).toFixed(1);
  quality.value = 'high'; 
  renderer.setQuality('high'); 
  document.getElementById('qualityLabel').textContent = 'Alta';

  // Event listeners
  iter.addEventListener('input', ()=>{ 
    renderer.iterations = parseInt(iter.value); 
    document.getElementById('iterLabel').textContent = iter.value; 
  });

  scale.addEventListener('input', ()=>{ 
    renderer.scale = parseFloat(scale.value); 
    document.getElementById('scaleLabel').textContent = parseFloat(scale.value).toFixed(1); 
  });

  colorMode.addEventListener('change', ()=>{ 
    renderer.colorMode = parseInt(colorMode.value); 
  });

  quality.addEventListener('change', ()=>{ 
    renderer.setQuality(quality.value); 
    const labels = {high:'Alta', medium:'Media', low:'Baja'};
    document.getElementById('qualityLabel').textContent = labels[quality.value]; 
  });

  document.getElementById('reset').addEventListener('click', ()=>{
    renderer.cameraPos = [0,0,5]; 
    renderer.target = [0,0,0]; 
    renderer.rotationX=0; 
    renderer.rotationY=0; 
    renderer.zoom=5; 
    renderer.targetCameraPos=[...renderer.cameraPos]; 
    renderer.targetTarget=[...renderer.target]; 
    renderer.targetZoom = renderer.zoom;
  });

  autoBtn.addEventListener('click', ()=>{ 
    renderer.autoRotate = !renderer.autoRotate; 
    autoBtn.textContent = renderer.autoRotate? 'Detener' : 'Rotar';
    autoBtn.classList.toggle('active', renderer.autoRotate);
  });

  // Preset buttons
  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', ()=>{
      const preset = btn.dataset.preset;
      renderer.setPreset(preset);
      colorMode.value = renderer.colorMode;
      
      // Visual feedback
      document.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Mouse / touch controls
  let isDown=false, isPan=false, lastX=0, lastY=0;
  
  canvas.addEventListener('mousedown', (e)=>{ 
    isDown=true; 
    isPan = e.shiftKey; 
    lastX = e.clientX; 
    lastY = e.clientY; 
    canvas.style.cursor='grabbing'; 
    renderer.targetCameraPos = [...renderer.cameraPos]; 
    renderer.targetTarget = [...renderer.target]; 
    renderer.targetZoom = renderer.zoom; 
  });

  window.addEventListener('mouseup', ()=>{ 
    isDown=false; 
    isPan=false; 
    canvas.style.cursor='auto'; 
  });

  canvas.addEventListener('mousemove', (e)=>{
    if(!isDown) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY; 
    lastX = e.clientX; 
    lastY = e.clientY;
    
    if(isPan){ 
      const panSpeed = 0.005 * renderer.zoom; 
      const right = renderer._normalize(
        renderer._cross(
          [renderer.target[0]-renderer.cameraPos[0], 
           renderer.target[1]-renderer.cameraPos[1], 
           renderer.target[2]-renderer.cameraPos[2]], 
          renderer.up
        )
      ); 
      const upVec = renderer.up; 
      renderer.target = [
        renderer.target[0] - right[0]*dx*panSpeed + upVec[0]*dy*panSpeed, 
        renderer.target[1] - right[1]*dx*panSpeed + upVec[1]*dy*panSpeed, 
        renderer.target[2] - right[2]*dx*panSpeed + upVec[2]*dy*panSpeed
      ]; 
      renderer.cameraPos = [...renderer.targetCameraPos]; 
    } else { 
      renderer.rotationY += dx*0.005; 
      renderer.rotationX += dy*0.005; 
      renderer.rotationX = Math.max(-Math.PI/2, Math.min(Math.PI/2, renderer.rotationX)); 
    }
    
    renderer.targetCameraPos = [...renderer.cameraPos]; 
    renderer.targetTarget = [...renderer.target]; 
    renderer.targetZoom = renderer.zoom;
  });

  canvas.addEventListener('wheel', (e)=>{ 
    e.preventDefault(); 
    renderer.zoom *= e.deltaY > 0 ? 1.05 : 0.95; 
    renderer.zoom = Math.max(0.5, Math.min(80.0, renderer.zoom)); 
    renderer.targetZoom = renderer.zoom; 
    renderer.targetCameraPos = [...renderer.cameraPos]; 
    renderer.targetTarget = [...renderer.target]; 
  }, {passive:false});

  canvas.addEventListener('dblclick', ()=>{ 
    renderer.target = [0,0,0]; 
    renderer.targetTarget=[0,0,0]; 
  });

  // Mobile touch
  let lastDist = 0;
  canvas.addEventListener('touchstart', (e)=>{ 
    if(e.touches.length===1){ 
      lastX=e.touches[0].clientX; 
      lastY=e.touches[0].clientY; 
    } else if(e.touches.length===2){ 
      const dx=e.touches[0].clientX-e.touches[1].clientX; 
      const dy=e.touches[0].clientY-e.touches[1].clientY; 
      lastDist = Math.hypot(dx,dy); 
    } 
  });

  canvas.addEventListener('touchmove', (e)=>{ 
    e.preventDefault(); 
    if(e.touches.length===1){ 
      const dx=e.touches[0].clientX-lastX, dy=e.touches[0].clientY-lastY; 
      lastX=e.touches[0].clientX; 
      lastY=e.touches[0].clientY; 
      renderer.rotationY += dx*0.005; 
      renderer.rotationX += dy*0.005; 
    } else if(e.touches.length===2){ 
      const dx=e.touches[0].clientX-e.touches[1].clientX; 
      const dy=e.touches[0].clientY-e.touches[1].clientY; 
      const d = Math.hypot(dx,dy); 
      const delta = d - lastDist; 
      renderer.zoom *= delta > 0 ? 0.98 : 1.02; 
      lastDist = d; 
    } 
  }, {passive:false});

  // Animation loop
  let raf;
  function loop(now){ 
    renderer.render(now); 
    status.innerHTML = `
      <span class="fps">${renderer.currentFps} FPS</span> • 
      Zoom: ${renderer.zoom.toFixed(2)} • 
      Iter: ${renderer.iterations} • 
      Scale: ${renderer.scale.toFixed(2)}
    `; 
    raf = requestAnimationFrame(loop); 
  }
  raf = requestAnimationFrame(loop);

  // Initial preset
  setTimeout(()=>{ 
    renderer.setPreset('ciudadela'); 
    colorMode.value = renderer.colorMode; 
  }, 150);

  // Menu toggle
  document.getElementById('menuToggle').addEventListener('click', ()=>{ 
    const ui = document.getElementById('ui'); 
    ui.style.display = (ui.style.display==='none')? 'block' : 'none'; 
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) =>{
    // Toggle UI con "U"
    if (e.key.toLowerCase() === 'u') {
      const ui = document.getElementById('ui');
      const status = document.getElementById('status');
      const footer = document.getElementById('footer');
      const menuToggle = document.getElementById('menuToggle');
      ui.style.display = ui.style.display === 'none' ? 'block' : 'none';      
      status.style.display = status.style.display === 'none' ? 'block' : 'none';
      footer.style.display = footer.style.display === 'none' ? 'block' : 'none';
      menuToggle.style.display = menuToggle.style.display === 'none' ? 'block' : 'none';
    }

    // Cambiar paleta con "C"
    if (e.key.toLowerCase() === 'c') {
      const sel = document.getElementById('colorMode');
      const currentVal = parseInt(sel.value);
      const maxVal = sel.options.length - 1;
      sel.value = (currentVal + 1) % (maxVal + 1);
      sel.dispatchEvent(new Event('change'));
    }

    // Iteraciones +/-
    if (e.key === '+' || e.key === '=') {
      const it = document.getElementById('iterations');
      it.value = Math.min(parseInt(it.value) + 1, it.max);
      it.dispatchEvent(new Event('input'));
    }
    if (e.key === '-' || e.key === '_') {
      const it = document.getElementById('iterations');
      it.value = Math.max(parseInt(it.value) - 1, it.min);
      it.dispatchEvent(new Event('input'));
    }

    // Calidad con Q
    if (e.key.toLowerCase() === 'q') {
      const q = document.getElementById('quality');
      const idx = (q.selectedIndex + 1) % q.options.length;
      q.selectedIndex = idx;
      q.dispatchEvent(new Event('change'));
    }

    // Escala: S sube / Shift+S baja
    if (e.key.toLowerCase() === 's') {
      const s = document.getElementById('scale');
      const val = parseFloat(s.value);

      if (e.shiftKey) {
        s.value = Math.max(parseFloat(s.min), (val - 0.1)).toFixed(1);
      } else {
        s.value = Math.min(parseFloat(s.max), (val + 0.1)).toFixed(1);
      }

      s.dispatchEvent(new Event('input'));
    }

    // Auto-rotación con R
    if (e.key.toLowerCase() === 'r') {
      document.getElementById('autoRotate').click();
    }

    // Ayuda con H
    if (e.key.toLowerCase() === 'h') {
      alert(`🎮 ATAJOS DE TECLADO:
      
U - Toggle UI
C - Cambiar paleta de color
+/- - Aumentar/Reducir iteraciones
Q - Cambiar calidad
S - Aumentar escala
Shift+S - Reducir escala
R - Activar/Desactivar rotación automática
H - Esta ayuda

🖱️ CONTROLES:
Arrastrar - Rotar cámara
Shift+Arrastrar - Mover cámara (pan)
Rueda - Zoom
Doble clic - Centrar vista`);
    }
  });

})();