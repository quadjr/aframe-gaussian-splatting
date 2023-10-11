## aframe-gaussian-splatting-component

This component is an A-Frame implementation of real-time rendering for [3D Gaussian Splatting for Real-Time Radiance Field Rendering](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/).  
This code is derived from the WebGL implementation developed by [antimatter15](https://github.com/antimatter15/splat).

### Demo page

Need few seconds to load sploats.
https://quadjr.github.io/aframe-gaussian-splatting/

### Properties

| Property  | Description                 | Default Value |
| --------  | -----------                 | ------------- |
| src       | url of splat or ply file    | train.splat   |


### Usage

#### Browser Installation

Install and use by directly including the file.
About the splat file, please refer [antimatter15](https://github.com/antimatter15/splat).

```html
<!DOCTYPE html>
<html>
  <head>
    <script src="https://aframe.io/releases/1.4.2/aframe.min.js"></script>
    <script src="https://unpkg.com/aframe-gaussian-splatting-component@0.0.16/dist/aframe-gaussian-splatting-component.min.js"></script>
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