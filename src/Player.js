import PeerConnector from './PeerConnector.js';
import WorldHost from './WorldHost.js';
import { calcDeterministicWavesForWaterChunk } from './calculateDeterministicWaves.js';
import { makeRandomId } from './utils.js';

export default class Player {
	constructor() {
		this.id = this.makeId();
		this.isHosting = false;
		this.connector = new PeerConnector(); // `${this.id}_player_wave_morph`);
		this.worldHost = null;
		this.syncTimer = null;
		this.waterChunks = [];
		this.crateInfo = [];
		this.cannonballs = [];
		this.boats = [];
		this.worldTotalTime = 0;
		this.myBoatIndex = -1;
	}

	makeId() {
		// TODO: Re-use the same ID to make it easier to re-establish connection if the player
		// refreshes their page.
		// const id = localStorage.getItem('wavesPlayerId') || makeRandomId();
		const id = makeRandomId();
		localStorage.setItem('wavesPlayerId', id);
		this.id = id;
		return id;
	}

	async hostWorld(worldHost) {
		this.worldHost = worldHost || null;
		if (!this.worldHost) throw new Error('No worldHost to host');
		await this.worldHost.start();
		this.isHosting = true;
		await this.connectToWorld(this.worldHost.connector.peerId, true);
	}

	async hostNewWorld() {
		const worldHost = new WorldHost();
		await this.hostWorld(worldHost);
	}

	getConnectionDetails() {
		const { worldPeerId } = this;
		return {
			text: worldPeerId,
			worldPeerId,
			hostPeerId: this.worldHost.connector.peerId,
			isHosting: this.isHosting,
		};
	}

	async connectToWorld(worldPeerId = null, keepHosting = false) {
		if (this.worldHost && !keepHosting) {
			this.worldHost.stop();
			this.isHosting = false;
			// TODO: Close other peer?
		}
		this.worldPeerId = null;
		await this.connector.start({
			onData: (...args) => this.handleWorldHostData(...args),
		});
		await this.connector.connectTo(worldPeerId);
		this.worldPeerId = worldPeerId;
		await this.connector.send({ newPlayer: { id: this.id } });
		/*
		const peer = await this.makePeer(`${this.id}_player_wave_morph`);
		const connectPromise = new Promise((resolve, reject) => {
			console.log('Trying to connect to host', this.worldPeerId);
			const conn = peer.connect(worldPeerId);
			conn.on('open', () => {
				console.log('Out-going connection open');
				resolve(conn);
			});
			conn.on('data', (...args) => {
				console.log('Data from out-going connection', this.worldPeerId, args);
			});
			conn.on('error', () => {
				reject();
			});
		});
		this.connection = await connectPromise;
		*/
	}

	// NOTE: Any values that were Structered arrays will come over from peer js as array buffers,
	// and need to be converted back into their particular type (e.g., surfaceOffsetVerts)
	handleWorldHostData(data) {
		const { sync } = data;
		if (!sync) return;
		const { totalTime, waterChunk, crateInfo, cannonballs, boats } = sync;
		this.worldTotalTime = totalTime;
		if (waterChunk) {
			this.waterChunks = [waterChunk];
			this.waterChunks.forEach(
				(wc) => {
					// wc.surfaceOffsetVerts = new Float32Array(wc.surfaceOffsetVerts);
					wc.rippleDeltas = new Float32Array(wc.rippleDeltas);
					wc.surfaceVerts = new Float32Array(wc.surfaceVerts);
				},
			);
		}
		if (crateInfo) this.crateInfo = [...crateInfo];
		if (boats) this.boats = [...boats];
		if (cannonballs) this.cannonballs = [...cannonballs];
		this.myBoatIndex = this.boats.findIndex((b) => b.playerId === this.id);
	}

	syncWorldHost() {
		clearTimeout(this.syncTimer);
		this.waterChunks = [this.worldHost?.world?.waterChunk];
		this.crateInfo = [];
		this.worldHost?.world.crates.forEach((crate) => {
			this.crateInfo.push(crate.body.position.x);
			this.crateInfo.push(crate.body.position.y);
			this.crateInfo.push(crate.body.angle);
		});
		this.boats = this.worldHost?.world?.boats;
		this.myBoatIndex = this.boats.findIndex((b) => b.playerId === this.id);
		this.syncTimer = setTimeout(() => this.syncWorldHost(), 10);
	}

	async waitForWaterChunk() {
		const wait = new Promise((resolve) => {
			const timer = setInterval(() => {
				if (this.waterChunks.length) {
					clearInterval(timer);
					resolve();
				}
			}, 100);
		});
		await wait;
		return this.waterChunk;
	}

	async sendCommand(command, params) {
		if (command === 'CONNECT') {
			const peerId = params;
			await this.connectToWorld(peerId);
			return;
		}
		if (command === 'HOST') {
			// TODO
			return;
		}
		if (this.isHosting) {
			this.worldHost.handleCommand(command, params, this.id);
			return;
		}
		this.connector.send({ command: [command, params], playerId: this.id });
	}

	getWaterChunk() {
		return this.waterChunks[0];
	}

	getBoats() {
		return this.boats;
	}

	getCrates() {
		const crates = [];
		for (let i = 0; i < this.crateInfo.length; i += 3) {
			crates.push({
				x: this.crateInfo[i],
				y: this.crateInfo[i + 1],
				angle: this.crateInfo[i + 2],
			});
		}
		return crates;
	}

	getCannonballs() {
		return this.cannonballs;
	}

	calcWaterSurface() {
		const arr = [];
		const wc = this.waterChunks[0];
		const { verts, offsetVerts } = calcDeterministicWavesForWaterChunk(wc, this.worldTotalTime);
		for (let i = 0; i < wc.vertCount.x * 2; i += 2) {
			arr.push({
				x: verts[i],
				y: verts[i + 1],
				dx: offsetVerts[i],
				dy: offsetVerts[i + 1],
			});
		}
		return arr;
	}

	getFocusCoords() {
		const { x = 0, y = 0, direction = 0 } = this.boats?.[this.myBoatIndex] || {};
		return [
			x + (direction * 85),
			(y / 10) // reduce y to be closer to zero
			- 60, // And keep focus above the boat (the air has more action w/ cannonballs)
		];
	}
}
