AFRAME.registerComponent('simple-fly', {
    schema: {
        speed: { type: 'number', default: 0.1 }
    },
    init: function () {
        this.rightController = null;
        this.isFlying = false;

        const controllers = document.querySelectorAll('a-entity[xr-controller]');
        if (controllers.length >= 2) {
            this.rightController = controllers[1];

            this.rightController.addEventListener('gripdown', () => {
                this.startFlying();
                console.log('Flying started');
            });
            this.rightController.addEventListener('gripup', () => {
                this.stopFlying();
                console.log('Flying stopped');
            });
        } else {
            console.warn('No second controller found.');
        }

        this.gaussianSplattingEntity = document.querySelector('[gaussian_splatting]');
        if (!this.gaussianSplattingEntity) {
            console.warn('No Gaussian Splatting entity found.');
        }
    },
    tick: function () {
        if (this.isFlying) {
            this.fly();
        }
    },
    startFlying: function () {
        this.isFlying = true;
        console.log('Start flying...');
    },
    stopFlying: function () {
        this.isFlying = false;
        console.log('Stop flying.');
    },
    fly: function () {
        if (this.rightController && this.gaussianSplattingEntity) {
            const direction = new THREE.Vector3();
            this.rightController.object3D.getWorldDirection(direction);
            direction.multiplyScalar(-this.data.speed); // Invert the direction for the opposite translation
            this.gaussianSplattingEntity.object3D.position.add(direction);
            console.log('Flying in the opposite direction.');
        } else {
            console.warn('Right controller or Gaussian Splatting entity not found.');
        }
    }
});
