import Matter from 'matter-js';
import WaterChunk from './WaterChunk.js';
import { vec2 } from './Vector2.js';
import { randInt, clamp, pickRand, makeRandomId } from './utils.js';
import entityTypes from './entityTypes.js';

const {
	Engine,
	// Render,
	Runner,
	// MouseConstraint,
	// Mouse,
	Bodies,
	Body,
	Composite,
	// Bounds,
	Events,
} = Matter;

const WATER_UNITS_PER_VERT = 28; // Any lower and there might be chaos
const WATER_VERTICAL_VERTS = 6;
const LEFT = 0;
const ROOF = -9000;
const RIGHT = 28000; // Can this go to 28k?
// If this is too high the spring functionality can get "bugged out", probably due to losing data
// during the peer js communication
const FLOOR = 500;
const SPAWN_PADDING = 400; // How far from the edges things should spawn

const NPC_PLAYER_ID_PREFIX = 'NPC';
const BOAT_LABEL = 'Boat';
const CANNONBALL_LABEL = 'Cannonball';
const CRATE_LABEL = 'Crate';

export default class World {
	constructor(boundaries = [LEFT, ROOF, RIGHT, FLOOR]) {
		const [boundMinX, boundMinY, boundMaxX, boundMaxY] = boundaries;
		this.totalTime = 0;
		this.min = { x: boundMinX, y: boundMinY };
		this.max = { x: boundMaxX, y: boundMaxY };
		this.terrain = [];
		const xSize = boundMaxX - boundMinX;
		const xVerts = xSize / WATER_UNITS_PER_VERT;
		// console.log('Making water with', xVerts, 'verts');
		this.waterChunk = new WaterChunk(xSize, boundMaxY, xVerts, WATER_VERTICAL_VERTS);
		this.crates = [];
		this.cannonballs = [];
		this.boats = [];

		this.engine = Engine.create();
		this.physicsWorld = this.engine.world;
		this.runner = Runner.create();

		this.boatTypes = ['tug'];
		this.idealBoatNumber = 30;

		this.cutOffMomentum = 2820; // cannonball velocity length 3 * cannonball mass

		/*
		const render = Render.create({
			element: document.body,
			engine,
			options: {
				width: window.innerWidth - 12,
				height: window.innerHeight - 12,
				// showAngleIndicator: true,
				// showCollisions: true,
				// showIds: true,
				// showAxes: true,
				// showPositions: true,
				// showSeparations: true,
				// showDebug: true,
				wireframes: false,
			},
			renderer: { element: document.getElementById('world') },
		});
		render.context.imageSmmothingEnabled = false;
		render.context.mozImageSmoothingEnabled = false;
		render.context.webkitImageSmoothingEnabled = false;
		Render.run(render);

		const mouse = Mouse.create(render.canvas);
		const mouseConstraint = MouseConstraint.create(engine, {
			mouse,
			constraint: {
				stiffness: 0.2,
				render: {
					visible: false,
				},
			},
		});
		this.addToWorld(mouseConstraint);
		// keep the mouse in sync with rendering
		render.mouse = mouse;
		*/
	}

	setup() {
		for (let i = 0; i < this.idealBoatNumber; i += 1) {
			this.makeEnemyBoat();
		}
	}

	startPhysics() {
		this.stopPhysics();
		Runner.run(this.runner, this.engine);
		Events.on(this.engine, 'collisionStart', (event) => {
			if (!event.pairs.length) return;
			event.pairs.forEach((pair) => this.handleCollisionPair(pair));
		});
	}

	stopPhysics() {
		// Render.stop(render);
		Events.off(this.engine, 'collisionStart');
		Runner.stop(this.runner);
	}

	addToWorld(physicsThing) {
		Composite.add(this.engine.world, physicsThing);
	}

	removeFromWorld(physicsThing) {
		Composite.remove(this.engine.world, physicsThing);
	}

	/** If there is a removed item already in the array, then override that one and reuse the spot
	 * This assumes that the index isn't saved and used elsewhere. TODO: Fix this for boats
	*/
	addNewEntityToArray(entity, array) { // eslint-disable-line class-methods-use-this
		const firstRemovedEntIndex = array.findIndex((ent) => ent.removed);
		if (firstRemovedEntIndex === -1) {
			array.push(entity);
			return;
		}
		array[firstRemovedEntIndex] = entity;
	}

	removeEntity(entity) {
		entity.removed = true;
		this.removeFromWorld(entity.body);
	}

	makeCrate(pos) {
		const entityTypeKey = 'woodCrate';
		const entType = entityTypes[entityTypeKey];
		const body = Bodies.rectangle(pos.x, pos.y, 32, 32, {
			// render: { fillStyle: '#000000' },
			label: CRATE_LABEL,
			density: entType.density,
		});
		this.addToWorld(body);
		this.crates.push({
			body,
			entityTypeKey,
			hp: entType.maxHp,
			submerged: 0,
			submergedPercent: 0, // 0 - 1
			globalBuoyancyVoxelPoints: [],
		});

		const xi = this.waterChunk.getWaterEdgeSpringIndex(pos.x);
		this.waterChunk.rippleDeltas[(xi * 2) + 1] = 100;
	}

	makeCannonball(boatIndex, aimPos) {
		const entityTypeKey = 'ironCannonball';
		const entType = entityTypes[entityTypeKey];
		// Spawn the cannonball near the boat
		const boat = this.boats[boatIndex];
		if (boat.removed || boat.isDead) return false;
		// TODO: track data where the cannon is relative to the boat coordinates, and spawn there
		const spawnPos = vec2(boat.body.position.x, boat.body.position.y - 10);
		// const spawnPos = { x: boat.body.positionx, y: boat.body.position.y };
		const { group } = boat;
		const body = Bodies.circle(spawnPos.x, spawnPos.y, 8, {
			// Use group to prevent collisions
			collisionFilter: { group },
			// render: { fillStyle: '#000000' },
			// TODO: We may need to make it so the cannonball doesn't collide with the boat
			// -- at least for first few seconds
			label: CANNONBALL_LABEL,
			density: entType.density,
		});
		this.addToWorld(body);
		const forceMultiplier = 60;
		// Direction of the force will be the vector from the spawn (cannon) to the position of
		// the mouse cursor (aimPos).
		const forceVector = vec2(aimPos).subtract(spawnPos).normalize().scale(forceMultiplier);
		// console.log(aimPos, forceVector);
		Body.applyForce(body, body.position, forceVector);
		const cb = {
			isCannonball: true,
			boatIndex,
			entityTypeKey,
			body,
			hit: 0, // 0 - 1
			hp: entType.maxHp,
			hitDamage: entType.hitDamage || 0,
			removed: false,
			deep: 0, // 0 - 1
			submerged: 0,
			submergedPercent: 0, // 0 - 1
			globalBuoyancyVoxelPoints: [],
		};
		this.addNewEntityToArray(cb, this.cannonballs);
		return cb;
	}

	makeBoat(playerId, respawnBoatIndex = -1) {
		const entityTypeKey = pickRand(this.boatTypes);
		const entType = entityTypes[entityTypeKey];
		const {
			// physicalWidth, physicalHeight,
			density, maxHp,
			vertexSet,
		} = entType;
		const rightmost = RIGHT - LEFT - (SPAWN_PADDING * 2);
		const x = SPAWN_PADDING + (Math.random() * rightmost);
		const y = -100; // Above the water
		const group = Body.nextGroup(true); // use group to filter collisions from cannonball
		// const body = Bodies.rectangle(x, y, physicalWidth, physicalHeight, {
		const body = Bodies.fromVertices(x, y, vertexSet, {
			collisionFilter: { group },
			label: BOAT_LABEL,
			density,
		});
		Body.setAngle(body, 0.3);
		this.addToWorld(body);
		const boat = {
			isBoat: true,
			playerId,
			entityTypeKey,
			group, // pass this to cannonballs to avoid collisions
			body,
			direction: 1, // 1 or -1
			throttle: 0, // between -1 and 1
			submerged: 0,
			deep: 0, // 0 - 1
			submergedPercent: 0, // 0 - 1
			hit: 0, // 0 - 1
			firing: 0, // 0 - 1
			hp: maxHp,
			score: 0,
			flooded: 0, // 0 - 1
			globalBuoyancyVoxelPoints: [], // Global/world coordinates
			rateOfFire: entType.rateOfFire,
			fireCooldown: randInt(1000 / entType.rateOfFire),
		};
		if (respawnBoatIndex >= 0) { // We're replacing an existing (probably dead) boat
			this.boats[respawnBoatIndex] = boat;
		} else { // Not a respawn, this is a new boat
			this.boats.push(boat);
		}
		return boat;
	}

	makeEnemyBoat(respawnBoatIndex = -1) {
		const boat = this.makeBoat(NPC_PLAYER_ID_PREFIX + makeRandomId(), respawnBoatIndex);
		boat.rateOfFire /= 3;
		boat.isNpc = true;
		boat.autoRespawn = true;
		boat.target = null;
		boat.sightRange = 1000;
		boat.aggroRange = 1000;
		boat.planningCooldown = 100;
		boat.preferredDistance = 250;
		boat.preferredFireAngle = Math.PI / 4; // 45 degrees
		boat.randomFireAngle = Math.PI / 10; // < 20 degress
	}

	deleteBoat(playerId) {
		// TODO: Remove the boat from the array
		// We can't remove the boat from the array yet because we use the index for things...
		const boat = this.boats.find((b) => b.playerId === playerId);
		this.removeEntity(boat);
		boat.deleted = true;
	}

	moveBoat(index, direction = 1) {
		const boat = this.boats[index];
		if (direction === 1 || direction === -1) boat.direction = direction;
		boat.throttle = direction;
		// if ((boat.throttle > 0 && direction < 0) || (boat.throttle < 0 && direction > 0)) {
		// 	boat.throttle = 0;
		// 	return;
		// }
		// boat.throttle = clamp(direction / 0.1, -1, 1);
		// Body.setVelocity(body, { x: (x / 10) + (direction * mag), y });
	}

	// Returns a Matter Vector
	static getWorldCoordinatesFromRelative(body, point) {
		const { x, y } = point;
		const localVector = Matter.Vector.create(x, y);
		// Apply Rotation (rotation around the origin/center of mass)
		const rotatedVector = Matter.Vector.rotate(localVector, body.angle);
		// Apply Translation (add the body's world position)
		const worldPosition = Matter.Vector.add(body.position, rotatedVector);
		return worldPosition;
	}

	getBuoyancyVoxelPoints(entity) { // eslint-disable-line class-methods-use-this
		if (entity.entityTypeKey) {
			const points = entityTypes[entity.entityTypeKey].buoyancyVoxelPoints.map((point) => {
				return World.getWorldCoordinatesFromRelative(entity.body, point);
			});
			return points;
		}
		return [{ x: entity.body.position.x, y: entity.body.position.y }];
	}

	getEntityVolume(entity) { // eslint-disable-line class-methods-use-this
		if (!entity.volume) {
			if (entity.entityTypeKey) {
				const entType = entityTypes[entity.entityTypeKey];
				const { buoyancyVoxelSize, buoyancyVoxelPoints } = entType;
				entity.volume = buoyancyVoxelPoints.length * buoyancyVoxelSize;
			} else {
				entity.volume = entity.body.area;
			}
		}
		return entity.volume;
	}

	applyEngines(entity, deltaTime = 1) { // eslint-disable-line class-methods-use-this
		if (!entity.throttle) return;
		if (!entity.submerged) return;
		const { body } = entity;
		const ENGINE_MAGNITUDE = 0.12; // velocity magnitude
		const globalDirectionVector = vec2(entity.direction, 0);
		const boatDirectionVector = globalDirectionVector.rotate(-body.angle);
		// body.angle + (Math.PI / 2);
		const newVel = vec2(body.velocity.x, body.velocity.y)
			.add(boatDirectionVector.scale(ENGINE_MAGNITUDE * deltaTime));
		Body.setVelocity(body, newVel);
		entity.throttle *= 0.9;
		if (Math.abs(entity.throttle) < 0.05) entity.throttle = 0;
	}

	/** Mutates the entity to apply water physics */
	applyFlotation(entity, deltaTime = 1) {
		if (entity.removed) return;
		const { body } = entity;
		const entType = entityTypes[entity.entityTypeKey];
		const { buoyancyMultipler = 1, waterFrictionScale = 1 } = entType;

		const bvPoints = this.getBuoyancyVoxelPoints(entity);
		// console.log(bvPoints);
		let bvSubmergedCount = 0;
		const centerOfSubmerged = { x: 0, y: 0 };
		bvPoints.forEach((bv) => {
			const waterY = this.waterChunk.getY(bv.x);
			bv.submerged = bv.y >= waterY;
			if (bv.submerged) {
				bvSubmergedCount += 1;
				centerOfSubmerged.x += bv.x;
				centerOfSubmerged.y += bv.y;
			}
		});
		centerOfSubmerged.x /= bvSubmergedCount;
		centerOfSubmerged.y /= bvSubmergedCount;
		entity.globalBuoyancyVoxelPoints = bvPoints; // The world coordinate points
		const volume = this.getEntityVolume(entity);

		// TODO: Check bounding box versus highest water height -- if it is higher than any water
		// then return.

		const submergedPercent = bvSubmergedCount / bvPoints.length; // value between 0 and 1
		entity.submerged = submergedPercent > 0;
		const WATER_FRICTION_SCALE = 10;

		if (submergedPercent > 0) {
			const frictionForce = vec2(body.velocity).normalize(-1)
				.scale(WATER_FRICTION_SCALE * deltaTime * submergedPercent * waterFrictionScale);
			// Apply water friction
			Body.applyForce(body, body.position, frictionForce);
			// Should we apply more friction in the y coordinate to prevent bounce?
			/*
			// TODO: Remove once we get buoyancy working?
			if (body.velocity.y > 0) {
				Body.setVelocity(body, {
					x: body.velocity.x,
					y: body.velocity.y * 0.8,
				});
			}
			*/
			// Rotational friction
			// TODO: Remove once we get buoyancy working?
			const ANGULAR_FRICTION = 0.8; // Worst friction when fully submerged
			const angularSpeedFriction = 1 - ((1 - ANGULAR_FRICTION) * submergedPercent * deltaTime);
			// TODO: How to use deltaTime here?
			Body.setAngularSpeed(body, Body.getAngularSpeed(body) * angularSpeedFriction);

			// TODO: do better buoyancy here
			const BUOYANCY_FORCE_MAGNITUDE = -10;
			const volumeMultiplier = volume / 100;
			const bouyantForceScale = (
				BUOYANCY_FORCE_MAGNITUDE
				* volumeMultiplier
				* buoyancyMultipler
				* submergedPercent
				* clamp(1 - ((entity.flooded || 0) * 0.88))
			);
			const forceVec = vec2(0, 1).scale(bouyantForceScale);
			Body.applyForce(body, centerOfSubmerged, forceVec);
		}
		if (submergedPercent === 1) {
			const surface = this.waterChunk.getY(body.position.y);
			const deepY = surface + 10; // somewhat arbitrary cutoff
			const maxDepth = (entity.isCannonball) ? deepY + 20 : this.max.y;
			entity.deep = clamp((body.position.y - deepY) / maxDepth);
		} else {
			entity.deep = 0;
		}
	}

	applyDamage(entity, damageAmount = 0) { // eslint-disable-line class-methods-use-this
		entity.hp = Math.floor((entity.hp || 0) - damageAmount);
	}

	killEntity(entity) { // eslint-disable-line class-methods-use-this
		entity.isDead = true;
		entity.flooded = 1;
		entity.score = 0;
		if (entity.decaying === undefined) entity.decaying = 500;
	}

	decay(entity, deltaTime = 1) {
		if (entity.removed) return;
		const entType = entityTypes[entity.entityTypeKey];
		if (entType.decaysUnderWater && entity.submerged) {
			const dmg = deltaTime + (entity.deep * 3);
			this.applyDamage(entity, dmg);
		}
		if (entity.hp <= 0) this.killEntity(entity);
		if (entity.decaying) entity.decaying -= deltaTime;
		if (entity.decaying <= 0) this.removeEntity(entity);
		if (entity.hit) entity.hit = clamp(entity.hit - 0.1, 0, 1);
		if (entity.firing) entity.firing = clamp(entity.firing - 0.1, 0, 1);
	}

	findTarget(boat, cutOffDistance = Infinity) {
		let distance = cutOffDistance;
		let target = null;
		this.boats.forEach((b) => {
			if (b === boat) return;
			const dx = Math.abs(b.body.position.x - boat.body.position.x);
			if (dx < distance) {
				distance = dx;
				target = b;
			}
		});
		return { target, distance };
	}

	static getMoveDirection(x, targetX, preferredDistance, wiggleRoom = 0) {
		let dir = 0; // Zero = Don't move
		const dx = targetX - x;
		// If within some range of preferred distance, then stop
		const okRightOuter = preferredDistance + wiggleRoom;
		const okRightInner = preferredDistance - wiggleRoom;
		const okLeftOuter = -1 * okRightOuter;
		const okLeftInner = -1 * okRightInner;
		if (dx > 0) {
			if (dx > okRightOuter) dir = 1;
			else if (dx < okRightInner) dir = -1;
			return dir;
		}
		if (dx < okLeftOuter) dir = -1;
		else if (dx > okLeftInner) dir = 1;
		return dir;
	}

	planBoat(boat, boatIndex) {
		if (boat.removed || boat.isDead) return;
		if (typeof boat.planningCooldown !== 'number' || boat.planningCooldown > 0) return;
		const { target /* , distance */ } = this.findTarget(boat, boat.sightRange);
		if (target) {
			// TODO: set a preferred distance and angle
			// TODO: find the distance to the target
			const dir = World.getMoveDirection(
				boat.body.position.x,
				target.body.position.x,
				boat.preferredDistance,
				100,
			);
			this.moveBoat(boatIndex, dir);
		} else {
			boat.throttle = 0;
		}
		boat.planningCooldown = 100;
	}

	fireCannonballFromBoat(boatIndex, aimPos) {
		const boat = this.boats[boatIndex];
		if (boat.removed || boat.isDead) return;
		if (typeof boat.fireCooldown !== 'number' || boat.fireCooldown > 0) return;
		const fireHeatUp = 1000 / (boat.rateOfFire || 1);
		boat.fireCooldown = (fireHeatUp || 0) + randInt(fireHeatUp / 10);
		boat.firing = 1;
		if (aimPos) { // Typically for players
			this.makeCannonball(boatIndex, aimPos);
			return;
		}
		// Typically for NPCs...
		const { target } = this.findTarget(boat, boat.aggroRange);
		if (!target) return;
		// NOTE: Angle seems to be backwards from what I would expect - TODO LATER: Fix?
		const targetDirection = (target.body.position.x < boat.body.position.x) ? 1 : -1;
		const { preferredFireAngle = 0, randomFireAngle = 0 } = boat;
		const fireAngle = -Math.PI // offset
			+ ((
				preferredFireAngle // Base angle, like 45 degrees
				- (randomFireAngle / 2) + (Math.random() * randomFireAngle) // Add some randomness
			)
			* targetDirection // point angle towards target
			);
		const fireVector = vec2(0, 1).setAngle(fireAngle, 100);
		const aimPosition = vec2(boat.body.position).add(fireVector);
		this.makeCannonball(boatIndex, aimPosition);
	}

	respawnBoat(deadBoats) {
		this.makeEnemyBoat(deadBoats[0].boatIndex);
	}

	// TODO: Run this in-sync with the Matter runner
	update(deltaTimeParam = 1) {
		const deltaTime = clamp(deltaTimeParam, 0, 10);
		if (deltaTimeParam > 10) console.warn('Delta time:', deltaTimeParam, 'clamped to', deltaTime);
		this.totalTime += deltaTime;
		this.waterChunk.update(deltaTime, this.totalTime);
		const allPhysicalEntities = [...this.crates, ...this.boats, ...this.cannonballs];
		allPhysicalEntities.forEach((ent) => {
			// TODO: Handle the edges differently
			// setting the position can mess the matter-js physics up
			ent.body.position.x = clamp(ent.body.position.x, this.min.x, this.max.x);
			ent.body.position.y = clamp(ent.body.position.y, this.min.y, this.max.y);
			this.applyFlotation(ent, deltaTime);
			this.applyEngines(ent, deltaTime);
			this.decay(ent, deltaTime);
			// if (ent.isCannonball) console.log(vec2(ent.body.velocity).length(), ent.body.mass);
		});
		const deadBoats = [];
		this.boats.forEach((b, boatIndex) => {
			if (typeof b.fireCooldown === 'number') b.fireCooldown -= deltaTimeParam;
			if (typeof b.planningCooldown === 'number') b.planningCooldown -= deltaTimeParam;
			if (b.isNpc) {
				this.planBoat(b, boatIndex);
				this.fireCannonballFromBoat(boatIndex);
			}
			if (b.removed || b.isDead) {
				b.boatIndex = boatIndex;
				deadBoats.push(b);
			}
		});
		const aliveBoats = this.boats.length - deadBoats.length;
		if (aliveBoats < this.idealBoatNumber) {
			const firstRemovedNpcBoat = deadBoats.find((b) => b.isNpc && b.removed);
			if (firstRemovedNpcBoat) {
				console.log('Alive boats:', aliveBoats, '. Respawning an NPC boat.');
				this.makeEnemyBoat(firstRemovedNpcBoat.boatIndex); // Respawn a boat
			}
		}
		// console.log('Alive boats:', aliveBoats);
		// this.crates.forEach((crate) => this.applyFlotation(crate));
		// this.boats.forEach((boat) => this.applyFlotation(boat));
		// this.cannonballs.forEach((ball) => this.applyFlotation(ball, 0.14));
	}

	findObjectFromBody(body) {
		let arr = [];
		if (body.label === BOAT_LABEL) arr = this.boats;
		if (body.label === CANNONBALL_LABEL) arr = this.cannonballs;
		if (body.label === CRATE_LABEL) arr = this.crates;
		return arr.find((b) => (b.body.id === body.id));
	}

	giveCollisionScore(entA, entB) {
		if (entA.removed || entB.removed) return;
		let victim = null;
		let attacker = null;
		if (entB.boatIndex) { // TODO: Check if it's a projectile?
			attacker = this.boats[entB.boatIndex];
			victim = entA;
		}
		if (entA.boatIndex) {
			attacker = this.boats[entA.boatIndex];
			victim = entB;
		}
		// console.log('👹', attacker, '💀', victim);
		if (attacker
			&& victim && victim.isBoat && !victim.isDead
		) {
			attacker.score += 1;
		}
	}

	getHitDamage(entity) {
		const { hitDamage = 0 } = entity;
		const velLength = vec2(entity.body.velocity).length();
		const momentum = velLength * entity.body.mass;
		if (momentum < this.cutOffMomentum) return hitDamage / 10;
		// TODO: blend the damage between the cutoff length?
		return hitDamage;
	}

	handleCollisionPair(pair) {
		const { bodyA, bodyB } = pair;
		const objA = this.findObjectFromBody(bodyA);
		const objB = this.findObjectFromBody(bodyB);
		const totalHitDamage = this.getHitDamage(objA) + this.getHitDamage(objB);
		if (totalHitDamage) {
			objA.hit = 1;
			objB.hit = 1;
			const randAmount = totalHitDamage / 10;
			const damage = totalHitDamage + randInt(randAmount) - randInt(randAmount);
			this.applyDamage(objA, damage);
			this.applyDamage(objB, damage);
			// if (objA.isBoat) objA.flooded = 1;
			// if (objB.isBoat) objB.flooded = 1;
			this.giveCollisionScore(objA, objB);
			// Is explosive?
			if (objA.isCannonball) this.removeEntity(objA);
			if (objB.isCannonball) this.removeEntity(objB);
		}
	}

	syncGraphics() {
		this.crates.forEach((crate) => {
			crate.graphic.x = crate.body.position.x;
			crate.graphic.y = crate.body.position.y;
			crate.graphic.angle = crate.body.angle;
		});
	}
}
