import { clamp } from './utils.js';
import { calcDeterministicWavesForWaterChunk } from './calculateDeterministicWaves.js';

// Hooke's Law
// F = - k * dy; // F = force, k = stiffness constant, dy = distance
const MAX_SPRING_DELTA = 100;
const MIN_SPRING_DELTA = -100;
const SPRING_K = 0.01; // stiffness
// Dampening = How much the spring slows down over time; can be anything 0-1
const SPRING_DAMPENING = 0.016;
// How much it spreads to its neighbors
const SPRING_WAVE_SPREAD = -0.008;
// Thanks to https://www.youtube.com/watch?v=RXIRkou021U
// Mutates arrays in springs
function adjustSprings(springDeltas = [], springVelocities = [], deltaTime = 1) {
	const t = deltaTime; // ~1
	function setNeighborVelocity(i, middleDx, middleDy) {
		const neighborDX = springDeltas[i] || 0;
		const neighborDy = springDeltas[i + 1] || 0;
		const neighborDeltaDeltaX = neighborDX - middleDx;
		const neighborDeltaDeltaY = neighborDy - middleDy;
		springVelocities[i] += neighborDeltaDeltaX * SPRING_WAVE_SPREAD * t;
		springVelocities[i + 1] += neighborDeltaDeltaY * SPRING_WAVE_SPREAD * t;
	}
	for (let i = 0; i < springDeltas.length; i += 2) {
		let dx = springDeltas[i];
		let dy = springDeltas[i + 1];
		let velX = springVelocities[i];
		let velY = springVelocities[i + 1];
		// TODO: Implement time better
		// const lossX = -SPRING_DAMPENING * velX;
		// const lossY = -SPRING_DAMPENING * velY;
		const forceX = -SPRING_K * dx + (-SPRING_DAMPENING * velX);
		const forceY = -SPRING_K * dy + (-SPRING_DAMPENING * velY);

		velX += forceX;
		velY += forceY;
		dx = clamp(dx + (velX * t), MIN_SPRING_DELTA, MAX_SPRING_DELTA);
		dy = clamp(dy + (velY * t), MIN_SPRING_DELTA, MAX_SPRING_DELTA);
		if (Math.abs(dx) < 0.0001) dx = 0;
		if (Math.abs(dy) < 0.0001) dy = 0;
		springDeltas[i] = dx;
		springDeltas[i + 1] = dy;
		springVelocities[i] = velX;
		springVelocities[i + 1] = velY;
	}
	for (let i = 0; i < springDeltas.length; i += 2) {
		const middleDx = springDeltas[i];
		const middleDy = springDeltas[i + 1];
		const hasLeft = (i > 0);
		const hasRight = (i < springDeltas.length - 2);
		// Give a velocity to neighbors based on the difference between coordinates
		if (hasLeft) {
			setNeighborVelocity(i - 2, middleDx, middleDy);
		}
		if (hasRight) {
			setNeighborVelocity(i + 2, middleDx, middleDy);
		}
	}
}

export default class WaterChunk {
	constructor(sizeX = 2500, sizeY = 300, vertCountX = 100, vertCountY = 8) {
		// number of vertices in the plane
		this.vertCount = { x: Math.round(vertCountX), y: Math.round(vertCountY) };
		this.size = { x: sizeX, y: sizeY }; // width, height in world units (~pixels)
		this.rippleDeltas = new Float32Array(this.vertCount.x * 2);
		this.rippleVelocities = new Float32Array(this.vertCount.x * 2);
		// Flat array of x, y coordinates
		this.surfaceOffsetVerts = new Float32Array(this.vertCount.x * 2);
		// After re-watching the video I took of my recent changes, I identified that this was
		// the problematic code:
		this.surfaceVerts = new Float32Array(this.vertCount.x * 2);
		// ^ What I think is happening is that all the data for the water chunk is being sent
		// through peer js, but it is too much now, so some data is being dropped.
		this.waveParams = {
			k: 1,
			w: 1,
		};
	}

	static getXPerVert(wc) {
		return (wc.size.x / (wc.vertCount.x - 1));
	}

	static getCoordinatesAtIndex(wc, i) {
		return {
			x: wc.surfaceVerts[i * 2],
			y: wc.surfaceVerts[(i * 2) + 1],
		};
		// return {
		// 	x: (i * WaterChunk.getXPerVert(wc)) + (wc.surfaceOffsetVerts[i * 2] || 0),
		// 	y: wc.surfaceOffsetVerts[(i * 2) + 1] || 0,
		// };
	}

	getXPerVert() { return WaterChunk.getXPerVert(this); }

	getWaterEdgeSpringIndex(x) {
		return Math.floor(x / this.getXPerVert());
	}

	getXAtIndex(i) {
		return (i * this.getXPerVert()) + this.surfaceOffsetVerts[i * 2];
	}

	getYAtIndex(i) {
		return this.surfaceOffsetVerts[(i * 2) + 1];
	}

	getY(x) {
		// TODO: Make this more robust. This is just an approximation
		// TODO: Improve by getting the indices before/after to x coordinate
		const i = this.getWaterEdgeSpringIndex(x);
		return this.surfaceOffsetVerts[(i * 2) + 1];
	}

	updateSurface(totalTime) {
		const { verts, offsetVerts } = calcDeterministicWavesForWaterChunk(this, totalTime);
		this.surfaceVerts = verts;
		this.surfaceOffsetVerts = offsetVerts;
	}

	update(deltaTime = 0, totalTime = 0) {
		adjustSprings(this.rippleDeltas, this.rippleVelocities, deltaTime);
		this.updateSurface(totalTime);
	}
}
