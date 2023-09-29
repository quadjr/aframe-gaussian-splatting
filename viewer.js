
AFRAME.registerComponent("3d_gaussian_splatting", {
	init: function () {
		this.el.sceneEl.renderer.setPixelRatio(1);

		fetch("train.splat")
		.then((data) => data.blob())
		.then((res) => res.arrayBuffer())
		.then((buffer) => {
			let size = new THREE.Vector2();
			this.el.sceneEl.renderer.getSize(size);

			const camera_el = document.getElementById("camera");
			const focal = (size.y / 2.0) / Math.tan(camera_el.components.camera.data.fov / 2.0 * Math.PI / 180.0);

			const geometry = new THREE.PlaneGeometry( 4, 4);
			const material = new THREE.ShaderMaterial( {
				uniforms : {
					"viewport": {value: new Float32Array([size.x, size.y])},
					"focal": {value: focal},
				},
				vertexShader: `
					varying vec4 vColor;
					varying vec2 vPosition;
					uniform vec2 viewport;
					uniform float focal;

					void main () {
						vec4 center = vec4(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2], 1);

						vec4 camspace = modelViewMatrix * center;
						vec4 pos2d = projectionMatrix * mat4(1,0,0,0,0,-1,0,0,0,0,1,0,0,0,0,1)  * camspace;
											
						float bounds = 1.2 * pos2d.w;
						if (pos2d.z < -pos2d.w || pos2d.x < -bounds || pos2d.x > bounds
							|| pos2d.y < -bounds || pos2d.y > bounds) {
							gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
							return;
						}

						mat3 J = mat3(
							focal / camspace.z, 0., -(focal * camspace.x) / (camspace.z * camspace.z), 
							0., -focal / camspace.z, (focal * camspace.y) / (camspace.z * camspace.z), 
							0., 0., 0.
						);

						mat3 W = transpose(mat3(modelViewMatrix));
						mat3 T = W * J;
						mat3 cov = transpose(T) * mat3(instanceMatrix) * T;

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

						float r = floor(instanceColor.r * 255.0)/255.0;
						float a = (instanceColor.r - r)*256.0;
						vColor = vec4(r, instanceColor.g, instanceColor.b, a);
						vPosition = position.xy;

						gl_Position = vec4(
							vCenter 
								+ position.x * v2 / viewport * 2.0 
								+ position.y * v1 / viewport * 2.0, 0.0, 1.0);
					}
					`,
				fragmentShader:  `
					varying vec4 vColor;
					varying vec2 vPosition;

					void main () {    
						float A = -dot(vPosition, vPosition);
						if (A < -4.0) discard;
						float B = exp(A) * vColor.a;
						gl_FragColor = vec4(B * vColor.rgb, B);
					}
					`
			} );

			material.blending = THREE.CustomBlending;
			material.blendEquation = THREE.AddEquation;
			material.blendSrc = THREE.OneMinusDstAlphaFactor;
			material.blendDst = THREE.OneFactor;
			material.blendSrcAlpha = THREE.OneMinusDstAlphaFactor;
			material.blendDstAlpha = THREE.OneFactor;
			material.depthTest = false;
			material.needsUpdate = true;

			window.addEventListener('resize', () => {
				let size = new THREE.Vector2();
				this.el.sceneEl.renderer.getSize(size);
				const camera_el = document.getElementById("camera");
				const focal = (size.y / 2.0) / Math.tan(camera_el.components.camera.data.fov / 2.0 * Math.PI / 180.0);
				material.uniforms.viewport.value[0] = size.x;
				material.uniforms.viewport.value[1] = size.y;
				material.uniforms.focal.value = focal;
			});

			const rowLength = 3 * 4 + 3 * 4 + 4 + 4;
			let vertexCount = Math.floor(buffer.byteLength / rowLength);
			const f_buffer = new Float32Array(buffer);
			const u_buffer = new Uint8Array(buffer);

			let depthMix = new BigInt64Array(vertexCount);
			const indexMix = new Uint32Array(depthMix.buffer);
			for (let j = 0; j < vertexCount; j++) {
				indexMix[2 * j] = j;
			}

			const floatMix = new Float32Array(depthMix.buffer);
			const view = camera_el.object3D.matrixWorld;

			for (let j = 0; j < vertexCount; j++) {
				let i = indexMix[2 * j];
				floatMix[2 * j + 1] =
					10000 +
					view.elements[2] * f_buffer[8 * i + 0] +
					view.elements[6] * f_buffer[8 * i + 1] +
					view.elements[10] * f_buffer[8 * i + 2];
			}

			depthMix.sort();

			let iMesh = new THREE.InstancedMesh(geometry, material, vertexCount);
			for (let j = 0; j < vertexCount; j++) {
				const i = indexMix[2 * j];
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
				let color = new THREE.Color(
					u_buffer[32 * i + 24 + 0] / 255 + u_buffer[32 * i + 24 + 3] / 255 / 256.0,
					u_buffer[32 * i + 24 + 1] / 255,
					u_buffer[32 * i + 24 + 2] / 255,
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
				mtx.transpose();

				let mtx_t = mtx.clone()
				mtx_t.transpose();
				mtx.premultiply(mtx_t);

				mtx.setPosition(center);
				iMesh.setMatrixAt(j, mtx)
				iMesh.setColorAt(j, color);
			}

			iMesh.frustumCulled = false;
			iMesh.instanceMatrix.needsUpdate = true;
			iMesh.instanceColor.needsUpdate = true;
			this.el.object3D.add(iMesh);
		});
	},
	tick: function() {
	}
});