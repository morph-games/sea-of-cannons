import { Assets, Container, Graphics, Sprite } from 'pixi.js';
import ParticleController from './ParticleController.js';
import { radiansToDegrees, pickRand } from './utils.js';
import entityTypes from './entityTypes.js';

const NOOP = () => {};

export default class Renderer {
	constructor(worldContainer, bgContainer) {
		this.particleController = null; // created in init
		this.worldContainer = worldContainer;
		this.bgContainer = bgContainer;
		this.wireframesOn = false;
		this.surfaceCirclesOn = false;
		this.wireframes = new Container();
		this.worldContainer.addChild(this.wireframes);
		this.buoyancyCircles = [];
		this.surfaceCircles = [];
		this.visualBoats = [];
		this.clouds = [];
	}

	async init() {
		this.waterTexture = await Assets.load('images/water01.png');
		this.cloudTexture1 = await Assets.load('images/cloud01.png');
		this.cloudTexture2 = await Assets.load('images/cloud02.png');
		this.cloudTextures = [this.cloudTexture1, this.cloudTexture2];
		this.crateTexture = await Assets.load('images/crate01.png');
		this.ballTexture = await Assets.load('images/cannonball01.png');
		this.boatRightTexture = await Assets.load('images/boat01-right.png');
		this.boatLeftTexture = await Assets.load('images/boat01-left.png');
		this.puffTexture = await Assets.load('images/puff-8x8.png');
		[
			// waterTexture,
			...this.cloudTextures, this.crateTexture,
			this.boatRightTexture, this.boatLeftTexture, this.ballTexture,
			this.puffTexture,
		].forEach((texture) => { texture.source.scaleMode = 'nearest'; });
		// Create the particle controller now that we have the puff texture
		this.particleController = new ParticleController(this.worldContainer, this.puffTexture);
		// Make buoyancy circles for debugging
		for (let i = 0; i < 100; i += 1) {
			const circle = new Graphics().circle(0, 0, 4).fill('#777777');
			this.worldContainer.addChild(circle);
			this.buoyancyCircles.push(circle);
		}
		for (let c = 0; c < 100; c += 1) {
			this.makeCloud();
		}
	}

	makeCloud() {
		// TODO: get world dimensions from world somehow
		const sprite = new Sprite(pickRand(this.cloudTextures));
		sprite.scale = 1 + Math.ceil(Math.random() * 5);
		sprite.anchor.set(0.5);
		sprite.alpha = Math.random();
		sprite.tint = pickRand([0x7b6268, 0x5d4550]);
		sprite.scale.x *= pickRand([-1, 1]);
		sprite.x = Math.random() * 28000;
		sprite.y = Math.random() * -600;
		this.clouds.push(sprite);
		this.bgContainer.addChild(sprite);
		return sprite;
	}

	makeVisualBoat(boat, arr) {
		const vb = new Container();
		const sprite = new Sprite(this.boatRightTexture);
		vb.addChild(sprite);
		const entType = entityTypes[boat.entityTypeKey];
		sprite.width = entType.width;
		sprite.height = entType.height;
		sprite.anchor.set(0.5);
		this.worldContainer.addChild(vb);
		arr.push(vb);
		return vb;
	}

	renderBoats(boats = [], boatCallback = NOOP) {
		let bcIndex = 0;
		if (this.wireframesOn) this.wireframes.removeChildren(); // Bad performance - TODO: improve?
		boats.forEach((b, i) => {
			let vb = this.visualBoats[i];
			if (!vb) {
				vb = this.makeVisualBoat(b, this.visualBoats);
			}
			const directionTexture = b.direction < 0 ? this.boatLeftTexture : this.boatRightTexture;
			const sprite = vb.children[0];
			if (directionTexture.label !== sprite.texture.label) {
				sprite.texture = directionTexture;
			}
			vb.x = b.x;
			vb.y = b.y;
			vb.angle = radiansToDegrees(b.angle);
			let tint = 0xFFFFFF;
			if (b.hit) tint = 0xd8725e;
			if (b.isDead) tint = 0x7b6268;
			vb.tint = tint;
			vb.visible = !b.removed;
			vb.alpha = 1 - b.deep;

			if (this.wireframesOn && !b.removed) {
				// Draw wireframe for vertices
				const boatWireframe = new Graphics();
				boatWireframe.moveTo(b.vertices[0].x, b.vertices[0].y);
				b.vertices.forEach((vert) => boatWireframe.lineTo(vert.x, vert.y));
				boatWireframe.lineTo(b.vertices[0].x, b.vertices[0].y);
				boatWireframe.stroke({
					color: 0xff7700, // Red color
					pixelLine: true, // Crucial for a consistent 1-pixel thickness
				});
				this.wireframes.addChild(boatWireframe);
				// Draw points for buoyancy voxels
				b?.globalBuoyancyVoxelPoints?.forEach((point) => {
					const circle = this.buoyancyCircles[bcIndex];
					if (!circle) return;
					this.worldContainer.setChildIndex(circle, this.worldContainer.children.length - 1);
					circle.tint = point.submerged ? 0x4455FF : 0xFFFFFF;
					circle.alpha = point.submerged ? 0.8 : 0.3;
					bcIndex += 1;
					circle.x = point.x;
					circle.y = point.y;
				});
			}
			if (!b.removed && !b.isDead) {
				if (b.hit) {
					this.particleController.emit(
						40,
						{ x: b.x, y: b.y },
						{ scale: 1.8, randomVelocityScale: 20, tint: 0xab597d, life: 20 },
					);
				}
				this.particleController.emit(
					0.2,
					{ x: b.x, y: b.y },
					{
						scale: 4,
						randomScale: 3,
						randomVelocityScale: 0.1,
						// tint: 0x5d4550,
						tint: 0x452e3f,
						life: 300,
						gravityScale: -0.05,
					},
				);
			}
			boatCallback(b);
		});
	}

	update(data) { // Do all rendering
		const { surface /* , boats */ } = data;

		if (this.surfaceCirclesOn) {
			surface.forEach((s, i) => {
				let circle = this.surfaceCircles[i];
				if (!circle) {
					circle = new Graphics().circle(0, 0, 4).fill('#cccccc');
					this.worldContainer.addChild(circle);
					this.surfaceCircles[i] = circle;
				}
				circle.x = s.x;
				circle.y = s.y;
				// if (Math.abs(x - circle.x) < 100) {
				// 	circle.tint = 0xFF0000;
				// } else {
				// 	circle.tint = 0xFFFFFF;
				// }
			});
		}
	}
}
