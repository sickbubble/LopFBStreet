/**
 * The Godot build's input map (project.godot), on a keyboard and mouse:
 *
 * | action | binding |
 * |---|---|
 * | move_forward / back / left / right | W / S / A / D (also the arrows) |
 * | sprint | Shift, held |
 * | jump | Space |
 * | bounce_ball | left mouse: hold for height, release to queue |
 * | launch_ball | right mouse: hold for power, release to queue |
 * | reset_ball | R |
 * | free_mouse | Esc (the browser releases pointer lock itself) |
 * | camera mode | C |
 * | body / capsule | F1 |
 *
 * Polled once per fixed step, like Godot's `Input.IsActionPressed`; a press
 * that started and ended between two steps still counts once as "just
 * pressed". Engine vocabulary: no rule lives here.
 */
export interface InputSnapshot {
  /** Strafe right positive, forward positive; length at most 1. */
  readonly moveX: number;
  readonly moveY: number;
  readonly sprint: boolean;
  readonly bounceHeld: boolean;
  readonly launchHeld: boolean;
  readonly jumpPressed: boolean;
  readonly resetPressed: boolean;
}

export interface Input {
  /** One snapshot per fixed step. Clears the "just pressed" latches. */
  poll(): InputSnapshot;
  /** Mouse movement since the last call, in pixels, while the pointer is locked. */
  takeMouse(): { dx: number; dy: number };
  /** Keys pressed since the last call that the frame (not the step) handles: C and F1. */
  takeFramePresses(): Set<string>;
  readonly locked: boolean;
}

export function installInput(canvas: HTMLCanvasElement): Input {
  const keys = new Set<string>();
  const justPressed = new Set<string>();
  const framePresses = new Set<string>();
  const buttons = { left: false, right: false };
  // A click that only ends up locking the pointer is not a bounce.
  const latched = { left: false, right: false };
  let mouseX = 0;
  let mouseY = 0;

  const locked = (): boolean => document.pointerLockElement === canvas;

  window.addEventListener('keydown', (e) => {
    if (e.code === 'F1' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (!e.repeat) {
      justPressed.add(e.code);
      if (e.code === 'KeyC' || e.code === 'F1') framePresses.add(e.code);
    }
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => {
    keys.clear();
    buttons.left = buttons.right = false;
  });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousedown', (e) => {
    if (!locked()) {
      void canvas.requestPointerLock();
      return;
    }
    if (e.button === 0) {
      buttons.left = true;
      latched.left = true;
    }
    if (e.button === 2) {
      buttons.right = true;
      latched.right = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) buttons.left = false;
    if (e.button === 2) buttons.right = false;
  });
  document.addEventListener('pointerlockchange', () => {
    if (!locked()) buttons.left = buttons.right = false;
  });
  window.addEventListener('mousemove', (e) => {
    if (!locked()) return;
    mouseX += e.movementX;
    mouseY += e.movementY;
  });

  const down = (...codes: string[]): boolean => codes.some((c) => keys.has(c));

  return {
    get locked() {
      return locked();
    },
    poll(): InputSnapshot {
      let x = (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0);
      let y = (down('KeyW', 'ArrowUp') ? 1 : 0) - (down('KeyS', 'ArrowDown') ? 1 : 0);
      const len = Math.hypot(x, y);
      if (len > 1) {
        x /= len;
        y /= len;
      }
      // A press that ended between two steps still holds for this one step,
      // so a tap shorter than 1/120 s is a tap, not nothing.
      const snapshot: InputSnapshot = {
        moveX: x,
        moveY: y,
        sprint: down('ShiftLeft', 'ShiftRight'),
        bounceHeld: buttons.left || latched.left,
        launchHeld: buttons.right || latched.right,
        jumpPressed: justPressed.has('Space'),
        resetPressed: justPressed.has('KeyR'),
      };
      latched.left = latched.right = false;
      justPressed.clear();
      return snapshot;
    },
    takeMouse() {
      const m = { dx: mouseX, dy: mouseY };
      mouseX = mouseY = 0;
      return m;
    },
    takeFramePresses() {
      const s = new Set(framePresses);
      framePresses.clear();
      return s;
    },
  };
}
