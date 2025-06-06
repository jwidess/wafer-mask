## wafer-mask

**This is a simple 3D viewer for simulating a silicon wafer with an SiO₂ image mask applied. The program uses OpenGL via [Three.js](https://threejs.org/)**  

\*I created this program to assist myself and other students in a nanomanufacturing course. Our first assignment involved designing and manufacturing an "art" wafer to teach us the basic steps of spin coating, baking, photolithography, developing, isotropic [BOE](https://en.wikipedia.org/wiki/Buffered_oxide_etch), and finally inspection. I wanted a way to simulate what different images may look like masked on to a wafer, and thus sparked the inspiration to create this program!

> [!Note]
> View the program here: [https://jwidess.github.io/wafer-mask/src/wafer.html](https://jwidess.github.io/wafer-mask/src/wafer.html)

> \*GPT-4.1 & Claude 3.5 Sonnet were used heavily for the majority of the GLSL shaders and Three.js as I am not familiar with either and just wanted to make this as a fun mini-project!

## Example Image:
![Example Image](https://github.com/jwidess/wafer-mask/blob/main/example.jpg?raw=true)

---

## Thin Film Interference Calculations

The wafer's mask color is simulated using a custom GLSL shader that models thin film interference for a silicon wafer with a silicon dioxide (SiO₂) layer. These calculations are based on the following:

- **Refractive Indices:** 
  - Air (n₀ = 1.0)  
  - SiO₂ (n₁ ≈ 1.82) (*Not accurate, but adjusted for color accuracy of reference wafer*)
  - Silicon (n₂ ≈ 3.88, k₂ ≈ 0.02 for absorption)

- **Wavelengths:**  
  The shader computes reflectance for three wavelengths; And again these have been tuned for color accuracy of reference wafer.
  - Red: 680 nm  
  - Green: 550 nm  
  - Blue: 480 nm

- **Physics:**  
  The reflectance is calculated using the Fresnel equations and phase difference due to the optical path in the thin film. The formula used is a simplified version for a single-layer thin film at a given angle of incidence and could be improved. (See [Thin Film Interference Physics](#thin-film-interference-physics) for more info)

- **Angle Dependence:**  
  The shader blends the angle of incidence toward normal to reduce color shifting at glancing angles, which helps with visual realism, however this isn't perfect and or completely realistic. 

- **Color Normalization:**  
  The resulting RGB reflectance is normalized and gamma-corrected for "vividness", then blended with an environment map for somewhat realistic reflections. (See [Areas for Improvement](#areas-for-improvement))

## Shader Details

- **Mask Application:**  
  The mask image is processed into multiple gray levels and used to blend between the thin film color (masked regions) and a metallic "silver" mirror (unmasked regions of bare silicon).

- **Environment Reflection:**  
  The shader samples an HDR environment map using equirectangular mapping to simulate realistic reflections on the wafer surface. Fresnel blending is used to control the strength of the reflection based on the viewing angle. (See [Areas for Improvement](#areas-for-improvement))

## Areas for Improvement

This project is a functional prototype, but several aspects could be improved for greater realism and usability:

- **Thin Film Physics:**  
  - Use wavelength-dependent refractive indices (dispersion) for SiO₂ and Si.
  - Add support for multiple film layers or arbitrary stackups. (This would be really awesome!)
  - Model polarization effects and absorption more accurately.

- **Reflections:**  
  - Improve environment mapping (e.g., use real measured wafer BRDFs).
  - Add support for dynamic lighting and more advanced reflection models.
  - Fix current reflections rotating around center axis improperly. 

- **Mask Processing:**  
  - Simulate inkjet (or other technology) mask printing to accurately simulate minimum feature sizes.
  - Support for vector masks or SVG input.

- **Performance & UI:**  
  - Optimize for lower-end devices and slow connections. EXR Environment is 14MB alone.
  - Add undo/redo, drag-and-drop, and more intuitive controls.

- **Export:**  
  - Enable exporting the mask or wafer as high-resolution images.
  - Add support for 3D model export (e.g., GLTF).

Contributions and suggestions are welcome!

---

## Thin Film Interference Physics

The simulation uses a simplified physical model to approximate the color and reflectance. The main calculations in the GLSL shader are:

- **Fresnel Equations:**  
  The reflectance at each interface (air/SiO₂ and SiO₂/Si) is calculated for s-polarized light:

  $$r = \frac{n_1 \cos\theta_1 - n_2 \cos\theta_2}{n_1 \cos\theta_1 + n_2 \cos\theta_2}$$

- **Snell's Law:**  
  Used to compute the angle of refraction in each layer:

  $$n_0 \sin\theta_0 = n_1 \sin\theta_1$$

- **Phase Difference:**  
  The phase shift due to the optical path length in the film:

  $$\Delta = \frac{4\pi n_1 d \cos\theta_1}{\lambda}$$

- **Thin Film Reflectance:**  
  The total reflectance for a single wavelength:
  
  $$R = \frac{r_{01}^2 + r_{12}^2 + 2 r_{01} r_{12} \cos\Delta}{1 + r_{01}^2 r_{12}^2 + 2 r_{01} r_{12} \cos\Delta}$$
  
  where:
  - $r_{01}$ is the Fresnel reflection coefficient between air and SiO₂
  - $r_{12}$ is the Fresnel reflection coefficient between SiO₂ and Si
  - $\Delta$ is the phase difference accumulated in the film
  - $R$ is the total reflectance for that wavelength

This is computed for three wavelengths (R, G, B) to produce the final color. The shader also blends the angle of incidence toward normal and uses a Fresnel term to mix the thin film color with an environment map for realistic reflections.

---

## Reference Wafer Vs. Simulation Comparison
>On the right is my 4" silicon wafer with a 500nm coating of SiO₂. On the right is this programs rendering of the same coating thickness and image mask. Overall, its a pretty good recreation, but could still use some improvements. 

![Example Image](https://github.com/jwidess/wafer-mask/blob/main/comparison.jpg?raw=true)
