/** Runtime state of a Nav Agent 2D (V4): its destination, current path and arrival. */
import type { NavAgent2DComponent } from "../types";
import type { NavPoint } from "./pathfinding";

export type NavPathStatus = "complete" | "partial" | "invalid";

export class NavAgentState {
    readonly component: NavAgent2DComponent;
    /** Where the agent is going (null: nowhere). */
    destination: NavPoint | null = null;
    /** Corner points of the current path; `corner` is the next one to reach. */
    path: NavPoint[] = [];
    corner = 1;
    status: NavPathStatus = "complete";
    stopped = false;
    /** Seconds until the path is computed again (chasing a target). */
    repathTimer = 0;
    /** Destination the current path was computed for. */
    pathGoal: NavPoint | null = null;
    /** OnDestinationReached was sent for the current destination. */
    arrived = false;
    velocity = { x: 0, y: 0 };

    constructor(component: NavAgent2DComponent) {
        this.component = component;
    }

    setDestination(point: NavPoint) {
        this.destination = { x: point.x, y: point.y };
        this.arrived = false;
        this.repathTimer = 0;
        this.pathGoal = null;
    }

    clear() {
        this.destination = null;
        this.path = [];
        this.corner = 1;
        this.pathGoal = null;
        this.velocity = { x: 0, y: 0 };
    }

    /** Distance left along the path from `position`. */
    remainingDistance(position: NavPoint): number {
        if (!this.path.length) return this.destination ? Math.hypot(this.destination.x - position.x, this.destination.y - position.y) : 0;
        let total = 0;
        let previous = position;
        for (let index = this.corner; index < this.path.length; index += 1) {
            total += Math.hypot(this.path[index].x - previous.x, this.path[index].y - previous.y);
            previous = this.path[index];
        }
        return total;
    }
}
