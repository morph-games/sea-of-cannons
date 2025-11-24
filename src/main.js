import { Application, Container, Sprite, Graphics, MeshPlane } from 'pixi.js';
// import { Bodies } from 'matter-js';
import Renderer from './Renderer.js';
import Player from './Player.js';
import Camera from './Camera.js';
import { radiansToDegrees } from './utils.js';
import UserInterface from './UserInterface.js';
import SoundController from './SoundController.js';

const player = new Player();
const ui = new UserInterface(player);
window.player = player;

async function makeRenderApp() {
	const app = new Application();
	// Initialize the application
	await app.init({ background: '#392945', resizeTo: window });
	// Append the application canvas to the document body
	document.body.appendChild(app.canvas);
	return app;
}

function makeRenderWorld(app) {
	const worldContainer = new Container();
	app.stage.addChild(worldContainer);
	const bgContainer = new Container();
	worldContainer.addChild(bgContainer);
	const grid = new Graphics()
		.moveTo(-200, 0)
		.lineTo(200, 0)
		.moveTo(0, -200)
		.lineTo(0, 200)
		.stroke({ color: 0x000000, pixelLine: true });
	bgContainer.addChild(grid);
	return { worldContainer, bgContainer };
}

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

function repeatTextureHorizontally(object, repeatCountX = 2) {
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

function makeWaterMeshPlane(texture, waterChunk) {
	// texture.source.repeatMode = 'repeat'; // Sets the addressMode also
	// texture.source.addressMode = 'repeat'; // Horizontal (vertical is addressModeV)
	// const texture2 = await Assets.load('./images/wavetexture.png');
	// #1099bb
	const plane = new MeshPlane({
		texture,
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
	plane.tint = 0x9c807e;
	repeatTextureHorizontally(plane, horizontalRepeat);
	return plane;
}

(async () => {
	await player.hostNewWorld();
	ui.renderConnection();
	await player.waitForWaterChunk();
	const waterChunk = player.getWaterChunk();

	const keysDown = {};
	document.addEventListener('keydown', (e) => { keysDown[e.key] = true; });
	document.addEventListener('keyup', (e) => {
		keysDown[e.key] = false;
		if (e.key === 'p') {
			ui.openP2PDialog();
		}
	});
	const mousePosition = {};
	window.keys = keysDown;

	const app = await makeRenderApp();
	await ui.init();

	const { worldContainer, bgContainer } = makeRenderWorld(app);
	const camera = new Camera(worldContainer, app.canvas);
	camera.setupWheelZoom();
	camera.setupPinchZoom();
	if (window.innerWidth < 800) camera.zoom = 0.75;

	const renderer = new Renderer(worldContainer, bgContainer);
	await renderer.init();

	const plane = makeWaterMeshPlane(renderer.waterTexture, waterChunk);
	worldContainer.addChild(plane);
	// Get the buffer for vertex positions.
	const { buffer } = plane.geometry.getAttribute('aPosition');
	window.b = buffer;

	const visualCrates = [];
	const visualCannonballs = [];

	const click = new Graphics().circle(0, 0, 10).fill('#00000022');
	worldContainer.addChild(click);

	function makeVisualCrate() {
		const sprite = new Sprite(renderer.crateTexture);
		sprite.scale = 2;
		sprite.anchor.set(0.5);
		visualCrates.push(sprite);
		// const graphic = new Graphics().circle(0, 0, 10).fill('#ff550077');
		worldContainer.addChild(sprite);
		return sprite;
	}

	function makeVisualCannonball() {
		const sprite = new Sprite(renderer.ballTexture);
		sprite.scale = 1;
		sprite.anchor.set(0.5);
		visualCannonballs.push(sprite);
		// const graphic = new Graphics().circle(0, 0, 10).fill('#ff550077');
		worldContainer.addChild(sprite);
		return sprite;
	}

	const makeCrate = async (pos) => {
		await player.sendCommand('MC', pos);
		makeVisualCrate();
	};
	document.addEventListener('mousemove', (e) => {
		mousePosition.x = e.clientX;
		mousePosition.y = e.clientY;
	});
	document.addEventListener('pointerdown', (e) => {
		if (e.target.closest('.go-left')) {
			keysDown.ButtonLeft = true;
		} else if (e.target.closest('.go-right')) {
			keysDown.ButtonRight = true;
		} else if (e.target.closest('.repair')) {
			keysDown.ButtonRepair = true;
		}
	});
	document.addEventListener('pointerup', () => {
		keysDown.ButtonLeft = false;
		keysDown.ButtonRight = false;
		keysDown.ButtonRepair = false;
	});
	document.addEventListener('click', async (e) => {
		const outcome = ui.handleButtonClicks(e);
		if (typeof outcome === 'string') {
			await player.sendCommand(outcome);
			return;
		}
		if (outcome === true) return; // A click was handled
		// Otherwise, do a shoot
		const pos = camera.getWorldCoordinates(e.clientX, e.clientY);
		click.x = pos.x;
		click.y = pos.y;
		await player.sendCommand('FC', pos);
	});

	const soundController = new SoundController();

	let totalTime = 0;
	let myBoat = null;
	let previousBoats = [];

	app.ticker.add((time) => { // Listen for animate update
		totalTime += time.deltaTime;
		// let bcIndex = 0;

		const surface = player.calcWaterSurface();
		const boats = player.getBoats();
		const crates = player.getCrates();
		const balls = player.getCannonballs();
		// TODO: get wind direction from player from world

		updateWaveBufferData(buffer.data, plane, waterChunk.vertCount, surface, totalTime);
		buffer.update();

		renderer.particleController.update(time.deltaTime, totalTime);

		renderer.update({ surface, boats });

		let playerCount = 0;
		let highScore = 0;
		const boatCallback = (b, boatIndex) => {
			if (b.score > highScore) highScore = b.score;
			if (b.playerId === player.id) {
				myBoat = b;
			}
			if (!b.isNpc && !b.deleted) playerCount += 1;
			// Handle sounds
			if (b.removed) return;
			if (b.isDead && previousBoats[boatIndex] && !previousBoats[boatIndex].isDead) {
				soundController.playSounds(['hit', 'splash', 'destroy'], b, myBoat);
			}
			if (!b.isDead) {
				if (b.hit) soundController.playSound('hit', b, myBoat, b.hit);
				if (b.firing) soundController.playSound('fire', b, myBoat, b.firing);
			}
		};
		renderer.renderBoats(boats, boatCallback);
		previousBoats = boats;

		crates.forEach((c, i) => {
			let vc = visualCrates[i];
			if (!vc) {
				vc = makeVisualCrate();
				// TODO: Do we need width and height?
				// vc.width = c.width;
				// vc.height = c.height;
			}
			vc.x = c.x;
			vc.y = c.y;
			vc.angle = radiansToDegrees(c.angle);
		});
		balls.forEach((b, i) => {
			let vcb = visualCannonballs[i];
			if (!vcb) {
				vcb = makeVisualCannonball();
				// TODO: Do we need width and height?
				// vcb.width = c.width;
				// vcb.height = c.height;
			}
			vcb.x = b.x;
			vcb.y = b.y;
			vcb.angle = radiansToDegrees(b.angle);
			vcb.visible = !b.removed;
			vcb.alpha = 1 - b.deep;
			if (!b.removed || !b.isDead || !b.submergedPercent) {
				renderer.particleController.emit(0.5, { x: b.x, y: b.y }, {
					randomVelocityScale: 0.2,
					gravityScale: 0.1,
					scale: 2,
					randomScale: 1,
					tint: 0x2d1e2f,
				});
			}
		});

		// console.log(crates);

		camera.focus(...player.getFocusCoords());

		ui.renderPlayers(playerCount);
		ui.renderScore(myBoat?.score || 0, highScore);
		ui.renderThrottle(myBoat?.throttle || 0);
		ui.renderHealth(myBoat?.hp || 0);
		ui.renderDeath(myBoat);

		if (keysDown.a || keysDown.ArrowLeft || keysDown.ButtonLeft) {
			player.sendCommand('MV', -1);
		} else if (keysDown.d || keysDown.ArrowRight || keysDown.ButtonRight) {
			player.sendCommand('MV', 1);
		}
		if (keysDown['c']) { // eslint-disable-line dot-notation
			const pos = camera.getWorldCoordinates(mousePosition.x, mousePosition.y);
			// TODO: If we want to keep this as a feature we're going to need a cooldown on how
			// often this can be done.
			makeCrate(pos);
		}
	});

	window.plane = plane;
	window.camera = camera;
})();
