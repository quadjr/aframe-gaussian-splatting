AFRAME.registerComponent("gaussian-splatting", {
    schema: {
        splatUrl: {
            type: "string",
            default:
                "https://cdn.glitch.me/7eb34fc5-dc2f-4b3b-afc1-8eb4a88210ba/truck.splat",
        },
        initialPosition: { type: "string", default: "0 0 0" },
        downsampleFactor: { type: "int", default: 1 },
        vertexCount: { type: "int", default: 1000000 },
        splatSize: { type: "number", default: 1159.5880733038064 },
        splatPixelDiscard: { type: "float", default: 2.0 },
        slider: { type: "boolean", default: true },
        splatColor: { type: "string", default: "grayscale" },
    },
    init: function () {
        let scene = this.el.sceneEl.object3D;
        let renderer = this.el.sceneEl.renderer;
        let camera = document.querySelector("a-entity[camera]").object3D; ////this.el.sceneEl.camera;
        this.viewer;
        let selectedColor = this.data.splatColor;
        let colorSelection;

        let splatU = this.data.splatUrl;
        let initialPosition = this.data.initialPosition;
        let downsampleF = this.data.downsampleFactor;
        let splatP = this.data.splatPixelDiscard;
        let vertexC;
        let particle;

        if (this.data.slider == false) {
            vertexC = this.data.vertexCount;
            particle = this.data.splatSize;
        } else {
            vertexC = this.data.vertexCount;
            particle = this.data.splatSize;

            // Create the slider element for vertex count
            var slider = document.createElement("input");
            slider.type = "range";
            slider.min = vertexC / 10;
            slider.max = vertexC;
            slider.step = vertexC / 10;
            slider.value = vertexC;
            slider.id = "slider";
            slider.style.position = "absolute";
            slider.style.bottom = "25%";
            slider.style.left = "50%";
            slider.style.transform = "translateX(-50%)";
            slider.style.display = "block";
            slider.style.zIndex = "1";
            // Create a div element for the label
            var labelDiv = document.createElement("div");
            labelDiv.textContent = "Change vertex count";
            labelDiv.style.position = "absolute";
            labelDiv.style.bottom = "20%";
            labelDiv.style.left = "50%";
            labelDiv.style.transform = "translateX(-50%)";
            labelDiv.style.zIndex = "1";
            labelDiv.style.color = "#fff";
            labelDiv.style.fontSize = "24px";
            document.body.appendChild(labelDiv);
            document.body.appendChild(slider);

            // Particle size
            var slider2 = document.createElement("input");
            slider2.type = "range";
            slider2.min = 0;
            slider2.max = particle;
            slider2.step = 1.0;
            slider2.value = particle;
            slider2.id = "slider2";
            slider2.style.position = "absolute";
            slider2.style.bottom = "15%";
            slider2.style.left = "50%";
            slider2.style.transform = "translateX(-50%)";
            slider2.style.display = "block";
            slider2.style.zIndex = "1";
            // Create a div element for the label
            var labelDiv2 = document.createElement("div");
            labelDiv2.textContent = "Change splat size";
            labelDiv2.style.position = "absolute";
            labelDiv2.style.bottom = "10%";
            labelDiv2.style.left = "50%";
            labelDiv2.style.transform = "translateX(-50%)";
            labelDiv2.style.zIndex = "1";
            labelDiv2.style.color = "#fff";
            labelDiv2.style.fontSize = "24px";
            document.body.appendChild(labelDiv2);
            document.body.appendChild(slider2);

            function updateVertexCount() {
                let sliderValue = document.getElementById("slider").value;
                vertexC = parseInt(sliderValue);
                this.viewer.updateWorkerBuffer();
            }

            function updateParticleSize() {
                let sliderValue = document.getElementById("slider2").value;
                particle = sliderValue + ".0";
                this.viewer.cameraSpecs.fx = particle;
                this.viewer.cameraSpecs.fy = particle;
                console.log(this.viewer.cameraSpecs.fy);
                this.viewer.updateSplatMeshUniforms();
            }
        }
        if (this.data.slider == true) {
            // Add event listener to the slider
            document.getElementById("slider").addEventListener("input", function () {
                updateVertexCount();
            });
            document.getElementById("slider2").addEventListener("input", function () {
                updateParticleSize();
            });
        }

        const values = initialPosition.split(" ");
        const val = {
            x: parseFloat(values[0]),
            y: parseFloat(values[1]),
            z: parseFloat(values[2]),
        };

        if (selectedColor == "color") {
            colorSelection = `            
      float B = exp(A) * vColor.a;
      gl_FragColor = vec4(B * vColor.rgb, B);
      `;
        } else if (selectedColor == "grayscale") {
            colorSelection = `
      float grayscale = dot(vColor.rgb, vec3(0.2989, 0.5870, 0.1140));
      float B = exp(A) * vColor.a;
      gl_FragColor = vec4(B * vec3(grayscale), B);
      `;
        } else if (selectedColor == "blackAndWhite") {
            colorSelection = `
      float grayscale = dot(vColor.rgb, vec3(0.2989, 0.5870, 0.1140));
      float B = exp(A) * vColor.a;
      vec3 blackAndWhite = vec3(0.0);
      if (grayscale < 0.5) {
        blackAndWhite = vec3(0.1);
      } else if (grayscale < 1.0) {
        blackAndWhite = vec3(1.0);
      }
      gl_FragColor = vec4(B * blackAndWhite, B);`;
        } else if (selectedColor == "green") {
            colorSelection = `
      float grayscale = dot(vColor.rgb, vec3(0.2989, 0.5870, 0.1140));
    float B = exp(A) * vColor.a;
    gl_FragColor = vec4(B * vec3(0.0, grayscale, 0.0), B);`;
        }
        // renderer.anialias = false;
        // renderer.shadowMap.enabled = false;
        // renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        const element = document.querySelector("a-entity[gaussian-splatting]");
        element.setAttribute("gaussian-splatting", "splatSize: 500.0");

        class SplatBuffer {
            static RowSizeBytes = 44;
            static RowSizeFloats = 11;
            static CovarianceSizeFloat = 6;
            static CovarianceSizeBytes = 24;
            static ColorSizeFloats = 4;
            static ColorSizeBytes = 16;

            static ScaleRowOffsetFloats = 3;
            static ScaleRowOffsetBytes = 12;
            static ColorRowOffsetBytes = 24;
            static RotationRowOffsetFloats = 7;
            static RotationRowOffsetBytes = 28;

            constructor(bufferData) {
                this.bufferData = bufferData;
                this.covarianceBufferData = null;
                this.colorBufferData = null;
            }

            buildPreComputedBuffers() {
                const vertexCount = vertexC; //this.getVertexCount(); // vertexC

                this.covarianceBufferData = new ArrayBuffer(
                    SplatBuffer.CovarianceSizeBytes * vertexCount
                );
                const covarianceArray = new Float32Array(this.covarianceBufferData);

                this.colorBufferData = new ArrayBuffer(
                    SplatBuffer.ColorSizeBytes * vertexCount
                );
                const colorArray = new Float32Array(this.colorBufferData);

                const splatFloatArray = new Float32Array(this.bufferData);
                const splatUintArray = new Uint8Array(this.bufferData);

                const scale = new THREE.Vector3();
                const rotation = new THREE.Quaternion();
                const rotationMatrix = new THREE.Matrix3();
                const scaleMatrix = new THREE.Matrix3();
                const covarianceMatrix = new THREE.Matrix3();
                const tempMatrix4 = new THREE.Matrix4();

                const downsampleFactor = downsampleF; // Adjust the downsample factor as needed

                for (let i = 0; i < vertexCount; i += downsampleFactor) {
                    const baseColor =
                        SplatBuffer.RowSizeBytes * i + SplatBuffer.ColorRowOffsetBytes;
                    colorArray[SplatBuffer.ColorSizeFloats * i] =
                        splatUintArray[baseColor] / 255;
                    colorArray[SplatBuffer.ColorSizeFloats * i + 1] =
                        splatUintArray[baseColor + 1] / 255;
                    colorArray[SplatBuffer.ColorSizeFloats * i + 2] =
                        splatUintArray[baseColor + 2] / 255;
                    colorArray[SplatBuffer.ColorSizeFloats * i + 3] =
                        splatUintArray[baseColor + 3] / 255;

                    const baseScale =
                        SplatBuffer.RowSizeFloats * i + SplatBuffer.ScaleRowOffsetFloats;
                    scale.set(
                        splatFloatArray[baseScale],
                        splatFloatArray[baseScale + 1],
                        splatFloatArray[baseScale + 2]
                    );
                    tempMatrix4.makeScale(scale.x, scale.y, scale.z);
                    scaleMatrix.setFromMatrix4(tempMatrix4);

                    const rotationBase =
                        SplatBuffer.RowSizeFloats * i + SplatBuffer.RotationRowOffsetFloats;
                    rotation.set(
                        splatFloatArray[rotationBase + 1],
                        splatFloatArray[rotationBase + 2],
                        splatFloatArray[rotationBase + 3],
                        splatFloatArray[rotationBase]
                    );
                    tempMatrix4.makeRotationFromQuaternion(rotation);
                    rotationMatrix.setFromMatrix4(tempMatrix4);

                    covarianceMatrix.copy(rotationMatrix).multiply(scaleMatrix);
                    const M = covarianceMatrix.elements;

                    covarianceArray[SplatBuffer.CovarianceSizeFloat * i] =
                        M[0] * M[0] + M[3] * M[3] + M[6] * M[6];
                    covarianceArray[SplatBuffer.CovarianceSizeFloat * i + 1] =
                        M[0] * M[1] + M[3] * M[4] + M[6] * M[7];
                    covarianceArray[SplatBuffer.CovarianceSizeFloat * i + 2] =
                        M[0] * M[2] + M[3] * M[5] + M[6] * M[8];
                    covarianceArray[SplatBuffer.CovarianceSizeFloat * i + 3] =
                        M[1] * M[1] + M[4] * M[4] + M[7] * M[7];
                    covarianceArray[SplatBuffer.CovarianceSizeFloat * i + 4] =
                        M[1] * M[2] + M[4] * M[5] + M[7] * M[8];
                    covarianceArray[SplatBuffer.CovarianceSizeFloat * i + 5] =
                        M[2] * M[2] + M[5] * M[5] + M[8] * M[8];
                }

                this.vertexCount = Math.ceil(vertexCount / downsampleFactor);
            }

            getBufferData() {
                return this.bufferData;
            }

            getCovarianceBufferData() {
                return this.covarianceBufferData;
            }

            getColorBufferData() {
                return this.colorBufferData;
            }

            getVertexCount() {
                return vertexC; //this.bufferData.byteLength / SplatBuffer.RowSizeBytes;
            }
        }

        class PlyParser {
            constructor(plyBuffer) {
                this.plyBuffer = plyBuffer;
            }

            decodeHeader(plyBuffer) {
                const decoder = new TextDecoder();
                let headerOffset = 0;
                let headerText = "";

                while (true) {
                    const headerChunk = new Uint8Array(plyBuffer, headerOffset, 50);
                    headerText += decoder.decode(headerChunk);
                    headerOffset += 50;
                    if (headerText.includes("end_header")) {
                        break;
                    }
                }

                const headerLines = headerText.split("\n");

                let vertexCount = 0;
                let propertyTypes = {};

                for (let i = 0; i < headerLines.length; i++) {
                    const line = headerLines[i].trim();
                    if (line.startsWith("element vertex")) {
                        const vertexCountMatch = line.match(/\d+/);
                        if (vertexCountMatch) {
                            vertexCount = parseInt(vertexCountMatch[0]);
                        }
                    } else if (line.startsWith("property")) {
                        const propertyMatch = line.match(/(\w+)\s+(\w+)\s+(\w+)/);
                        if (propertyMatch) {
                            const propertyType = propertyMatch[2];
                            const propertyName = propertyMatch[3];
                            propertyTypes[propertyName] = propertyType;
                        }
                    } else if (line === "end_header") {
                        break;
                    }
                }

                const vertexByteOffset =
                    headerText.indexOf("end_header") + "end_header".length + 1;
                const vertexData = new DataView(plyBuffer, vertexByteOffset);

                return {
                    vertexCount: vertexCount,
                    propertyTypes: propertyTypes,
                    vertexData: vertexData,
                    headerOffset: headerOffset,
                };
            }

            readRawVertexFast(
                vertexData,
                offset,
                fieldOffsets,
                propertiesToRead,
                propertyTypes,
                outVertex
            ) {
                let rawVertex = outVertex || {};
                for (let property of propertiesToRead) {
                    const propertyType = propertyTypes[property];
                    if (propertyType === "float") {
                        rawVertex[property] = vertexData.getFloat32(
                            offset + fieldOffsets[property],
                            true
                        );
                    } else if (propertyType === "uchar") {
                        rawVertex[property] =
                            vertexData.getUint8(offset + fieldOffsets[property]) / 255.0;
                    }
                }
            }

            parseToSplatBuffer() {
                console.time("PLY load");

                const { vertexCount, propertyTypes, vertexData } = this.decodeHeader(
                    this.plyBuffer
                );

                let nRestCoeffs = 0;
                for (const propertyName in propertyTypes) {
                    if (propertyName.startsWith("f_rest_")) {
                        nRestCoeffs += 1;
                    }
                }
                const nCoeffsPerColor = nRestCoeffs / 3;

                const sphericalHarmonicsDegree = 0;

                console.log(
                    "Detected degree",
                    sphericalHarmonicsDegree,
                    "with ",
                    nCoeffsPerColor,
                    "coefficients per color"
                );

                const shFeatureOrder = [];
                for (let rgb = 0; rgb < 3; ++rgb) {
                    shFeatureOrder.push(`f_dc_${rgb}`);
                }
                for (let i = 0; i < nCoeffsPerColor; ++i) {
                    for (let rgb = 0; rgb < 3; ++rgb) {
                        shFeatureOrder.push(`f_rest_${rgb * nCoeffsPerColor + i}`);
                    }
                }

                let plyRowSize = 0;
                let fieldOffsets = {};
                const fieldSize = {
                    double: 8,
                    int: 4,
                    uint: 4,
                    float: 4,
                    short: 2,
                    ushort: 2,
                    uchar: 1,
                };
                for (let fieldName in propertyTypes) {
                    if (propertyTypes.hasOwnProperty(fieldName)) {
                        const type = propertyTypes[fieldName];
                        fieldOffsets[fieldName] = plyRowSize;
                        plyRowSize += fieldSize[type];
                    }
                }

                let rawVertex = {};

                const propertiesToRead = [
                    "scale_0",
                    "scale_1",
                    "scale_2",
                    "rot_0",
                    "rot_1",
                    "rot_2",
                    "rot_3",
                    "x",
                    "y",
                    "z",
                    "f_dc_0",
                    "f_dc_1",
                    "f_dc_2",
                    "opacity",
                ];

                console.time("Importance computations");
                let sizeList = new Float32Array(vertexCount);
                let sizeIndex = new Uint32Array(vertexCount);
                for (let row = 0; row < vertexCount; row++) {
                    this.readRawVertexFast(
                        vertexData,
                        row * plyRowSize,
                        fieldOffsets,
                        propertiesToRead,
                        propertyTypes,
                        rawVertex
                    );
                    sizeIndex[row] = row;
                    if (!propertyTypes["scale_0"]) continue;
                    const size =
                        Math.exp(rawVertex.scale_0) *
                        Math.exp(rawVertex.scale_1) *
                        Math.exp(rawVertex.scale_2);
                    const opacity = 1 / (1 + Math.exp(-rawVertex.opacity));
                    sizeList[row] = size * opacity;
                }
                console.timeEnd("Importance computations");

                console.time("Importance sort");
                sizeIndex.sort((b, a) => sizeList[a] - sizeList[b]);
                console.timeEnd("Importance sort");

                const splatBufferData = new ArrayBuffer(
                    SplatBuffer.RowSizeBytes * vertexCount
                );

                for (let j = 0; j < vertexCount; j++) {
                    const row = sizeIndex[j];
                    const offset = row * plyRowSize;
                    this.readRawVertexFast(
                        vertexData,
                        offset,
                        fieldOffsets,
                        propertiesToRead,
                        propertyTypes,
                        rawVertex
                    );
                    const position = new Float32Array(
                        splatBufferData,
                        j * SplatBuffer.RowSizeBytes,
                        3
                    );
                    const scales = new Float32Array(
                        splatBufferData,
                        j * SplatBuffer.RowSizeBytes + SplatBuffer.ScaleRowOffsetBytes,
                        3
                    );
                    const rgba = new Uint8ClampedArray(
                        splatBufferData,
                        j * SplatBuffer.RowSizeBytes + SplatBuffer.ColorRowOffsetBytes,
                        4
                    );
                    const rot = new Float32Array(
                        splatBufferData,
                        j * SplatBuffer.RowSizeBytes + SplatBuffer.RotationRowOffsetBytes,
                        4
                    );

                    if (propertyTypes["scale_0"]) {
                        const quat = new THREE.Quaternion(
                            rawVertex.rot_1,
                            rawVertex.rot_2,
                            rawVertex.rot_3,
                            rawVertex.rot_0
                        );
                        quat.normalize();
                        rot.set([quat.w, quat.x, quat.y, quat.z]);
                        scales.set([
                            Math.exp(rawVertex.scale_0),
                            Math.exp(rawVertex.scale_1),
                            Math.exp(rawVertex.scale_2),
                        ]);
                    } else {
                        scales.set([0.01, 0.01, 0.01]);
                        rot.set([1.0, 0.0, 0.0, 0.0]);
                    }

                    position.set([rawVertex.x, rawVertex.y, rawVertex.z]);

                    if (propertyTypes["f_dc_0"]) {
                        const SH_C0 = 0.28209479177387814;
                        rgba.set([
                            (0.5 + SH_C0 * rawVertex.f_dc_0) * 255,
                            (0.5 + SH_C0 * rawVertex.f_dc_1) * 255,
                            (0.5 + SH_C0 * rawVertex.f_dc_2) * 255,
                        ]);
                    } else {
                        rgba.set([255, 0, 0]);
                    }
                    if (propertyTypes["opacity"]) {
                        rgba[3] = (1 / (1 + Math.exp(-rawVertex.opacity))) * 255;
                    } else {
                        rgba[3] = 255;
                    }
                }

                console.timeEnd("PLY load");

                const splatBuffer = new SplatBuffer(splatBufferData);
                splatBuffer.buildPreComputedBuffers();
                return splatBuffer;
            }
        }

        class PlyLoader {
            constructor() {
                this.splatBuffer = null;
            }

            fetchFile(fileName) {
                return new Promise((resolve, reject) => {
                    fetch(fileName)
                        .then((res) => {
                            return res.arrayBuffer();
                        })
                        .then((data) => {
                            resolve(data);
                        })
                        .catch((err) => {
                            reject(err);
                        });
                });
            }

            loadFromFile(fileName) {
                return new Promise((resolve, reject) => {
                    const loadPromise = this.fetchFile(fileName);
                    loadPromise
                        .then((plyFileData) => {
                            const plyParser = new PlyParser(plyFileData);
                            const splatBuffer = plyParser.parseToSplatBuffer();
                            this.splatBuffer = splatBuffer;
                            resolve(splatBuffer);
                        })
                        .catch((err) => {
                            reject(err);
                        });
                });
            }
        }

        class SplatLoader {
            constructor(splatBuffer = null) {
                this.splatBuffer = splatBuffer;
                this.downLoadLink = null;
            }

            loadFromFile(fileName) {
                return new Promise((resolve, reject) => {
                    fetch(fileName)
                        .then((res) => {
                            return res.arrayBuffer();
                        })
                        .then((bufferData) => {
                            const splatBuffer = new SplatBuffer(bufferData);
                            splatBuffer.buildPreComputedBuffers();
                            resolve(splatBuffer);
                        })
                        .catch((err) => {
                            reject(err);
                        });
                });
            }

            setFromBuffer(splatBuffer) {
                this.splatBuffer = splatBuffer;
            }

            saveToFile(fileName) {
                const splatData = new Uint8Array(this.splatBuffer.getBufferData());
                const blob = new Blob([splatData.buffer], {
                    type: "application/octet-stream",
                });

                if (!this.downLoadLink) {
                    this.downLoadLink = document.createElement("a");
                    document.body.appendChild(this.downLoadLink);
                }
                this.downLoadLink.download = fileName;
                this.downLoadLink.href = URL.createObjectURL(blob);
                this.downLoadLink.click();
            }
        }

        function createSortWorker(self) {
            let splatBuffer;
            let precomputedCovariance;
            let precomputedColor;
            let vertexCount = 0;
            let viewProj;
            let depthMix = new BigInt64Array();
            let lastProj = [];

            let rowSizeFloats = 0;

            const runSort = (viewProj) => {
                if (!splatBuffer) return;

                const splatArray = new Float32Array(splatBuffer);
                const pCovarianceArray = new Float32Array(precomputedCovariance);
                const pColorArray = new Float32Array(precomputedColor);
                const color = new Float32Array(4 * vertexCount);
                const centerCov = new Float32Array(9 * vertexCount);

                if (depthMix.length !== vertexCount) {
                    depthMix = new BigInt64Array(vertexCount);
                    const indexMix = new Uint32Array(depthMix.buffer);
                    for (let j = 0; j < vertexCount; j++) {
                        indexMix[2 * j] = j;
                    }
                } else {
                    let dot =
                        lastProj[2] * viewProj[2] +
                        lastProj[6] * viewProj[6] +
                        lastProj[10] * viewProj[10];
                    if (Math.abs(dot - 1) < 0.01) {
                        return;
                    }
                }

                const floatMix = new Float32Array(depthMix.buffer);
                const indexMix = new Uint32Array(depthMix.buffer);

                for (let j = 0; j < vertexCount; j++) {
                    let i = indexMix[2 * j];
                    const splatArrayBase = rowSizeFloats * i;
                    floatMix[2 * j + 1] =
                        10000 +
                        viewProj[2] * splatArray[splatArrayBase] +
                        viewProj[6] * splatArray[splatArrayBase + 1] +
                        viewProj[10] * splatArray[splatArrayBase + 2];
                }

                lastProj = viewProj;

                depthMix.sort();

                for (let j = 0; j < vertexCount; j++) {
                    const i = indexMix[2 * j];

                    const centerCovBase = 9 * j;
                    const pCovarianceBase = 6 * i;
                    const colorBase = 4 * j;
                    const pcColorBase = 4 * i;
                    const splatArrayBase = rowSizeFloats * i;

                    centerCov[centerCovBase] = splatArray[splatArrayBase];
                    centerCov[centerCovBase + 1] = splatArray[splatArrayBase + 1];
                    centerCov[centerCovBase + 2] = splatArray[splatArrayBase + 2];

                    color[colorBase] = pColorArray[pcColorBase];
                    color[colorBase + 1] = pColorArray[pcColorBase + 1];
                    color[colorBase + 2] = pColorArray[pcColorBase + 2];
                    color[colorBase + 3] = pColorArray[pcColorBase + 3];

                    centerCov[centerCovBase + 3] = pCovarianceArray[pCovarianceBase];
                    centerCov[centerCovBase + 4] = pCovarianceArray[pCovarianceBase + 1];
                    centerCov[centerCovBase + 5] = pCovarianceArray[pCovarianceBase + 2];
                    centerCov[centerCovBase + 6] = pCovarianceArray[pCovarianceBase + 3];
                    centerCov[centerCovBase + 7] = pCovarianceArray[pCovarianceBase + 4];
                    centerCov[centerCovBase + 8] = pCovarianceArray[pCovarianceBase + 5];
                }

                self.postMessage({ color, centerCov }, [
                    color.buffer,
                    centerCov.buffer,
                ]);
            };

            const throttledSort = () => {
                if (!sortRunning) {
                    sortRunning = true;
                    let lastView = viewProj;
                    runSort(lastView);
                    setTimeout(() => {
                        sortRunning = false;
                        if (lastView !== viewProj) {
                            throttledSort();
                        }
                    }, 0);
                }
            };

            let sortRunning;
            self.onmessage = (e) => {
                if (e.data.bufferUpdate) {
                    rowSizeFloats = e.data.bufferUpdate.rowSizeFloats;
                    rowSizeBytes = e.data.bufferUpdate.rowSizeBytes;
                    splatBuffer = e.data.bufferUpdate.splatBuffer;
                    precomputedCovariance = e.data.bufferUpdate.precomputedCovariance;
                    precomputedColor = e.data.bufferUpdate.precomputedColor;
                    vertexCount = e.data.bufferUpdate.vertexCount; //1000000
                } else if (e.data.sort) {
                    viewProj = e.data.sort.view;
                    throttledSort();
                }
            };
        }

        const DEFAULT_CAMERA_SPECS = {
            fx: particle, //1159.5880733038064,
            fy: particle, //1164.6601287484507,
            near: 0.1,
            far: 500,
        };

        class Viewer {
            constructor(
                cameraUp = [0, 0, 0],
                initialCameraPos = [0, 0, 0],
                initialCameraLookAt = [0, 0, 0],
                cameraSpecs = DEFAULT_CAMERA_SPECS,

                selfDrivenMode = true
            ) {
                this.cameraUp = new THREE.Vector3().fromArray(cameraUp);
                this.initialCameraPos = new THREE.Vector3().fromArray(initialCameraPos);
                this.initialCameraLookAt = new THREE.Vector3().fromArray(
                    initialCameraLookAt
                );
                this.cameraSpecs = cameraSpecs;
                this.selfDrivenMode = selfDrivenMode;
                this.realProjectionMatrix = new THREE.Matrix4();
                this.splatBuffer = null;

                this.splatMesh = null;
                this.sortWorker = null;
                this.resizeFunc = this.onResize.bind(this);
            }

            getRenderDimensions(outDimensions) {
                outDimensions.x = window.innerWidth;
                outDimensions.y = window.innerHeight;
            }

            // updateRealProjectionMatrix(renderDimensions) {
            //   this.realProjectionMatrix.elements = [
            //     [-(2 * this.cameraSpecs.fx) / renderDimensions.x, 0, 0, 0],
            //     [0, -(2 * this.cameraSpecs.fy) / renderDimensions.y, 0, 0],
            //     [
            //       0,
            //       0,
            //       -(this.cameraSpecs.far + this.cameraSpecs.near) /
            //         (this.cameraSpecs.far - this.cameraSpecs.near),
            //       -1,
            //     ],
            //     [
            //       0,
            //       0,
            //       -(2.0 * this.cameraSpecs.far * this.cameraSpecs.near) /
            //         (this.cameraSpecs.far - this.cameraSpecs.near),
            //       0,
            //     ],
            //   ].flat();
            // }
            updateRealProjectionMatrix(renderDimensions) {
                const entity = document.querySelectorAll("a-entity")[0].object3D;
                const entityRotation = entity.rotation;
                const entityPosition = entity.position;


                const scaleX = -(2 * this.cameraSpecs.fx) / renderDimensions.x;
                const scaleY = -(2 * this.cameraSpecs.fy) / renderDimensions.y;
                const near = this.cameraSpecs.near;
                const far = this.cameraSpecs.far;

                this.realProjectionMatrix.elements = [
                    scaleX, 0, 0, 0,
                    0, scaleY, 0, 0,
                    0, 0, -(far + near) / (far - near), -1,
                    0, 0, -(2 * far * near) / (far - near), 0
                ];

                // Apply the entity's rotation, position, and scale
                const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(entityRotation);
                this.realProjectionMatrix.multiply(rotationMatrix);
                this.realProjectionMatrix.setPosition(entityPosition);

            }


            onResize = (function () {
                const renderDimensions = new THREE.Vector2();

                return function () {
                    renderer.setSize(1, 1);
                    this.getRenderDimensions(renderDimensions);
                    camera.aspect = renderDimensions.x / renderDimensions.y;
                    camera.updateProjectionMatrix();
                    renderer.setSize(renderDimensions.x, renderDimensions.y);
                    this.updateRealProjectionMatrix(renderDimensions);
                    this.updateSplatMeshUniforms();
                };
            })();
            init() {
                const renderDimensions = new THREE.Vector2();
                this.getRenderDimensions(renderDimensions);
                camera.aspect = renderDimensions.x / renderDimensions.y;
                camera.position.copy(this.initialCameraPos);
                camera.lookAt(this.initialCameraLookAt);
                camera.up.copy(this.cameraUp).normalize();
                this.updateRealProjectionMatrix(renderDimensions);

                renderer.setSize(renderDimensions.x, renderDimensions.y);

                window.addEventListener("resize", this.resizeFunc, false);

                this.sortWorker = new Worker(
                    URL.createObjectURL(
                        new Blob(["(", createSortWorker.toString(), ")(self)"], {
                            type: "application/javascript",
                        })
                    )
                );

                this.sortWorker.onmessage = (e) => {
                    let { color, centerCov } = e.data;
                    this.updateSplatMeshAttributes(color, centerCov);
                    this.updateSplatMeshUniforms();
                };
            }

            updateSplatMeshAttributes(colors, centerCovariances) {
                const vertexCount = centerCovariances.length / 9;
                const geometry = this.splatMesh.geometry;

                geometry.attributes.splatCenterCovariance.set(centerCovariances);
                geometry.attributes.splatCenterCovariance.needsUpdate = true;
                geometry.attributes.splatColor.set(colors);
                geometry.attributes.splatColor.needsUpdate = true;

                geometry.instanceCount = vertexCount;
            }

            updateSplatMeshUniforms = (function () {
                const renderDimensions = new THREE.Vector2();

                return function () {
                    this.getRenderDimensions(renderDimensions);
                    if (this.splatMesh) {
                        this.splatMesh.material.uniforms.realProjectionMatrix.value.copy(
                            this.realProjectionMatrix
                        );
                        this.splatMesh.material.uniforms.focal.value.set(
                            this.cameraSpecs.fx,
                            this.cameraSpecs.fy
                        );
                        this.splatMesh.material.uniforms.viewport.value.set(
                            renderDimensions.x,
                            renderDimensions.y
                        );
                        this.splatMesh.material.uniformsNeedUpdate = true;
                    }
                };
            })();

            loadFile(fileName) {
                // Creating the div element
                let loadingDiv = document.createElement("div");
                loadingDiv.id = "loader";
                loadingDiv.textContent = "Loading...";
                loadingDiv.style.fontSize = "22px";
                // Styling the div element
                loadingDiv.style.position = "fixed";
                loadingDiv.style.top = "50%";
                loadingDiv.style.left = "50%";
                loadingDiv.style.transform = "translate(-50%, -50%)";

                // Appending the div element to the document body
                document.body.appendChild(loadingDiv);
                const loadPromise = new Promise((resolve, reject) => {
                    let fileLoadPromise;
                    if (fileName.endsWith(".splat")) {
                        fileLoadPromise = new SplatLoader().loadFromFile(fileName);
                    } else if (fileName.endsWith(".ply")) {
                        fileLoadPromise = new PlyLoader().loadFromFile(fileName);
                    } else {
                        reject(
                            new Error(
                                `Viewer::loadFile -> File format not supported: ${fileName}`
                            )
                        );
                    }
                    fileLoadPromise
                        .then((splatBuffer) => {
                            resolve(splatBuffer);
                        })
                        .catch((e) => {
                            reject(
                                new Error(`Viewer::loadFile -> Could not load file ${fileName}`)
                            );
                        });
                });

                return loadPromise.then((splatBuffer) => {
                    this.splatBuffer = splatBuffer;
                    this.splatMesh = this.buildMesh(this.splatBuffer);
                    this.splatMesh.frustumCulled = false;
                    document.querySelector("#loader").style.display = "none";
                    scene.add(this.splatMesh);
                    this.updateWorkerBuffer();
                });
            }

            updateView = (function () {
                const tempMatrix = new THREE.Matrix4();
                const tempVector2 = new THREE.Vector2();

                return function () {
                    this.getRenderDimensions(tempVector2);
                    tempMatrix.copy(camera.matrixWorld).invert();
                    tempMatrix.premultiply(this.realProjectionMatrix);
                    this.sortWorker.postMessage({
                        sort: {
                            view: tempMatrix.elements,
                        },
                    });
                };
            })();

            updateWorkerBuffer = (function () {
                return function () {
                    this.sortWorker.postMessage({
                        bufferUpdate: {
                            rowSizeFloats: SplatBuffer.RowSizeFloats,
                            rowSizeBytes: SplatBuffer.RowSizeBytes,
                            splatBuffer: this.splatBuffer.getBufferData(),
                            precomputedCovariance: this.splatBuffer.getCovarianceBufferData(),
                            precomputedColor: this.splatBuffer.getColorBufferData(),
                            vertexCount: this.splatBuffer.getVertexCount(),
                        },
                    });
                };
            })();

            buildMaterial() {
                const vertexShaderSource = `
                    #include <common>
                    precision mediump float;
        
                    attribute vec4 splatColor;
                    attribute mat3 splatCenterCovariance;
        
                    uniform mat4 realProjectionMatrix;
                    uniform vec2 focal;
                    uniform vec2 viewport;
        
                    varying vec4 vColor;
                    varying vec2 vPosition;
        
                    void main () {
        
                    vec3 splatCenter = splatCenterCovariance[0];
                    vec3 cov3D_M11_M12_M13 = splatCenterCovariance[1];
                    vec3 cov3D_M22_M23_M33 = splatCenterCovariance[2];
        
                    vec4 camspace = viewMatrix * vec4(splatCenter, 1);
                    vec4 pos2d = realProjectionMatrix * camspace;
        
                    float bounds = 1.2 * pos2d.w;
                    if (pos2d.z < -pos2d.w || pos2d.x < -bounds || pos2d.x > bounds
                        || pos2d.y < -bounds || pos2d.y > bounds) {
                        gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
                        return;
                    }
        
                    mat3 Vrk = mat3(
                        cov3D_M11_M12_M13.x, cov3D_M11_M12_M13.y, cov3D_M11_M12_M13.z,
                        cov3D_M11_M12_M13.y, cov3D_M22_M23_M33.x, cov3D_M22_M23_M33.y,
                        cov3D_M11_M12_M13.z, cov3D_M22_M23_M33.y, cov3D_M22_M23_M33.z
                    );
        
                    mat3 J = mat3(
                        focal.x / camspace.z, 0., -(focal.x * camspace.x) / (camspace.z * camspace.z),
                        0., focal.y / camspace.z, -(focal.y * camspace.y) / (camspace.z * camspace.z),
                        0., 0., 0.
                    );
        
                    mat3 W = transpose(mat3(viewMatrix));
                    mat3 T = W * J;
                    mat3 cov2Dm = transpose(T) * Vrk * T;
                    cov2Dm[0][0] += 0.5;
                    cov2Dm[1][1] += 0.3;
                    vec3 cov2Dv = vec3(cov2Dm[0][0], cov2Dm[0][1], cov2Dm[1][1]);
        
                    vec2 vCenter = vec2(pos2d) / pos2d.w;
        
                    float diagonal1 = cov2Dv.x;
                    float offDiagonal = cov2Dv.y;
                    float diagonal2 = cov2Dv.z;
        
                    float mid = 0.5 * (diagonal1 + diagonal2);
                    float radius = length(vec2((diagonal1 - diagonal2) / 2.0, offDiagonal));
                    float lambda1 = mid + radius;
                    float lambda2 = max(mid - radius, 0.1);
                    vec2 diagonalVector = normalize(vec2(offDiagonal, lambda1 - diagonal1));
                    vec2 v1 = min(sqrt(2.0 * lambda1), 1024.0) * diagonalVector;
                    vec2 v2 = min(sqrt(2.0 * lambda2), 1024.0) * vec2(diagonalVector.y, -diagonalVector.x);
        
                    vColor = splatColor;
                    vPosition = position.xy;
        
                    vec2 projectedCovariance = vCenter +
                                               position.x * v1 / viewport * 2.0 +
                                               position.y * v2 / viewport * 2.0;
        
                    gl_Position = vec4(projectedCovariance, 0.0, 1.0);
                }`;
                const fragmentShaderSource = `
                    #include <common>
                    precision mediump float;
        
                    varying vec4 vColor;
                    varying vec2 vPosition;
        
                    void main () {
                        float A = -dot(vPosition, vPosition);
                        if (A < - ${splatP.toFixed(1)}) discard;
                        
                        ${colorSelection}                        
                    }`;

                const uniforms = {
                    realProjectionMatrix: {
                        type: "v4v",
                        value: new THREE.Matrix4(),
                    },
                    focal: {
                        type: "v2",
                        value: new THREE.Vector2(),
                    },

                    viewport: {
                        type: "v2",
                        value: new THREE.Vector2(),
                    },
                };
                return new THREE.ShaderMaterial({
                    uniforms: uniforms,
                    vertexShader: vertexShaderSource,
                    fragmentShader: fragmentShaderSource,
                    // transparent: true,
                    // alphaTest: 1.0,
                    blending: THREE.CustomBlending,
                    blendEquation: THREE.AddEquation,
                    blendSrc: THREE.OneMinusDstAlphaFactor,
                    blendDst: THREE.OneFactor,
                    blendSrcAlpha: THREE.OneMinusDstAlphaFactor,
                    blendDstAlpha: THREE.OneFactor,
                    depthTest: false,
                    depthWrite: false,
                    // side: THREE.DoubleSide
                });
            }

            buildGeometry(splatBuffer) {
                const baseGeometry = new THREE.BufferGeometry();

                const positionsArray = new Float32Array(18); // quality
                const positions = new THREE.BufferAttribute(positionsArray, 3);
                baseGeometry.setAttribute("position", positions);
                positions.setXYZ(2, -2.0, 2.0, 0.0);
                positions.setXYZ(1, -2.0, -2.0, 0.0);
                positions.setXYZ(0, 2.0, 2.0, 0.0);
                positions.setXYZ(5, -2.0, -2.0, 0.0);
                positions.setXYZ(4, 2.0, -2.0, 0.0);
                positions.setXYZ(3, 2.0, 2.0, 0.0);
                positions.needsUpdate = true;
                const geometry = new THREE.InstancedBufferGeometry().copy(baseGeometry);
                const splatColorsArray = new Float32Array(
                    splatBuffer.getVertexCount() * 4
                );
                const splatColors = new THREE.InstancedBufferAttribute(
                    splatColorsArray,
                    4,
                    false
                );
                splatColors.setUsage(THREE.DynamicDrawUsage);
                geometry.setAttribute("splatColor", splatColors);

                const splatCentersArray = new Float32Array(
                    splatBuffer.getVertexCount() * 9
                );
                const splatCenters = new THREE.InstancedBufferAttribute(
                    splatCentersArray,
                    9,
                    false
                );
                splatCenters.setUsage(THREE.DynamicDrawUsage);
                geometry.setAttribute("splatCenterCovariance", splatCenters);

                return geometry;
            }

            /*
            //Quads:
            buildGeometry(splatBuffer) {
        const baseGeometry = new THREE.BufferGeometry();
      
        const positionsArray = new Float32Array(24); // 4 vertices per quad
        const positions = new THREE.BufferAttribute(positionsArray, 3);
        baseGeometry.setAttribute("position", positions);
        positions.setXYZ(0, -1.0, -1.0, 0.0);
        positions.setXYZ(1, -1.0, 1.0, 0.0);
        positions.setXYZ(2, 1.0, -1.0, 0.0);
        positions.setXYZ(3, 1.0, 1.0, 0.0);
        positions.needsUpdate = true;
      
        const geometry = new THREE.InstancedBufferGeometry().copy(baseGeometry);
      
        const splatColorsArray = new Float32Array(splatBuffer.getVertexCount() * 4);
        const splatColors = new THREE.InstancedBufferAttribute(
          splatColorsArray,
          4,
          false
        );
        splatColors.setUsage(THREE.DynamicDrawUsage);
        geometry.setAttribute("splatColor", splatColors);
      
        const splatCentersArray = new Float32Array(splatBuffer.getVertexCount() * 9);
        const splatCenters = new THREE.InstancedBufferAttribute(
          splatCentersArray,
          9,
          false
        );
        splatCenters.setUsage(THREE.DynamicDrawUsage);
        geometry.setAttribute("splatCenterCovariance", splatCenters);
      
        return geometry;
      }
            */

            buildMesh(splatBuffer) {
                const geometry = this.buildGeometry(splatBuffer);
                const material = this.buildMaterial();
                const mesh = new THREE.Mesh(geometry, material);
                return mesh;
            }
        }

        function init() {
            function load() {
                viewer = new Viewer([0, -1, 0], [val.x, val.y, val.z], [0, 0, 0]);
                viewer.init();
                viewer.loadFile(splatU);
            }
            load();
        }
        init();
    },
    tick: function () {
        if (viewer) {
            viewer.updateView();
        }
    },
});
