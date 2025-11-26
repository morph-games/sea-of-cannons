import PeerConnector from './PeerConnector.js';
import World from './World.js';
import gameConfig from './gameConfig.js';

// const DEFAULT_PEER_ID = '1_wave_morph';

export default class WorldHost {
	constructor() {
		this.world = null;
		// this.tickTime = 1000 / 60; // ms
		// this.tickTimer = null;
		this.players = {};
		this.syncTime = 10; // ms
		this.syncTimer = null;
		this.peerIdSuffix = '_wave_morph';
		this.connector = new PeerConnector(
			this.getRandomPeerId(),
			// DEFAULT_PEER_ID,
			{ incoming: true, outgoing: false },
		);
	}

	getRandomPeerId() {
		return `${Math.round(Math.random() * 9999)}${this.peerIdSuffix}`;
	}

	getHostName() { // For now this will just be the peer ID, but we could change this later
		return this.connector.peerId;
	}

	findPlayerBoatIndex(playerId) {
		return this.world.boats.findIndex((b) => b.playerId === playerId);
	}

	addPlayer(playerId, connection) {
		if (!playerId) return false;
		const playerBoatIndex = this.findPlayerBoatIndex(playerId);
		if (playerBoatIndex === -1) {
			const pBoat = this.world.makeBoat(playerId);
			pBoat.hp += 0; // Tweak this for testing
		}
		const boatIndex = this.findPlayerBoatIndex(playerId);
		const { connectionId } = connection;
		this.players[playerId] = { boatIndex, connectionId };
		return playerId;
	}

	removePlayer(conn) {
		const pIds = Object.keys(this.players);
		const pId = pIds.find((key) => this.players[key].connectionId === conn.connectionId);
		if (!pId) throw new Error(`Cannot find player ${conn.connectionId}`);
		// Could delete the player, but we can keep them around in case we allow them to reconnect
		// delete this.players[pId]
		this.players[pId].disconnected = true;
		this.world.deleteBoat(pId);
	}

	// tick(lastTime) {
	// const now = performance.now();
	// const deltaTime = (now - lastTime) / this.tickTime; // Should be close to 1
	// // console.log(deltaTime);
	// this.world.update(deltaTime);
	// this.tickTimer = setTimeout(() => this.tick(now), this.tickTime);
	// }

	async startConnector() {
		await this.connector.start({
			onIncomingOpen: (conn) => {
				console.log('Host: Incoming connection', conn.connectionId);
				// TODO: some kind of authorization?
			},
			onIncomingClose: (conn) => {
				console.log('Host: Lost a player', conn.connectionId, conn);
				this.removePlayer(conn);
			},
			onData: (...args) => this.handleData(...args),
		});
	}

	async start() {
		this.world = new World();
		window.w = this.world;
		this.world.setup();
		this.world.startPhysics();
		// this.tick(performance.now());
		try {
			await this.startConnector();
		} catch (err) {
			// Should we try again?
			this.connector.peerId = this.getRandomPeerId();
			await this.startConnector();
			// if (this.connector.peerId === DEFAULT_PEER_ID) {
			// 	this.connector.peerId = this.getRandomPeerId();
			// 	await this.startConnector();
			// } else {
			// 	console.error(err);
			// }
		}
		this.sync();
	}

	static convertWorldObjectToRenderObject(o) {
		const ro = {};
		if (o.body) {
			ro.x = o.body.position.x;
			ro.y = o.body.position.y;
			ro.angle = o.body.angle;
			if (gameConfig.wireframesOn) {
				ro.vertices = o.body.vertices.map(({ x, y }) => ({ x, y }));
			}
		}
		if (o.playerId) ro.playerId = o.playerId;
		if (o.entityTypeKey) ro.entityTypeKey = o.entityTypeKey;
		if (o.boatIndex) ro.boatIndex = o.boatIndex;
		if (o.direction) ro.direction = o.direction;
		if (o.variant) ro.variant = o.variant;
		if (o.width) ro.width = o.width;
		if (o.height) ro.height = o.height;
		if (o.hp) ro.hp = o.hp;
		if (o.hit) ro.hit = o.hit;
		if (o.firing) ro.firing = o.firing;
		if (o.isDead) ro.isDead = o.isDead;
		if (o.submergedPercent) ro.submergedPercent = o.submergedPercent;
		if (o.cargo) ro.cargo = o.cargo;
		['deep', 'score', 'throttle'].forEach((prop) => {
			if (o[prop] || o[prop] === 0) ro[prop] = o[prop];
		});
		if (o.removed) ro.removed = true;
		if (o.deleted) ro.deleted = true;
		if (o.isNpc) ro.isNpc = true;
		else { // Transfer certain data only for players, not for NPCs
			// eslint-disable-next-line no-lonely-if
			if (o.globalBuoyancyVoxelPoints && gameConfig.wireframesOn) {
				ro.globalBuoyancyVoxelPoints = o.globalBuoyancyVoxelPoints;
			}
		}
		// console.log(o.body.vertices);
		return ro;
	}

	/** Sync all the players with the world by sending all the data */
	sync() {
		const { totalTime } = this.world;
		const crateInfo = [];
		this.world.crates.forEach((c) => {
			crateInfo.push(c.body.position.x);
			crateInfo.push(c.body.position.y);
			crateInfo.push(c.body.angle);
		});
		// TODO: Rename boats and waterChunk to "transferObject" or "renderObject" or "renderData"
		const boats = this.world.boats.map((b) => {
			return WorldHost.convertWorldObjectToRenderObject(b);
		});
		const cannonballs = this.world.cannonballs.map(WorldHost.convertWorldObjectToRenderObject);
		const waterChunk = {
			vertCount: this.world.waterChunk.vertCount,
			size: this.world.waterChunk.size,
			// If we stop sending rippleDeltas we save some bandwidth ~2+Mbps
			// TODO: Add ripple deltas back in if it can be done in a performant way
			// rippleDeltas: this.world.waterChunk.rippleDeltas, // This data is currently big
			waveParams: this.world.waterChunk.waveParams,
			// surfaceVerts: this.world.waterChunk.surfaceVerts, // TODO: Remove me
		};
		const sync = { totalTime, crateInfo, cannonballs, waterChunk, boats };
		// console.log(sync);
		this.connector.send({ sync });
		this.syncTimer = setTimeout(() => this.sync(), this.syncTime);
	}

	async stop() {
		// clearTimeout(this.syncTimer);
		// clearTimeout(this.tickTimer);
		this.world?.stopPhysics();
		await this.connector.stop();
	}

	stopSync() {
		clearTimeout(this.syncTimer);
	}

	// Receive data from player.connector.send
	handleData(data, connection, direction) { // <-- arguments from PeerConnector's onData
		console.log('\t>', data, direction);
		if (data.command) this.handleCommand(data.command[0], data.command[1], data.playerId);
		if (data.newPlayer) {
			this.addPlayer(data.newPlayer.id, connection);
		}
	}

	handleCommand(command, params, playerId) {
		// console.log('Handle command', command, 'with params', params, 'from player', playerId);
		const { boatIndex } = this.players[playerId];
		if (command === 'MC') { // Make Crate
			const pos = params;
			this.world.makeCrate(pos);
		} else if (command === 'MV') { // MoVe
			const direction = params;
			this.world.moveBoat(boatIndex, direction);
		} else if (command === 'FC') { // Fire Cannon
			const aimPosition = params;
			this.world.fireCannonballFromBoat(boatIndex, aimPosition);
		} else if (command === 'RS') { // Respawn
			this.world.makeBoat(playerId, boatIndex);
		} else if (command === 'RE') {
			this.world.repairBoat(boatIndex);
		}
	}
}
