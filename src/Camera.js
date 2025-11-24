import { Point } from 'pixi.js';
import { clamp, lerp } from './utils.js';

const evCache = [];
let prevDiff = -1;

export default class Camera {
	constructor(worldContainer, canvas) {
		this.worldContainer = worldContainer;
		this.canvas = canvas;
		this.x = 0;
		this.y = 0;
		this.zoom = 1;
	}

	setZoom(z) {
		this.zoom = clamp(z, 0.1, 7);
	}

	addZoom(z) {
		this.setZoom(this.zoom + z);
	}

	focus(x = this.x, y = this.y, zoom = this.zoom) {
		this.x = (typeof x === 'object') ? x.x : x;
		this.y = (typeof x === 'object') ? x.y : y;
		this.zoom = zoom;
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
		const zoomIn = () => { this.addZoom(1); };
		const zoomOut = () => { this.addZoom(-1); };

		// Install event handlers for the pointer target
		const el = document.body; // getElementById("target");
		el.onpointerdown = pointerdownHandler;
		el.onpointermove = pointermoveHandler;

		// Use same handler for pointer{up,cancel,out,leave} events since
		// the semantics for these events - in this app - are the same.
		el.onpointerup = pointerupHandler;
		el.onpointercancel = pointerupHandler;
		el.onpointerout = pointerupHandler;
		el.onpointerleave = pointerupHandler;

		function pointerdownHandler(ev) {
			// The pointerdown event signals the start of a touch interaction.
			// This event is cached to support 2-finger gestures
			evCache.push(ev);
			// log("pointerDown", ev);
		}

		function pointermoveHandler(ev) {
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
			const index = evCache.findIndex(
				(cachedEv) => cachedEv.pointerId === ev.pointerId,
			);
			evCache[index] = ev;

			// If two pointers are down, check for pinch gestures
			if (evCache.length === 2) {
				// Calculate the distance between the two pointers
				const curDiff = Math.abs(evCache[0].clientX - evCache[1].clientX);

				if (prevDiff > 0) {
					if (curDiff > prevDiff) {
						// The distance between the two pointers has increased
						// log("Pinch moving OUT -> Zoom in", ev);
						zoomIn();
					}
					if (curDiff < prevDiff) {
						// The distance between the two pointers has decreased
						// log('Pinch moving IN -> Zoom out', ev);
						zoomOut();
					}
				}

				// Cache the distance for the next move event
				prevDiff = curDiff;
			}
		}

		function pointerupHandler(ev) {
			// Remove this pointer from the cache and reset the target's
			// background and border
			removeEvent(ev);

			// If the number of pointers down is less than two then reset diff tracker
			if (evCache.length < 2) {
				prevDiff = -1;
			}
		}

		function removeEvent(ev) {
			// Remove this event from the target's cache
			const index = evCache.findIndex(
				(cachedEv) => cachedEv.pointerId === ev.pointerId,
			);
			evCache.splice(index, 1);
		}
	}

	getWorldCoordinates(screenX = 0, screenY = 0) {
		const screenGlobalClick = new Point(screenX, screenY);
		// Convert the global position to local coordinates within the container
		const localPos = this.worldContainer.toLocal(screenGlobalClick);
		return localPos;
	}
}
