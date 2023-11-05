AFRAME.registerComponent("gaussian_splatting", {
	schema: {
		src: {type: 'string', default: "train.splat"},
		cutoutEntity: {type: 'selector'},
		pixelRatio: {type: 'number', default: 1},
		xrPixelRatio: {type: 'number', default: 0.5}
	},
	init: function () {
		// aframe-specific data
		if(this.data.pixelRatio > 0){
			this.el.sceneEl.renderer.setPixelRatio(this.data.pixelRatio);
		}
		if(this.data.xrPixelRatio > 0){
			this.el.sceneEl.renderer.xr.setFramebufferScaleFactor(this.data.xrPixelRatio);
		}

		document.querySelector('a-scene').addEventListener('loaded', () => {
			this.loadData(this.el.sceneEl.camera.el.components.camera.camera, this.el.object3D, this.el.sceneEl.renderer, this.data.src);
			if (!!this.data.cutoutEntity) {
				this.cutout = this.data.cutoutEntity.object3D;
			}
		})
	},
	// also works from vanilla three.js
	initGL: async function(numVertexes){
		console.log("initGL", numVertexes);
		this.object.frustumCulled = false;

		let gl = this.renderer.getContext();
		let mexTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
		this.maxVertexes = mexTextureSize * mexTextureSize;

		if(numVertexes > this.maxVertexes){
			console.log("numVertexes limited to ", this.maxVertexes, numVertexes);
			numVertexes = this.maxVertexes;
		}
		this.bufferTextureWidth = mexTextureSize;
		this.bufferTextureHeight = Math.floor((numVertexes - 1)/mexTextureSize) + 1;

		this.centerAndScaleData = new Float32Array(this.bufferTextureWidth * this.bufferTextureHeight * 4);
		this.covAndColorData = new Uint32Array(this.bufferTextureWidth * this.bufferTextureHeight * 4);
		this.centerAndScaleTexture = new THREE.DataTexture(this.centerAndScaleData, this.bufferTextureWidth, this.bufferTextureHeight, THREE.RGBA, THREE.FloatType);
		this.centerAndScaleTexture.needsUpdate = true;
		this.covAndColorTexture = new THREE.DataTexture(this.covAndColorData, this.bufferTextureWidth, this.bufferTextureHeight, THREE.RGBAIntegerFormat, THREE.UnsignedIntType);
		this.covAndColorTexture.internalFormat = "RGBA32UI";
		this.covAndColorTexture.needsUpdate = true;

		let splatIndexArray = new Uint32Array(this.bufferTextureWidth * this.bufferTextureHeight);
		const splatIndexes = new THREE.InstancedBufferAttribute(splatIndexArray, 1, false);
		splatIndexes.setUsage(THREE.DynamicDrawUsage);

		const baseGeometry = new THREE.BufferGeometry();
		const positionsArray = new Float32Array(6 * 3);
		const positions = new THREE.BufferAttribute(positionsArray, 3);
		baseGeometry.setAttribute('position', positions);
		positions.setXYZ(2, -2.0, 2.0, 0.0);
		positions.setXYZ(1, 2.0, 2.0, 0.0);
		positions.setXYZ(0, -2.0, -2.0, 0.0);
		positions.setXYZ(5, -2.0, -2.0, 0.0);
		positions.setXYZ(4, 2.0, 2.0, 0.0);
		positions.setXYZ(3, 2.0, -2.0, 0.0);
		positions.needsUpdate = true;

		const geometry = new THREE.InstancedBufferGeometry().copy(baseGeometry);
		geometry.setAttribute('splatIndex', splatIndexes);
		geometry.instanceCount = 1;

		const material = new THREE.ShaderMaterial( {
			uniforms : {
				viewport: {value: new Float32Array([1980, 1080])}, // Dummy. will be overwritten
				focal: {value: 1000.0}, // Dummy. will be overwritten
				centerAndScaleTexture: {value: this.centerAndScaleTexture},
				covAndColorTexture: {value: this.covAndColorTexture},
				gsProjectionMatrix: {value: this.getProjectionMatrix()},
				gsModelViewMatrix: {value: this.getModelViewMatrix()},
			},
			vertexShader: `
				precision highp sampler2D;
				precision highp usampler2D;

				out vec4 vColor;
				out vec2 vPosition;
				uniform vec2 viewport;
				uniform float focal;
				uniform mat4 gsProjectionMatrix;
				uniform mat4 gsModelViewMatrix;

				attribute uint splatIndex;
				uniform sampler2D centerAndScaleTexture;
				uniform usampler2D covAndColorTexture;

				vec2 unpackInt16(in uint value) {
					int v = int(value);
					int v0 = v >> 16;
					int v1 = (v & 0xFFFF);
					if((v & 0x8000) != 0)
						v1 |= 0xFFFF0000;
					return vec2(float(v1), float(v0));
				}

				void main () {
					ivec2 texSize = textureSize(centerAndScaleTexture, 0);
					ivec2 texPos = ivec2(splatIndex%uint(texSize.x), splatIndex/uint(texSize.x));
					vec4 centerAndScaleData = texelFetch(centerAndScaleTexture, texPos, 0);

					vec4 center = vec4(centerAndScaleData.xyz, 1);
					vec4 camspace = gsModelViewMatrix * center;
					vec4 pos2d = gsProjectionMatrix * camspace;

					float bounds = 1.2 * pos2d.w;
					if (pos2d.z < -pos2d.w || pos2d.x < -bounds || pos2d.x > bounds
						|| pos2d.y < -bounds || pos2d.y > bounds) {
						gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
						return;
					}

					uvec4 covAndColorData = texelFetch(covAndColorTexture, texPos, 0);
					vec2 cov3D_M11_M12 = unpackInt16(covAndColorData.x) * centerAndScaleData.w;
					vec2 cov3D_M13_M22 = unpackInt16(covAndColorData.y) * centerAndScaleData.w;
					vec2 cov3D_M23_M33 = unpackInt16(covAndColorData.z) * centerAndScaleData.w;
					mat3 Vrk = mat3(
						cov3D_M11_M12.x, cov3D_M11_M12.y, cov3D_M13_M22.x,
						cov3D_M11_M12.y, cov3D_M13_M22.y, cov3D_M23_M33.x,
						cov3D_M13_M22.x, cov3D_M23_M33.x, cov3D_M23_M33.y
					);

					mat3 J = mat3(
						focal / camspace.z, 0., -(focal * camspace.x) / (camspace.z * camspace.z), 
						0., -focal / camspace.z, (focal * camspace.y) / (camspace.z * camspace.z), 
						0., 0., 0.
					);

					mat3 W = transpose(mat3(gsModelViewMatrix));
					mat3 T = W * J;
					mat3 cov = transpose(T) * Vrk * T;

					vec2 vCenter = vec2(pos2d) / pos2d.w;

					float diagonal1 = cov[0][0] + 0.3;
					float offDiagonal = cov[0][1];
					float diagonal2 = cov[1][1] + 0.3;

					float mid = 0.5 * (diagonal1 + diagonal2);
					float radius = length(vec2((diagonal1 - diagonal2) / 2.0, offDiagonal));
					float lambda1 = mid + radius;
					float lambda2 = max(mid - radius, 0.1);
					vec2 diagonalVector = normalize(vec2(offDiagonal, lambda1 - diagonal1));
					vec2 v1 = min(sqrt(2.0 * lambda1), 1024.0) * diagonalVector;
					vec2 v2 = min(sqrt(2.0 * lambda2), 1024.0) * vec2(diagonalVector.y, -diagonalVector.x);

					uint colorUint = covAndColorData.w;
					vColor = vec4(
						float(colorUint & uint(0xFF)) / 255.0,
						float((colorUint >> uint(8)) & uint(0xFF)) / 255.0,
						float((colorUint >> uint(16)) & uint(0xFF)) / 255.0,
						float(colorUint >> uint(24)) / 255.0
					);
					vPosition = position.xy;

					gl_Position = vec4(
						vCenter 
							+ position.x * v2 / viewport * 2.0 
							+ position.y * v1 / viewport * 2.0, pos2d.z / pos2d.w, 1.0);
				}
				`,
			fragmentShader: `
				in vec4 vColor;
				in vec2 vPosition;

				void main () {
					float A = -dot(vPosition, vPosition);
					if (A < -4.0) discard;
					float B = exp(A) * vColor.a;
					gl_FragColor = vec4(vColor.rgb, B);
				}
			`,
			blending : THREE.CustomBlending,
			blendSrcAlpha : THREE.OneFactor,
			depthTest : true,
			depthWrite: false,
			transparent: true
		} );

		material.onBeforeRender = ((renderer, scene, camera, geometry, object, group) => {
			let projectionMatrix = this.getProjectionMatrix(camera);
			mesh.material.uniforms.gsProjectionMatrix.value = projectionMatrix;
			mesh.material.uniforms.gsModelViewMatrix.value = this.getModelViewMatrix(camera);

			let viewport = new THREE.Vector4();
			renderer.getCurrentViewport(viewport);
			const focal = (viewport.w / 2.0) * Math.abs(projectionMatrix.elements[5]);
			material.uniforms.viewport.value[0] = viewport.z;
			material.uniforms.viewport.value[1] = viewport.w;
			material.uniforms.focal.value = focal;
		});

		const mesh = new THREE.Mesh(geometry, material);
		mesh.frustumCulled = false;
		this.object.add(mesh);

		this.worker.onmessage = (e) => {
			let indexes = new Uint32Array(e.data.sortedIndexes);
			mesh.geometry.attributes.splatIndex.set(indexes);
			mesh.geometry.attributes.splatIndex.needsUpdate = true;
			mesh.geometry.instanceCount = indexes.length;
			this.sortReady = true;
		};

		// Wait texture is ready
		while(true){
			const centerAndScaleTextureProperties = this.renderer.properties.get( this.centerAndScaleTexture );
			const covAndColorTextureProperties = this.renderer.properties.get( this.covAndColorTexture );
			if(centerAndScaleTextureProperties && centerAndScaleTextureProperties.__webglTexture && 
				covAndColorTextureProperties && centerAndScaleTextureProperties.__webglTexture){
				break;
			}
			await new Promise(resolve => setTimeout(resolve, 10));
		}

		this.sortReady = true;
	}, 
	loadData: function(camera, object, renderer, src) {
		this.camera = camera;
		this.object = object;
		this.renderer = renderer;
		this.loadedVertexCount = 0;
		this.rowLength = 3 * 4 + 3 * 4 + 4 + 4;

		this.worker = new Worker(
			URL.createObjectURL(
				new Blob(["(", this.createWorker.toString(), ")(self)"], {
					type: "application/javascript",
				}),
			),
		);
		this.worker.postMessage({method: "clear"});

		fetch(src)
		.then(async (data) => {
			const reader = data.body.getReader();

			let glInitialized = false;
			let bytesDownloaded = 0;
			let bytesProcesses = 0;
			let _totalDownloadBytes = data.headers.get("Content-Length");
			let totalDownloadBytes = _totalDownloadBytes ? parseInt(_totalDownloadBytes) : undefined;

			if(totalDownloadBytes != undefined){
				let numVertexes = Math.floor(totalDownloadBytes / this.rowLength);
				await this.initGL(numVertexes);
				glInitialized = true;
			}
			
			const chunks = [];
			const start = Date.now();
			let lastReportedProgress = 0;
			let isPly = src.endsWith(".ply");

			while (true) {
				try {
					const { value, done } = await reader.read();
					if (done) {
						console.log("Completed download.");
						break;
					}
					bytesDownloaded += value.length;
					if (totalDownloadBytes != undefined) {
						const mbps = (bytesDownloaded / 1024 / 1024) / ((Date.now() - start) / 1000);
						const percent = bytesDownloaded / totalDownloadBytes * 100;
						if (percent - lastReportedProgress > 1) {
							console.log("download progress:", percent.toFixed(2) + "%", mbps.toFixed(2) + " Mbps");
							lastReportedProgress = percent;
						}
						} else {
						console.log("download progress:", bytesDownloaded, ", unknown total");
					}
					chunks.push(value);

					const bytesRemains = bytesDownloaded - bytesProcesses;
					if(!isPly && totalDownloadBytes != undefined && bytesRemains > this.rowLength){
						let vertexCount = Math.floor(bytesRemains / this.rowLength);
						const concatenatedChunksbuffer = new Uint8Array(bytesRemains);
						let offset = 0;
						for (const chunk of chunks) {
							concatenatedChunksbuffer.set(chunk, offset);
							offset += chunk.length;
						}
						chunks.length = 0;
						if(bytesRemains > vertexCount * this.rowLength){
							const extra_data = new Uint8Array(bytesRemains - vertexCount * this.rowLength);
							extra_data.set(concatenatedChunksbuffer.subarray(bytesRemains - extra_data.length, bytesRemains), 0);
							chunks.push(extra_data);
						}
						const buffer = new Uint8Array(vertexCount * this.rowLength);
						buffer.set(concatenatedChunksbuffer.subarray(0, buffer.byteLength), 0);
						this.pushDataBuffer(buffer.buffer, vertexCount);
						bytesProcesses += vertexCount * this.rowLength;
					}
				} catch (error) {
				  console.error(error);
				  break;
				}
			}

			if(bytesDownloaded - bytesProcesses > 0){
				// Concatenate the chunks into a single Uint8Array
				let concatenatedChunks = new Uint8Array(
					chunks.reduce((acc, chunk) => acc + chunk.length, 0)
				);
				let offset = 0;
				for (const chunk of chunks) {
					concatenatedChunks.set(chunk, offset);
					offset += chunk.length;
				}
				if(isPly){
					concatenatedChunks = new Uint8Array(this.processPlyBuffer(concatenatedChunks.buffer));
				}

				let numVertexes = Math.floor(concatenatedChunks.byteLength/this.rowLength);
				if(!glInitialized){
					await this.initGL(numVertexes);
					glInitialized = true;
				}
				this.pushDataBuffer(concatenatedChunks.buffer, numVertexes);
			}
		});
	},
	pushDataBuffer: function(buffer, vertexCount) {
		if(this.loadedVertexCount + vertexCount > this.maxVertexes){
			console.log("vertexCount limited to ", this.maxVertexes, vertexCount);
			vertexCount = this.maxVertexes - this.loadedVertexCount;
		}
		if(vertexCount <= 0){
			return;
		}

		let u_buffer = new Uint8Array(buffer);
		let f_buffer = new Float32Array(buffer);
		let matrices = new Float32Array(vertexCount * 16);

		const covAndColorData_uint8 = new Uint8Array(this.covAndColorData.buffer);
		const covAndColorData_int16 = new Int16Array(this.covAndColorData.buffer);
		for (let i = 0; i < vertexCount; i++) {
			let quat = new THREE.Quaternion(
				(u_buffer[32 * i + 28 + 1] - 128) / 128.0,
				(u_buffer[32 * i + 28 + 2] - 128) / 128.0,
				-(u_buffer[32 * i + 28 + 3] - 128) / 128.0,
				(u_buffer[32 * i + 28 + 0] - 128) / 128.0,
			);
			let center = new THREE.Vector3(
				f_buffer[8 * i + 0],
				f_buffer[8 * i + 1],
				-f_buffer[8 * i + 2]
			);
			let scale = new THREE.Vector3(
				f_buffer[8 * i + 3 + 0],
				f_buffer[8 * i + 3 + 1],
				f_buffer[8 * i + 3 + 2]
			);

			let mtx = new THREE.Matrix4();
			mtx.makeRotationFromQuaternion(quat);
			mtx.transpose();
			mtx.scale(scale);
			let mtx_t = mtx.clone()
			mtx.transpose();
			mtx.premultiply(mtx_t);
			mtx.setPosition(center);

			let cov_indexes = [0, 1, 2, 5, 6, 10];
			let max_value = 0.0;
			for(let j = 0; j < cov_indexes.length; j++){
				if(Math.abs(mtx.elements[cov_indexes[j]]) > max_value){
					max_value = Math.abs(mtx.elements[cov_indexes[j]]);
				}
			}

			let destOffset = this.loadedVertexCount * 4 + i * 4;
			this.centerAndScaleData[destOffset + 0] = center.x;
			this.centerAndScaleData[destOffset + 1] = center.y;
			this.centerAndScaleData[destOffset + 2] = center.z;
			this.centerAndScaleData[destOffset + 3] = max_value / 32767.0;

			destOffset =  this.loadedVertexCount * 8 + i * 4 * 2;
			for(let j = 0; j < cov_indexes.length; j++){
				covAndColorData_int16[destOffset + j] = parseInt(mtx.elements[cov_indexes[j]] * 32767.0 / max_value);
			}

			// RGBA
			destOffset = this.loadedVertexCount * 16 + (i * 4 + 3) * 4;
			covAndColorData_uint8[destOffset + 0] = u_buffer[32 * i + 24 + 0];
			covAndColorData_uint8[destOffset + 1] = u_buffer[32 * i + 24 + 1];
			covAndColorData_uint8[destOffset + 2] = u_buffer[32 * i + 24 + 2];
			covAndColorData_uint8[destOffset + 3] = u_buffer[32 * i + 24 + 3];

			// Store scale and transparent to remove splat in sorting process
			mtx.elements[15] = Math.max(scale.x, scale.y, scale.z) * u_buffer[32 * i + 24 + 3] / 255.0;

			for(let j = 0; j < 16; j++){
				matrices[i * 16 + j] = mtx.elements[j];
			}
		}

		const gl = this.renderer.getContext();
		while(vertexCount > 0){
			let width = 0;
			let height = 0;
			let xoffset = (this.loadedVertexCount%this.bufferTextureWidth);
			let yoffset = Math.floor(this.loadedVertexCount/this.bufferTextureWidth);
			if(this.loadedVertexCount%this.bufferTextureWidth != 0){
				width = Math.min(this.bufferTextureWidth, xoffset + vertexCount) - xoffset;
				height = 1;
			}else if(Math.floor(vertexCount/this.bufferTextureWidth) > 0){
				width = this.bufferTextureWidth;
				height = Math.floor(vertexCount/this.bufferTextureWidth);
			}else{
				width = vertexCount%this.bufferTextureWidth;
				height = 1;
			}

			const centerAndScaleTextureProperties = this.renderer.properties.get( this.centerAndScaleTexture );
			gl.bindTexture(gl.TEXTURE_2D, centerAndScaleTextureProperties.__webglTexture);	
			gl.texSubImage2D(gl.TEXTURE_2D, 0, xoffset, yoffset, width, height, gl.RGBA, gl.FLOAT, this.centerAndScaleData, this.loadedVertexCount * 4);

			const covAndColorTextureProperties = this.renderer.properties.get( this.covAndColorTexture );
			gl.bindTexture(gl.TEXTURE_2D, covAndColorTextureProperties.__webglTexture);
			gl.texSubImage2D(gl.TEXTURE_2D, 0, xoffset, yoffset, width, height, gl.RGBA_INTEGER, gl.UNSIGNED_INT, this.covAndColorData, this.loadedVertexCount * 4);
			
			this.loadedVertexCount += width * height;
			vertexCount -= width * height;
		}

		this.worker.postMessage({
			method: "push",
			matrices: matrices.buffer
		}, [matrices.buffer]);
	},
	tick: function(time, timeDelta) {
		if(this.sortReady){
			this.sortReady = false;
			let camera_mtx = this.getModelViewMatrix().elements;
			let view = new Float32Array([camera_mtx[2], camera_mtx[6], camera_mtx[10], camera_mtx[14]]);
			let worldToCutout = new THREE.Matrix4();
			if (this.cutout) {
				worldToCutout.copy(this.cutout.matrixWorld);
				worldToCutout.invert();
				worldToCutout.multiply(this.object.matrixWorld);
			}
			this.worker.postMessage({
				method: "sort",
				view: view.buffer,
				cutout: this.cutout ? new Float32Array(worldToCutout.elements) : undefined
			}, [view.buffer]);
		}
	},
	getProjectionMatrix: function(camera) {
		if(!camera){
			camera = this.camera;
		}
		let mtx = camera.projectionMatrix.clone();
		mtx.elements[4] *= -1;
		mtx.elements[5] *= -1;
		mtx.elements[6] *= -1;
		mtx.elements[7] *= -1;
		return mtx;
	},
	getModelViewMatrix: function(camera) {
		if(!camera){
			camera = this.camera;
		}
		const viewMatrix = camera.matrixWorld.clone();
		viewMatrix.elements[1] *= -1.0;
		viewMatrix.elements[4] *= -1.0;
		viewMatrix.elements[6] *= -1.0;
		viewMatrix.elements[9] *= -1.0;
		viewMatrix.elements[13] *= -1.0;
		const mtx = this.object.matrixWorld.clone();
		mtx.invert();
		mtx.elements[1] *= -1.0;
		mtx.elements[4] *= -1.0;
		mtx.elements[6] *= -1.0;
		mtx.elements[9] *= -1.0;
		mtx.elements[13] *= -1.0;
		mtx.multiply(viewMatrix);
		mtx.invert();
		return mtx;
	},
	createWorker: function (self) {
		let matrices = undefined;

		// multiply: matrix4x4 * vector3
		const mul = function mul(e, x, y, z){
			const w = 1 / ( e[ 3 ] * x + e[ 7 ] * y + e[ 11 ] * z + e[ 15 ] );

			return [
				(e[0] * x + e[4] * y + e[8] * z + e[12]) * w,
				(e[1] * x + e[5] * y + e[9] * z + e[13]) * w,
				(e[2] * x + e[6] * y + e[10] * z + e[14]) * w,
			];
		}

		// dot: vector3 * vector3
		const dot = function dot(vec1, vec2){
			return vec1[0] * vec2[0] + vec1[1] * vec2[1] + vec1[2] * vec2[2];
		}

		const sortSplats = function sortSplats(matrices, view, cutout = undefined){
			const vertexCount = matrices.length/16;
			let threshold = -0.0001;

			let maxDepth = -Infinity;
			let minDepth = Infinity;
			let depthList = new Float32Array(vertexCount);
			let sizeList = new Int32Array(depthList.buffer);
			let validIndexList = new Int32Array(vertexCount);
			let validCount = 0;
			for (let i = 0; i < vertexCount; i++) {
				// Sign of depth is reversed
				let depth =
					( view[0] * matrices[i * 16 + 12] 
					+ view[1] * matrices[i * 16 + 13]
					+ view[2] * matrices[i * 16 + 14]
					+ view[3]);

				let cutoutArea = true;
				if (cutout !== undefined) {
					// Position-based culling
					let posX = matrices[i * 16 + 12];
					let posY = matrices[i * 16 + 13];
					let posZ = matrices[i * 16 + 14];

					// convert to cutout space – not sure why Y axis is inverted
					const cutoutSpacePos = mul(cutout, posX, -posY, posZ);
					const len = dot(cutoutSpacePos, cutoutSpacePos);
					
					// box cutout
					if (cutoutSpacePos[0] < -0.5 || cutoutSpacePos[0] > 0.5 || 
						cutoutSpacePos[1] < -0.5 || cutoutSpacePos[1] > 0.5 || 
						cutoutSpacePos[2] < -0.5 || cutoutSpacePos[2] > 0.5)
						cutoutArea = false;
					
					// spherical cutout
					// if (dot(cutoutSpacePos, cutoutSpacePos) > 1)
					// 	cutoutArea = false;
				}

				// Skip behind of camera and small, transparent splat
				if(depth < 0 && matrices[i * 16 + 15] > threshold * depth && cutoutArea){
					depthList[validCount] = depth;
					validIndexList[validCount] = i;
					validCount++;
					if (depth > maxDepth) maxDepth = depth;
					if (depth < minDepth) minDepth = depth;
				};
			}

			// This is a 16 bit single-pass counting sort
			let depthInv = (256 * 256 - 1) / (maxDepth - minDepth);
			let counts0 = new Uint32Array(256*256);
			for (let i = 0; i < validCount; i++) {
				sizeList[i] = ((depthList[i] - minDepth) * depthInv) | 0;
				counts0[sizeList[i]]++;
			}
			let starts0 = new Uint32Array(256*256);
			for (let i = 1; i < 256*256; i++) starts0[i] = starts0[i - 1] + counts0[i - 1];
			let depthIndex = new Uint32Array(validCount);
			for (let i = 0; i < validCount; i++) depthIndex[starts0[sizeList[i]]++] = validIndexList[i];
	
			return depthIndex;
		};

		self.onmessage = (e) => {
			if(e.data.method == "clear"){
				matrices = undefined;
			}
			if(e.data.method == "push"){
				const new_matrices = new Float32Array(e.data.matrices);
				if(matrices === undefined){
					matrices = new_matrices;
				}else{
					resized = new Float32Array(matrices.length + new_matrices.length);
					resized.set(matrices);
					resized.set(new_matrices, matrices.length);
					matrices = resized;
				}
			}
			if(e.data.method == "sort"){
				if(matrices === undefined){
					const sortedIndexes = new Uint32Array(1);
					self.postMessage({sortedIndexes}, [sortedIndexes.buffer]);
				}else{
					const view = new Float32Array(e.data.view);
					const cutout = e.data.cutout !== undefined ? new Float32Array(e.data.cutout) : undefined;
					const sortedIndexes = sortSplats(matrices, view, cutout);
					self.postMessage({sortedIndexes}, [sortedIndexes.buffer]);
				}
			}
		};
	},
	processPlyBuffer: function (inputBuffer) {
		const ubuf = new Uint8Array(inputBuffer);
		// 10KB ought to be enough for a header...
		const header = new TextDecoder().decode(ubuf.slice(0, 1024 * 10));
		const header_end = "end_header\n";
		const header_end_index = header.indexOf(header_end);
		if (header_end_index < 0)
			throw new Error("Unable to read .ply file header");
		const vertexCount = parseInt(/element vertex (\d+)\n/.exec(header)[1]);
		console.log("Vertex Count", vertexCount);
		let row_offset = 0,
			offsets = {},
			types = {};
		const TYPE_MAP = {
			double: "getFloat64",
			int: "getInt32",
			uint: "getUint32",
			float: "getFloat32",
			short: "getInt16",
			ushort: "getUint16",
			uchar: "getUint8",
		};
		for (let prop of header
			.slice(0, header_end_index)
			.split("\n")
			.filter((k) => k.startsWith("property "))) {
			const [p, type, name] = prop.split(" ");
			const arrayType = TYPE_MAP[type] || "getInt8";
			types[name] = arrayType;
			offsets[name] = row_offset;
			row_offset += parseInt(arrayType.replace(/[^\d]/g, "")) / 8;
		}
		console.log("Bytes per row", row_offset, types, offsets);

		let dataView = new DataView(
			inputBuffer,
			header_end_index + header_end.length,
		);
		let row = 0;
		const attrs = new Proxy(
			{},
			{
				get(target, prop) {
					if (!types[prop]) throw new Error(prop + " not found");
					return dataView[types[prop]](
						row * row_offset + offsets[prop],
						true,
					);
				},
			},
		);

		console.time("calculate importance");
		let sizeList = new Float32Array(vertexCount);
		let sizeIndex = new Uint32Array(vertexCount);
		for (row = 0; row < vertexCount; row++) {
			sizeIndex[row] = row;
			if (!types["scale_0"]) continue;
			const size =
				Math.exp(attrs.scale_0) *
				Math.exp(attrs.scale_1) *
				Math.exp(attrs.scale_2);
			const opacity = 1 / (1 + Math.exp(-attrs.opacity));
			sizeList[row] = size * opacity;
		}
		console.timeEnd("calculate importance");

		console.time("sort");
		sizeIndex.sort((b, a) => sizeList[a] - sizeList[b]);
		console.timeEnd("sort");

		// 6*4 + 4 + 4 = 8*4
		// XYZ - Position (Float32)
		// XYZ - Scale (Float32)
		// RGBA - colors (uint8)
		// IJKL - quaternion/rot (uint8)
		const rowLength = 3 * 4 + 3 * 4 + 4 + 4;
		const buffer = new ArrayBuffer(rowLength * vertexCount);

		console.time("build buffer");
		for (let j = 0; j < vertexCount; j++) {
			row = sizeIndex[j];

			const position = new Float32Array(buffer, j * rowLength, 3);
			const scales = new Float32Array(buffer, j * rowLength + 4 * 3, 3);
			const rgba = new Uint8ClampedArray(
				buffer,
				j * rowLength + 4 * 3 + 4 * 3,
				4,
			);
			const rot = new Uint8ClampedArray(
				buffer,
				j * rowLength + 4 * 3 + 4 * 3 + 4,
				4,
			);

			if (types["scale_0"]) {
				const qlen = Math.sqrt(
					attrs.rot_0 ** 2 +
						attrs.rot_1 ** 2 +
						attrs.rot_2 ** 2 +
						attrs.rot_3 ** 2,
				);

				rot[0] = (attrs.rot_0 / qlen) * 128 + 128;
				rot[1] = (attrs.rot_1 / qlen) * 128 + 128;
				rot[2] = (attrs.rot_2 / qlen) * 128 + 128;
				rot[3] = (attrs.rot_3 / qlen) * 128 + 128;

				scales[0] = Math.exp(attrs.scale_0);
				scales[1] = Math.exp(attrs.scale_1);
				scales[2] = Math.exp(attrs.scale_2);
			} else {
				scales[0] = 0.01;
				scales[1] = 0.01;
				scales[2] = 0.01;

				rot[0] = 255;
				rot[1] = 0;
				rot[2] = 0;
				rot[3] = 0;
			}

			position[0] = attrs.x;
			position[1] = attrs.y;
			position[2] = attrs.z;

			if (types["f_dc_0"]) {
				const SH_C0 = 0.28209479177387814;
				rgba[0] = (0.5 + SH_C0 * attrs.f_dc_0) * 255;
				rgba[1] = (0.5 + SH_C0 * attrs.f_dc_1) * 255;
				rgba[2] = (0.5 + SH_C0 * attrs.f_dc_2) * 255;
			} else {
				rgba[0] = attrs.red;
				rgba[1] = attrs.green;
				rgba[2] = attrs.blue;
			}
			if (types["opacity"]) {
				rgba[3] = (1 / (1 + Math.exp(-attrs.opacity))) * 255;
			} else {
				rgba[3] = 255;
			}
		}
		console.timeEnd("build buffer");
		return buffer;
	}
});