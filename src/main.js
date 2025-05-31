import * as THREE from 'https://unpkg.com/three@0.126.1/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.126.1/examples/jsm/controls/OrbitControls.js';

// === Scene Setup ===
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x222222);

// === Camera Setup ===
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 5, 5);

// === Renderer Setup ===
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

// === Controls Setup ===
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
//controls.enablePan = false;  // Disable panning
controls.target.set(0, 0, 0); // Lock target to center
controls.target0.set(0, 0, 0); // Lock reset position to center
controls.update();

let lastInteraction = Date.now();
let isAutoRotating = true;
const AUTO_ROTATION_DELAY = 3000; // 3 seconds

// Add these event listeners after the controls setup
controls.addEventListener('start', () => {
    isAutoRotating = false;
    lastInteraction = Date.now();
});

controls.addEventListener('end', () => {
    lastInteraction = Date.now();
});

window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

// === Wafer Geometry ===
const RADIUS = 2;
const THICK = 0.02;
const topGeo = new THREE.CircleGeometry(RADIUS, 256);
const bottomGeo = new THREE.CircleGeometry(RADIUS, 256);
const sideGeo = new THREE.CylinderGeometry(RADIUS, RADIUS, THICK, 256, 1, true);

// --- Correct UV Remapping for Circle ---
const uv = topGeo.attributes.uv;
for (let i = 0; i < uv.count; i++) {
    const x = topGeo.attributes.position.getX(i) / RADIUS;
    const y = topGeo.attributes.position.getY(i) / RADIUS;
    uv.setXY(i, x * 0.5 + 0.5, y * 0.5 + 0.5);
}
uv.needsUpdate = true;

// === Off-Screen Canvas for Mask ===
const SIZE = 2048;
const maskCanvas = document.createElement('canvas');
maskCanvas.width = maskCanvas.height = SIZE;
const mctx = maskCanvas.getContext('2d');

const maskTex = new THREE.CanvasTexture(maskCanvas);
maskTex.flipY = false;
maskTex.wrapS = maskTex.wrapT = THREE.ClampToEdgeWrapping;
maskTex.minFilter = THREE.LinearMipmapLinearFilter;
maskTex.magFilter = THREE.LinearFilter;
maskTex.anisotropy = renderer.capabilities.getMaxAnisotropy();    // === TextureLoader ===
const loader = new THREE.TextureLoader();
const silverTex = loader.load('./textures/silver-texture-square.jpg');
silverTex.wrapS = silverTex.wrapT = THREE.RepeatWrapping;
silverTex.repeat.set(1, 1);

// Replace the entire ShaderMaterial definition
const topMat = new THREE.ShaderMaterial({
    uniforms: {
        maskMap: { value: maskTex },
        silverMap: { value: silverTex },
        customCameraPosition: { value: new THREE.Vector3() }
    },
    vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying vec2 vUv;

        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vViewDir = normalize(cameraPosition - worldPosition.xyz);
          vUv = uv;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
    fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying vec2 vUv;
        uniform sampler2D maskMap;
        uniform sampler2D silverMap;

        const float iridStrength = 0.5;
        const float iridSaturation = 0.7;
        const float fresnelStrength = 3.0;
        const vec3 lightCol = vec3(0.02, 0.7, 0.02);
        const float bandFrequency = 0.9;

        // Rotation matrix for UV distortion
        mat2 rotate2d(float angle) {
            return mat2(
                cos(angle), -sin(angle),
                sin(angle), cos(angle)
            );
        }

        // Dynamic color palette with view-dependent phase shift
        vec4 pal(float t, vec3 viewDir) {
            // Add view-dependent phase shift
            float viewAngle = atan(viewDir.y, viewDir.x);
            float heightInfluence = viewDir.z * 0.5; // How much height affects the pattern
            
            // Create dynamic phase shifts based on view
            vec4 phases = vec4(0.0, 1.0, 2.0, 0.0) / 3.0;
            phases += viewAngle * 0.2; // Rotate colors based on view angle
            phases += heightInfluence; // Shift based on viewing height
            
            return 0.5 + 0.5 * cos(6.28318 * bandFrequency * (t + phases));
        }

        vec3 greyScale(vec3 color, float lerpVal) {
            float greyCol = 0.3 * color.r + 0.59 * color.g + 0.11 * color.b;
            vec3 grey = vec3(greyCol);
            return mix(color, grey, lerpVal);
        }

        void main() {
            vec3 normal = normalize(vNormal);
            vec3 viewDir = normalize(vViewDir);
              // Calculate view angle for color effects only
            float viewAngle = atan(viewDir.y, viewDir.x) * 0.5;
            
            // Dynamic lighting based on view angle
            vec3 lightPos = vec3(2.0, 2.0, -5.0);
            lightPos.xy = rotate2d(viewAngle) * lightPos.xy;
            vec3 lightDir = normalize(-lightPos);
            
            float ldc = dot(lightDir, -normal);
            vec3 rflct = reflect(normalize(lightPos), normal);
            float spec = pow(max(dot(rflct, viewDir), 0.0), 4.0); // Sharper specular
            
            // Enhanced Fresnel with angle-dependent falloff
            float fresnel = 1.0 - dot(normal, viewDir);
            float angleFalloff = pow(abs(dot(normal, vec3(0, 0, 1))), 0.5);
            fresnel *= fresnelStrength * angleFalloff;
              // Sample textures with original UVs
            float mask = texture2D(maskMap, vUv).r;
            vec3 silverColor = texture2D(silverMap, vUv).rgb;
            
            // Enhanced base color with dynamic lighting
            vec3 col = (0.4 + 0.3 * ldc + spec * 0.5) * lightCol * 0.3;
            
            // Dynamic iridescence
            vec4 irid = pal(fresnel, viewDir);
            vec3 finalColor = greyScale(irid.rgb, 1.0 - iridSaturation) * iridStrength;
            
            // Add view-dependent color enhancement
            float viewEnhance = pow(1.0 - abs(dot(normal, viewDir)), 2.0);
            finalColor *= (1.0 + fresnel * 0.5 + viewEnhance);
            
            // Mix with additional view-dependent effects
            gl_FragColor = vec4(mix(silverColor, finalColor, mask), 1.0);
        }
      `,
    side: THREE.DoubleSide
});

// Bottom and side material with grey color
const greyMaterial = new THREE.MeshStandardMaterial({
    color: 0x808080, // Grey color
    metalness: 0.5,  // Slight metallic look
    roughness: 0.8,  // Matte finish
    side: THREE.DoubleSide // Render both sides
});

// Apply the grey material to both bottom and sides
const bottomMat = greyMaterial;
const sideMat = greyMaterial;

// === Meshes ===
const top = new THREE.Mesh(topGeo, topMat);
top.rotation.x = -Math.PI / 2;
top.position.y = THICK / 2;

const bottom = new THREE.Mesh(bottomGeo, bottomMat);
bottom.rotation.x = Math.PI / 2;
bottom.position.y = -THICK / 2;

const side = new THREE.Mesh(sideGeo, sideMat);

const wafer = new THREE.Group();
wafer.add(top, bottom, side);
scene.add(wafer);

//scene.add(new THREE.AxesHelper(2));

// === Preview Canvas ===
const dctx = document.getElementById('preview').getContext('2d');

// Add event listener to the "Invert Mask" checkbox
document.getElementById('invertMask').addEventListener('change', () => {
    console.log('Invert Mask toggled');
    if (currentImage) {
        processImage(currentImage); // Reprocess the current image with the new inversion state
    }
});

// Add event listener to the scale slider
document.getElementById('scaleSlider').addEventListener('input', () => {
    const imgInput = document.getElementById('imgInput');
    if (imgInput.files.length > 0) {
        const event = new Event('change');
        imgInput.dispatchEvent(event);
    }
});    // Add event listener to the "Reset Scale" button
document.getElementById('resetScale').addEventListener('click', () => {
    const scaleSlider = document.getElementById('scaleSlider');
    const scaleNumber = document.getElementById('scaleNumber');
    scaleSlider.value = 1; // Reset the slider to its default value
    scaleNumber.value = 1; // Reset the number input to its default value
    if (currentImage) {
        processImage(currentImage); // Reprocess the current image with the default scale
    }
});

const defaultImagePath = '../images/seamless-cross-hatch-pattern.jpg';
let currentImage = null; // Store the currently loaded image

function processImage(img) {
    const scale = parseFloat(document.getElementById('scaleSlider').value); // Get the scale value
    const aspect = img.width / img.height;
    const w = (aspect >= 1 ? SIZE : SIZE * aspect) * scale;
    const h = (aspect < 1 ? SIZE : SIZE / aspect) * scale;
    const x = (SIZE - w) / 2;
    const y = (SIZE - h) / 2;

    // Clear and prepare the mask canvas
    mctx.clearRect(0, 0, SIZE, SIZE);
    mctx.save();
    mctx.translate(0, SIZE); // Flip vertically
    mctx.scale(1, -1);
    mctx.fillStyle = '#ffffff'; // Fill background with white
    mctx.fillRect(0, 0, SIZE, SIZE);
    mctx.drawImage(img, 0, 0, img.width, img.height, x, y, w, h);
    mctx.restore();

    // Process image with multiple grey levels
    const id = mctx.getImageData(0, 0, SIZE, SIZE);
    const invert = document.getElementById('invertMask').checked; // Check if the mask should be inverted

    const greyLevels = 16; // Number of grey levels (can be adjusted)
    const stepSize = 256 / greyLevels;

    for (let i = 0; i < id.data.length; i += 4) {
        const lum = 0.299 * id.data[i] + 0.587 * id.data[i + 1] + 0.114 * id.data[i + 2];
        const level = Math.floor(lum / stepSize);
        const value = invert ? (level * stepSize) : (255 - (level * stepSize));

        id.data[i] = value;
        id.data[i + 1] = value;
        id.data[i + 2] = value;
        id.data[i + 3] = 255; // Fully opaque
    }
    mctx.putImageData(id, 0, 0);

    // === Update Preview Canvas ===
    dctx.clearRect(0, 0, 128, 128);
    dctx.save();

    const previewAspect = img.width / img.height;
    let pWidth = 128, pHeight = 128;
    if (previewAspect >= 1) {
        pHeight = 128 / previewAspect;
    } else {
        pWidth = 128 * previewAspect;
    }
    const pOffsetX = (128 - pWidth) / 2;
    const pOffsetY = (128 - pHeight) / 2;

    // Draw the scaled image onto the preview canvas
    dctx.drawImage(img, 0, 0, img.width, img.height, pOffsetX, pOffsetY, pWidth, pHeight);
    dctx.restore();

    // Refresh Three.js texture
    maskTex.needsUpdate = true;
}

// Load the default image on startup
window.addEventListener('load', () => {
    const img = new Image();
    img.onload = () => {
        currentImage = img;
        processImage(img);
    };
    img.src = defaultImagePath; // Load the default image
});

// Update the scale slider logic
document.getElementById('scaleSlider').addEventListener('input', () => {
    if (currentImage) {
        processImage(currentImage); // Reprocess the current image with the new scale
    }
});

// === Image Input & Mask Processing ===
document.getElementById('imgInput').addEventListener('change', e => {
    // Hide helper text when file is selected
    document.getElementById('helperText').classList.add('hidden');

    const file = e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
        currentImage = img; // Update the current image
        processImage(img);
    };
    img.src = URL.createObjectURL(file); // Load the selected image
});

// Show helper text again if file input is cleared
document.getElementById('imgInput').addEventListener('click', () => {
    document.getElementById('helperText').classList.remove('hidden');
});

// Add ambient light for general illumination
const ambientLight = new THREE.AmbientLight(0xffffff, 1); // Soft white light
scene.add(ambientLight);

// Add directional light for highlights
const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 5, 5);
scene.add(directionalLight);

// Add a point light for better illumination
const pointLight = new THREE.PointLight(0xffffff, 1, 10); // White light, intensity 1, range 10
pointLight.position.set(0, 2, 2); // Position above the wafer
scene.add(pointLight);

// Sync the number input with the slider
document.getElementById('scaleSlider').addEventListener('input', (e) => {
    document.getElementById('scaleNumber').value = e.target.value;
    if (currentImage) {
        processImage(currentImage);
    }
});

// Sync the slider with the number input
document.getElementById('scaleNumber').addEventListener('input', (e) => {
    const value = Math.min(Math.max(e.target.value, 0.1), 3);
    document.getElementById('scaleSlider').value = value;
    if (currentImage) {
        processImage(currentImage);
    }
});

const CENTER = new THREE.Vector3(0, 0, 0);

const toggleBtn = document.getElementById('toggleRotation');
let autoRotateEnabled = true; // Start with auto-rotation enabled

toggleBtn.addEventListener('click', () => {
    autoRotateEnabled = !autoRotateEnabled;
    toggleBtn.textContent = autoRotateEnabled ? 'Disable Auto-Rotate' : 'Enable Auto-Rotate';

    // Toggle the disabled class
    toggleBtn.classList.toggle('disabled', !autoRotateEnabled);

    if (!autoRotateEnabled) {
        isAutoRotating = false;
    }
});

// === Animation Loop ===
// Modify the animation loop to rotate camera instead of wafer
function animate() {
    requestAnimationFrame(animate);

    // Modify your auto-rotation check in the animate function
    if (!isAutoRotating && autoRotateEnabled && Date.now() - lastInteraction > AUTO_ROTATION_DELAY) {
        isAutoRotating = true;
    }      // Apply auto-rotation if active
    if (isAutoRotating) {
        // Smoothly move target back to center
        controls.target.lerp(CENTER, 0.01);

        // Calculate orbit position
        const radius = Math.sqrt(camera.position.x * camera.position.x + camera.position.z * camera.position.z);
        const angle = Math.atan2(camera.position.x, camera.position.z) + 0.002;

        // Update camera position
        camera.position.x = radius * Math.sin(angle);
        camera.position.z = radius * Math.cos(angle);

        // Make camera look at current target
        camera.lookAt(controls.target);
    }

    topMat.uniforms.customCameraPosition.value.copy(camera.position);
    controls.update();
    renderer.render(scene, camera);
}
animate();

// === Export Image Button Logic ===
document.getElementById('exportImage').addEventListener('click', () => {
    renderer.render(scene, camera); // Ensure latest frame
    const dataURL = renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = 'wafer-scene.png';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});