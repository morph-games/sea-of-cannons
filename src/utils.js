const { min, max, abs } = Math;

const clamp = (v, minV = 0, maxV = 1) => min(max(v, minV), maxV);
const lerp = (a, b, percent, minDiff = 0.1) => (
	(abs(b - a) < minDiff) ? b : a + (b - a) * percent // clamp(percent)
);
/** Check if object is a valid number, not NaN or undefined, but it may be infinite */
function isNumber(n) { return typeof n === 'number' && !Number.isNaN(n); }
/** Returns first parm modulo the second param, but adjusted so negative numbers work as expected */
function mod(dividend, divisor = 1) { return ((dividend % divisor) + divisor) % divisor; }

function rand(a = 1, b = 0) {
	return (b + Math.random() * (a - b));
}
function randInt(a, b) {
	return Math.floor(rand(a, b));
}
function pickRand(arr) {
	return arr[randInt(arr.length)];
}

function radiansToDegrees(radians) {
	return radians * (180 / Math.PI);
}

function makeRandomId() {
	return [
		Number(new Date()).toString(32),
		Math.round(Math.random() * 9999).toString(32),
	].join('-');
}

export {
	clamp, lerp, isNumber, mod,
	rand, randInt, pickRand,
	radiansToDegrees,
	makeRandomId,
};
