const BUOYANCY_VOXEL_SIZE = 10; // Width and height of each voxel

// Note: This is for rectangles only
function getBuoyancyVoxelPoints(w = 0, h = 0, buoyancyVoxelSize = 10) {
	const arr = [];
	for (let yi = 0; yi < h / buoyancyVoxelSize; yi += 1) {
		for (let xi = 0; xi < w / buoyancyVoxelSize; xi += 1) {
			arr.push({
				x: (xi * buoyancyVoxelSize) + (buoyancyVoxelSize / 2) - (w / 2),
				y: (yi * buoyancyVoxelSize) + (buoyancyVoxelSize / 2) - (h / 2),
			});
		}
	}
	return arr;
}

const defaultEntityType = {
	maxHp: 1,
	density: 1,
	decaysUnderWater: false,
	waterFrictionScale: 1,
	buoyancyMultipler: 1,
	buoyancyVoxelSize: BUOYANCY_VOXEL_SIZE,
	buoyancyVoxelPoints: [{ x: 0, y: 0 }],
};

const tug = {
	...defaultEntityType,
	width: 100,
	height: 100 / 2,
	// TODO: Use polygon points for physical shape?
	vertexSet: [
		// { x: 0, y: 40 }, { x: 50, y: 10 }, { x: 100, y: 35 },
		{ x: 0, y: 0 }, { x: 100, y: 0 },
		{ x: 100, y: 50 }, { x: 0, y: 50 },
	],
	physicalWidth: 100,
	physicalHeight: 100 / 4,
	texture: '???', // ??
	// All the points are relative/local to the boat's center of mass
	buoyancyVoxelPoints: getBuoyancyVoxelPoints(100, 100 / 2, BUOYANCY_VOXEL_SIZE), // ??
	smokeEmissionPoints: [], // ?? WIP
	cannonPoints: [{ x: 0, y: 0 }], // WIP
	density: 3,
	maxHp: 100,
	rateOfFire: 10, // x shots per deltaTime?
};

export default {
	tug,
	ironCannonball: {
		...defaultEntityType,
		density: 5,
		maxHp: 50,
		hitDamage: 50,
		decaysUnderWater: true,
		waterFrictionScale: 0.5,
		buoyancyMultipler: 0.0014,
	},
	woodCrate: {
		...defaultEntityType,
		maxHp: 10,
		buoyancyMultipler: 0.1, // TODO: Don't use this as a hack
	},
	pirateTug: {
		...tug,
		sightRange: 100,
		aggroRange: 90,
	},
};
