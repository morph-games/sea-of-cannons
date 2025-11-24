import { Point } from 'pixi.js';
import { clamp, lerp } from './utils.js';

export default class Camera {
	constructor(worldContainer, canvas) {
		this.worldContainer = worldContainer;
		this.canvas = canvas;
		this.x = 0;
		this.y = 0;
		this.zoom = 1;
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
			this.zoom = clamp(this.zoom - (e.deltaY / 1000), 0.05, 150);
		});
	}

	getWorldCoordinates(screenX = 0, screenY = 0) {
		const screenGlobalClick = new Point(screenX, screenY);
		// Convert the global position to local coordinates within the container
		const localPos = this.worldContainer.toLocal(screenGlobalClick);
		return localPos;
	}
}
