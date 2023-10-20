## aframe-gaussian-splatting-component

This component is an A-Frame implementation of real-time rendering for [3D Gaussian Splatting for Real-Time Radiance Field Rendering](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/).  
This code is derived from the WebGL implementation developed by [antimatter15](https://github.com/antimatter15/splat).

### Demo pages

Needs few seconds to load splats.  
* Demo: https://quadjr.github.io/aframe-gaussian-splatting/
* Cutout demo: https://quadjr.github.io/aframe-gaussian-splatting/cutout-demo.html

### Properties

| Property  | Description                 | Default Value |
| --------  | -----------                 | ------------- |
| src       | url of splat or ply file    | train.splat   |
| cutoutEntity | selector to a box primitive that uses scale and position to define the bounds of splat points to render    |     |
| pixelRatio | Pixel ratio for rendering. Reducing the value decreases the resolution and improves performance. If a negative value is set, the device's native value will be applied. |  1.0  |
| xrPixelRatio | Same as pixelRatio. Applied to XR devices.  |  0.5   |

### Example custom scan to gaussian splat workflow
* Use a service such as https://lumalabs.ai/ to process a scan into splat (an alternative is https://poly.cam/)
* Go to download dialog and choose Gaussian > Splat (which will download a .zip file with .ply file inside)
* Convert the .ply to .splat in the browser using this site: https://splat-converter.glitch.me/ by @akbartus (repo https://github.com/akbartus/Gaussian-Splatting-WebViewers/tree/main/splat_converter)
* Use resultant .splat in the A-Frame scene with this component

### Usage

#### Browser Installation

Install and use by directly including the file.
About the splat file, please refer [antimatter15](https://github.com/antimatter15/splat).

```html
<!DOCTYPE html>
<html>
  <head>
    <script src="https://aframe.io/releases/1.4.2/aframe.min.js"></script>
    <script src="https://quadjr.github.io/aframe-gaussian-splatting/index.js"></script>
  </head>
  <body>
    <a-scene renderer="antialias: false" stats>
      <a-entity position="0 1.6 -2.0" animation="property: rotation; to: 0 360 0; dur: 10000; easing: linear; loop: true">
        <a-sphere position="0 0 0.5" radius="0.5" color="#EF2D5E"></a-sphere>
        <a-sphere position="0 0 -0.5" radius="0.5" color="#EF2D5E"></a-sphere>
      </a-entity>
      <a-entity gaussian_splatting="src: https://huggingface.co/cakewalk/splat-data/resolve/main/train.splat;" rotation="0 0 0" position="0 1.5 -2"></a-entity>
    </a-scene>
  </body>
</html>
```


#### NPM Installation

Install via NPM:

```bash
npm install aframe-gaussian-splatting-component
```

Then register and use.

```js
require('aframe');
require('aframe-gaussian-splatting-component');
```