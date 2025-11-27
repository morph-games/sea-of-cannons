import { Application, Assets, Container, Graphics, Sprite, MeshPlane } from 'pixi.js';
import ParticleController from './ParticleController.js';
import { radiansToDegrees, pickRand, rand } from './utils.js';
import { vec2 } from './Vector2.js';
import entityTypes from './entityTypes.js';
import gameConfig from './gameConfig.js';

const NOOP = () => {};

function updateWaveBufferData(data, plane, vertCount, surface, totalTime) {
	const { scale, geometry } = plane;
	const xPer = geometry.width / (vertCount.x - 1);
	// return;
	const k = 0.3; // wave number
	const w = 1; // angular frequency
	for (let y = 0; y < vertCount.y; y += 1) {
		let amplitude = 1 - (y / (vertCount.y - 1)); // From 1 --> 0
		amplitude *= 0.1;
		const t = totalTime / 40;
		for (let x = 0; x < vertCount.x; x += 1) {
			const b = x + (y * vertCount.x);
			const i = (x + (y * vertCount.x)) * 2;
			// for the top row, just copy the coordinates from the surface array and scale them
			if (y === 0) {
				data[i] = (xPer * x) + (surface[b].dx / scale.x);
				data[i + 1] = surface[b].dy / scale.y;
			} else {
				// All other rows just move around only for animation purposes
				// doesn't currently affect the physics
				data[i] += Math.cos((k * x) + (w * t)) * (-amplitude / 40);
				data[i + 1] += (
					Math.sin((k * x) + (w * t)) * amplitude
				) + (
					Math.sin(((k / 2) * x) + (w * t)) * (amplitude / 1.5)
				);
			}
		}
	}
}

export default class Renderer {
	constructor() {
		this.app = new Application();

		this.worldContainer = new Container();
		this.app.stage.addChild(this.worldContainer);
		this.bgContainer = new Container();
		this.worldContainer.addChild(this.bgContainer);
		// const grid = new Graphics()
		// 	.moveTo(-200, 0)
		// 	.lineTo(200, 0)
		// 	.moveTo(0, -200)
		// 	.lineTo(0, 200)
		// 	.stroke({ color: 0x000000, pixelLine: true });
		// this.bgContainer.addChild(grid);
		this.click = new Graphics().circle(0, 0, 10).fill('#00000022');
		this.worldContainer.addChild(this.click);

		this.particleController = null; // created in init
		this.surfaceCirclesOn = false;
		this.wireframes = new Container();
		this.worldContainer.addChild(this.wireframes);
		this.waterMeshPlane = null;
		this.buoyancyCircles = [];
		this.surfaceCircles = [];
		this.visualBoats = [];
		this.visualCannonballs = [];
		this.visualCrates = [];
		this.clouds = [];
		this.waterContainer = new Container();
		this.worldContainer.addChild(this.waterContainer);
		// Make container for all physical objects (boats, cannonballs, etc) that are unlikely
		// to overlap each other, so don't have to worry about z level
		this.physicsContainer = new Container();
		this.worldContainer.addChild(this.physicsContainer);
	}

	static repeatTextureHorizontally(object, repeatCountX = 2) {
		object.texture.source.repeatMode = 'repeat'; // Sets the addressMode also
		// Scale the texture
		const uvsBuffer = object.geometry.getBuffer('aUV');
		const uvs = uvsBuffer.data; // This is a Float32Array of [u, v, u, v, ...]
		const m = Math.round(repeatCountX);
		// 3. Iterate through the array and scale the U (horizontal) coordinates
		for (let i = 0; i < uvs.length; i += 2) {
			// i is the index for the U coordinate (horizontal)
			// i + 1 is the index for the V coordinate (vertical)
			// Scale the U coordinate by the desired repeat count
			uvs[i] *= m;
		}
		// 4. Important: Tell PixiJS that the buffer data has changed
		uvsBuffer.update();
	}

	async init() {
		// Initialize the application
		// Visible sky should be #392945, but beyond that is darkest 2d1e2f
		await this.app.init({ background: '#2d1e2f', resizeTo: window });
		// Append the application canvas to the document body
		document.body.appendChild(this.app.canvas);
		// Define all the textures: alias and source
		const assetLoadArray = [
			['water', 'images/water01.png'],
			['cloud01', 'images/cloud01.png'],
			['cloud02', 'images/cloud02.png'],
			['crate', 'images/crate01.png'], // TODO: move to entity?
			['cannonball', 'images/cannonball01.png'], // TODO: move to entity?
			['puff', 'images/puff-8x8.png'],
			['skyWaterBg', 'images/sky-water-bg.png'],
		];
		// Entity types can have a `texture` string, or a `textures` array of variants, each of
		// which is an array of strings.
		Object.keys(entityTypes).forEach((entKey) => {
			const ent = entityTypes[entKey];
			if (ent.texture) {
				assetLoadArray.push([entKey, `images/${ent.texture}.png`]);
			}
			if (ent.textures) {
				ent.textures.forEach((variant, variantIndex) => {
					variant.forEach((texture, directionIndex) => {
						assetLoadArray.push([
							`${entKey}-${variantIndex}-${directionIndex}`,
							`images/${texture}.png`,
						]);
					});
				});
			}
		});
		await Assets.load(assetLoadArray.map((item) => {
			return { alias: item[0], src: item[1] };
		}));
		// Change the scaleMode value to make all textures pixelated
		assetLoadArray.forEach((item) => {
			const [alias] = item;
			if (alias === 'water') return; // Want water to get blurry
			const texture = Assets.get(alias);
			texture.source.scaleMode = 'nearest';
			// texture.label = alias; // Doesn't work?
		});
		this.cloudTextures = [Assets.get('cloud01'), Assets.get('cloud02')];
		// Create the particle controller now that we have the puff texture
		this.particleController = new ParticleController(this.worldContainer, Assets.get('puff'));
		// Make buoyancy circles for debugging
		for (let i = 0; i < 100; i += 1) {
			const circle = new Graphics().circle(0, 0, 4).fill('#777777');
			this.worldContainer.addChild(circle);
			this.buoyancyCircles.push(circle);
		}
		this.makeBackground();
		for (let c = 0; c < 140; c += 1) {
			this.makeCloud();
		}
	}

	makeBackground() {
		// TODO: Can we just repeat a sprite instead of bothering with a mesh plane?
		const texture = Assets.get('skyWaterBg');
		const sky = new MeshPlane({
			texture,
			verticesX: 4,
			verticesY: 4,
		});
		// const sky = new Sprite(this.bgTexture);
		// sky.anchor.set(0, 0.5);
		sky.y = -1000;
		const WORLD_WIDTH = 28000; // TODO: Get from the world?
		sky.width = WORLD_WIDTH;
		sky.height = texture.height; // Actual height of the texture
		const repeat = WORLD_WIDTH / texture.width;
		Renderer.repeatTextureHorizontally(sky, repeat);
		this.bgContainer.addChild(sky);
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
		sprite.y = Math.random() * -1000;
		this.clouds.push(sprite);
		this.bgContainer.addChild(sprite);
		return sprite;
	}

	makeVisualBoat(boat, arr) {
		const vb = new Container();
		const textureAlias = `${boat.entityTypeKey}-${boat.variant || 0}-0`;
		vb.currentTextureAlias = textureAlias;
		const sprite = Sprite.from(textureAlias);
		sprite.label = textureAlias;
		vb.addChild(sprite);
		const entType = entityTypes[boat.entityTypeKey];
		sprite.width = entType.width;
		sprite.height = entType.height;
		sprite.anchor.set(0.5);
		this.physicsContainer.addChild(vb);
		arr.push(vb);
		return vb;
	}

	makeVisualCannonball() {
		const sprite = Sprite.from('cannonball');
		sprite.scale = 1;
		sprite.anchor.set(0.5);
		this.visualCannonballs.push(sprite);
		// const graphic = new Graphics().circle(0, 0, 10).fill('#ff550077');
		this.physicsContainer.addChild(sprite);
		return sprite;
	}

	makeVisualCrate() {
		const sprite = Sprite.from('crate');
		sprite.scale = 2;
		sprite.anchor.set(0.5);
		this.visualCrates.push(sprite);
		// const graphic = new Graphics().circle(0, 0, 10).fill('#ff550077');
		this.physicsContainer.addChild(sprite);
		return sprite;
	}

	makeWaterMeshPlane(waterChunk) {
		// texture.source.repeatMode = 'repeat'; // Sets the addressMode also
		// texture.source.addressMode = 'repeat'; // Horizontal (vertical is addressModeV)
		// const texture2 = await Assets.load('./images/wavetexture.png');
		// #1099bb
		const plane = new MeshPlane({
			texture: Assets.get('water'),
			verticesX: waterChunk.vertCount.x,
			verticesY: waterChunk.vertCount.y,
		});
		plane.autoResize = false;
		// Dimensions from the texture
		const h = plane.height;
		const w = plane.width;
		plane.height = waterChunk.size.y;
		plane.width = waterChunk.size.x;
		const scaleHeight = waterChunk.size.y / h;
		const scaleWidth = waterChunk.size.x / w;
		const horizontalStretch = 4;
		const horizontalRepeat = (scaleWidth / scaleHeight) / horizontalStretch;
		// plane.tint = '#3e3b66'; // '1099bb';
		// plane.tint = 0x9c807e;
		plane.tint = 0xc3a79c;
		Renderer.repeatTextureHorizontally(plane, horizontalRepeat);
		this.waterMeshPlane = plane;
		this.waterMeshBuffer = null;
		this.waterContainer.addChild(plane);
		// Get the buffer for vertex positions.
		this.waterMeshBuffer = plane.geometry.getAttribute('aPosition').buffer;
		return plane;
	}

	static getCannonPoint(boat) {
		const entType = entityTypes[boat.entityTypeKey];
		let cannonPos = vec2(boat);
		if (entType.cannonPoints) {
			const cannonPoint = entType.cannonPoints[0];
			// ^ TODO: account for multiple cannon positions
			cannonPos = cannonPos.add({
				x: cannonPoint.x * boat.direction,
				y: cannonPoint.y,
			});
			// TODO: Rotate the x, y coordinates around the boat's center
		}
		return cannonPos;
	}

	renderBoats(boats = [], boatCallback = NOOP) {
		let bcIndex = 0;
		if (gameConfig.wireframesOn) this.wireframes.removeChildren();
		// ^^ Bad performance - TODO: improve?
		boats.forEach((b, i) => {
			let vb = this.visualBoats[i];
			if (!vb) {
				vb = this.makeVisualBoat(b, this.visualBoats);
			}
			const directionIndex = b.direction < 0 ? 0 : 1;
			const textureAlias = `${b.entityTypeKey}-${b.variant || 0}-${directionIndex}`;
			// TODO: Rather than store currentTextureAlias, and compare it,
			// can we get the alias from the sprite?
			const sprite = vb.children[0];
			if (textureAlias !== vb.currentTextureAlias) {
				sprite.texture = Assets.get(textureAlias);
				vb.currentTextureAlias = textureAlias;
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

			if (gameConfig.wireframesOn && !b.removed) {
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
				// const entType = entityTypes[b.entityTypeKey];
				if (b.hit) {
					this.particleController.emit(
						35,
						{ x: b.x, y: b.y },
						{
							scale: 1.8,
							randomVelocityScale: 20,
							// tint: 0xab597d,
							tints: [0xd8725e, 0xf7cf91, 0xab597d],
							life: 18,
							gravityScale: 5,
						},
					);
				}
				if (b.firing) {
					const cannonPos = Renderer.getCannonPoint(b);
					// TODO: Set velocity based on direction and angle of boat
					// TODO: Set velocity based on angle of firing
					this.particleController.emit(
						1,
						cannonPos,
						{
							scale: 3,
							randomScale: 2,
							randomVelocityScale: 0.2,
							baseVelocity: { x: b.direction * 1.5, y: 0 },
							tints: [0x2d1e2f, 0x452e3f],
							life: 170,
							gravityScale: -0.05,
						},
					);
					// Sparks
					this.particleController.emit(
						1,
						cannonPos,
						{
							scale: 1,
							randomScale: 2,
							randomVelocityScale: 0.2,
							baseVelocity: { x: b.direction * 4, y: 0 },
							tints: [0xd8725e, 0xf7cf91],
							life: 15,
							gravityScale: 0.1,
						},
					);
				}
				if (b.submergedPercent) {
					// Water spray
					// TODO: base positions on ship's submerged buoyancy points? or at least
					// take into consideration the ship's angle?
					this.particleController.emit(
						b.submergedPercent / 4,
						{ x: b.x - 50 + rand(100), y: b.y + 49 },
						{
							scale: 1,
							randomScale: 1,
							randomVelocityScale: 0.12,
							// tint: 0x5d4550,
							// tint: 0x799181,
							tint: 0xa0ddd3,
							baseVelocity: { x: 0, y: -2 },
							// tints: [0x452e3f, 0x5d4550],
							life: 30,
							gravityScale: 1,
						},
					);
				}
				// Smoke stack
				this.particleController.emit(
					0.2,
					{ x: b.x, y: b.y - 49 },
					{
						scale: 4,
						randomScale: 4,
						randomVelocityScale: 0.12,
						// tint: 0x5d4550,
						tint: 0x452e3f,
						// tints: [0x452e3f, 0x5d4550],
						life: 300,
						gravityScale: -0.05,
					},
				);
			}
			boatCallback(b, i);
		});
	}

	renderCrate(crate, i) {
		let vc = this.visualCrates[i];
		if (!vc) {
			vc = this.makeVisualCrate();
			// TODO: Do we need width and height?
			// vc.width = c.width;
			// vc.height = c.height;
		}
		vc.x = crate.x;
		vc.y = crate.y;
		vc.angle = radiansToDegrees(crate.angle);
	}

	renderCannonball(cb, i) {
		let vcb = this.visualCannonballs[i];
		if (!vcb) {
			vcb = this.makeVisualCannonball();
			// TODO: Do we need width and height?
			// vcb.width = c.width;
			// vcb.height = c.height;
		}
		vcb.x = cb.x;
		vcb.y = cb.y;
		vcb.angle = radiansToDegrees(cb.angle);
		vcb.visible = !cb.removed;
		vcb.alpha = 1 - cb.deep;
		if (!cb.removed && !cb.isDead && !cb.submergedPercent) {
			this.particleController.emit(0.5, { x: cb.x, y: cb.y }, {
				randomVelocityScale: 0.2,
				gravityScale: 0.1,
				scale: 2,
				randomScale: 1,
				tint: 0x2d1e2f,
			});
		}
	}

	updateWave(vertCount, surface, totalTime) {
		updateWaveBufferData(
			this.waterMeshBuffer.data,
			this.waterMeshPlane,
			vertCount,
			surface,
			totalTime,
		);
		this.waterMeshBuffer.update();
	}

	update(data, deltaTime, totalTime) { // Do all rendering
		const { surface /* , boats */ } = data;

		this.particleController.update(deltaTime, totalTime);

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
