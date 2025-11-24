// Vector2 class courtesy of LittleJS (MIT Licensed)
// https://github.com/KilledByAPixel/LittleJS/blob/main/src/engineMath.js

import { isNumber, clamp, mod } from './utils.js';

const { abs, atan2, sin, cos, floor } = Math;

/* eslint-disable no-nested-ternary */

function ASSERT(trueThing, text, value) { // Not sure if this is the same ASSERT that little js uses
	if (!trueThing) throw new Error(`${text} (${value})`);
}

// vector2 asserts
function ASSERT_VECTOR2_VALID(v) { ASSERT(isVector2(v), 'Vector2 is invalid.', v); }
function ASSERT_NUMBER_VALID(n) { ASSERT(isNumber(n), 'Number is invalid.', n); }
// function ASSERT_VECTOR2_NORMAL(v) {
// ASSERT_VECTOR2_VALID(v);
// ASSERT(abs(v.lengthSquared() - 1) < 0.01, 'Vector2 is not normal.', v);
// }

/**
 * 2D Vector object with vector math library
 * - Functions do not change this so they can be chained together
 * @memberof Engine
 * @example
 * let a = new Vector2(2, 3); // vector with coordinates (2, 3)
 * let b = new Vector2;       // vector with coordinates (0, 0)
 * let c = vec2(4, 2);        // use the vec2 function to make a Vector2
 * let d = a.add(b).scale(5); // operators can be chained
 */
class Vector2 {
	/** Create a 2D vector with the x and y passed in, can also be created with vec2()
	 *  @param {number} [x] - X axis location
	 *  @param {number} [y] - Y axis location */
	constructor(x = 0, y = 0) {
		/** @property {number} - X axis location */
		this.x = x;
		/** @property {number} - Y axis location */
		this.y = y;
		ASSERT(this.isValid(), 'Constructed Vector2 is invalid.', this);
	}

	/** Sets values of this vector and returns self
	 *  @param {number} [x] - X axis location
	 *  @param {number} [y] - Y axis location
	 *  @return {Vector2} */
	set(x = 0, y = 0) {
		this.x = x;
		this.y = y;
		ASSERT_VECTOR2_VALID(this);
		return this;
	}

	/** Sets this vector from another vector and returns self
	 *  @param {Vector2} v - other vector
	 *  @return {Vector2} */
	setFrom(v) { return this.set(v.x, v.y); }

	/** Returns a new vector that is a copy of this
	 *  @return {Vector2} */
	copy() { return new Vector2(this.x, this.y); }

	/** Returns a copy of this vector plus the vector passed in
	 *  @param {Vector2} v - other vector
	 *  @return {Vector2} */
	add(v) { return new Vector2(this.x + v.x, this.y + v.y); }

	/** Returns a copy of this vector minus the vector passed in
	 *  @param {Vector2} v - other vector
	 *  @return {Vector2} */
	subtract(v) { return new Vector2(this.x - v.x, this.y - v.y); }

	/** Returns a copy of this vector times the vector passed in
	 *  @param {Vector2} v - other vector
	 *  @return {Vector2} */
	multiply(v) { return new Vector2(this.x * v.x, this.y * v.y); }

	/** Returns a copy of this vector divided by the vector passed in
	 *  @param {Vector2} v - other vector
	 *  @return {Vector2} */
	divide(v) { return new Vector2(this.x / v.x, this.y / v.y); }

	/** Returns a copy of this vector scaled by the vector passed in
	 *  @param {number} s - scale
	 *  @return {Vector2} */
	scale(s) { return new Vector2(this.x * s, this.y * s); }

	/** Returns the length of this vector
	 * @return {number} */
	length() { return this.lengthSquared() ** 0.5; }

	/** Returns the length of this vector squared
	 * @return {number} */
	lengthSquared() { return this.x ** 2 + this.y ** 2; }

	/** Returns the distance from this vector to vector passed in
	 * @param {Vector2} v - other vector
	 * @return {number} */
	distance(v) { return this.distanceSquared(v) ** 0.5; }

	/** Returns the distance squared from this vector to vector passed in
	 * @param {Vector2} v - other vector
	 * @return {number} */
	distanceSquared(v) { return (this.x - v.x) ** 2 + (this.y - v.y) ** 2; }

	/** Returns a new vector in same direction as this one with the length passed in
	 * @param {number} [length]
	 * @return {Vector2} */
	normalize(length = 1) {
		const l = this.length();
		return l ? this.scale(length / l) : new Vector2(0, length);
	}

	unit() {
		return this.normalize(1);
	}

	/** Returns a new vector clamped to length passed in
	 * @param {number} [length]
	 * @return {Vector2} */
	clampLength(length = 1) {
		const l = this.length();
		return l > length ? this.scale(length / l) : this.copy();
	}

	/** Returns the dot product of this and the vector passed in
	 * @param {Vector2} v - other vector
	 * @return {number} */
	dot(v) { return this.x * v.x + this.y * v.y; }

	/** Returns the cross product of this and the vector passed in
	 * @param {Vector2} v - other vector
	 * @return {number} */
	cross(v) { return this.x * v.y - this.y * v.x; }

	/** Returns a copy this vector reflected by the surface normal
	 * @param {Vector2} normal - surface normal (should be normalized)
	 * @param {number} restitution - how much to bounce, 1 is perfect bounce, 0 is no bounce
	 * @return {Vector2} */
	reflect(normal, restitution = 1) {
		return this.subtract(normal.scale((1 + restitution) * this.dot(normal)));
	}

	/** Returns the clockwise angle of this vector, up is angle 0
	 * @return {number} */
	angle() { return atan2(this.x, this.y); }

	/** Sets this vector with clockwise angle and length passed in
	 * @param {number} [angle]
	 * @param {number} [length]
	 * @return {Vector2} */
	setAngle(angle = 0, length = 1) {
		ASSERT_NUMBER_VALID(angle);
		ASSERT_NUMBER_VALID(length);
		this.x = length * sin(angle);
		this.y = length * cos(angle);
		return this;
	}

	/** Returns copy of this vector rotated by the clockwise angle passed in
	 * @param {number} angle
	 * @return {Vector2} */
	rotate(angle) {
		ASSERT_NUMBER_VALID(angle);
		const c = cos(-angle);
		const s = sin(-angle);
		return new Vector2(this.x * c - this.y * s, this.x * s + this.y * c);
	}

	/** Sets this this vector to point in the specified integer direction (0-3),
	 * corresponding to multiples of 90 degree rotation
	 * @param {number} [direction]
	 * @param {number} [length]
	 * @return {Vector2} */
	setDirection(direction, length = 1) {
		ASSERT_NUMBER_VALID(direction);
		ASSERT_NUMBER_VALID(length);
		const dir = mod(direction, 4);
		ASSERT(
			dir === 0 || dir === 1 || dir === 2 || dir === 3,
			'Vector2.setDirection() direction must be an integer between 0 and 3.',
		);
		this.x = dir % 2 ? dir - 1 ? -length : length : 0;
		this.y = dir % 2 ? 0 : dir ? -length : length;
		return this;
	}

	/** Returns the integer direction of this vector, corresponding to multiples of
	 * 90 degree rotation (0-3)
	 * @return {number} */
	direction() { return abs(this.x) > abs(this.y) ? this.x < 0 ? 3 : 1 : this.y < 0 ? 2 : 0; }

	/** Returns a copy of this vector with absolute values
	 * @return {Vector2} */
	abs() { return new Vector2(abs(this.x), abs(this.y)); }

	/** Returns a copy of this vector with each axis floored
	 * @return {Vector2} */
	floor() { return new Vector2(floor(this.x), floor(this.y)); }

	/** Returns new vec2 with modded values
	*  @param {number} [divisor]
	*  @return {Vector2} */
	mod(divisor = 1) { return new Vector2(mod(this.x, divisor), mod(this.y, divisor)); }

	/** Returns the area this vector covers as a rectangle
	 * @return {number} */
	area() { return abs(this.x * this.y); }

	/** Returns a new vector that is p percent between this and the vector passed in
	 * @param {Vector2} v - other vector
	 * @param {number}  percent
	 * @return {Vector2} */
	lerp(v, percent) {
		ASSERT_VECTOR2_VALID(v);
		ASSERT_NUMBER_VALID(percent);
		const p = clamp(percent);
		return new Vector2(v.x * p + this.x * (1 - p), v.y * p + this.y * (1 - p));
	}

	/** Returns true if this vector is within the bounds of an array size passed in
	 * @param {Vector2} arraySize
	 * @return {boolean} */
	arrayCheck(arraySize) {
		return this.x >= 0 && this.y >= 0 && this.x < arraySize.x && this.y < arraySize.y;
	}

	/** Returns this vector expressed as a string
	 * @param {number} digits - precision to display
	 * @return {string} */
	toString(digits = 3) {
		ASSERT_NUMBER_VALID(digits);
		if (this.isValid()) {
			return `(${(this.x < 0 ? '' : ' ') + this.x.toFixed(digits)},${(this.y < 0 ? '' : ' ') + this.y.toFixed(digits)} )`;
		}
		return `(${this.x}, ${this.y})`;
	}

	/** Checks if this is a valid vector
	 * @return {boolean} */
	isValid() { return isNumber(this.x) && isNumber(this.y); }
}

/**
 * Create a 2d vector, can take 1 or 2 scalar values
 * @param {number} [x] (or object that contains x and y)
 * @param {number} [y] - if y is undefined, x is used for both
 * @return {Vector2}
 * @example
 * let a = vec2(0, 1); // vector with coordinates (0, 1)
 * a = vec2(5);        // set a to (5, 5)
 * b = vec2();         // set b to (0, 0)
 * @memberof Math */
function vec2(x = 0, y = undefined) {
	if (typeof x === 'object') return vec2(x.x, x.y);
	return new Vector2(x, y ?? x);
}

/**
 * Check if object is a valid Vector2
 * @param {any} v
 * @return {boolean}
 * @memberof Math */
function isVector2(v) { return v instanceof Vector2 && v.isValid(); }

export default Vector2;
export {
	vec2,
	isVector2,
	Vector2,
};
