/**
 * The rules of the landing page's runner, shared by the game (MiniGame.tsx)
 * and the C# class shown next to it (CodeShowcase.tsx), so the code on the
 * page is the code that plays.
 */
export const RUNNER = {
    /** Pixels per second². */
    gravity: 2300,
    jumpSpeed: 760,
    doubleJumpSpeed: 680,
    /** A jump still counts this long after leaving the ground (seconds). */
    coyoteTime: 0.1,
    /** A press this long before landing jumps on landing (seconds). */
    jumpBuffer: 0.12,
    maxJumps: 2,
    /** Every this many coins in a row raises the multiplier by one. */
    streakStep: 5,
    maxMultiplier: 5,
    magnetSeconds: 8,
} as const;
