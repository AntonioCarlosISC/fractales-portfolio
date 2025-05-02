// Variables globales
        let gl, program;
        let cameraPos = [0, 0, 5];
        let target = [0, 0, 0];
        let up = [0, 1, 0];
        let rotationX = 0, rotationY = 0;
        let prevMouseX = 0, prevMouseY = 0;
        let isDragging = false, isPanning = false;
        let autoRotate = false;
        let scale = 2.0, iterations = 18;
        let colorMode = 0;
        let startTime = Date.now();
        let zoom = 5.0;
        let targetCameraPos = [...cameraPos];
        let targetTarget = [...target];
        let targetZoom = zoom;

        // Funciones matemáticas
        const subtract = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
        const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
        const multiply = (v, s) => [v[0]*s, v[1]*s, v[2]*s];
        const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
        const length = v => Math.sqrt(dot(v, v));
        
        const cross = (a, b) => [
            a[1]*b[2] - a[2]*b[1],
            a[2]*b[0] - a[0]*b[2],
            a[0]*b[1] - a[1]*b[0]
        ];
        
        const normalize = v => {
            const len = length(v);
            return len > 0 ? [v[0]/len, v[1]/len, v[2]/len] : [0, 0, 0];
        };

        // Vertex Shader
        const vsSource = `#version 300 es
            in vec4 aPosition;
            uniform mat4 uModelViewMatrix;
            uniform mat4 uProjectionMatrix;
            out vec3 vPosition;
            
            void main() {
                vPosition = aPosition.xyz;
                gl_Position = uProjectionMatrix * uModelViewMatrix * aPosition;
                gl_Position.z = gl_Position.z * 0.5 + 0.5;
            }
        `;

        // Fragment Shader corregido
        const fsSource = `#version 300 es
            precision highp float;
            in vec3 vPosition;
            out vec4 fragColor;
            
            uniform vec3 uCameraPos;
            uniform float uScale;
            uniform int uIterations;
            uniform int uColorMode;
            uniform float uTime;
            uniform float uZoom;
            
            const float PI = 3.141592653589793;
            const float ESCAPE_RADIUS = 256.0;
            const float LOG2 = log(2.0);

            float mandelboxDE(vec3 z) {
                float scale = uScale;
                float foldingLimit = 1.0;
                float fixedRadius2 = 1.0;
                float minRadius2 = 0.25;
                vec3 offset = z;
                float dr = 1.0;
                
                for (int n = 0; n < 1000; n++) {
                    if (n >= uIterations) break;
                    
                    // Box fold
                    z = clamp(z, -foldingLimit, foldingLimit) * 2.0 - z;
                    
                    // Sphere fold
                    float r2 = dot(z, z);
                    if (r2 < minRadius2) {
                        z *= (fixedRadius2 / minRadius2);
                    } else if (r2 < fixedRadius2) {
                        z *= (fixedRadius2 / r2);
                    }
                    
                    z = z * scale + offset;
                    dr = dr * abs(scale) + 1.0;
                }
                
                return length(z) / abs(dr);
            }
            
            vec3 calculateNormal(vec3 pos, float eps) {
                vec2 e = vec2(1.0, -1.0) * eps;
                return normalize(
                    e.xyy * mandelboxDE(pos + e.xyy) +
                    e.yyx * mandelboxDE(pos + e.yyx) +
                    e.yxy * mandelboxDE(pos + e.yxy) +
                    e.xxx * mandelboxDE(pos + e.xxx)
                );
            }
            
            vec3 neonGalactic(float t, vec3 pos) {
                float r = 0.7 + 0.5 * sin(t * 3.0 + pos.x * 2.0 + uTime * 0.001);
                float g = 0.5 + 0.5 * cos(t * 2.5 + pos.y * 3.0);
                float b = 1.0 - 0.5 * sin(t * 4.0 + pos.z * 2.0 + uTime * 0.002);
                return vec3(r*r, g*g, b);
            }
            
            vec3 fireLava(float t) {
                return vec3(
                    t * 1.2,
                    t * t * 0.8,
                    pow(t, 5.0) * 0.5
                ) * 2.0;
            }
            
            vec3 deepOcean(float t, vec3 pos) {
                return vec3(
                    0.2 + 0.5 * cos(t * 2.0 + pos.x * 0.5),
                    0.3 + 0.5 * sin(t * 3.0 + pos.y * 0.7),
                    0.7 + 0.3 * sin(t * 5.0 + pos.z * 1.0 + uTime * 0.001)
                );
            }
            
            vec3 alien(float t, vec3 pos) {
                return vec3(
                    0.5 + 0.5 * sin(t * 7.0 + pos.z * 2.0 + uTime * 0.001),
                    0.5 + 0.5 * cos(t * 5.0 + pos.x * 3.0),
                    0.5 + 0.5 * sin(t * 3.0 + pos.y * 4.0 + uTime * 0.002)
                );
            }
            
            void main() {
                vec3 rayDir = normalize(vPosition - uCameraPos);
                vec3 rayPos = uCameraPos;
                float dist, totalDist = 0.0;
                int steps;
                float maxDist = 100.0;
                float eps = 0.0001 * uZoom;
                vec3 color = vec3(0.0);
                bool hit = false;
                
                // Ray marching
                for (steps = 0; steps < 200; steps++) {
                    dist = mandelboxDE(rayPos);
                    totalDist += dist;
                    rayPos += rayDir * dist;
                    
                    if (dist < eps) {
                        hit = true;
                        break;
                    }
                    if (totalDist > maxDist) break;
                }
                
                if (hit) {
                    vec3 normal = calculateNormal(rayPos, eps * 0.5);
                    float diffuse = max(0.2, dot(normal, normalize(vec3(1.0, 1.0, 1.0))));
                    vec3 lightDir = normalize(vec3(sin(uTime * 0.001), 1.0, cos(uTime * 0.001)));
                    float light = max(0.3, dot(normal, lightDir));
                    
                    float iterFactor = float(steps) / float(uIterations);
                    float depthFactor = 1.0 - smoothstep(0.0, maxDist, totalDist);
                    
                    // Aplicar paleta de colores
                    if (uColorMode == 0) {
                        color = neonGalactic(iterFactor, rayPos) * light;
                    } else if (uColorMode == 1) {
                        color = fireLava(iterFactor) * light;
                    } else if (uColorMode == 2) {
                        color = deepOcean(iterFactor, rayPos) * light;
                    } else {
                        color = alien(iterFactor, rayPos) * light;
                    }
                    
                    // Efecto de borde
                    float edge = 1.0 - smoothstep(0.0, eps * 2.0, dist);
                    color = mix(color, color * 1.5, edge);
                    
                    // Iluminación especular
                    vec3 viewDir = normalize(uCameraPos - rayPos);
                    vec3 reflectDir = reflect(-lightDir, normal);
                    float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
                    color += vec3(spec * 0.5);
                    
                    fragColor = vec4(color * depthFactor, 1.0);
                } else {
                    // Fondo
                    float glow = smoothstep(maxDist * 0.5, maxDist, totalDist);
                    vec3 bgColor = vec3(0.05, 0.05, 0.1);
                    if (uColorMode == 0) bgColor = vec3(0.0, 0.02, 0.05);
                    else if (uColorMode == 1) bgColor = vec3(0.05, 0.0, 0.0);
                    fragColor = vec4(bgColor, 1.0);
                }
            }
        `;

        // Inicialización
        function init() {
            const canvas = document.getElementById('canvas');
            gl = canvas.getContext('webgl2', { antialias: true });
            
            if (!gl) {
                alert('WebGL 2.0 no está disponible en tu navegador. Prueba con Chrome o Firefox.');
                return;
            }

            // Ajustar tamaño del canvas
            function resize() {
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
                gl.viewport(0, 0, canvas.width, canvas.height);
                updateStatus();
            }
            window.addEventListener('resize', resize);
            resize();

            // Compilar shaders
            function compileShader(type, source) {
                const shader = gl.createShader(type);
                gl.shaderSource(shader, source);
                gl.compileShader(shader);
                
                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                    console.error(`Error compilando ${type === gl.VERTEX_SHADER ? 'vertex' : 'fragment'} shader:`, gl.getShaderInfoLog(shader));
                    return null;
                }
                return shader;
            }

            // Crear programa
            function createProgram(vertexShader, fragmentShader) {
                const program = gl.createProgram();
                gl.attachShader(program, vertexShader);
                gl.attachShader(program, fragmentShader);
                gl.linkProgram(program);
                
                if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                    console.error('Error enlazando programa:', gl.getProgramInfoLog(program));
                    return null;
                }
                return program;
            }

            const vertexShader = compileShader(gl.VERTEX_SHADER, vsSource);
            const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fsSource);
            
            if (!vertexShader || !fragmentShader) {
                alert('Error al compilar los shaders. Ver consola para detalles.');
                return;
            }
            
            program = createProgram(vertexShader, fragmentShader);
            
            if (!program) {
                alert('Error al crear el programa WebGL.');
                return;
            }

            // Crear geometría (cubo que llena la pantalla)
            const positions = new Float32Array([
                -1, -1, -1,  1, -1, -1,  1, 1, -1, -1, 1, -1,  // back
                -1, -1,  1,  1, -1,  1,  1, 1,  1, -1, 1,  1   // front
            ]);

            const indices = new Uint16Array([
                0, 1, 2, 0, 2, 3,  // back
                4, 5, 6, 4, 6, 7,   // front
                0, 4, 7, 0, 7, 3,   // left
                1, 5, 6, 1, 6, 2,   // right
                0, 1, 5, 0, 5, 4,   // bottom
                3, 2, 6, 3, 6, 7    // top
            ]);

            // Configurar buffers
            const positionBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

            const indexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

            const positionLoc = gl.getAttribLocation(program, 'aPosition');
            gl.enableVertexAttribArray(positionLoc);
            gl.vertexAttribPointer(positionLoc, 3, gl.FLOAT, false, 0, 0);

            setupControls();
            setupEventListeners(canvas);
            
            // Iniciar animación
            requestAnimationFrame(animate);
            updateStatus();
        }

        // Configurar controles
        function setupControls() {
            document.getElementById('iterations').addEventListener('input', function() {
                iterations = parseInt(this.value);
                document.getElementById('iterValue').textContent = iterations;
            });

            document.getElementById('scale').addEventListener('input', function() {
                scale = parseFloat(this.value);
                document.getElementById('scaleValue').textContent = scale.toFixed(1);
            });

            document.getElementById('colorMode').addEventListener('change', function() {
                colorMode = parseInt(this.value);
            });

            document.getElementById('reset').addEventListener('click', function() {
                cameraPos = [0, 0, 5];
                target = [0, 0, 0];
                rotationX = 0;
                rotationY = 0;
                zoom = 5.0;
            });

            document.getElementById('toggleAuto').addEventListener('click', function() {
                autoRotate = !autoRotate;
                this.textContent = autoRotate ? "Detener Rotación" : "Rotación Automática";
            });
        }

        // Configurar eventos
        function setupEventListeners(canvas) {
            canvas.addEventListener('mousedown', function(e) {
            isDragging = true;
            isPanning = e.shiftKey;
            prevMouseX = e.clientX;
            prevMouseY = e.clientY;
            canvas.style.cursor = 'grabbing';

            // 🔥 ACTUALIZA los objetivos de interpolación para que no salte de regreso
            targetCameraPos = [...cameraPos];
            targetTarget = [...target];
            targetZoom = zoom;
            
        });


            window.addEventListener('mouseup', function() {
                    isDragging = false;
                    isPanning = false;
                    canvas.style.cursor = 'grab';
                    
                });


            canvas.addEventListener('mousemove', function(e) {
    if (!isDragging) return;

    const deltaX = e.clientX - prevMouseX;
    const deltaY = e.clientY - prevMouseY;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;

    if (isPanning) {
        const panSpeed = 0.005 * zoom;
        const right = normalize(cross(subtract(target, cameraPos), up));
        const upVec = normalize(up);

        target = add(target, multiply(right, -deltaX * panSpeed));
        target = add(target, multiply(upVec, deltaY * panSpeed));
        cameraPos = add(cameraPos, multiply(right, -deltaX * panSpeed));
        cameraPos = add(cameraPos, multiply(upVec, deltaY * panSpeed));
    } else {
        rotationY += deltaX * 0.005;
        rotationX += deltaY * 0.005;
        rotationX = Math.max(-Math.PI/2, Math.min(Math.PI/2, rotationX));

        const radius = zoom;
        cameraPos[0] = target[0] + radius * Math.sin(rotationY) * Math.cos(rotationX);
        cameraPos[1] = target[1] + radius * Math.sin(rotationX);
        cameraPos[2] = target[2] + radius * Math.cos(rotationY) * Math.cos(rotationX);


    }

    // 🔥 ACTUALIZAR objetivos de interpolación
    targetCameraPos = [...cameraPos];
    targetTarget = [...target];
    targetZoom = zoom;
});


            canvas.addEventListener('dblclick', function() {
                target = [0, 0, 0];
            });

            canvas.addEventListener('wheel', function(e) {
    e.preventDefault();
    zoom *= e.deltaY > 0 ? 0.95 : 1.05;
    zoom = Math.max(0.5, Math.min(50.0, zoom));

    const radius = zoom;
    cameraPos[0] = target[0] + radius * Math.sin(rotationY) * Math.cos(rotationX);
    cameraPos[1] = target[1] + radius * Math.sin(rotationX);
    cameraPos[2] = target[2] + radius * Math.cos(rotationY) * Math.cos(rotationX);

    // 🔥 ACTUALIZAR objetivos de interpolación
    targetCameraPos = [...cameraPos];
    targetTarget = [...target];
    targetZoom = zoom;
});
}

        // Funciones de matrices
        function lookAt(eye, target, up) {
            const z = normalize(subtract(eye, target));
            const x = normalize(cross(up, z));
            const y = normalize(cross(z, x));
            
            return [
                x[0], y[0], z[0], 0,
                x[1], y[1], z[1], 0,
                x[2], y[2], z[2], 0,
                -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
            ];
        }
        
        function perspective(fovy, aspect, near, far) {
            const f = 1.0 / Math.tan(fovy * Math.PI / 360);
            const range = near - far;
            
            return [
                f/aspect, 0, 0, 0,
                0, f, 0, 0,
                0, 0, (far+near)/range, -1,
                0, 0, (2*far*near)/range, 0
            ];
        }

        // Actualizar estado
        function updateStatus() {
            const status = document.getElementById('status');
            status.textContent = `Zoom: ${zoom.toFixed(2)}x | Pos: [${cameraPos.map(v => v.toFixed(2)).join(', ')}]`;
        }

        // Bucle de animación
        function animate(time) {
        // Si autoRotate está activo, seguimos rotando alrededor del target
        if (autoRotate) {
        rotationY += 0.002;
        const radius = zoom;
        cameraPos[0] = target[0] + radius * Math.sin(rotationY) * Math.cos(rotationX);
        cameraPos[2] = target[2] + radius * Math.cos(rotationY) * Math.cos(rotationX);
            } else if(!isDragging){
                for (let i = 0; i < 3; i++){
                    cameraPos[i] += (targetCameraPos[i] - cameraPos[i]) * 0.1;
            target[i]    += (targetTarget[i]    - target[i])    * 0.1;
                }
                zoom += (targetZoom - zoom)* 0.1;
        }

    render(time);
    updateStatus();
    requestAnimationFrame(animate);
}


        // Función de renderizado
        function render(time) {
            gl.clearColor(0.0, 0.0, 0.0, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            gl.enable(gl.DEPTH_TEST);
            
            gl.useProgram(program);
            
            // Matrices de vista y proyección
            const viewMatrix = lookAt(cameraPos, target, up);
            const projMatrix = perspective(60, gl.canvas.width/gl.canvas.height, 0.1, 100.0);
            
            // Pasar uniformes al shader
            gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uModelViewMatrix'), false, viewMatrix);
            gl.uniformMatrix4fv(gl.getUniformLocation(program, 'uProjectionMatrix'), false, projMatrix);
            gl.uniform3fv(gl.getUniformLocation(program, 'uCameraPos'), cameraPos);
            gl.uniform1f(gl.getUniformLocation(program, 'uScale'), scale);
            gl.uniform1i(gl.getUniformLocation(program, 'uIterations'), iterations);
            gl.uniform1i(gl.getUniformLocation(program, 'uColorMode'), colorMode);
            gl.uniform1f(gl.getUniformLocation(program, 'uTime'), time - startTime);
            gl.uniform1f(gl.getUniformLocation(program, 'uZoom'), zoom);
            
            // Dibujar
            gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
        }

        //Tour por figuras destacadas
        document.getElementById('figureSelect').addEventListener('change', function () {
                if(this.value === 'ciudadela'){
                    targetCameraPos = [-1.39, -1.14, -0.21]; 
                    targetTarget = [0, 0, 0];
                    targetZoom = 0.98;
                    /*cameraPos = [-1.39, -1.14, -0.21];                    
                    target = [0, 0, 0];
                    rotationX = 0;
                    rotationY = 0;*/
                    zoom = 0.98;

                    colorMode = 1;
                    document.getElementById('colorMode').value = 1;                                                
                    setScaleAndIterations(2.8,27);
                    syncCameraRotation();
                }
                else if(this.value === 'biblioteca'){
                    /*Iteraciones: 27
                    Escala: 2.7
                    Zoom: 2.64x
                    Posición: [1.22, 1.30, -1.10]*/
                    targetCameraPos = [1.22, 1.30, -1.10];
                    targetTarget = [0, 0, 0];
                    targetZoom = 2.64;
                    zoom = 2.64;

                    colorMode = 0;
                    document.getElementById('colorMode').value = 1;                                                
                    setScaleAndIterations(2.7,27);
                    syncCameraRotation();
                    
                } else if(this.value === 'paisaje'){
                    /*Paisaje Tecnosurrealista
                    Color: Océano Profundo, Alienigena, Fuego Lava
                    Iteraciones: 27
                    Escala: 2.4
                    Zoom: 2.35x
                    Posición: [-2.71, 0.80, -0.03]*/
                    targetCameraPos = [-2.71, 0.80, -0.03];
                    targetTarget = [0,0,0];
                    targetZoom = 2.35;
                    zoom = 2.35;

                    colorMode = 2;
                    document.getElementById('colorMode').value = 2;                                                
                    setScaleAndIterations(2.4,27);
                    syncCameraRotation();
                } else if(this.value === 'trono'){
                    /*Trono Hipercúbico del Infinito
                    Color: Océano Profundo, Rojo Lava
                    Iteraciones: 27
                    Escala: 3.0
                    Zoom: 1.54x
                    Posición: [0.03, 0.08, 1.53]*/
                    targetCameraPos = [0.03, 0.08, 1.53];
                    targetTarget = [0,0,0];
                    targetZoom = 1.54;

                    colorMode = 2;
                    document.getElementById('colorMode').value = 2;                                                
                    setScaleAndIterations(3.0,27);
                    syncCameraRotation();
                }
        });

        function setScaleAndIterations(newScale, newIter) {
            scale = newScale;
            iterations = newIter;
            document.getElementById('iterations').value = newIter;
            document.getElementById('scale').value = newScale;
            document.getElementById('scaleValue').textContent = newScale.toFixed(1);
            document.getElementById('iterValue').textContent = newIter;
        }
        

        function syncCameraRotation() {
            const dx = cameraPos[0] - target[0];
            const dy = cameraPos[1] - target[1];
            const dz = cameraPos[2] - target[2];
    
            zoom = Math.sqrt(dx*dx + dy*dy + dz*dz); // distancia euclidiana (zoom real)

            rotationY = Math.atan2(dx, dz); // rotación horizontal
            rotationX = Math.asin(dy / zoom); // rotación vertical
        }



  window.onload = function () {
        init();

        // Esperar un pequeño tiempo para asegurar que los listeners están listos
        setTimeout(() => {
            const selector = document.getElementById('figureSelect');
            selector.value = 'ciudadela';
            selector.dispatchEvent(new Event('change'));
        }, 100);
    };
