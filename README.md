## aframe-gaussian-splatting-component

This component is an A-Frame implementation of real-time rendering for [3D Gaussian Splatting for Real-Time Radiance Field Rendering](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/).  
This code is derived from the WebGL implementation developed by [antimatter15](https://github.com/antimatter15/splat).


### Properties

| Property  | Description          | Default Value |
| --------  | -----------          | ------------- |
| src       | url of splat file    | train.splat   |


### Usage

#### Browser Installation

Install and use by directly including the file.
About the splat file, please refer [antimatter15](https://github.com/antimatter15/splat).

```html
<head>
  <script src="https://aframe.io/releases/1.4.2/aframe.min.js"></script>
  <script src="https://unpkg.com/aframe-gaussian-splatting-component@0.0.2/dist/aframe-agaussian-splatting-component.min.js"></script>
</head>

<body>
  <a-scene>
    <a-entity gaussian_splatting="src: https://huggingface.co/cakewalk/splat-data/resolve/main/train.splat;" position="0 -1.5 -2.0"></a-entity>
  </a-scene>
</body>
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