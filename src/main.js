import Renderer from './Renderer.js';
import Player from './Player.js';
import Camera from './Camera.js';
import UserInterface from './UserInterface.js';
import SoundController from './SoundController.js';

const player = new Player();
const ui = new UserInterface(player);
window.player = player;

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

	const renderer = new Renderer();
	await renderer.init();
	await ui.init();

	const { worldContainer } = renderer;
	const camera = new Camera(worldContainer, renderer.app.canvas);
	camera.setupWheelZoom();
	camera.setupPinchZoom();
	if (window.innerWidth < 800) camera.zoom = 0.75;

	renderer.makeWaterMeshPlane(waterChunk);

	const makeCrate = async (pos) => {
		await player.sendCommand('MC', pos);
		renderer.makeVisualCrate();
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
	document.addEventListener('pointerup', (e) => {
		// console.log('up', e);
		if (keysDown.ButtonLeft || keysDown.ButtonRight || keysDown.ButtonRepair) {
			e.preventDefault(); // Try to prevent click -> shoot // TODO: Fix - not working?
		}
		setTimeout(() => { // TODO: come up with a better solution for this
			keysDown.ButtonLeft = false;
			keysDown.ButtonRight = false;
			keysDown.ButtonRepair = false;
		}, 1);
	});
	document.addEventListener('click', async (e) => {
		// console.log('click', e);
		const outcome = ui.handleButtonClicks(e);
		// if (outcome) e.preventDefault();
		if (typeof outcome === 'string') {
			await player.sendCommand(outcome);
			return;
		}
		if (outcome === true) return; // A click was handled
		if (keysDown.ButtonLeft || keysDown.ButtonRight || keysDown.ButtonRepair) return;
		// TODO: Check if your boat is ready fire based on fire cooldown. If not ready, then
		// play the 'dud' sound, otherwise proceed to send the FC command.
		// Otherwise, do a shoot
		const pos = camera.getWorldCoordinates(e.clientX, e.clientY);
		renderer.click.x = pos.x;
		renderer.click.y = pos.y;
		await player.sendCommand('FC', pos);
	});

	const soundController = new SoundController();

	let totalTime = 0;
	let myBoat = null;
	let previousBoats = [];

	renderer.app.ticker.add((time) => { // Listen for animate update
		totalTime += time.deltaTime;
		// let bcIndex = 0;

		const surface = player.calcWaterSurface();
		const boats = player.getBoats();
		const crates = player.getCrates();
		const balls = player.getCannonballs();
		// TODO: get wind direction from player from world

		renderer.updateWave(waterChunk.vertCount, surface, totalTime);

		renderer.update({ surface, boats }, time.deltaTime, totalTime);

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

		crates.forEach((c, i) => renderer.renderCrate(c, i));
		balls.forEach((cb, i) => renderer.renderCannonball(cb, i));

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

	window.camera = camera;
})();
