import Matter from 'matter-js';
import WaterChunk from './WaterChunk.js';
import { vec2 } from './Vector2.js';
import { randInt, clamp, pickRand, makeRandomId, HALF_PI, TWO_PI } from './utils.js';
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
const SIZE_X = RIGHT - LEFT;
// If this is too high the spring functionality can get "bugged out", probably due to losing data
// during the peer js communication
const FLOOR = 500;
const SPAWN_PADDING = 400; // How far from the edges things should spawn

const NPC_PLAYER_ID_PREFIX = 'NPC';
const BOAT_LABEL = 'Boat';
const CANNONBALL_LABEL = 'Cannonball';
const CRATE_LABEL = 'Crate';

/* eslint-disable class-methods-use-this */

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
		this.idealBoatNumber = 18; // Would like 30, but impacting bandwidth

		this.cutOffMomentum = 2820; // cannonball velocity length 3 * cannonball mass
	}

	setup() {
		for (let i = 0; i < this.idealBoatNumber; i += 1) {
			this.makeEnemyBoat();
		}
		const edgeOptions = { label: 'Edge', isStatic: true };
		const leftEdge = Bodies.rectangle(0, 0, 10, 1000, edgeOptions);
		const rightEdge = Bodies.rectangle(RIGHT, 0, 10, 1000, edgeOptions);
		const bottomEdge = Bodies.rectangle(RIGHT / 2, FLOOR, SIZE_X, 10, edgeOptions);
		this.addToWorld(leftEdge);
		this.addToWorld(rightEdge);
		this.addToWorld(bottomEdge);
	}

	startPhysics() {
		this.stopPhysics();
		Runner.run(this.runner, this.engine);
		Events.on(this.engine, 'collisionStart', (event) => {
			if (!event.pairs.length) return;
			event.pairs.forEach((pair) => this.handleCollisionPair(pair));
		});
		const expectedMs = 1000 / 60; // 1 second / 60 frames per second
		// Update the world after each matter-js physics update
		Events.on(this.runner, 'afterUpdate', (event) => {
			// TODO: event.source.frameDeltaHistory can help show FPS
			this.update(event.source.delta, event.source.delta / expectedMs);
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

	makeCannonball(boatIndex, spawnPos) {
		const entityTypeKey = 'ironCannonball';
		const entType = entityTypes[entityTypeKey];
		// Spawn the cannonball near the boat
		const boat = this.boats[boatIndex];
		if (boat.removed || boat.isDead) return false;
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
			cargoSlots,
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
		const variants = entType.textures?.map((t, i) => i) || [0];
		const cargo = []; // ('x').repeat(cargoSlots).map(() => null);
		cargo.length = cargoSlots;
		const boat = {
			isBoat: true,
			playerId,
			entityTypeKey,
			group, // pass this to cannonballs to avoid collisions
			body,
			variant: pickRand(variants),
			direction: 1, // 1 or -1
			throttle: 0, // between -1 and 1
			submerged: 0,
			deep: 0, // 0 - 1
			submergedPercent: 0, // 0 - 1
			hit: 0, // 0 - 1
			firing: 0, // 0 - 1
			hitDamage: entType.hitDamage || 0,
			hp: maxHp,
			score: 0,
			flooded: 0, // 0 - 1
			globalBuoyancyVoxelPoints: [], // Global/world coordinates
			rateOfFire: entType.rateOfFire,
			repairCooldown: 1000,
			fireCooldown: randInt(1000 / entType.rateOfFire),
			cargo,
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

	repairBoat(index) {
		const boat = this.boats[index];
		const entType = entityTypes[boat.entityTypeKey];
		if (boat.hp >= entType.maxHp) return;
		const hasRepairCooldown = (typeof boat.repairCooldown === 'number');
		if (hasRepairCooldown && boat.repairCooldown > 0) return;
		const amountLeftToRemove = this.removeCargo(boat, 'SU', 1);
		if (amountLeftToRemove > 0) return; // Repair failed
		boat.hp += 1; // Repair success
		if (hasRepairCooldown) boat.repairCooldown = entType.repairCooldownTime || 60;
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

	applyEngines(entity, deltaTimeUnit = 1) { // eslint-disable-line class-methods-use-this
		if (!entity.throttle) return;
		if (!entity.submerged) return;
		const { body } = entity;
		const ENGINE_MAGNITUDE = 0.12; // velocity magnitude
		const globalDirectionVector = vec2(entity.direction, 0);
		const boatDirectionVector = globalDirectionVector.rotate(-body.angle);
		// body.angle + (Math.PI / 2);
		const newVel = vec2(body.velocity.x, body.velocity.y)
			.add(boatDirectionVector.scale(ENGINE_MAGNITUDE * deltaTimeUnit));
		Body.setVelocity(body, newVel);
		entity.throttle *= 0.9;
		if (Math.abs(entity.throttle) < 0.05) entity.throttle = 0;
	}

	/** Mutates the entity to apply water physics */
	applyFlotation(entity, deltaTimeUnit = 1) {
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
		// const WATER_FRICTION_SCALE = 10;
		const WATER_VEL_FRICTION = 0.15;

		if (submergedPercent > 0) {
			/*
			// TODO: Should we not normalize this? The faster you go the more friction?
			const frictionForce = vec2(body.velocity).normalize(-1)
				.scale(WATER_FRICTION_SCALE * deltaTimeUnit * submergedPercent * waterFrictionScale);
			// Apply water friction
			Body.applyForce(body, body.position, frictionForce);
			*/

			// TODO: Should friction be based on area or mass or current velocity?
			const velFriction = 1 - (
				WATER_VEL_FRICTION * waterFrictionScale * submergedPercent * deltaTimeUnit
			);
			const newVelocity = Matter.Vector.mult(body.velocity, velFriction);
			Body.setVelocity(body, newVelocity);
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
			const angularSpeedFriction = 1 - ((1 - ANGULAR_FRICTION) * submergedPercent * deltaTimeUnit);
			// TODO: How to use deltaTimeUnit here?
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
		if (entity.hp <= 0) this.killEntity(entity);
	}

	killEntity(entity) { // eslint-disable-line class-methods-use-this
		entity.isDead = true;
		entity.flooded = 1;
		entity.score = 0;
		if (entity.decaying === undefined) entity.decaying = 500;
	}

	decay(entity, deltaTimeUnit = 1) {
		if (entity.removed) return;
		const entType = entityTypes[entity.entityTypeKey];
		if (entType.decaysUnderWater && entity.submerged) {
			const dmg = deltaTimeUnit + (entity.deep * 3);
			this.applyDamage(entity, dmg);
		}
		if (entity.hp <= 0) this.killEntity(entity);
		if (entity.decaying) entity.decaying -= deltaTimeUnit;
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

	getNpcAimPosition(boat, target) {
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
		return vec2(boat.body.position).add(fireVector);
	}

	getBoatFireVector(spawnPos, aimPos, boatAngle) {
		const fireVector = vec2(aimPos).subtract(spawnPos).normalize();
		// Initial fire angle is 0 down, half Pi to the right, -half pi to the left, pi to the top
		const angle = (fireVector.angle() + TWO_PI) % TWO_PI; // Make it positive
		// Now the angle is half pi right, pi up, 1.5 pi left
		// We want to limit this fire vector based on the boat's angle
		// Whereas, the boat's angle is 0 to the right, -half pi to the top, +half pi to the bottom
		// When the boat is stable its angle is 0, so we can offset the min and max fire
		// angle based on that
		const minAngle = HALF_PI - boatAngle;
		const maxAngle = (1.5 * Math.PI) - boatAngle;
		fireVector.setAngle(clamp(angle, minAngle, maxAngle));
		return fireVector;
	}

	fireCannonballFromBoat(boatIndex, aimPos) {
		const boat = this.boats[boatIndex];
		if (boat.removed || boat.isDead) return;
		if (typeof boat.fireCooldown !== 'number' || boat.fireCooldown > 0) return;
		const fireHeatUp = 1000 / (boat.rateOfFire || 1);
		boat.fireCooldown = (fireHeatUp || 0) + randInt(fireHeatUp / 10);
		boat.firing = 1;
		// Make the cannonball
		// TODO: track data where the cannon is relative to the boat coordinates, and spawn there
		const spawnPos = vec2(boat.body.position.x, boat.body.position.y - 10);
		const cb = this.makeCannonball(boatIndex, spawnPos);
		// Now we need to aim the cannonball
		let aimPosition = aimPos; // Players typically will provide an aim position
		if (!aimPosition) { // Typically for NPCs...
			const { target } = this.findTarget(boat, boat.aggroRange);
			if (!target) return;
			aimPosition = this.getNpcAimPosition(boat, target);
		}
		const fireVector = this.getBoatFireVector(spawnPos, aimPosition, boat.body.angle);
		// Finally apply force to the cannonball
		const forceMultiplier = 60;
		// Direction of the force will be the vector from the spawn (cannon) to the position of
		// the mouse cursor (aimPos).
		const forceVector = fireVector.scale(forceMultiplier);
		// console.log(aimPos, forceVector);
		Body.applyForce(cb.body, cb.body.position, forceVector);
	}

	respawnBoat(deadBoats) {
		this.makeEnemyBoat(deadBoats[0].boatIndex);
	}

	// TODO: Run this in-sync with the Matter runner
	update(deltaTime = 16, deltaTimeUnitParam = 1) {
		const deltaTimeUnit = clamp(deltaTimeUnitParam, 0, 10);
		if (deltaTimeUnitParam > 10) {
			console.warn('Delta time:', deltaTimeUnitParam, 'clamped to', deltaTimeUnit);
		}
		this.totalTime += deltaTimeUnit;
		this.waterChunk.update(deltaTimeUnit, this.totalTime);
		const allPhysicalEntities = [...this.crates, ...this.boats, ...this.cannonballs];
		allPhysicalEntities.forEach((ent) => {
			// TODO: Handle the edges differently
			// setting the position can mess the matter-js physics up
			ent.body.position.x = clamp(ent.body.position.x, this.min.x, this.max.x);
			ent.body.position.y = clamp(ent.body.position.y, this.min.y, this.max.y);
			this.applyFlotation(ent, deltaTimeUnit);
			this.applyEngines(ent, deltaTimeUnit);
			this.decay(ent, deltaTimeUnit);
			// if (ent.isCannonball) console.log(vec2(ent.body.velocity).length(), ent.body.mass);
		});
		const deadBoats = [];
		this.boats.forEach((b, boatIndex) => {
			if (typeof b.fireCooldown === 'number') b.fireCooldown -= deltaTime;
			if (typeof b.repairCooldown === 'number') b.repairCooldown -= deltaTime;
			if (typeof b.planningCooldown === 'number') b.planningCooldown -= deltaTime;
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
		// TODO: Reduce the spawn boat number based on the number of player boats in the game
		// in order to reduce bandwidth
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

	removeCargo(boat, cargoType, amount = 1) {
		const entType = entityTypes[boat.entityTypeKey];
		const { cargoSlots = 0 } = entType;
		let amountLeftToRemove = amount;
		const { cargo } = boat;
		// Loop backwards to remove from right-most cargo slots first
		for (let i = cargoSlots - 1; i >= 0; i -= 1) {
			if (amountLeftToRemove > 0) {
				if (cargo[i] && cargo[i][0] === cargoType && cargo[i][1] > 0) {
					const removeAmount = Math.min(cargo[i][1], amount);
					boat.cargo[i][1] -= removeAmount;
					amountLeftToRemove -= removeAmount;
				}
			}
		}
		return amountLeftToRemove;
	}

	giveCargoToSlot(cargo, i, cargoType, amount = 0, cargoSlotSize = 0) {
		if (amount <= 0) return 0;
		let amountLeft = amount;
		if (!cargo[i]) {
			const givenToSlot = Math.min(cargoSlotSize, amountLeft);
			cargo[i] = [cargoType, givenToSlot];
			amountLeft -= givenToSlot;
		} else if (cargo[i][0] === cargoType) {
			const space = clamp(cargoSlotSize - cargo[i][1], 0, cargoSlotSize);
			const givenToSlot = Math.min(cargoSlotSize, amountLeft, space);
			cargo[i][1] += givenToSlot;
			amountLeft -= givenToSlot;
		}
		// Else: If the cargo type is not the same, then the cargo slot is occupied
		return amountLeft;
	}

	giveCargo(boat, cargoType, amount = 0) {
		const entType = entityTypes[boat.entityTypeKey];
		const { cargoSlots = 0, cargoSlotSize = 1 } = entType;
		let amountLeft = amount;
		for (let i = 0; i < cargoSlots; i += 1) {
			amountLeft = this.giveCargoToSlot(boat.cargo, i, cargoType, amountLeft, cargoSlotSize);
		}
		// console.log('Gave', amount - amountLeft, 'to boat.', amountLeft, 'lost.');
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
		if (attacker && victim && victim.isBoat) {
			// TODO: This is flawed because you can gain a score by hitting a dead enemy
			// (hopefully they will sink quickly and that will be rare)
			if (victim.isDead) {
				attacker.score += 2;
				this.giveCargo(attacker, 'SU', 2 + randInt(12));
			} else {
				// Score for hitting, but not killing, an enemy
				attacker.score += 1;
			}
		}
	}

	getHitDamage(entity) {
		if (!entity) return 0;
		const { hitDamage = 0 } = entity;
		const velLength = vec2(entity.body.velocity).length();
		const momentum = velLength * entity.body.mass;
		// console.log(entity, momentum, this.cutOffMomentum);
		if (momentum < this.cutOffMomentum) return hitDamage / 10;
		// TODO: blend the damage between the cutoff length?
		return hitDamage;
	}

	handleCollisionPair(pair) {
		const { bodyA, bodyB } = pair;
		const objA = this.findObjectFromBody(bodyA);
		const objB = this.findObjectFromBody(bodyB);
		if (!objA || !objB) return;
		const totalHitDamage = this.getHitDamage(objA) + this.getHitDamage(objB);
		// console.log('💥', totalHitDamage);
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
