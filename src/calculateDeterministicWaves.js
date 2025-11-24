function calculateDeterministicWaves(
	n = 10, // Number of verts
	totalTime = 0, // What is the total time
	params = {}, // Other params
) {
	const verts = new Float32Array(n * 2);
	const offsetVerts = new Float32Array(n * 2);
	const {
		k = 1, // wave number
		w = 1, // angular frequency
		amplitude = 20, // 20,
		xPerVert = 1, // How far does x go per vert
		offsets = [], // aka. "ripples" or "edge spring", rippleDeltas
	} = params;
	const t = totalTime / 20;
	const t2 = Math.sin(totalTime / 100);
	for (let xi = 0; xi < n; xi += 1) {
		const i = xi * 2;
		offsetVerts[i] = (
			Math.cos((k * xi) + (w * t)) * -16
		) + (offsets[i] || 0);
		offsetVerts[i + 1] = (
			Math.sin((k * xi) + (w * t)) * amplitude // Waves
			+ Math.sin((k * 0.4 * xi) + (w * t2)) * amplitude * 1.2 // Reversing waves
			+ Math.sin((0.1 * xi) + (0.2 * t)) * amplitude * 2 // Swells
		) + (offsets[i + 1] || 0);
		// Set the final x, y coordinates for the surface by sclaing the x based on the x-per-vert
		verts[i] = (xi * xPerVert) + offsetVerts[i];
		verts[i + 1] = offsetVerts[i + 1];
	}
	return { verts, offsetVerts };
}

function calcDeterministicWavesForWaterChunk(wc, totalTime) {
	return calculateDeterministicWaves(
		wc.vertCount.x,
		totalTime,
		{
			...wc.waveParams,
			xPerVert: (wc.size.x / (wc.vertCount.x - 1)),
			offsets: wc.rippleDeltas,
		},
	);
}

export {
	calculateDeterministicWaves,
	calcDeterministicWavesForWaterChunk,
};
