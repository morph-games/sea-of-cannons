import { Point } from 'pixi.js';
import { clamp, lerp } from './utils.js';
import { vec2 } from './Vector2.js';

export default class Camera {
	constructor(worldContainer, canvas) {
		this.worldContainer = worldContainer;
		this.canvas = canvas;
		this.x = 0;
		this.y = 0;
		this.zoom = 1;
		this.pinchEventCache = [];
		this.pinchPrevDiff = null;
	}

	setZoom(z) {
		this.zoom = clamp(z, 0.3, 3); // max of 7?
	}

	addZoom(z) {
		this.setZoom(this.zoom + z);
	}

	focus(x = this.x, y = this.y, zoom = this.zoom) {
		this.x = (typeof x === 'object') ? x.x : x;
		this.y = (typeof x === 'object') ? x.y : y;
		this.setZoom(zoom);
		const screenX = (this.canvas.width / 2) - (this.x * this.zoom);
		const screenY = (this.canvas.height / 2) - this.y;
		this.worldContainer.x = lerp(this.worldContainer.x, screenX, 0.1);
		this.worldContainer.y = lerp(this.worldContainer.y, screenY, 0.5);
		if (this.worldContainer.scale.x === this.zoom) return;
		this.worldContainer.scale.set(
			lerp(this.worldContainer.scale.x, this.zoom, 0.1, 0.001),
		);
	}

	setupWheelZoom() {
		document.addEventListener('wheel', (e) => {
			this.addZoom((e.deltaY / -1000));
		});
	}

	setupPinchZoom() {
		document.addEventListener('pointerdown', (e) => {
			// The pointerdown event signals the start of a touch interaction.
			// This event is cached to support 2-finger gestures
			this.pinchEventCache.push(e);
		});
		document.addEventListener('pointermove', (ev) => {
			// This function implements a 2-pointer horizontal pinch/zoom gesture.
			//
			// If the distance between the two pointers has increased (zoom in),
			// the target element's background is changed to "pink" and if the
			// distance is decreasing (zoom out), the color is changed to "lightblue".
			//
			// This function sets the target element's border to "dashed" to visually
			// indicate the pointer's target received a move event.
			// log("pointerMove", ev);

			// Find this event in the cache and update its record with this event
			const index = this.pinchEventCache.findIndex(
				(cachedEv) => cachedEv.pointerId === ev.pointerId,
			);
			this.pinchEventCache[index] = ev;

			// If two pointers are down, check for pinch gestures
			if (this.pinchEventCache.length === 2) {
				// Calculate the distance between the two pointers
				const [evOne, evTwo] = this.pinchEventCache;
				const evOneVec = vec2(evOne.clientX, evOne.clientY);
				const evTwoVec = vec2(evTwo.clientX, evTwo.clientY);
				const curDiff = evOneVec.distance(evTwoVec);

				if (this.pinchPrevDiff === null) {
					this.pinchPrevDiff = curDiff;
					return;
				}
				if (curDiff > this.pinchPrevDiff) {
					// The distance between the two pointers has increased
					// log("Pinch moving OUT -> Zoom in", ev);
					this.addZoom(0.07);
					// TODO: Make this based on the diff + some exponent scaling
				} else if (curDiff < this.pinchPrevDiff) {
					// The distance between the two pointers has decreased
					// log('Pinch moving IN -> Zoom out', ev);
					this.addZoom(-0.07);
					// TODO: Make this based on the diff + some exponent scaling
				}
				// Cache the distance for the next move event
				this.pinchPrevDiff = curDiff;
			}
		});

		const handlePointerDone = (ev) => {
			// Remove this event from the target's cache
			const index = this.pinchEventCache.findIndex(
				(cachedEv) => cachedEv.pointerId === ev.pointerId,
			);
			this.pinchEventCache.splice(index, 1);

			// If the number of pointers down is less than two then reset diff tracker
			if (this.pinchEventCache.length < 2) {
				this.pinchPrevDiff = null;
			}
		};
		// Use same handler for pointer{up,cancel,out,leave} events since
		// the semantics for these events - in this app - are the same.
		document.addEventListener('pointerup', handlePointerDone);
		document.addEventListener('pointercancel', handlePointerDone);
		document.addEventListener('pointerout', handlePointerDone);
		document.addEventListener('pointerleave', handlePointerDone);
	}

	getWorldCoordinates(screenX = 0, screenY = 0) {
		const screenGlobalClick = new Point(screenX, screenY);
		// Convert the global position to local coordinates within the container
		const localPos = this.worldContainer.toLocal(screenGlobalClick);
		return localPos;
	}
}
