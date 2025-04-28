 document.getElementById('colorMode').addEventListener('change', (e) => {
    if (e.target.value === "2") {
        alertPsicodelia();
    }
    });

    function alertPsicodelia() {
    alert("⚠️ Advertencia: El modo 'Psicodélico Extremo' puede emitir destellos rápidos e intensos durante el zoom. Si tienés sensibilidad a estímulos visuales o epilepsia fotosensible, se recomienda evitar este modo. Usalo bajo tu responsabilidad.");
}

    const canvas = document.getElementById('mandelbrotCanvas');
    const gl = canvas.getContext('webgl2', {precision: 'highp'}) || 
               canvas.getContext('webgl', {precision: 'highp'}) || 
               canvas.getContext('experimental-webgl', {precision: 'highp'});

    if (!gl) {
        alert("WebGL no está disponible en tu navegador.");
        throw new Error("WebGL no soportado");
    }

    // Configuración avanzada
    let zoomSpeed = 1.005;
    let pathX = 0.00263;
    let pathY = -0.00305;
    let autoZoomEnabled = true;
    let aspectRatio = 1;
    let colorMode = 0;
    let maxIterations = 500; //500 // Aumentamos las iteraciones para zoom profundo

    // Variables de estado
    let zoom = 1.0;
    let targetZoom = zoom;
    let offset = [0.0, 0.0];
    let targetOffset = [...offset];
    let isDragging = false;
    let lastX, lastY;
    let zoomDepth = 1;

    // Ajustar el canvas manteniendo relación de aspecto
    function resizeCanvas() {
        const displayWidth = window.innerWidth;
        const displayHeight = window.innerHeight;
        
        aspectRatio = displayWidth / displayHeight;
        
        if (displayWidth / displayHeight > aspectRatio) {
            canvas.width = displayHeight * aspectRatio;
            canvas.height = displayHeight;
        } else {
            canvas.width = displayWidth;
            canvas.height = displayWidth / aspectRatio;
        }
        
        gl.viewport(0, 0, canvas.width, canvas.height);
    }

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Vertex shader
    const vertexShaderSource = `#version 300 es
        in vec2 a_position;
        out vec2 v_uv;
        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
            v_uv = a_position * 0.5 + 0.5;
        }
    `;

    // Fragment shader con paletas psicodélicas y zoom profundo
    const fragmentShaderSource = `#version 300 es
        precision highp float;
        in vec2 v_uv;
        out vec4 outColor;
        
        uniform float u_zoom;
        uniform vec2 u_offset;
        uniform float u_aspect;
        uniform int u_colorMode;
        uniform int u_maxIter;
        
        const float PI = 3.141592653589793;

        // Paletas psicodélicas
        vec3 palettePsycho(float t, float time) {
            // Base psicodélica con múltiples frecuencias
            float r = 0.5 + 0.5 * cos(6.0*PI*t + 0.1*time + 0.5) * 
                      sin(3.0*PI*t + 0.2*time) * 
                      cos(9.0*PI*t + 0.3*time);
            float g = 0.5 + 0.5 * sin(4.0*PI*t + 0.4*time) * 
                      cos(7.0*PI*t + 0.5*time) * 
                      sin(5.0*PI*t + 0.6*time);
            float b = 0.5 + 0.5 * cos(8.0*PI*t + 0.7*time) * 
                      sin(6.0*PI*t + 0.8*time) * 
                      cos(4.0*PI*t + 0.9*time);
            return vec3(r*r, g*g, b*b);
        }

        vec3 paletteFire(float t) {
            return vec3(
                t * 0.7 + 0.2,
                t * t * 0.7,
                pow(t, 5.3) * 0.4
            );
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

        vec3 palletteVerdeNaturaleza(float t){
    return vec3(
        0.15 + 0.03 * cos(2.0 * PI * t * t),         
        0.35 + 0.45 * cos(2.0 * PI * t + 3.0),       
        0.08 + 0.07 * sin(2.0 * PI * t + 1.0)   
                );
        }

        void main() {
            // Coordenadas ajustadas por zoom y relación de aspecto
            vec2 c = (v_uv - 0.5) * vec2(4.0/u_zoom, (4.0/u_zoom)/u_aspect) - u_offset;
            vec2 z = vec2(0.0, 0.0);
            int iterations = 0; //0
            
            // Algoritmo de escape con límite aumentado para zoom profundo
            for (int i = 0; i < u_maxIter; i++) {
                if (z.x*z.x + z.y*z.y > 256.0) break; // Límite aumentado para evitar distorsión temprana
                
                float xtemp = z.x*z.x - z.y*z.y + c.x;
                z.y = 2.0*z.x*z.y + c.y;
                z.x = xtemp;
                iterations++;
            }
            
            // Coloración con diferentes paletas
            if (iterations == u_maxIter) {
                outColor = vec4(0.0, 0.0, 0.0, 1.0);
            } else {
                // Suavizado para zoom profundo
                float smoothed = float(iterations) - log(log(length(z))) / log(2.0);
                float colorT = sqrt(smoothed / float(u_maxIter));
                
                vec3 color;
                if (u_colorMode == 0) {
                    color = paletteOcean(colorT);
                } else if (u_colorMode == 1) {
                    color = paletteFire(colorT) * 2.0;
                } else if (u_colorMode == 2) {                    
                // Psicodélico extremo con efecto de tiempo
                    float time = float(u_zoom) * 0.01;
                    color = palettePsycho(colorT * 2.0, time) * (1.0 + 0.5 * sin(time));
                } else if (u_colorMode == 3){
                    color = paletteNeon(colorT) * 1.5;
                } else if (u_colorMode == 4){
                    color = palletteVerdeNaturaleza(colorT) * 1.75; 
                }
                
                // Aumentar saturación
                vec3 saturated = mix(color, color * color * 3.0, 0.7);
                outColor = vec4(saturated, 1.0);
            }
        }
    `;

    // Compilar shaders
    const compileShader = (gl, source, type) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error("Error al compilar el shader: " + gl.getShaderInfoLog(shader));
            return null;
        }
        return shader;
    };

    const vertexShader = compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Error al linkear el programa: " + gl.getProgramInfoLog(program));
    }
    
    gl.useProgram(program);

    // Configurar atributos y uniforms
    const positionLocation = gl.getAttribLocation(program, "a_position");
    const zoomLocation = gl.getUniformLocation(program, "u_zoom");
    const offsetLocation = gl.getUniformLocation(program, "u_offset");
    const aspectLocation = gl.getUniformLocation(program, "u_aspect");
    const colorModeLocation = gl.getUniformLocation(program, "u_colorMode");
    const maxIterLocation = gl.getUniformLocation(program, "u_maxIter");

    // Buffer para los vértices
    const vertices = new Float32Array([
        -1.0, -1.0,
         1.0, -1.0,
         1.0,  1.0,
        -1.0,  1.0
    ]);
    
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(positionLocation);

    // Función de renderizado
    function render() {
        gl.uniform1f(zoomLocation, zoom);
        gl.uniform2fv(offsetLocation, new Float32Array(offset));
        gl.uniform1f(aspectLocation, aspectRatio);
        gl.uniform1i(colorModeLocation, colorMode);
        gl.uniform1i(maxIterLocation, maxIterations);
        
        gl.clearColor(0.0, 0.0, 0.0, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
        
        // Actualizar indicador de zoom
        document.getElementById('zoomLevel').textContent = `Zoom: ${zoomDepth.toExponential(2)}x`;
    }

    // Animación suave
    function animate(time) {
        // Interpolación suave
        zoom += (targetZoom - zoom) * 0.1;
        offset[0] += (targetOffset[0] - offset[0]) * 0.1;
        offset[1] += (targetOffset[1] - offset[1]) * 0.1;
        
        render();
        requestAnimationFrame(animate);
    }

    // Zoom automático con camino personalizable
    let zoomTimeOutId = false;
    function autoZoomStep() {
        if (autoZoomEnabled) {
            targetZoom *= zoomSpeed;
            zoomDepth *= zoomSpeed;
            targetOffset[0] += pathX / targetZoom;
            targetOffset[1] += pathY / targetZoom;
            
            // Aumentar iteraciones a medida que hacemos zoom para más detalle
            maxIterations = Math.min(2000, 500 + Math.floor(Math.log(zoomDepth) * 50));
            
            zoomTimeOutId = setTimeout(autoZoomStep, 20);
        }
    }

    // Iniciar animaciones
    animate();
    //autoZoomStep();

    // Controles de la interfaz
    document.getElementById('zoomSpeed').addEventListener('input', (e) => {
        zoomSpeed = 1.0 + (parseInt(e.target.value) / 1000);
        document.getElementById('zoomSpeedValue').textContent = e.target.value;
    });

    document.getElementById('pathX').addEventListener('input', (e) => {
        pathX = parseInt(e.target.value) / 100000;
        document.getElementById('pathXValue').textContent = e.target.value;
    });

    document.getElementById('pathY').addEventListener('input', (e) => {
        pathY = parseInt(e.target.value) / 100000;
        document.getElementById('pathYValue').textContent = e.target.value;
    });

    document.getElementById('colorMode').addEventListener('change', (e) => {
        colorMode = parseInt(e.target.value);
    });

    document.getElementById('toggleZoom').addEventListener('click', () => {
    autoZoomEnabled = !autoZoomEnabled;
    autoZoomStep();
    document.getElementById('toggleZoom').textContent = 
        autoZoomEnabled ? "Pausar Zoom" : "Reanudar Zoom";

    if (autoZoomEnabled) {
        autoZoomStep();            
    } else if (zoomTimeOutId !== null) {
        clearTimeout(zoomTimeOutId);
        zoomTimeOutId = null;            
    }
});


    document.getElementById('resetView').addEventListener('click', () => {
        targetZoom = 1.0;
        zoomDepth = 1;
        targetOffset = [0.0, 0.0];
        maxIterations = 500;
        autoZoomEnabled = false;
        document.getElementById('toggleZoom').textContent = "Reanudar Zoom";
    });

    // Interacción con el ratón
    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
        autoZoomEnabled = false;
        document.getElementById('toggleZoom').textContent = "Reanudar Zoom";
    });

    window.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
            
            targetOffset[0] += dx * 2.0 / (canvas.width * zoom);
            targetOffset[1] += dy * 2.0 / (canvas.height * zoom);
        }
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
    });

    // Zoom con la rueda del ratón
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        autoZoomEnabled = false;
        document.getElementById('toggleZoom').textContent = "Reanudar Zoom";
        
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const mouseX = e.clientX / canvas.width * 2.0 - 1.0;
        const mouseY = 1.0 - e.clientY / canvas.height * 2.0;
        
        targetOffset[0] -= mouseX * (1.0 - factor) / zoom;
        targetOffset[1] -= mouseY * (1.0 - factor) / zoom;
        targetZoom *= factor;
        zoomDepth *= factor;
        
        // Ajustar iteraciones para zoom manual
        maxIterations = Math.min(2000, 500 + Math.floor(Math.log(zoomDepth) * 50));
    });

    // Renderizado inicial
    render();