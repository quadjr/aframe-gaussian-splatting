
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

			const geometry = new THREE.PlaneGeometry( 2, 2);
			const material = new THREE.ShaderMaterial( {
				uniforms : {
					"viewport": {value: new Float32Array([size.x, size.y])},
					"focal": {value: focal},
				},
				vertexShader: `
					varying vec4 vColor;
					varying vec3 vConic;
					varying vec2 vCenter;
					uniform vec2 viewport;
					uniform float focal;

					vec3 compute_cov2d(vec4 center){
						mat3 Vrk = mat3(instanceMatrix);
						vec4 t = modelViewMatrix * center;
						vec2 lims = 1.3 * 0.5 * viewport / focal;
						t.xy = min(lims, max(-lims, t.xy / t.z)) * t.z;
						mat3 J = mat3(
							focal / t.z, 0., -(focal * t.x) / (t.z * t.z), 
							0., focal / t.z, -(focal * t.y) / (t.z * t.z), 
							0., 0., 0.
						);
						mat3 W = transpose(mat3(modelViewMatrix));
						mat3 T = W * J;
						mat3 cov = transpose(T) * transpose(Vrk) * T;
						return vec3(cov[0][0] + 0.3, cov[0][1], cov[1][1] + 0.3);
					}
		
					void main () {
						vec4 center = vec4(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2], 1);
						vec4 camspace = modelViewMatrix * center;
						vec4 pos2d = projectionMatrix * mat4(1,0,0,0,0,-1,0,0,0,0,1,0,0,0,0,1)  * camspace;
											
						vec3 cov2d = compute_cov2d(center);
						float det = cov2d.x * cov2d.z - cov2d.y * cov2d.y;
						vec3 conic = vec3(cov2d.z, cov2d.y, cov2d.x) / det;
						float mid = 0.5 * (cov2d.x + cov2d.z);
						float lambda1 = mid + sqrt(max(0.1, mid * mid - det));
						float lambda2 = mid - sqrt(max(0.1, mid * mid - det));
						vec2 v1 = 7.0 * sqrt(lambda1) * normalize(vec2(cov2d.y, lambda1 - cov2d.x));
						vec2 v2 = 7.0 * sqrt(lambda2) * normalize(vec2(-(lambda1 - cov2d.x),cov2d.y));
						
						float r = floor(instanceColor.r * 255.0)/255.0;
						float a = (instanceColor.r - r)*256.0;
						vColor = vec4(r, instanceColor.g, instanceColor.b, a);
						vConic = conic;
						vCenter = vec2(pos2d) / pos2d.w;
					
						gl_Position = vec4(vec2(vCenter + position.x * (position.x * position.y < 0.0 ? v1 : v2) / viewport), pos2d.z / pos2d.w, 1);
					}
					`,
				fragmentShader:  `
					varying vec4 vColor;
					varying vec3 vConic;
					varying vec2 vCenter;
					uniform vec2 viewport;

					void main () {    
						vec2 d = (vCenter - 2.0 * (gl_FragCoord.xy/viewport - vec2(0.5, 0.5))) * viewport * 0.5;
						float power = -0.5 * (vConic.x * d.x * d.x + vConic.z * d.y * d.y) - vConic.y * d.x * d.y;
						if (power > 0.0) discard;
						float alpha = min(0.99, vColor.a * exp(power));
						if(alpha < 0.02) discard;

						gl_FragColor = vec4(alpha * vColor.rgb, alpha);
						// gl_FragColor = vec4(1,0,0,1);
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
				let quat2 = new THREE.Quaternion(
					(u_buffer[32 * i + 28 + 0] - 128) / 128.0,
					(u_buffer[32 * i + 28 + 1] - 128) / 128.0,
					(u_buffer[32 * i + 28 + 2] - 128) / 128.0,
					(u_buffer[32 * i + 28 + 3] - 128) / 128.0,
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