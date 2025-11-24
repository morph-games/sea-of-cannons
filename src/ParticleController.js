import { ParticleContainer, Particle, Texture } from 'pixi.js';
import { vec2 } from './Vector2.js';

const TWO_PI = Math.PI * 2;

export default class ParticleController {
	constructor(worldContainer, texture) {
		// All particles in a container should share the same base texture.
		this.texture = texture || Texture.WHITE;
		this.container = new ParticleContainer({
			dynamicProperties: {
				position: true, // Allow dynamic position changes (default)
				scale: false, // Static scale for extra performance
				rotation: false, // Static rotation
				color: true, // Static color
			},
		});
		this.baseScale = 3 / this.texture.width;
		this.gravityAcc = 0.1;
		worldContainer.addChild(this.container);
	}

	emit(n = 100, pos = {}, options = {}) {
		const { x = 0, y = 0 } = pos;
		const {
			scale = 1,
			randomScale = 0,
			tint = 0xFFFFFF,
			baseVelocity = { x: 0, y: 0 },
			randomVelocityScale = 1,
			gravityScale = 1,
			life = 100,
		} = options;
		let vel;
		if (n < 1) {
			n = (Math.random() < n) ? 1 : 0;
		}
		// vel.setAngle(Math.random() * TWO_PI, 1);
		for (let i = 0; i < n; i += 1) {
			vel = vec2(baseVelocity).add(
				vec2(0, 1).setAngle(Math.random() * TWO_PI, Math.random() * randomVelocityScale),
			);
			const particleScale = this.baseScale * (scale + (randomScale * Math.random()));
			const particle = new Particle({
				texture: this.texture,
				// x: Math.random() * 1800,
				// y: 300 - (Math.random() * 600),
				x,
				y,
				scaleX: particleScale,
				scaleY: particleScale,
				life: life + (Math.random() * life),
				vel, // : { x: 10 - Math.random() * 20, y: 10 - Math.random() * 20 },
				gravityScale,
				tint,
				alpha: Math.random(),
				anchorX: 0.5,
				anchorY: 0.5,
			});
			this.container.addParticle(particle);
		}
	}

	update(deltaTime = 1, totalTime = 0) {
		const { particleChildren } = this.container;
		let particle;
		for (let i = particleChildren.length - 1; i >= 0; i -= 1) {
			particle = particleChildren[i];
			// particle.x += Math.random() * 2 - Math.random() * 2;
			// particle.y += Math.random() * 2 - Math.random() * 2;
			particle.vel.y += this.gravityAcc * deltaTime * particle.gravityScale;
			particle.x += particle.vel.x * deltaTime;
			particle.y += particle.vel.y * deltaTime;
			// particle.scaleX *= 1.1;
			// particle.scaleY *= 1.1;
			particle.life -= 1;
			if (particle.life < 0) {
				particle.alpha -= 0.1;
				if (particle.alpha <= 0) this.container.removeParticleAt(i);
			}
		}
		/*
		this.container.particleChildren.forEach((particle) => {
			particle.x += Math.random() * 2 - Math.random() * 2;
			particle.y += Math.random() * 2 - Math.random() * 2;
			// particle.scaleX *= 1.1;
			// particle.scaleY *= 1.1;
			particle.life -= 1;
			if (particle.life < 0) particle.alpha -= 0.1;
			// particle.alpha = 0.5 + Math.sin(totalTime) * 0.5;
		});
		*/
	}
}
